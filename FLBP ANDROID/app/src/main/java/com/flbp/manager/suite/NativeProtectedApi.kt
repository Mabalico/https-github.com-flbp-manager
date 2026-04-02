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

data class NativeAdminAccessResult(
    val ok: Boolean,
    val email: String? = null,
    val userId: String? = null,
    val reason: String? = null,
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

    private fun decodeJwtSub(token: String): String? {
        return runCatching {
            val parts = token.split('.')
            if (parts.size < 2) return null
            val payload = String(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_WRAP), Charsets.UTF_8)
            JSONObject(payload).optString("sub").trim().ifEmpty { null }
        }.getOrNull()
    }

    private fun requestArray(path: String, bearer: String?): JSONArray {
        val connection = openConnection(path, bearer, "GET")
        return try {
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

    private fun requestObject(path: String, method: String, bearer: String?, body: JSONObject?): JSONObject {
        val connection = openConnection(path, bearer, method)
        try {
            if (body != null) {
                connection.doOutput = true
                connection.outputStream.use { output ->
                    output.write(body.toString().toByteArray(StandardCharsets.UTF_8))
                }
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

    private fun openConnection(path: String, bearer: String?, method: String): HttpURLConnection {
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
