import SwiftUI
import WebKit

enum NativeWebMirrorConfig {
    static let enabled = true
    static let baseUrl = URL(string: "https://flbp.marcoxbaroncelli.workers.dev/?native_shell=ios&shell_rev=20260403d")!
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
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = true
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

    final class Coordinator: NSObject, WKNavigationDelegate {
        @Binding var firstLoadCompleted: Bool
        @Binding var fatalError: String?
        var lastReloadToken = UUID()

        init(firstLoadCompleted: Binding<Bool>, fatalError: Binding<String?>) {
            _firstLoadCompleted = firstLoadCompleted
            _fatalError = fatalError
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            firstLoadCompleted = true
            fatalError = nil
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
