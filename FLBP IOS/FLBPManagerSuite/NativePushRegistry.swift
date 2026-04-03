import Foundation
import UIKit
import UserNotifications

extension Notification.Name {
    static let flbpNativePushRegistrationDidChange = Notification.Name("flbpNativePushRegistrationDidChange")
}

struct NativePushRegistrationSnapshot {
    let platform: String
    let provider: String
    let deviceId: String
    let deviceToken: String?
    let permission: String
    let pushEnabled: Bool
    let configReady: Bool
    let appVersion: String?
    let lastError: String?

    func jsonString() -> String {
        let payload: [String: Any?] = [
            "platform": platform,
            "provider": provider,
            "deviceId": deviceId,
            "deviceToken": deviceToken,
            "permission": permission,
            "pushEnabled": pushEnabled,
            "configReady": configReady,
            "appVersion": appVersion,
            "lastError": lastError,
        ]
        let sanitized = payload.reduce(into: [String: Any]()) { result, entry in
            result[entry.key] = entry.value ?? NSNull()
        }
        let data = (try? JSONSerialization.data(withJSONObject: sanitized, options: [])) ?? Data("{}".utf8)
        return String(data: data, encoding: .utf8) ?? "{}"
    }
}

enum NativePushRegistry {
    private static let defaults = UserDefaults.standard
    private static let permissionKey = "flbp.native.push.permission"
    private static let tokenKey = "flbp.native.push.token"
    private static let errorKey = "flbp.native.push.error"
    static let bridgeEventName = "flbp-native-push-registration"

    static func currentSnapshot() -> NativePushRegistrationSnapshot {
        let token = defaults.string(forKey: tokenKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nonEmpty(or: nil)
        let permission = defaults.string(forKey: permissionKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nonEmpty(or: "unknown") ?? "unknown"
        let lastError = defaults.string(forKey: errorKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nonEmpty(or: nil)
        let deviceId = NativeProtectedCache().readOrCreatePlayerDeviceId()
        let appVersion = (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return NativePushRegistrationSnapshot(
            platform: "ios",
            provider: "apns",
            deviceId: deviceId,
            deviceToken: token,
            permission: permission,
            pushEnabled: permission == "granted" && token != nil,
            configReady: true,
            appVersion: appVersion,
            lastError: lastError
        )
    }

    static func bridgeBootstrapScript() -> String {
        """
        (function () {
          window.__flbpNativePushBridge = window.__flbpNativePushBridge || {
            getRegistrationJson: function () {
              try { return JSON.stringify(window.__flbpNativePushRegistration || null); } catch (_) { return 'null'; }
            },
            requestPermission: function () {
              if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.flbpNativePush) {
                window.webkit.messageHandlers.flbpNativePush.postMessage({ type: 'requestPermission' });
              }
              return true;
            },
            refreshRegistration: function () {
              if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.flbpNativePush) {
                window.webkit.messageHandlers.flbpNativePush.postMessage({ type: 'refreshRegistration' });
              }
              return true;
            }
          };
        })();
        """
    }

    static func syncScript() -> String {
        let encoded = jsonStringLiteral(currentSnapshot().jsonString())
        return """
        (function () {
          try {
            var snapshot = JSON.parse(\(encoded));
            window.__flbpNativePushRegistration = snapshot;
            window.dispatchEvent(new CustomEvent('\(bridgeEventName)', { detail: snapshot }));
          } catch (error) {
            console.warn('FLBP native push sync failed', error);
          }
        })();
        """
    }

    static func refreshRegistration() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let permission: String
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                permission = "granted"
            case .denied:
                permission = "denied"
            case .notDetermined:
                permission = "prompt"
            @unknown default:
                permission = "unknown"
            }
            defaults.set(permission, forKey: permissionKey)
            if permission == "granted" {
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
            postSnapshotChanged()
        }
    }

    static func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            if let error {
                defaults.set(error.localizedDescription, forKey: errorKey)
            } else {
                defaults.removeObject(forKey: errorKey)
            }
            defaults.set(granted ? "granted" : "denied", forKey: permissionKey)
            if granted {
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
            postSnapshotChanged()
        }
    }

    static func handleDeviceToken(_ deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        defaults.set(token, forKey: tokenKey)
        defaults.set("granted", forKey: permissionKey)
        defaults.removeObject(forKey: errorKey)
        postSnapshotChanged()
    }

    static func handleRegistrationError(_ error: Error) {
        defaults.set(error.localizedDescription, forKey: errorKey)
        postSnapshotChanged()
    }

    private static func postSnapshotChanged() {
        NotificationCenter.default.post(name: .flbpNativePushRegistrationDidChange, object: nil)
    }

    private static func jsonStringLiteral(_ value: String) -> String {
        let data = (try? JSONEncoder().encode(value)) ?? Data("\"{}\"".utf8)
        return String(data: data, encoding: .utf8) ?? "\"{}\""
    }
}

final class NativeAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        NativePushRegistry.refreshRegistration()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NativePushRegistry.handleDeviceToken(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NativePushRegistry.handleRegistrationError(error)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }
}

private extension String {
    func nonEmpty(or fallback: String?) -> String? {
        isEmpty ? fallback : self
    }
}
