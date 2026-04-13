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
    let permissionDetail: String
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
            "permissionDetail": permissionDetail,
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
    private static let permissionDetailKey = "flbp.native.push.permission.detail"
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
        let permissionDetail = defaults.string(forKey: permissionDetailKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nonEmpty(or: nil) ?? defaultPermissionDetail(for: permission)
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
            permissionDetail: permissionDetail,
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
            },
            openSettings: function () {
              if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.flbpNativePush) {
                window.webkit.messageHandlers.flbpNativePush.postMessage({ type: 'openSettings' });
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
            let snapshot = normalizedPermission(from: settings)
            let permission = snapshot.permission
            defaults.set(permission, forKey: permissionKey)
            defaults.set(snapshot.detail, forKey: permissionDetailKey)
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
            defaults.set(granted ? "authorized" : "denied", forKey: permissionDetailKey)
            if granted {
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
            postSnapshotChanged()
        }
    }

    static func openNotificationSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        guard UIApplication.shared.canOpenURL(url) else { return }
        UIApplication.shared.open(url)
    }

    static func handleDeviceToken(_ deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        defaults.set(token, forKey: tokenKey)
        defaults.set("granted", forKey: permissionKey)
        defaults.set("authorized", forKey: permissionDetailKey)
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

    private static func normalizedPermission(from settings: UNNotificationSettings) -> (permission: String, detail: String) {
        switch settings.authorizationStatus {
        case .authorized:
            return ("granted", "authorized")
        case .provisional:
            return ("granted", "provisional")
        case .ephemeral:
            return ("granted", "ephemeral")
        case .denied:
            return ("denied", "denied")
        case .notDetermined:
            return ("prompt", "not_determined")
        @unknown default:
            return ("unknown", "unknown")
        }
    }

    private static func defaultPermissionDetail(for permission: String) -> String {
        switch permission {
        case "prompt":
            return "not_determined"
        case "granted":
            return "authorized"
        case "denied":
            return "denied"
        default:
            return "unknown"
        }
    }

    fileprivate static func flbpPayload(from raw: Any?) -> [String: Any]? {
        if let payload = raw as? [String: Any] {
            return payload
        }
        guard let payload = raw as? [AnyHashable: Any] else {
            return nil
        }
        return payload.reduce(into: [String: Any]()) { result, entry in
            guard let key = entry.key as? String else { return }
            result[key] = entry.value
        }
    }

    fileprivate static func clearDeliveredCallNotifications(callId: String, completion: (() -> Void)? = nil) {
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { delivered in
            let idsToRemove = delivered.compactMap { notification -> String? in
                let info = notification.request.content.userInfo
                guard let flbp = flbpPayload(from: info["flbp"]) else { return nil }
                let notificationCallId = (flbp["callId"] as? String)?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                return notificationCallId == callId ? notification.request.identifier : nil
            }

            if !idsToRemove.isEmpty {
                center.removeDeliveredNotifications(withIdentifiers: idsToRemove)
            }

            completion?()
        }
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

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable : Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        guard
            let flbp = NativePushRegistry.flbpPayload(from: userInfo["flbp"]),
            let action = (flbp["action"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            let callId = (flbp["callId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
            !callId.isEmpty,
            action == "cancelled" || action == "acknowledged"
        else {
            completionHandler(.noData)
            return
        }

        NativePushRegistry.clearDeliveredCallNotifications(callId: callId) {
            NativePushRegistry.refreshRegistration()
            completionHandler(.newData)
        }
    }
}

private extension String {
    func nonEmpty(or fallback: String?) -> String? {
        isEmpty ? fallback : self
    }
}
