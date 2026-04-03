package com.flbp.manager.suite

import android.content.Context
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

private const val PROTECTED_SUPABASE_URL = "https://kgwhcemqkgqvtsctnwql.supabase.co"
private const val PROTECTED_SUPABASE_ANON_KEY = "sb_publishable_XhZ5hAdoycuWfDMeiQKaGA_7gD6nDhz"
private const val PROTECTED_SUPABASE_WORKSPACE_ID = "default"
private const val PROTECTED_ADMIN_EMAIL = "admin@flbp.local"

data class NativeAdminSession(
    val accessToken: String,
    val refreshToken: String?,
    val expiresAt: String?,
    val email: String?,
    val userId: String?,
)

data class NativePlayerSupabaseSession(
    val accessToken: String,
    val refreshToken: String?,
    val expiresAtEpochMs: Long?,
    val email: String?,
    val userId: String?,
    val provider: String,
)

data class NativeAdminAccessResult(
    val ok: Boolean,
    val email: String? = null,
    val userId: String? = null,
    val reason: String? = null,
)

data class NativePlayerSupabaseProfileRow(
    val workspaceId: String,
    val userId: String,
    val firstName: String,
    val lastName: String,
    val birthDate: String?,
    val canonicalPlayerId: String?,
    val canonicalPlayerName: String?,
    val createdAt: String?,
    val updatedAt: String?,
)

data class NativePlayerSupabaseCallRow(
    val id: String,
    val workspaceId: String,
    val tournamentId: String,
    val teamId: String,
    val teamName: String?,
    val targetUserId: String,
    val targetPlayerId: String?,
    val targetPlayerName: String?,
    val status: String,
    val requestedAt: String?,
    val acknowledgedAt: String?,
    val cancelledAt: String?,
)

data class NativeAdminPlayerAccountCatalogRow(
    val userId: String,
    val email: String?,
    val primaryProvider: String?,
    val providers: List<String>,
    val createdAt: String?,
    val lastLoginAt: String?,
    val hasProfile: Boolean,
    val linkedPlayerName: String?,
    val birthDate: String?,
    val canonicalPlayerId: String?,
)

data class NativeRefereeAuthCheckResult(
    val ok: Boolean,
    val reason: String? = null,
    val authVersion: String? = null,
)

data class NativeRefereeLiveStatePullResult(
    val ok: Boolean,
    val reason: String? = null,
    val authVersion: String? = null,
    val updatedAt: String? = null,
    val stateJson: String? = null,
)

data class NativeAdminOverview(
    val workspaceStateUpdatedAt: String? = null,
    val publicWorkspaceStateUpdatedAt: String? = null,
)

data class NativeProtectedTrafficUsageRow(
    val usageDate: String,
    val bucket: String,
    val requestCount: Long,
    val requestBytes: Long,
    val responseBytes: Long,
)

data class NativeProtectedBillingCycleWindow(
    val startDate: String,
    val todayDate: String,
    val nextResetDate: String,
    val displayEndDate: String,
)

data class NativeProtectedDateRangeWindow(
    val startDate: String,
    val endDate: String,
)

data class NativeProtectedSiteViewsRow(
    val viewDate: String,
    val views: Long,
)

data class NativeProtectedMatchBrief(
    val match: NativeMatchInfo,
    val title: String,
    val teamALabel: String,
    val teamBLabel: String,
    val teamAPlayers: String,
    val teamBPlayers: String,
    val scoreLabel: String,
    val playable: Boolean,
    val blockedByPlaceholder: Boolean,
)

data class NativeProtectedReportPlayerDraft(
    val key: String,
    val teamId: String,
    val teamName: String,
    val playerName: String,
    val canestri: Int,
    val soffi: Int,
)

data class NativeProtectedReportTeamDraft(
    val teamId: String,
    val teamName: String,
    val players: List<NativeProtectedReportPlayerDraft>,
    val derivedScore: Int,
)

data class NativeProtectedReportDraft(
    val match: NativeMatchInfo,
    val title: String,
    val playable: Boolean,
    val teams: List<NativeProtectedReportTeamDraft>,
    val derivedScoresByTeam: Map<String, Int>,
    val winnerTeamId: String?,
    val tieNotAllowed: Boolean,
    val hasStoredStats: Boolean,
    val totalPoints: Int,
    val totalSoffi: Int,
)

data class NativeProtectedReportSaveStat(
    val teamId: String,
    val teamName: String,
    val playerName: String,
    val canestri: Int,
    val soffi: Int,
)

data class NativeProtectedReportSaveDraft(
    val matchId: String,
    val title: String,
    val scoreA: Int,
    val scoreB: Int,
    val scoreLabel: String,
    val winnerTeamId: String?,
    val winnerTeamName: String?,
    val readyToSave: Boolean,
    val requiresOverwriteConfirm: Boolean,
    val blockReason: String?,
    val backendReady: Boolean,
    val backendNote: String,
    val stats: List<NativeProtectedReportSaveStat>,
)

data class NativeProtectedReportFormInput(
    val canestriText: String,
    val soffiText: String,
)

data class NativeProtectedCodeLookupResult(
    val normalizedCode: String,
    val selectedMatch: NativeMatchInfo? = null,
    val duplicateChoices: List<NativeProtectedMatchBrief> = emptyList(),
    val error: String? = null,
)

data class NativeProtectedTournamentSnapshot(
    val visibleTeamCount: Int,
    val visibleMatchCount: Int,
    val playedCount: Int,
    val liveCount: Int,
    val upcomingCount: Int,
    val tbdCount: Int,
    val turnsSnapshot: NativeTurnsSnapshot,
    val featuredTurnBlocks: List<NativeTurnBlock>,
    val upcomingPlayableMatches: List<NativeProtectedMatchBrief>,
    val blockedMatches: List<NativeProtectedMatchBrief>,
)

class NativeProtectedCache(context: Context) {
    private val prefs = context.getSharedPreferences("flbp_native_protected", Context.MODE_PRIVATE)

    fun readAdminSession(): NativeAdminSession? {
        val accessToken = prefs.getString("admin_access_token", null)?.trim().orEmpty()
        if (accessToken.isEmpty()) return null
        return NativeAdminSession(
            accessToken = accessToken,
            refreshToken = prefs.getString("admin_refresh_token", null)?.trim()?.ifEmpty { null },
            expiresAt = prefs.getString("admin_expires_at", null)?.trim()?.ifEmpty { null },
            email = prefs.getString("admin_email", null)?.trim()?.ifEmpty { null },
            userId = prefs.getString("admin_user_id", null)?.trim()?.ifEmpty { null },
        )
    }

    fun writeAdminSession(session: NativeAdminSession?) {
        prefs.edit().apply {
            if (session == null || session.accessToken.isBlank()) {
                remove("admin_access_token")
                remove("admin_refresh_token")
                remove("admin_expires_at")
                remove("admin_email")
                remove("admin_user_id")
            } else {
                putString("admin_access_token", session.accessToken)
                putString("admin_refresh_token", session.refreshToken)
                putString("admin_expires_at", session.expiresAt)
                putString("admin_email", session.email)
                putString("admin_user_id", session.userId)
            }
        }.apply()
    }

    fun readPlayerSession(): NativePlayerSupabaseSession? {
        val accessToken = prefs.getString("player_access_token", null)?.trim().orEmpty()
        if (accessToken.isEmpty()) return null
        return NativePlayerSupabaseSession(
            accessToken = accessToken,
            refreshToken = prefs.getString("player_refresh_token", null)?.trim()?.ifEmpty { null },
            expiresAtEpochMs = prefs.getLong("player_expires_at_ms", -1L).takeIf { it > 0L },
            email = prefs.getString("player_email", null)?.trim()?.ifEmpty { null },
            userId = prefs.getString("player_user_id", null)?.trim()?.ifEmpty { null },
            provider = prefs.getString("player_provider", null)?.trim()?.ifEmpty { null } ?: "password",
        )
    }

    fun writePlayerSession(session: NativePlayerSupabaseSession?) {
        prefs.edit().apply {
            if (session == null || session.accessToken.isBlank()) {
                remove("player_access_token")
                remove("player_refresh_token")
                remove("player_expires_at_ms")
                remove("player_email")
                remove("player_user_id")
                remove("player_provider")
            } else {
                putString("player_access_token", session.accessToken)
                putString("player_refresh_token", session.refreshToken)
                if (session.expiresAtEpochMs != null && session.expiresAtEpochMs > 0L) {
                    putLong("player_expires_at_ms", session.expiresAtEpochMs)
                } else {
                    remove("player_expires_at_ms")
                }
                putString("player_email", session.email)
                putString("player_user_id", session.userId)
                putString("player_provider", session.provider)
            }
        }.apply()
    }

    fun readOrCreatePlayerDeviceId(): String {
        val current = prefs.getString("player_device_id", null)?.trim().orEmpty()
        if (current.isNotEmpty()) return current
        val next = "android_" + java.util.UUID.randomUUID().toString().replace("-", "").take(12)
        prefs.edit().putString("player_device_id", next).apply()
        return next
    }

    fun readSelectedRefereeName(tournamentId: String): String? {
        val safeTournamentId = tournamentId.trim()
        if (safeTournamentId.isEmpty()) return null
        return prefs.getString("referee_name_$safeTournamentId", null)?.trim()?.ifEmpty { null }
    }

    fun writeSelectedRefereeName(tournamentId: String, refereeName: String?) {
        val safeTournamentId = tournamentId.trim()
        if (safeTournamentId.isEmpty()) return
        prefs.edit().apply {
            val normalized = refereeName?.trim()?.ifEmpty { null }
            if (normalized == null) {
                remove("referee_name_$safeTournamentId")
            } else {
                putString("referee_name_$safeTournamentId", normalized)
            }
        }.apply()
    }
}

object NativeProtectedApi {
    fun defaultAdminEmail(): String = PROTECTED_ADMIN_EMAIL

    fun isPlayerBackendPendingError(message: String): Boolean {
        val safeMessage = message.trim()
        if (safeMessage.isEmpty()) return false
        return Regex(
            pattern = "player_app_profiles|player_app_devices|player_app_calls|flbp_player_ack_call|flbp_player_call_team|flbp_admin_list_player_accounts|relation .*player_app_|function .*flbp_player_",
            option = RegexOption.IGNORE_CASE,
        ).containsMatchIn(safeMessage)
    }

    suspend fun signInWithPassword(email: String, password: String): NativeAdminSession = withContext(Dispatchers.IO) {
        val safeEmail = email.trim()
        val safePassword = password
        if (safeEmail.isEmpty() || safePassword.isEmpty()) {
            throw IllegalArgumentException("Inserisci email e password.")
        }

        val response = requestObject(
            path = "auth/v1/token?grant_type=password",
            method = "POST",
            bearer = null,
            body = JSONObject().apply {
                put("email", safeEmail)
                put("password", safePassword)
            },
        )

        val accessToken = response.optString("access_token").trim()
        if (accessToken.isEmpty()) {
            throw IllegalStateException("Login fallito (token mancante).")
        }

        val refreshToken = response.optString("refresh_token").trim().ifEmpty { null }
        val expiresIn = response.optLong("expires_in", 0L)
        val expiresAt = if (expiresIn > 0L) {
            java.util.Date(System.currentTimeMillis() + expiresIn * 1000L).toString()
        } else {
            null
        }
        val user = response.optJSONObject("user")
        NativeAdminSession(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAt = expiresAt,
            email = user?.optString("email")?.trim()?.ifEmpty { safeEmail } ?: safeEmail,
            userId = user?.optString("id")?.trim()?.ifEmpty { null },
        )
    }

    suspend fun signOut(session: NativeAdminSession?) = withContext(Dispatchers.IO) {
        val token = session?.accessToken?.trim().orEmpty()
        if (token.isEmpty()) return@withContext
        runCatching {
            requestObject(
                path = "auth/v1/logout",
                method = "POST",
                bearer = token,
                body = null,
            )
        }
    }

    suspend fun signInPlayerWithPassword(email: String, password: String): NativePlayerSupabaseSession = withContext(Dispatchers.IO) {
        val safeEmail = email.trim()
        val safePassword = password
        if (safeEmail.isEmpty() || safePassword.isEmpty()) {
            throw IllegalArgumentException("Inserisci email e password.")
        }
        val response = requestObject(
            path = "auth/v1/token?grant_type=password",
            method = "POST",
            bearer = null,
            body = JSONObject().apply {
                put("email", safeEmail)
                put("password", safePassword)
            },
        )
        parsePlayerSession(response, safeEmail, "password")
    }

    suspend fun signUpPlayerWithPassword(
        email: String,
        password: String,
        metadata: JSONObject? = null,
    ): NativePlayerSupabaseSession = withContext(Dispatchers.IO) {
        val safeEmail = email.trim()
        val safePassword = password
        if (safeEmail.isEmpty() || safePassword.isEmpty()) {
            throw IllegalArgumentException("Inserisci email e password.")
        }
        val response = requestObject(
            path = "auth/v1/signup",
            method = "POST",
            bearer = null,
            body = JSONObject().apply {
                put("email", safeEmail)
                put("password", safePassword)
                put("data", metadata ?: JSONObject())
            },
        )
        parsePlayerSession(response, safeEmail, "password")
    }

    suspend fun ensureFreshPlayerSession(cache: NativeProtectedCache): NativePlayerSupabaseSession? = withContext(Dispatchers.IO) {
        val session = cache.readPlayerSession() ?: return@withContext null
        val expiresAt = session.expiresAtEpochMs ?: return@withContext session
        if (expiresAt > System.currentTimeMillis() + 60_000L) {
            return@withContext session
        }
        val refreshToken = session.refreshToken?.trim().orEmpty()
        if (refreshToken.isEmpty()) {
            cache.writePlayerSession(null)
            return@withContext null
        }
        val response = runCatching {
            requestObject(
                path = "auth/v1/token?grant_type=refresh_token",
                method = "POST",
                bearer = null,
                body = JSONObject().apply {
                    put("refresh_token", refreshToken)
                },
            )
        }.getOrElse {
            cache.writePlayerSession(null)
            return@withContext null
        }
        val refreshed = parsePlayerSession(response, session.email, session.provider)
        cache.writePlayerSession(refreshed)
        refreshed
    }

    suspend fun requestPlayerPasswordReset(email: String) = withContext(Dispatchers.IO) {
        val safeEmail = email.trim()
        if (safeEmail.isEmpty()) throw IllegalArgumentException("Inserisci una email valida.")
        requestObject(
            path = "auth/v1/recover",
            method = "POST",
            bearer = null,
            body = JSONObject().apply {
                put("email", safeEmail)
            },
        )
    }

    suspend fun signOutPlayer(session: NativePlayerSupabaseSession?) = withContext(Dispatchers.IO) {
        val token = session?.accessToken?.trim().orEmpty()
        if (token.isEmpty()) return@withContext
        runCatching {
            requestObject(
                path = "auth/v1/logout",
                method = "POST",
                bearer = token,
                body = null,
            )
        }
    }

    suspend fun registerPlayerDevice(
        session: NativePlayerSupabaseSession,
        deviceId: String,
        platform: String = "android",
        deviceToken: String? = null,
        pushEnabled: Boolean = true,
    ) = withContext(Dispatchers.IO) {
        val userId = resolvePlayerSessionUserId(session)
            ?: throw IllegalArgumentException("Sessione player non valida.")
        val safeDeviceId = deviceId.trim()
        if (safeDeviceId.isEmpty()) throw IllegalArgumentException("Device id mancante.")
        val payload = JSONObject().apply {
            put("id", safeDeviceId)
            put("workspace_id", PROTECTED_SUPABASE_WORKSPACE_ID)
            put("user_id", userId)
            put("platform", platform)
            put("device_token", deviceToken?.trim()?.takeIf { it.isNotEmpty() } ?: JSONObject.NULL)
            put("push_enabled", pushEnabled)
        }
        requestArray(
            path = "rest/v1/player_app_devices?on_conflict=id&select=id",
            method = "POST",
            bearer = session.accessToken,
            body = payload,
            extraHeaders = mapOf("Prefer" to "resolution=merge-duplicates,return=representation"),
        )
    }

    suspend fun pullPlayerProfile(session: NativePlayerSupabaseSession): NativePlayerSupabaseProfileRow? = withContext(Dispatchers.IO) {
        val userId = resolvePlayerSessionUserId(session) ?: return@withContext null
        val rows = requestArray(
            path = "rest/v1/player_app_profiles" +
                "?workspace_id=eq.${encode(PROTECTED_SUPABASE_WORKSPACE_ID)}" +
                "&user_id=eq.${encode(userId)}" +
                "&select=workspace_id,user_id,first_name,last_name,birth_date,canonical_player_id,canonical_player_name,created_at,updated_at" +
                "&limit=1",
            bearer = session.accessToken,
        )
        rows.firstObjectOrNull()?.let(::playerProfileRowFromJson)
    }

    suspend fun pushPlayerProfile(
        session: NativePlayerSupabaseSession,
        firstName: String,
        lastName: String,
        birthDate: String,
        canonicalPlayerId: String? = null,
        canonicalPlayerName: String? = null,
    ): NativePlayerSupabaseProfileRow = withContext(Dispatchers.IO) {
        val userId = resolvePlayerSessionUserId(session)
            ?: throw IllegalArgumentException("Sessione player non valida.")
        val payload = JSONObject().apply {
            put("workspace_id", PROTECTED_SUPABASE_WORKSPACE_ID)
            put("user_id", userId)
            put("first_name", firstName.trim())
            put("last_name", lastName.trim())
            put("birth_date", birthDate.trim())
            put("canonical_player_id", canonicalPlayerId?.trim()?.takeIf { it.isNotEmpty() } ?: JSONObject.NULL)
            put("canonical_player_name", canonicalPlayerName?.trim()?.takeIf { it.isNotEmpty() } ?: JSONObject.NULL)
        }
        val rows = requestArray(
            path = "rest/v1/player_app_profiles?on_conflict=workspace_id,user_id&select=workspace_id,user_id,first_name,last_name,birth_date,canonical_player_id,canonical_player_name,created_at,updated_at",
            method = "POST",
            bearer = session.accessToken,
            body = payload,
            extraHeaders = mapOf("Prefer" to "resolution=merge-duplicates,return=representation"),
        )
        rows.firstObjectOrNull()?.let(::playerProfileRowFromJson)
            ?: throw IllegalStateException("Profilo player non restituito.")
    }

    suspend fun pullPlayerCalls(session: NativePlayerSupabaseSession): List<NativePlayerSupabaseCallRow> = withContext(Dispatchers.IO) {
        val userId = resolvePlayerSessionUserId(session) ?: return@withContext emptyList()
        val rows = requestArray(
            path = "rest/v1/player_app_calls" +
                "?workspace_id=eq.${encode(PROTECTED_SUPABASE_WORKSPACE_ID)}" +
                "&target_user_id=eq.${encode(userId)}" +
                "&select=id,workspace_id,tournament_id,team_id,team_name,target_user_id,target_player_id,target_player_name,status,requested_at,acknowledged_at,cancelled_at" +
                "&order=requested_at.desc",
            bearer = session.accessToken,
        )
        buildList {
            for (index in 0 until rows.length()) {
                rows.optJSONObject(index)?.let { add(playerCallRowFromJson(it)) }
            }
        }
    }

    suspend fun acknowledgePlayerCall(session: NativePlayerSupabaseSession, callId: String) = withContext(Dispatchers.IO) {
        requestObject(
            path = "rest/v1/rpc/flbp_player_ack_call",
            method = "POST",
            bearer = session.accessToken,
            body = JSONObject().apply {
                put("p_workspace_id", PROTECTED_SUPABASE_WORKSPACE_ID)
                put("p_call_id", callId.trim())
            },
        )
    }

    suspend fun pullAdminPlayerAccounts(
        session: NativeAdminSession,
        origin: String? = null,
    ): List<NativeAdminPlayerAccountCatalogRow> = withContext(Dispatchers.IO) {
        val response = requestArray(
            path = "rest/v1/rpc/flbp_admin_list_player_accounts",
            method = "POST",
            bearer = session.accessToken,
            body = JSONObject().apply {
                put("p_workspace_id", PROTECTED_SUPABASE_WORKSPACE_ID)
                put("p_origin", origin?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: JSONObject.NULL)
            },
            extraHeaders = mapOf("Prefer" to "params=single-object"),
        )
        buildList {
            for (index in 0 until response.length()) {
                response.optJSONObject(index)?.let { add(adminPlayerAccountRowFromJson(it)) }
            }
        }
    }

    suspend fun pushAdminPlayerProfile(
        session: NativeAdminSession,
        userId: String,
        firstName: String,
        lastName: String,
        birthDate: String,
        canonicalPlayerId: String? = null,
        canonicalPlayerName: String? = null,
    ): NativePlayerSupabaseProfileRow = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("workspace_id", PROTECTED_SUPABASE_WORKSPACE_ID)
            put("user_id", userId.trim())
            put("first_name", firstName.trim())
            put("last_name", lastName.trim())
            put("birth_date", birthDate.trim())
            put("canonical_player_id", canonicalPlayerId?.trim()?.takeIf { it.isNotEmpty() } ?: JSONObject.NULL)
            put("canonical_player_name", canonicalPlayerName?.trim()?.takeIf { it.isNotEmpty() } ?: JSONObject.NULL)
        }
        val rows = requestArray(
            path = "rest/v1/player_app_profiles?on_conflict=workspace_id,user_id&select=workspace_id,user_id,first_name,last_name,birth_date,canonical_player_id,canonical_player_name,created_at,updated_at",
            method = "POST",
            bearer = session.accessToken,
            body = payload,
            extraHeaders = mapOf("Prefer" to "resolution=merge-duplicates,return=representation"),
        )
        rows.firstObjectOrNull()?.let(::playerProfileRowFromJson)
            ?: throw IllegalStateException("Profilo player live non restituito.")
    }

    suspend fun ensureAdminAccess(session: NativeAdminSession): NativeAdminAccessResult = withContext(Dispatchers.IO) {
        val userId = resolveSessionUserId(session)
            ?: return@withContext NativeAdminAccessResult(
                ok = false,
                email = session.email,
                reason = "Impossibile determinare l’utente autenticato.",
            )

        val rows = requestArray(
            path = "rest/v1/admin_users?user_id=eq.${encode(userId)}&select=user_id,email&limit=1",
            bearer = session.accessToken,
        )

        if (rows.length() == 0) {
            return@withContext NativeAdminAccessResult(
                ok = false,
                email = session.email,
                userId = userId,
                reason = "Questo account autenticato non ha ruolo admin in Supabase.",
            )
        }

        val row = rows.getJSONObject(0)
        NativeAdminAccessResult(
            ok = true,
            email = row.optString("email").trim().ifEmpty { session.email },
            userId = row.optString("user_id").trim().ifEmpty { userId },
        )
    }

    suspend fun fetchAdminOverview(session: NativeAdminSession): NativeAdminOverview = withContext(Dispatchers.IO) {
        val workspaceRows = requestArray(
            path = "rest/v1/workspace_state?workspace_id=eq.${encode(PROTECTED_SUPABASE_WORKSPACE_ID)}&select=updated_at&limit=1",
            bearer = session.accessToken,
        )
        val publicRows = requestArray(
            path = "rest/v1/public_workspace_state?workspace_id=eq.${encode(PROTECTED_SUPABASE_WORKSPACE_ID)}&select=updated_at&limit=1",
            bearer = session.accessToken,
        )

        NativeAdminOverview(
            workspaceStateUpdatedAt = workspaceRows.firstObjectOrNull()?.optNullableString("updated_at"),
            publicWorkspaceStateUpdatedAt = publicRows.firstObjectOrNull()?.optNullableString("updated_at"),
        )
    }

    suspend fun fetchTrafficUsageRange(
        session: NativeAdminSession,
        startDate: String,
        endDate: String,
    ): List<NativeProtectedTrafficUsageRow> = withContext(Dispatchers.IO) {
        val rows = requestArray(
            path = "rest/v1/app_supabase_usage_daily" +
                "?workspace_id=eq.${encode(PROTECTED_SUPABASE_WORKSPACE_ID)}" +
                "&usage_date=gte.${encode(startDate)}" +
                "&usage_date=lte.${encode(endDate)}" +
                "&select=usage_date,bucket,request_count,request_bytes,response_bytes" +
                "&order=usage_date.asc,bucket.asc",
            bearer = session.accessToken,
        )

        buildList {
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                add(
                    NativeProtectedTrafficUsageRow(
                        usageDate = row.optString("usage_date").trim(),
                        bucket = row.optString("bucket").trim().ifEmpty { "unknown" },
                        requestCount = row.optLong("request_count", 0L),
                        requestBytes = row.optLong("request_bytes", 0L),
                        responseBytes = row.optLong("response_bytes", 0L),
                    )
                )
            }
        }
    }

    suspend fun fetchSiteViewsRange(
        session: NativeAdminSession,
        startDate: String,
        endDate: String,
    ): List<NativeProtectedSiteViewsRow> = withContext(Dispatchers.IO) {
        val rows = requestArray(
            path = "rest/v1/public_site_views_daily" +
                "?workspace_id=eq.${encode(PROTECTED_SUPABASE_WORKSPACE_ID)}" +
                "&view_date=gte.${encode(startDate)}" +
                "&view_date=lte.${encode(endDate)}" +
                "&select=view_date,views" +
                "&order=view_date.asc",
            bearer = session.accessToken,
        )
        buildList {
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                add(
                    NativeProtectedSiteViewsRow(
                        viewDate = row.optString("view_date").trim(),
                        views = row.optLong("views", 0L),
                    )
                )
            }
        }
    }

    suspend fun verifyRefereePassword(tournamentId: String, refereePassword: String): NativeRefereeAuthCheckResult =
        withContext(Dispatchers.IO) {
            val safeTournamentId = tournamentId.trim()
            val safePassword = refereePassword.trim()
            if (safeTournamentId.isEmpty() || safePassword.isEmpty()) {
                throw IllegalArgumentException("Inserisci la password arbitri.")
            }

            val response = requestObject(
                path = "rest/v1/rpc/flbp_referee_auth_check",
                method = "POST",
                bearer = null,
                body = JSONObject().apply {
                    put("p_workspace_id", PROTECTED_SUPABASE_WORKSPACE_ID)
                    put("p_tournament_id", safeTournamentId)
                    put("p_referees_password", safePassword)
                },
            )

            NativeRefereeAuthCheckResult(
                ok = response.optBoolean("ok", false),
                reason = response.optNullableString("reason"),
                authVersion = response.optNullableString("auth_version"),
            )
        }

    suspend fun pullRefereeLiveState(tournamentId: String, refereePassword: String): NativeRefereeLiveStatePullResult =
        withContext(Dispatchers.IO) {
            val safeTournamentId = tournamentId.trim()
            val safePassword = refereePassword.trim()
            if (safeTournamentId.isEmpty() || safePassword.isEmpty()) {
                throw IllegalArgumentException("Inserisci la password arbitri.")
            }

            val response = try {
                requestObject(
                    path = "rest/v1/rpc/flbp_referee_pull_live_state",
                    method = "POST",
                    bearer = null,
                    body = JSONObject().apply {
                        put("p_workspace_id", PROTECTED_SUPABASE_WORKSPACE_ID)
                        put("p_tournament_id", safeTournamentId)
                        put("p_referees_password", safePassword)
                    },
                )
            } catch (error: IllegalStateException) {
                val message = error.message.orEmpty()
                val missingRpc = message.contains("PGRST202", ignoreCase = true) ||
                    (message.contains("flbp_referee_pull_live_state", ignoreCase = true) &&
                        message.contains("function", ignoreCase = true))
                if (missingRpc) {
                    throw IllegalStateException("RPC flbp_referee_pull_live_state non disponibile su questo progetto Supabase.")
                }
                throw error
            }

            NativeRefereeLiveStatePullResult(
                ok = response.optBoolean("ok", false),
                reason = response.optNullableString("reason"),
                authVersion = response.optNullableString("auth_version"),
                updatedAt = response.optNullableString("updated_at"),
                stateJson = response.optJSONObject("state")?.toString()
                    ?: response.optJSONArray("state")?.toString()
                    ?: response.opt("state")?.takeIf { it !is JSONObject && it !is JSONArray }?.toString(),
            )
        }

    private fun resolveSessionUserId(session: NativeAdminSession): String? {
        val direct = session.userId?.trim().orEmpty()
        if (direct.isNotEmpty()) return direct
        return decodeJwtSub(session.accessToken)
    }

    private fun resolvePlayerSessionUserId(session: NativePlayerSupabaseSession): String? {
        val direct = session.userId?.trim().orEmpty()
        if (direct.isNotEmpty()) return direct
        return decodeJwtSub(session.accessToken)
    }

    private fun parsePlayerSession(
        response: JSONObject,
        fallbackEmail: String?,
        providerHint: String,
    ): NativePlayerSupabaseSession {
        val accessToken = response.optString("access_token").trim()
        if (accessToken.isEmpty()) {
            val userEmail = response.optJSONObject("user")?.optNullableString("email")
            val message = if (!userEmail.isNullOrBlank() || !fallbackEmail.isNullOrBlank()) {
                "Supabase ha creato l'account ma non ha restituito una sessione attiva. Verifica se il provider email richiede conferma."
            } else {
                "Login/registrazione player falliti (token mancante)."
            }
            throw IllegalStateException(message)
        }

        val refreshToken = response.optNullableString("refresh_token")
        val expiresAtEpochMs = when {
            response.has("expires_at") && !response.isNull("expires_at") -> {
                val raw = response.optLong("expires_at", 0L)
                when {
                    raw <= 0L -> null
                    raw > 1_000_000_000_000L -> raw
                    else -> raw * 1000L
                }
            }

            else -> {
                val expiresIn = response.optLong("expires_in", 0L)
                if (expiresIn > 0L) System.currentTimeMillis() + expiresIn * 1000L else null
            }
        }
        val user = response.optJSONObject("user")
        val provider = user
            ?.optJSONObject("app_metadata")
            ?.optNullableString("provider")
            ?.ifBlank { null }
            ?: providerHint.trim().ifEmpty { "password" }

        return NativePlayerSupabaseSession(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAtEpochMs = expiresAtEpochMs,
            email = user?.optNullableString("email") ?: fallbackEmail?.trim()?.ifEmpty { null },
            userId = user?.optNullableString("id") ?: decodeJwtSub(accessToken),
            provider = provider,
        )
    }

    private fun playerProfileRowFromJson(json: JSONObject): NativePlayerSupabaseProfileRow =
        NativePlayerSupabaseProfileRow(
            workspaceId = json.optString("workspace_id").trim(),
            userId = json.optString("user_id").trim(),
            firstName = json.optString("first_name").trim(),
            lastName = json.optString("last_name").trim(),
            birthDate = json.optNullableString("birth_date"),
            canonicalPlayerId = json.optNullableString("canonical_player_id"),
            canonicalPlayerName = json.optNullableString("canonical_player_name"),
            createdAt = json.optNullableString("created_at"),
            updatedAt = json.optNullableString("updated_at"),
        )

    private fun playerCallRowFromJson(json: JSONObject): NativePlayerSupabaseCallRow =
        NativePlayerSupabaseCallRow(
            id = json.optString("id").trim(),
            workspaceId = json.optString("workspace_id").trim(),
            tournamentId = json.optString("tournament_id").trim(),
            teamId = json.optString("team_id").trim(),
            teamName = json.optNullableString("team_name"),
            targetUserId = json.optString("target_user_id").trim(),
            targetPlayerId = json.optNullableString("target_player_id"),
            targetPlayerName = json.optNullableString("target_player_name"),
            status = json.optString("status").trim().ifEmpty { "ringing" },
            requestedAt = json.optNullableString("requested_at"),
            acknowledgedAt = json.optNullableString("acknowledged_at"),
            cancelledAt = json.optNullableString("cancelled_at"),
        )

    private fun adminPlayerAccountRowFromJson(json: JSONObject): NativeAdminPlayerAccountCatalogRow =
        NativeAdminPlayerAccountCatalogRow(
            userId = json.optString("user_id").trim(),
            email = json.optNullableString("email"),
            primaryProvider = json.optNullableString("primary_provider"),
            providers = parsePlayerProviders(json.opt("providers")),
            createdAt = json.optNullableString("created_at"),
            lastLoginAt = json.optNullableString("last_login_at"),
            hasProfile = json.optBoolean("has_profile", false),
            linkedPlayerName = json.optNullableString("linked_player_name"),
            birthDate = json.optNullableString("birth_date"),
            canonicalPlayerId = json.optNullableString("canonical_player_id"),
        )

    private fun parsePlayerProviders(value: Any?): List<String> = when (value) {
        is JSONArray -> buildList {
            for (index in 0 until value.length()) {
                val provider = value.optString(index).trim()
                if (provider.isNotEmpty()) add(provider)
            }
        }

        is Collection<*> -> value.mapNotNull { entry ->
            entry?.toString()?.trim()?.takeIf { it.isNotEmpty() }
        }

        is String -> {
            val text = value.trim()
            when {
                text.isEmpty() -> emptyList()
                text.startsWith("[") -> runCatching {
                    parsePlayerProviders(JSONArray(text))
                }.getOrDefault(listOf(text))
                else -> listOf(text)
            }
        }

        else -> emptyList()
    }

    private fun decodeJwtSub(token: String): String? {
        return runCatching {
            val parts = token.split('.')
            if (parts.size < 2) return null
            val payload = String(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_WRAP), Charsets.UTF_8)
            JSONObject(payload).optString("sub").trim().ifEmpty { null }
        }.getOrNull()
    }

    private fun requestArray(path: String, bearer: String?): JSONArray =
        requestArray(path, "GET", bearer, null)

    private fun requestArray(
        path: String,
        method: String,
        bearer: String?,
        body: Any?,
        extraHeaders: Map<String, String> = emptyMap(),
    ): JSONArray {
        val connection = openConnection(path, bearer, method, extraHeaders)
        return try {
            if (body != null) {
                writeRequestBody(connection, body)
            }
            val code = connection.responseCode
            val body = (if (code in 200..299) connection.inputStream else connection.errorStream).readTextSafe()
            if (code !in 200..299) {
                throw IllegalStateException(body.ifBlank { "HTTP $code" })
            }
            JSONArray(body.ifBlank { "[]" })
        } finally {
            connection.disconnect()
        }
    }

    private fun requestObject(
        path: String,
        method: String,
        bearer: String?,
        body: Any?,
        extraHeaders: Map<String, String> = emptyMap(),
    ): JSONObject {
        val connection = openConnection(path, bearer, method, extraHeaders)
        try {
            if (body != null) {
                writeRequestBody(connection, body)
            }
            val code = connection.responseCode
            val responseBody = (if (code in 200..299) connection.inputStream else connection.errorStream).readTextSafe()
            if (code !in 200..299) {
                throw IllegalStateException(responseBody.ifBlank { "HTTP $code" })
            }
            return JSONObject(responseBody.ifBlank { "{}" })
        } finally {
            connection.disconnect()
        }
    }

    private fun writeRequestBody(connection: HttpURLConnection, body: Any) {
        connection.doOutput = true
        connection.outputStream.use { output ->
            output.write(body.toString().toByteArray(StandardCharsets.UTF_8))
        }
    }

    private fun openConnection(
        path: String,
        bearer: String?,
        method: String,
        extraHeaders: Map<String, String> = emptyMap(),
    ): HttpURLConnection {
        val normalizedPath = path.removePrefix("/")
        val basePrefix = if (normalizedPath.startsWith("auth/")) {
            PROTECTED_SUPABASE_URL.trimEnd('/')
        } else {
            PROTECTED_SUPABASE_URL.trimEnd('/')
        }
        val endpoint = "$basePrefix/$normalizedPath"
        return (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 8_000
            readTimeout = 8_000
            setRequestProperty("apikey", PROTECTED_SUPABASE_ANON_KEY)
            setRequestProperty("Authorization", "Bearer ${(bearer?.trim().takeUnless { it.isNullOrEmpty() } ?: PROTECTED_SUPABASE_ANON_KEY)}")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
            extraHeaders.forEach { (key, value) ->
                setRequestProperty(key, value)
            }
        }
    }

    private fun encode(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8.toString())
}

private const val PROTECTED_BILLING_ANCHOR_DAY = 22

fun buildProtectedBillingCycleWindow(anchorDay: Int = PROTECTED_BILLING_ANCHOR_DAY): NativeProtectedBillingCycleWindow {
    val reference = java.util.Calendar.getInstance().apply {
        set(java.util.Calendar.HOUR_OF_DAY, 0)
        set(java.util.Calendar.MINUTE, 0)
        set(java.util.Calendar.SECOND, 0)
        set(java.util.Calendar.MILLISECOND, 0)
    }
    val currentMonthAnchor = cycleAnchorDate(reference, anchorDay)
    return if (!reference.before(currentMonthAnchor)) {
        val nextReset = cycleAnchorDate((reference.clone() as java.util.Calendar).apply {
            add(java.util.Calendar.MONTH, 1)
            set(java.util.Calendar.DAY_OF_MONTH, 1)
        }, anchorDay)
        NativeProtectedBillingCycleWindow(
            startDate = formatProtectedDate(currentMonthAnchor),
            todayDate = formatProtectedDate(reference),
            nextResetDate = formatProtectedDate(nextReset),
            displayEndDate = formatProtectedDate((nextReset.clone() as java.util.Calendar).apply {
                add(java.util.Calendar.DAY_OF_MONTH, -1)
            }),
        )
    } else {
        val previousAnchor = cycleAnchorDate((reference.clone() as java.util.Calendar).apply {
            add(java.util.Calendar.MONTH, -1)
            set(java.util.Calendar.DAY_OF_MONTH, 1)
        }, anchorDay)
        NativeProtectedBillingCycleWindow(
            startDate = formatProtectedDate(previousAnchor),
            todayDate = formatProtectedDate(reference),
            nextResetDate = formatProtectedDate(currentMonthAnchor),
            displayEndDate = formatProtectedDate((currentMonthAnchor.clone() as java.util.Calendar).apply {
                add(java.util.Calendar.DAY_OF_MONTH, -1)
            }),
        )
    }
}

fun buildProtectedPastDaysRange(days: Int): NativeProtectedDateRangeWindow {
    val today = java.util.Calendar.getInstance().apply {
        set(java.util.Calendar.HOUR_OF_DAY, 0)
        set(java.util.Calendar.MINUTE, 0)
        set(java.util.Calendar.SECOND, 0)
        set(java.util.Calendar.MILLISECOND, 0)
    }
    val start = (today.clone() as java.util.Calendar).apply {
        add(java.util.Calendar.DAY_OF_MONTH, -(days - 1))
    }
    return NativeProtectedDateRangeWindow(
        startDate = formatProtectedDate(start),
        endDate = formatProtectedDate(today),
    )
}

private fun cycleAnchorDate(referenceMonth: java.util.Calendar, anchorDay: Int): java.util.Calendar {
    val monthStart = (referenceMonth.clone() as java.util.Calendar).apply {
        set(java.util.Calendar.DAY_OF_MONTH, 1)
        set(java.util.Calendar.HOUR_OF_DAY, 0)
        set(java.util.Calendar.MINUTE, 0)
        set(java.util.Calendar.SECOND, 0)
        set(java.util.Calendar.MILLISECOND, 0)
    }
    val lastDay = monthStart.getActualMaximum(java.util.Calendar.DAY_OF_MONTH)
    monthStart.set(java.util.Calendar.DAY_OF_MONTH, minOf(anchorDay, lastDay))
    return monthStart
}

private fun formatProtectedDate(calendar: java.util.Calendar): String {
    val year = calendar.get(java.util.Calendar.YEAR)
    val month = (calendar.get(java.util.Calendar.MONTH) + 1).toString().padStart(2, '0')
    val day = calendar.get(java.util.Calendar.DAY_OF_MONTH).toString().padStart(2, '0')
    return "$year-$month-$day"
}

fun buildProtectedTournamentSnapshot(bundle: NativeTournamentBundle): NativeProtectedTournamentSnapshot {
    val turnsSnapshot = buildTurnsSnapshot(bundle)
    val visibleMatches = visiblePublicMatches(bundle)
    val briefs = visibleMatches.map { match -> buildProtectedMatchBrief(bundle, match) }
    val upcomingPlayableMatches = briefs
        .filter { !it.match.played && it.match.status != "finished" && it.playable }
        .take(8)
    val blockedMatches = briefs
        .filter { !it.match.played && it.match.status != "finished" && it.blockedByPlaceholder }

    return NativeProtectedTournamentSnapshot(
        visibleTeamCount = visibleTeamCount(bundle),
        visibleMatchCount = visibleMatches.size,
        playedCount = visibleMatches.count { it.played || it.status == "finished" },
        liveCount = visibleMatches.count { it.status == "playing" },
        upcomingCount = upcomingPlayableMatches.size,
        tbdCount = turnsSnapshot.tbdMatches.size,
        turnsSnapshot = turnsSnapshot,
        featuredTurnBlocks = buildProtectedFeaturedTurnBlocks(turnsSnapshot),
        upcomingPlayableMatches = upcomingPlayableMatches,
        blockedMatches = blockedMatches,
    )
}

fun buildProtectedFeaturedTurnBlocks(snapshot: NativeTurnsSnapshot): List<NativeTurnBlock> {
    val featured = mutableListOf<NativeTurnBlock>()
    snapshot.activeBlocks.firstOrNull { it.isLive }?.let { featured.add(it) }
    snapshot.activeBlocks.firstOrNull { candidate ->
        candidate.isNext && featured.none { existing -> existing.turnNumber == candidate.turnNumber }
    }?.let { featured.add(it) }
    if (featured.isEmpty()) {
        snapshot.activeBlocks.firstOrNull()?.let { featured.add(it) }
    }
    return featured
}

fun buildProtectedAvailableReferees(bundle: NativeTournamentBundle): List<String> {
    val names = linkedMapOf<String, String>()
    bundle.teams.forEach { team ->
        val player1Legacy = team.isReferee && !team.player2IsReferee
        val player1Referee = team.player1IsReferee || player1Legacy
        val player2Referee = team.player2IsReferee
        if (player1Referee) {
            normalizeProtectedRefereeName(team.player1)?.let { normalized ->
                names.putIfAbsent(normalized.lowercase(), normalized)
            }
        }
        if (player2Referee) {
            normalizeProtectedRefereeName(team.player2)?.let { normalized ->
                names.putIfAbsent(normalized.lowercase(), normalized)
            }
        }
    }
    return names.values.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it })
}

fun buildProtectedReportForm(draft: NativeProtectedReportDraft): Map<String, NativeProtectedReportFormInput> =
    draft.teams
        .flatMap { team ->
            team.players.map { player ->
                player.key to NativeProtectedReportFormInput(
                    canestriText = player.canestri.toString(),
                    soffiText = player.soffi.toString(),
                )
            }
        }
        .toMap()

fun buildProtectedReportDraft(
    bundle: NativeTournamentBundle,
    match: NativeMatchInfo,
    form: Map<String, NativeProtectedReportFormInput> = emptyMap(),
): NativeProtectedReportDraft {
    val seededStats = bundle.stats
        .filter { it.matchId == match.id }
        .associateBy { "${it.teamId}||${it.playerName.trim()}" }

    val teams = listOfNotNull(match.teamAId, match.teamBId)
        .distinct()
        .map { teamId ->
            val team = bundle.teams.firstOrNull { it.id == teamId }
            val teamName = bundle.teamNameFor(teamId)
            val playerRows = listOfNotNull(
                team?.player1?.trim()?.takeIf { it.isNotEmpty() },
                team?.player2?.trim()?.takeIf { it.isNotEmpty() },
            ).map { playerName ->
                val key = "$teamId||$playerName"
                val existing = seededStats[key]
                val override = form[key]
                NativeProtectedReportPlayerDraft(
                    key = key,
                    teamId = teamId,
                    teamName = teamName,
                    playerName = playerName,
                    canestri = override?.canestriText.toProtectedReportStatValue() ?: (existing?.canestri ?: 0),
                    soffi = override?.soffiText.toProtectedReportStatValue() ?: (existing?.soffi ?: 0),
                )
            }
            NativeProtectedReportTeamDraft(
                teamId = teamId,
                teamName = teamName,
                players = playerRows,
                derivedScore = playerRows.sumOf { it.canestri },
            )
        }

    val derivedScoresByTeam = teams.associate { it.teamId to it.derivedScore }
    val maxScore = derivedScoresByTeam.values.maxOrNull() ?: 0
    val leaderIds = if (maxScore > 0) {
        derivedScoresByTeam.filterValues { it == maxScore }.keys.toList()
    } else {
        emptyList()
    }
    val tieNotAllowed = maxScore > 0 && leaderIds.size != 1
    val winnerTeamId = leaderIds.singleOrNull()

    return NativeProtectedReportDraft(
        match = match,
        title = listOfNotNull(match.code, match.roundName, match.groupName)
            .joinToString(separator = " • ")
            .ifBlank { "Report draft" },
        playable = hasValidParticipants(bundle, match),
        teams = teams,
        derivedScoresByTeam = derivedScoresByTeam,
        winnerTeamId = winnerTeamId,
        tieNotAllowed = tieNotAllowed,
        hasStoredStats = seededStats.isNotEmpty(),
        totalPoints = teams.sumOf { it.derivedScore },
        totalSoffi = teams.sumOf { team -> team.players.sumOf { it.soffi } },
    )
}

fun buildProtectedReportSaveDraft(draft: NativeProtectedReportDraft): NativeProtectedReportSaveDraft {
    val teamAId = draft.match.teamAId
    val teamBId = draft.match.teamBId
    val teamADraft = draft.teams.firstOrNull { it.teamId == teamAId }
    val teamBDraft = draft.teams.firstOrNull { it.teamId == teamBId }
    val scoreA = teamADraft?.derivedScore ?: draft.match.scoreA
    val scoreB = teamBDraft?.derivedScore ?: draft.match.scoreB
    val stats = draft.teams.flatMap { team ->
        team.players.map { player ->
            NativeProtectedReportSaveStat(
                teamId = team.teamId,
                teamName = team.teamName,
                playerName = player.playerName,
                canestri = player.canestri,
                soffi = player.soffi,
            )
        }
    }
    val blockReason = when {
        !draft.playable -> "Blocked by BYE/TBD/slot libero."
        draft.tieNotAllowed -> "A unique winner is still required before saving."
        stats.isEmpty() -> "No player stats are available for this match."
        else -> null
    }
    val winnerTeamName = draft.winnerTeamId?.let { winnerId ->
        draft.teams.firstOrNull { it.teamId == winnerId }?.teamName
    }
    return NativeProtectedReportSaveDraft(
        matchId = draft.match.id,
        title = draft.title,
        scoreA = scoreA,
        scoreB = scoreB,
        scoreLabel = "$scoreA - $scoreB",
        winnerTeamId = draft.winnerTeamId,
        winnerTeamName = winnerTeamName,
        readyToSave = blockReason == null,
        requiresOverwriteConfirm = draft.match.status == "finished",
        blockReason = blockReason,
        backendReady = false,
        backendNote = "The additive protected full-state read path is now prepared in the repo, but it still has to be applied on the real Supabase project before native save can be wired safely.",
        stats = stats,
    )
}

fun lookupProtectedMatchByCode(
    bundle: NativeTournamentBundle,
    rawCode: String?,
): NativeProtectedCodeLookupResult {
    val code = rawCode?.trim().orEmpty().uppercase()
    if (code.isEmpty()) {
        return NativeProtectedCodeLookupResult(
            normalizedCode = "",
            error = "Enter a report code.",
        )
    }

    val hitsAll = visiblePublicMatches(bundle)
        .filter { it.code?.trim()?.uppercase() == code }

    if (hitsAll.isEmpty()) {
        return NativeProtectedCodeLookupResult(
            normalizedCode = code,
            error = "Report code not found in the live tournament.",
        )
    }

    val hits = hitsAll.filter { match -> protectedMatchValidationError(bundle, match) == null }
    if (hitsAll.size == 1 && hits.isEmpty()) {
        return NativeProtectedCodeLookupResult(
            normalizedCode = code,
            error = protectedMatchValidationError(bundle, hitsAll.first()) ?: "Match not valid.",
        )
    }

    if (hits.size > 1) {
        val choices = hits
            .sortedWith(compareBy<NativeMatchInfo>({ protectedMatchStatusRank(it) }, { it.orderIndex ?: Int.MAX_VALUE }))
            .map { match -> buildProtectedMatchBrief(bundle, match) }
        return NativeProtectedCodeLookupResult(
            normalizedCode = code,
            duplicateChoices = choices,
            error = "Duplicate report code. Choose the correct match from the list below.",
        )
    }

    val hit = hits.firstOrNull()
        ?: return NativeProtectedCodeLookupResult(
            normalizedCode = code,
            error = "Match not valid.",
        )

    return NativeProtectedCodeLookupResult(
        normalizedCode = hit.code?.trim()?.uppercase() ?: code,
        selectedMatch = hit,
    )
}

private fun buildProtectedMatchBrief(bundle: NativeTournamentBundle, match: NativeMatchInfo): NativeProtectedMatchBrief {
    val teamA = bundle.teams.firstOrNull { it.id == match.teamAId }
    val teamB = bundle.teams.firstOrNull { it.id == match.teamBId }
    val teamALabel = bundle.teamNameFor(match.teamAId)
    val teamBLabel = bundle.teamNameFor(match.teamBId)
    val scoreLabel = if (match.played || match.status == "finished" || match.status == "playing") {
        "${match.scoreA} - ${match.scoreB}"
    } else {
        "—"
    }
    return NativeProtectedMatchBrief(
        match = match,
        title = listOfNotNull(match.code, match.roundName, match.groupName).joinToString(separator = " • ").ifBlank { "Match" },
        teamALabel = teamALabel,
        teamBLabel = teamBLabel,
        teamAPlayers = listOfNotNull(teamA?.player1?.takeIf { it.isNotBlank() }, teamA?.player2?.takeIf { it.isNotBlank() }).joinToString(separator = " • "),
        teamBPlayers = listOfNotNull(teamB?.player1?.takeIf { it.isNotBlank() }, teamB?.player2?.takeIf { it.isNotBlank() }).joinToString(separator = " • "),
        scoreLabel = scoreLabel,
        playable = hasValidParticipants(bundle, match),
        blockedByPlaceholder = !hasValidParticipants(bundle, match),
    )
}

private fun protectedMatchStatusRank(match: NativeMatchInfo): Int = when (match.status) {
    "playing" -> 0
    "scheduled" -> 1
    else -> 2
}

private fun protectedMatchValidationError(
    bundle: NativeTournamentBundle,
    match: NativeMatchInfo,
): String? {
    val participantIds = listOfNotNull(match.teamAId?.takeIf { it.isNotBlank() }, match.teamBId?.takeIf { it.isNotBlank() })
    if (participantIds.isEmpty()) {
        return "Match not valid (missing participants)."
    }

    val labels = participantIds.map(bundle::teamNameFor)
    if (labels.any(::isProtectedByeLabel)) {
        return "This code resolves to a BYE. No report is required."
    }
    if (labels.any(::isProtectedPlaceholderLabel)) {
        return "This match still contains TBD/slot libero, so the report stays blocked."
    }

    return null
}

private fun isProtectedByeLabel(name: String): Boolean =
    name.trim().uppercase() == "BYE"

private fun isProtectedPlaceholderLabel(name: String): Boolean {
    val normalized = name.trim().uppercase()
    return normalized == "BYE" || normalized == "TBD" || normalized == "SLOT LIBERO" || normalized.startsWith("TBD-")
}

private fun normalizeProtectedRefereeName(raw: String?): String? {
    val normalized = raw
        ?.trim()
        ?.replace(Regex("\\s+"), " ")
        ?.takeIf { it.isNotEmpty() }
        ?: return null
    val upper = normalized.uppercase()
    return when {
        upper == "BYE" -> null
        upper == "TBD" -> null
        upper == "SLOT LIBERO" -> null
        upper.startsWith("TBD-") -> null
        else -> normalized
    }
}

private fun String?.toProtectedReportStatValue(): Int =
    this
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?.toIntOrNull()
        ?.coerceAtLeast(0)
        ?: 0

private fun InputStream?.readTextSafe(): String {
    if (this == null) return ""
    return BufferedReader(InputStreamReader(this)).use { reader ->
        buildString {
            var line = reader.readLine()
            while (line != null) {
                append(line)
                line = reader.readLine()
            }
        }
    }
}

private fun JSONObject.optNullableString(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return optString(key).trim().ifEmpty { null }
}

private fun JSONArray.firstObjectOrNull(): JSONObject? =
    if (length() > 0) optJSONObject(0) else null
