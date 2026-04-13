package com.flbp.manager.suite

import android.Manifest
import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.json.JSONObject

object NativeWebMirrorConfig {
    const val enabled: Boolean = true
    const val baseUrl: String = "https://flbp-pages.pages.dev/?native_shell=android&shell_rev=20260403f"
}

private class NativePushJavascriptBridge(
    private val context: android.content.Context,
    private val onRequestPermission: () -> Unit,
    private val onRefreshRegistration: () -> Unit,
) {
    private val mainHandler = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun getRegistrationJson(): String = NativePushRegistry.registrationJson(context)

    @JavascriptInterface
    fun requestPermission(): String {
        mainHandler.post { onRequestPermission() }
        return NativePushRegistry.registrationJson(context)
    }

    @JavascriptInterface
    fun refreshRegistration(): String {
        mainHandler.post { onRefreshRegistration() }
        return NativePushRegistry.registrationJson(context)
    }
}

private fun pushNativeRegistrationIntoWebView(webView: WebView?, context: android.content.Context) {
    val target = webView ?: return
    val escapedJson = JSONObject.quote(NativePushRegistry.registrationJson(context))
    val script = """
        (function () {
          try {
            var snapshot = JSON.parse($escapedJson);
            window.__flbpNativePushRegistration = snapshot;
            window.dispatchEvent(new CustomEvent('${NativePushRegistry.eventName}', { detail: snapshot }));
          } catch (error) {
            console.warn('FLBP native push sync failed', error);
          }
        })();
    """.trimIndent()
    target.evaluateJavascript(script, null)
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun NativeWebMirrorHost(
    fallback: @Composable (() -> Unit)? = null,
) {
    val context = LocalContext.current
    var reloadNonce by rememberSaveable { mutableIntStateOf(0) }
    var initialLoadComplete by rememberSaveable { mutableStateOf(false) }
    var fatalError by rememberSaveable { mutableStateOf<String?>(null) }
    var canGoBack by remember { mutableStateOf(false) }
    var useFallback by rememberSaveable { mutableStateOf(false) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) {
        NativePushRegistry.refreshRegistration(context)
    }

    val requestNotificationPermission = remember(context) {
        {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                NativePushRegistry.refreshRegistration(context)
            }
        }
    }

    DisposableEffect(context, webViewRef) {
        val listener: (NativePushRegistrationSnapshot) -> Unit = {
            webViewRef?.post { pushNativeRegistrationIntoWebView(webViewRef, context) }
        }
        NativePushRegistry.addListener(listener)
        onDispose {
            NativePushRegistry.removeListener(listener)
        }
    }

    if (useFallback && fallback != null) {
        fallback()
        return
    }

    BackHandler(enabled = canGoBack) {
        webViewRef?.goBack()
    }

    Box(modifier = Modifier.fillMaxSize()) {
        key(reloadNonce) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { factoryContext ->
                    CookieManager.getInstance().setAcceptCookie(true)
                    NativePushRegistry.createNotificationChannel(factoryContext)
                    NativePushRegistry.refreshRegistration(factoryContext)
                    WebView(factoryContext).apply {
                        webViewRef = this
                        CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.allowFileAccess = false
                        settings.databaseEnabled = true
                        settings.loadsImagesAutomatically = true
                        settings.loadWithOverviewMode = true
                        settings.useWideViewPort = true
                        settings.cacheMode = WebSettings.LOAD_NO_CACHE
                        addJavascriptInterface(
                            NativePushJavascriptBridge(
                                context = factoryContext,
                                onRequestPermission = requestNotificationPermission,
                                onRefreshRegistration = { NativePushRegistry.refreshRegistration(factoryContext) },
                            ),
                            "FLBPNativePushBridge",
                        )
                        clearCache(true)
                        clearHistory()
                        clearFormData()
                        webChromeClient = WebChromeClient()
                        webViewClient = object : WebViewClient() {
                            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                                fatalError = null
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                initialLoadComplete = true
                                fatalError = null
                                canGoBack = view?.canGoBack() == true
                                pushNativeRegistrationIntoWebView(view, factoryContext)
                            }

                            override fun onReceivedError(
                                view: WebView?,
                                request: WebResourceRequest?,
                                error: WebResourceError?,
                            ) {
                                if (request?.isForMainFrame == true && !initialLoadComplete) {
                                    fatalError = error?.description?.toString() ?: "Unable to load the FLBP web experience."
                                }
                                canGoBack = view?.canGoBack() == true
                            }
                        }
                        loadUrl(NativeWebMirrorConfig.baseUrl)
                    }
                },
                update = { view ->
                    webViewRef = view
                    canGoBack = view.canGoBack()
                },
            )
        }

        if (!initialLoadComplete && fatalError != null) {
            Surface(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp),
                color = NativeFlbpPalette.page.copy(alpha = 0.96f),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = "FLBP web mirror not available",
                        style = MaterialTheme.typography.headlineSmall,
                        color = NativeFlbpPalette.ink,
                    )
                    Text(
                        text = fatalError ?: "Unable to load the FLBP web experience.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = NativeFlbpPalette.ink.copy(alpha = 0.75f),
                        modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
                    )
                    Button(onClick = {
                        fatalError = null
                        initialLoadComplete = false
                        reloadNonce += 1
                    }) {
                        Text("Retry")
                    }
                    if (fallback != null) {
                        Button(
                            onClick = { useFallback = true },
                            modifier = Modifier.padding(top = 10.dp),
                        ) {
                            Text("Open native fallback")
                        }
                    }
                }
            }
        }
    }
}
