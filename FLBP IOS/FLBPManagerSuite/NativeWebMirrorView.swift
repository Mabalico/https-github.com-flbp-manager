import SwiftUI
import UIKit
import WebKit

enum NativeWebMirrorConfig {
    static let enabled = true
    static let baseUrl = URL(string: "https://flbp-pages.pages.dev/?native_shell=ios&shell_rev=20260413a")!
}

struct NativeWebMirrorHostView<Fallback: View>: View {
    let fallback: Fallback

    @State private var reloadToken = UUID()
    @State private var firstLoadCompleted = false
    @State private var fatalError: String?
    @State private var useFallback = false

    var body: some View {
        Group {
            if useFallback {
                fallback
            } else {
                ZStack {
                    NativeWebMirrorWebView(
                        url: NativeWebMirrorConfig.baseUrl,
                        reloadToken: reloadToken,
                        firstLoadCompleted: $firstLoadCompleted,
                        fatalError: $fatalError
                    )

                    if !firstLoadCompleted, let fatalError, !fatalError.isEmpty {
                        Color.white.opacity(0.96).ignoresSafeArea()
                        VStack(spacing: 14) {
                            Text("FLBP web mirror not available")
                                .font(.title2.weight(.black))
                                .foregroundStyle(NativeFlbpPalette.ink)
                            Text(fatalError)
                                .font(.body)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                            HStack(spacing: 10) {
                                Button("Retry") {
                                    firstLoadCompleted = false
                                    self.fatalError = nil
                                    reloadToken = UUID()
                                }
                                .buttonStyle(.borderedProminent)

                                Button("Open native fallback") {
                                    useFallback = true
                                }
                                .buttonStyle(.bordered)
                            }
                        }
                        .padding(24)
                    }
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            NativePushRegistry.refreshRegistration()
        }
    }
}

private struct NativeWebMirrorWebView: UIViewRepresentable {
    let url: URL
    let reloadToken: UUID
    @Binding var firstLoadCompleted: Bool
    @Binding var fatalError: String?

    func makeCoordinator() -> Coordinator {
        Coordinator(firstLoadCompleted: $firstLoadCompleted, fatalError: $fatalError)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let contentController = configuration.userContentController
        contentController.addUserScript(
            WKUserScript(
                source: NativePushRegistry.bridgeBootstrapScript(),
                injectionTime: .atDocumentStart,
                forMainFrameOnly: false
            )
        )
        contentController.add(context.coordinator, name: "flbpNativePush")
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = true
        context.coordinator.attach(webView)
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        webView.load(request)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if context.coordinator.lastReloadToken != reloadToken {
            context.coordinator.lastReloadToken = reloadToken
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            webView.load(request)
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        @Binding var firstLoadCompleted: Bool
        @Binding var fatalError: String?
        var lastReloadToken = UUID()
        private weak var webView: WKWebView?
        private var registrationObserver: NSObjectProtocol?

        init(firstLoadCompleted: Binding<Bool>, fatalError: Binding<String?>) {
            _firstLoadCompleted = firstLoadCompleted
            _fatalError = fatalError
            super.init()
            registrationObserver = NotificationCenter.default.addObserver(
                forName: .flbpNativePushRegistrationDidChange,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.pushRegistrationSnapshot()
            }
        }

        deinit {
            if let registrationObserver {
                NotificationCenter.default.removeObserver(registrationObserver)
            }
        }

        func attach(_ webView: WKWebView) {
            self.webView = webView
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "flbpNativePush" else { return }
            let body = message.body as? [String: Any]
            let type = (body?["type"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased() ?? ""
            switch type {
            case "requestpermission":
                NativePushRegistry.requestPermission()
            case "refreshregistration":
                NativePushRegistry.refreshRegistration()
            default:
                break
            }
        }

        private func pushRegistrationSnapshot() {
            guard let webView else { return }
            webView.evaluateJavaScript(NativePushRegistry.syncScript(), completionHandler: nil)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            firstLoadCompleted = true
            fatalError = nil
            pushRegistrationSnapshot()
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            if !firstLoadCompleted {
                fatalError = error.localizedDescription
            }
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            if !firstLoadCompleted {
                fatalError = error.localizedDescription
            }
        }
    }
}
