package com.flbp.manager.suite

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArraySet

private const val PUSH_PREFS = "flbp_native_push"
private const val KEY_DEVICE_ID = "device_id"
private const val KEY_DEVICE_TOKEN = "device_token"
private const val KEY_LAST_ERROR = "last_error"

data class NativePushRegistrationSnapshot(
    val platform: String,
    val provider: String,
    val deviceId: String,
    val deviceToken: String?,
    val permission: String,
    val pushEnabled: Boolean,
    val configReady: Boolean,
    val appVersion: String?,
    val lastError: String?,
) {
    fun toJsonString(): String = JSONObject().apply {
        put("platform", platform)
        put("provider", provider)
        put("deviceId", deviceId)
        put("deviceToken", deviceToken ?: JSONObject.NULL)
        put("permission", permission)
        put("pushEnabled", pushEnabled)
        put("configReady", configReady)
        put("appVersion", appVersion ?: JSONObject.NULL)
        put("lastError", lastError ?: JSONObject.NULL)
    }.toString()
}

object NativePushRegistry {
    const val eventName: String = "flbp-native-push-registration"
    const val notificationChannelId: String = "team_calls"

    private val listeners = CopyOnWriteArraySet<(NativePushRegistrationSnapshot) -> Unit>()

    fun readOrCreateDeviceId(context: Context): String {
        val prefs = context.getSharedPreferences(PUSH_PREFS, Context.MODE_PRIVATE)
        val current = prefs.getString(KEY_DEVICE_ID, null)?.trim().orEmpty()
        if (current.isNotEmpty()) return current
        val next = "android_" + java.util.UUID.randomUUID().toString().replace("-", "").take(12)
        prefs.edit().putString(KEY_DEVICE_ID, next).apply()
        return next
    }

    fun addListener(listener: (NativePushRegistrationSnapshot) -> Unit) {
        listeners.add(listener)
    }

    fun removeListener(listener: (NativePushRegistrationSnapshot) -> Unit) {
        listeners.remove(listener)
    }

    fun readSnapshot(context: Context): NativePushRegistrationSnapshot {
        val prefs = context.getSharedPreferences(PUSH_PREFS, Context.MODE_PRIVATE)
        val token = prefs.getString(KEY_DEVICE_TOKEN, null)?.trim().orEmpty().ifEmpty { null }
        val error = prefs.getString(KEY_LAST_ERROR, null)?.trim().orEmpty().ifEmpty { null }
        val configReady = hasFirebaseConfig(context)
        val permission = notificationPermissionState(context)
        return NativePushRegistrationSnapshot(
            platform = "android",
            provider = "fcm",
            deviceId = readOrCreateDeviceId(context),
            deviceToken = token,
            permission = permission,
            pushEnabled = permission == "granted" && !token.isNullOrBlank(),
            configReady = configReady,
            appVersion = runCatching {
                context.packageManager.getPackageInfo(context.packageName, 0).versionName
            }.getOrNull(),
            lastError = error ?: if (!configReady) "FCM Android non configurato nell'app nativa." else null,
        )
    }

    fun registrationJson(context: Context): String = readSnapshot(context).toJsonString()

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = ContextCompat.getSystemService(context, android.app.NotificationManager::class.java) ?: return
        val channel = android.app.NotificationChannel(
            notificationChannelId,
            context.getString(R.string.notification_channel_team_calls),
            android.app.NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.notification_channel_team_calls_description)
        }
        manager.createNotificationChannel(channel)
    }

    fun refreshRegistration(context: Context) {
        createNotificationChannel(context)
        if (!ensureFirebaseInitialized(context)) {
            notifyListeners(context)
            return
        }
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token ->
                updateDeviceToken(context, token)
            }
            .addOnFailureListener { error ->
                updateLastError(context, error.localizedMessage ?: "FCM token non disponibile.")
            }
    }

    fun updateDeviceToken(context: Context, token: String?) {
        val prefs = context.getSharedPreferences(PUSH_PREFS, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_DEVICE_TOKEN, token?.trim()?.ifEmpty { null })
            .remove(KEY_LAST_ERROR)
            .apply()
        notifyListeners(context)
    }

    fun updateLastError(context: Context, message: String?) {
        val prefs = context.getSharedPreferences(PUSH_PREFS, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_LAST_ERROR, message?.trim()?.ifEmpty { null }).apply()
        notifyListeners(context)
    }

    private fun notifyListeners(context: Context) {
        val snapshot = readSnapshot(context)
        listeners.forEach { listener ->
            runCatching { listener(snapshot) }
        }
    }

    private fun notificationPermissionState(context: Context): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) return "prompt"
        }
        return if (NotificationManagerCompat.from(context).areNotificationsEnabled()) "granted" else "denied"
    }

    private fun hasFirebaseConfig(context: Context): Boolean {
        val appId = runCatching { context.getString(R.string.fcm_application_id).trim() }.getOrDefault("")
        val projectId = runCatching { context.getString(R.string.fcm_project_id).trim() }.getOrDefault("")
        val apiKey = runCatching { context.getString(R.string.fcm_api_key).trim() }.getOrDefault("")
        val senderId = runCatching { context.getString(R.string.fcm_sender_id).trim() }.getOrDefault("")
        return appId.isNotEmpty() && projectId.isNotEmpty() && apiKey.isNotEmpty() && senderId.isNotEmpty()
    }

    private fun ensureFirebaseInitialized(context: Context): Boolean {
        if (!hasFirebaseConfig(context)) {
            updateLastError(context, "Config Firebase mancante. Completa le chiavi FCM Android.")
            return false
        }
        if (FirebaseApp.getApps(context).isNotEmpty()) return true
        val options = FirebaseOptions.Builder()
            .setApplicationId(context.getString(R.string.fcm_application_id).trim())
            .setProjectId(context.getString(R.string.fcm_project_id).trim())
            .setApiKey(context.getString(R.string.fcm_api_key).trim())
            .setGcmSenderId(context.getString(R.string.fcm_sender_id).trim())
            .build()
        return runCatching {
            FirebaseApp.initializeApp(context, options)
            true
        }.getOrElse { error ->
            updateLastError(context, error.localizedMessage ?: "Firebase non inizializzato.")
            false
        }
    }
}
