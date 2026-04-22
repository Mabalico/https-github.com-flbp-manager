package com.flbp.manager.suite

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
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
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
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
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import android.os.SystemClock
import org.json.JSONObject

object NativeWebMirrorConfig {
    const val enabled: Boolean = true
    const val baseUrl: String = "https://flbp-pages.pages.dev/?native_shell=android&shell_rev=20260422b"
}

private class NativePushJavascriptBridge(
    private val context: android.content.Context,
    private val onRequestPermission: () -> Unit,
    private val onRefreshRegistration: () -> Unit,
    private val onOpenSettings: () -> Unit,
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

    // Android deep link: apre prima le impostazioni notifiche dell'app (ACTION_APP_NOTIFICATION_SETTINGS),
    // con fallback automatico alla pagina dettagli app (ACTION_APPLICATION_DETAILS_SETTINGS).
    @JavascriptInterface
    fun openSettings(): String {
        mainHandler.post { onOpenSettings() }
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

private fun areAppNotificationsEnabled(context: android.content.Context): Boolean =
    NotificationManagerCompat.from(context).areNotificationsEnabled()

private tailrec fun findActivity(context: android.content.Context): Activity? = when (context) {
    is Activity -> context
    is ContextWrapper -> findActivity(context.baseContext)
    else -> null
}

private fun launchSettingsIntent(context: android.content.Context, intent: Intent): Boolean {
    val packageManager = context.packageManager
    val resolved = intent.resolveActivity(packageManager) != null
    if (!resolved) return false
    val activity = findActivity(context)
    return runCatching {
        if (activity != null) {
            activity.startActivity(intent)
        } else {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }
        true
    }.getOrDefault(false)
}

private fun openAppNotificationSettings(context: android.content.Context) {
    val notificationSettingsIntent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
        putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        putExtra("app_package", context.packageName)
        putExtra("app_uid", context.applicationInfo.uid)
        data = Uri.fromParts("package", context.packageName, null)
    }
    val appSettingsIntent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:${context.packageName}")
    }
    if (!launchSettingsIntent(context, notificationSettingsIntent)) {
        launchSettingsIntent(context, appSettingsIntent)
    }
}

/**
 * Decides whether to request the system permission dialog (first time, API 33+)
 * or to open the app notification settings directly (already denied / older API).
 * Safe to call from the JS bridge because it uses FLAG_ACTIVITY_NEW_TASK.
 */
private fun requestOrOpenNotificationSettings(
    context: android.content.Context,
    permissionLauncher: androidx.activity.result.ActivityResultLauncher<String>?,
) {
    NativePushRegistry.createNotificationChannel(context)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        when {
            granted && NotificationManagerCompat.from(context).areNotificationsEnabled() -> {
                NativePushRegistry.refreshRegistration(context)
            }
            !granted && !NativePushRegistry.hasRequestedNotificationPermission(context) && permissionLauncher != null -> {
                // First-time request: show system dialog via the Compose launcher.
                NativePushRegistry.markNotificationPermissionRequested(context)
                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
            else -> {
                // Already denied or system launcher not available: open settings.
                NativePushRegistry.refreshRegistration(context)
                openAppNotificationSettings(context)
            }
        }
    } else if (NotificationManagerCompat.from(context).areNotificationsEnabled()) {
        NativePushRegistry.refreshRegistration(context)
    } else {
        openAppNotificationSettings(context)
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun NativeWebMirrorHost(
    fallback: @Composable (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var reloadNonce by rememberSaveable { mutableIntStateOf(0) }
    var initialLoadComplete by rememberSaveable { mutableStateOf(false) }
    var fatalError by rememberSaveable { mutableStateOf<String?>(null) }
    var canGoBack by remember { mutableStateOf(false) }
    var useFallback by rememberSaveable { mutableStateOf(false) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { _ ->
        NativePushRegistry.refreshRegistration(context)
    }

    val requestNotificationPermission = remember(context, permissionLauncher) {
        { requestOrOpenNotificationSettings(context, permissionLauncher) }
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

    DisposableEffect(lifecycleOwner, webViewRef) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                webViewRef?.let { dispatchAndroidShellResume(it) }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
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
                        settings.loadWithOverviewMode = false
                        settings.useWideViewPort = true
                        settings.cacheMode = WebSettings.LOAD_NO_CACHE
                        addJavascriptInterface(
                            NativePushJavascriptBridge(
                                context = factoryContext,
                                onRequestPermission = requestNotificationPermission,
                                onRefreshRegistration = { NativePushRegistry.refreshRegistration(factoryContext) },
                                // The web layer uses openSettings() as the single CTA for
                                // "attiva notifiche". On Android we keep the native decision:
                                // first request => system dialog, denied/disabled => app settings.
                                onOpenSettings = {
                                    requestOrOpenNotificationSettings(factoryContext, permissionLauncher)
                                },
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
                                // The SPA already knows how to clear transient overlays on this event.
                                // Re-dispatch it here as well so the page can recover even when the
                                // lifecycle resume happened before the first visually stable frame.
                                view?.let(::dispatchAndroidShellResume)
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

private fun dispatchAndroidShellResume(webView: WebView) {
    val js = """
        (() => {
          document.documentElement.classList.add('flbp-android-webview');
          window.dispatchEvent(new CustomEvent('flbp-native-resume'));
        })();
    """.trimIndent()

    webView.post {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            webView.postVisualStateCallback(
                SystemClock.uptimeMillis(),
                object : WebView.VisualStateCallback() {
                    override fun onComplete(requestId: Long) {
                        webView.evaluateJavascript(js, null)
                        webView.invalidate()
                    }
                }
            )
        } else {
            webView.evaluateJavascript(js, null)
            webView.invalidate()
        }
    }
}
