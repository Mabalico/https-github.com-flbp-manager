package com.flbp.manager.suite

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max
import kotlin.random.Random

private const val PLAYER_PREVIEW_PREFS = "flbp_native_player_preview"
private const val PLAYER_PREVIEW_ACCOUNTS = "accounts"
private const val PLAYER_PREVIEW_SESSION = "session"
private const val PLAYER_PREVIEW_PROFILES = "profiles"
private const val PLAYER_PREVIEW_CALLS = "calls"

data class NativePlayerPreviewAccount(
    val id: String,
    val username: String,
    val password: String,
    val createdAt: Long,
    val lastLoginAt: Long?,
)

data class NativePlayerPreviewSession(
    val accountId: String,
    val username: String,
    val provider: String,
    val mode: String,
    val createdAt: Long,
    val lastActiveAt: Long,
)

data class NativePlayerPreviewProfile(
    val accountId: String,
    val firstName: String,
    val lastName: String,
    val birthDate: String,
    val canonicalPlayerName: String,
    val createdAt: Long,
    val updatedAt: Long,
)

data class NativePlayerPreviewCall(
    val id: String,
    val tournamentId: String,
    val teamId: String,
    val teamName: String,
    val targetAccountId: String,
    val targetPlayerName: String,
    val requestedAt: Long,
    val acknowledgedAt: Long?,
    val cancelledAt: Long?,
    val status: String,
    val previewOnly: Boolean,
)

data class NativePlayerFeatureStatus(
    val previewEnabled: Boolean,
    val remoteAuthPrepared: Boolean,
    val socialProvidersPrepared: List<String>,
    val playerProfilesPrepared: Boolean,
    val playerCallsPrepared: Boolean,
    val refereeBypassPrepared: Boolean,
)

data class NativePlayerResultSnapshot(
    val canonicalPlayerName: String,
    val birthDate: String,
    val leaderboardRows: List<NativeLeaderboardEntry>,
    val awards: List<NativeHallOfFameEntry>,
    val linkedTeams: List<String>,
    val totalGames: Int,
    val totalPoints: Int,
    val totalSoffi: Int,
)

data class NativePlayerLiveStatus(
    val liveTournamentId: String?,
    val liveTournamentName: String?,
    val linkedTeam: NativeTeamInfo?,
    val nextMatch: NativeMatchInfo?,
    val nextMatchLabel: String?,
    val nextOpponentLabel: String?,
    val nextMatchTurn: Int?,
    val turnsUntilPlay: Int?,
    val refereeBypassEligible: Boolean,
    val activeCall: NativePlayerPreviewCall?,
)

data class NativePlayerAreaSnapshot(
    val session: NativePlayerPreviewSession?,
    val profile: NativePlayerPreviewProfile?,
    val results: NativePlayerResultSnapshot?,
    val liveStatus: NativePlayerLiveStatus,
    val featureStatus: NativePlayerFeatureStatus,
)

data class NativePlayerAdminAccountRow(
    val id: String,
    val email: String,
    val provider: String,
    val origin: String,
    val mode: String,
    val providers: List<String>,
    val createdAt: Long,
    val lastLoginAt: Long?,
    val linkedPlayerName: String?,
    val birthDate: String?,
    val canonicalPlayerName: String?,
    val totalTitles: Int,
    val totalCanestri: Int,
    val totalSoffi: Int,
    val hasProfile: Boolean,
    val hasPasswordRecovery: Boolean,
)

class NativePlayerPreviewStore(context: Context) {
    private val prefs = context.getSharedPreferences(PLAYER_PREVIEW_PREFS, Context.MODE_PRIVATE)

    fun readSession(): NativePlayerPreviewSession? {
        val raw = prefs.getString(PLAYER_PREVIEW_SESSION, null) ?: return null
        return runCatching { sessionFromJson(JSONObject(raw)) }.getOrNull()
    }

    fun signOut() {
        prefs.edit().remove(PLAYER_PREVIEW_SESSION).apply()
    }

    fun registerAccount(usernameRaw: String, passwordRaw: String): NativePlayerPreviewSession {
        val username = normalizeUsername(usernameRaw)
        val password = passwordRaw.trim()
        require(username.isNotEmpty()) { "Enter a valid email address." }
        require(password.isNotEmpty()) { "Enter a valid password." }

        val accounts = readAccounts()
        if (accounts.any { it.username == username }) {
            throw IllegalArgumentException("A preview account already exists with this email.")
        }

        val now = System.currentTimeMillis()
        val account = NativePlayerPreviewAccount(
            id = buildPreviewId("preview"),
            username = username,
            password = password,
            createdAt = now,
            lastLoginAt = now,
        )
        val session = NativePlayerPreviewSession(
            accountId = account.id,
            username = account.username,
            provider = "preview_password",
            mode = "preview",
            createdAt = account.createdAt,
            lastActiveAt = now,
        )
        writeAccounts(accounts + account)
        writeSession(session)
        return session
    }

    fun signIn(usernameRaw: String, passwordRaw: String): NativePlayerPreviewSession {
        val username = normalizeUsername(usernameRaw)
        val password = passwordRaw.trim()
        require(username.isNotEmpty() && password.isNotEmpty()) { "Enter email and password." }

        val accounts = readAccounts()
        val match = accounts.firstOrNull { it.username == username && it.password == password }
            ?: throw IllegalArgumentException("Preview credentials are not valid.")
        val now = System.currentTimeMillis()
        writeAccounts(accounts.map { row ->
            if (row.id == match.id) row.copy(lastLoginAt = now) else row
        })
        val session = NativePlayerPreviewSession(
            accountId = match.id,
            username = match.username,
            provider = "preview_password",
            mode = "preview",
            createdAt = match.createdAt,
            lastActiveAt = now,
        )
        writeSession(session)
        return session
    }

    fun readProfile(accountId: String?): NativePlayerPreviewProfile? {
        val safeAccountId = accountId?.trim().orEmpty()
        if (safeAccountId.isEmpty()) return null
        return readProfiles()[safeAccountId]
    }

    fun saveProfile(
        session: NativePlayerPreviewSession,
        firstNameRaw: String,
        lastNameRaw: String,
        birthDateRaw: String,
    ): NativePlayerPreviewProfile {
        val firstName = firstNameRaw.trim()
        val lastName = lastNameRaw.trim()
        val birthDate = normalizeBirthDate(birthDateRaw)
        require(firstName.isNotEmpty() && lastName.isNotEmpty()) { "Enter first name and last name." }
        require(birthDate != null) { "Enter a valid birth date in YYYY-MM-DD format." }

        val now = System.currentTimeMillis()
        val previous = readProfile(session.accountId)
        val next = NativePlayerPreviewProfile(
            accountId = session.accountId,
            firstName = firstName,
            lastName = lastName,
            birthDate = birthDate,
            canonicalPlayerName = buildCanonicalPlayerName(firstName, lastName),
            createdAt = previous?.createdAt ?: now,
            updatedAt = now,
        )
        writeProfiles(readProfiles().toMutableMap().apply { put(next.accountId, next) })
        writeSession(session.copy(lastActiveAt = now))
        return next
    }

    fun readActiveCall(accountId: String?, tournamentId: String?): NativePlayerPreviewCall? {
        val safeAccountId = accountId?.trim().orEmpty()
        val safeTournamentId = tournamentId?.trim().orEmpty()
        if (safeAccountId.isEmpty()) return null
        return readCalls()
            .filter { it.targetAccountId == safeAccountId }
            .filter { safeTournamentId.isEmpty() || it.tournamentId == safeTournamentId }
            .filter { it.status == "ringing" || it.status == "acknowledged" }
            .maxByOrNull { it.requestedAt }
    }

    fun acknowledgeCall(session: NativePlayerPreviewSession, callId: String): NativePlayerPreviewCall {
        val rows = readCalls()
        val existing = rows.firstOrNull { it.id == callId && it.targetAccountId == session.accountId }
            ?: throw IllegalArgumentException("No active call exists for this account.")
        val next = existing.copy(status = "acknowledged", acknowledgedAt = System.currentTimeMillis())
        writeCalls(rows.map { if (it.id == callId) next else it })
        return next
    }

    fun clearCall(session: NativePlayerPreviewSession, callId: String): NativePlayerPreviewCall {
        val rows = readCalls()
        val existing = rows.firstOrNull { it.id == callId && it.targetAccountId == session.accountId }
            ?: throw IllegalArgumentException("No active call exists for this account.")
        val next = existing.copy(status = "cancelled", cancelledAt = System.currentTimeMillis())
        writeCalls(rows.map { if (it.id == callId) next else it })
        return next
    }

    fun listAdminRows(
        leaderboard: List<NativeLeaderboardEntry>,
        hallOfFame: List<NativeHallOfFameEntry>,
    ): List<NativePlayerAdminAccountRow> {
        val profiles = readProfiles()
        return readAccounts()
            .map { account ->
                val profile = profiles[account.id]
                val results = profile?.let { buildNativePlayerResultSnapshot(it, leaderboard, hallOfFame) }
                NativePlayerAdminAccountRow(
                    id = account.id,
                    email = normalizeUsername(account.username),
                    provider = "preview_password",
                    origin = "in_app",
                    mode = "preview",
                    providers = listOf("Email/Password"),
                    createdAt = account.createdAt,
                    lastLoginAt = account.lastLoginAt,
                    linkedPlayerName = profile?.canonicalPlayerName,
                    birthDate = profile?.birthDate,
                    canonicalPlayerName = profile?.canonicalPlayerName,
                    totalTitles = results?.awards?.size ?: 0,
                    totalCanestri = results?.totalPoints ?: 0,
                    totalSoffi = results?.totalSoffi ?: 0,
                    hasProfile = profile != null,
                    hasPasswordRecovery = false,
                )
            }
            .sortedWith(
                compareByDescending<NativePlayerAdminAccountRow> { it.lastLoginAt ?: 0L }
                    .thenBy { it.email.lowercase() }
            )
    }

    fun updateAdminAccount(
        accountIdRaw: String,
        emailRaw: String,
        firstNameRaw: String,
        lastNameRaw: String,
        birthDateRaw: String,
    ): NativePlayerPreviewAccount {
        val accountId = accountIdRaw.trim()
        require(accountId.isNotEmpty()) { "Invalid account." }

        val email = normalizeUsername(emailRaw)
        require(email.isNotEmpty()) { "Enter a valid email address." }

        val accounts = readAccounts()
        val current = accounts.firstOrNull { it.id == accountId }
            ?: throw IllegalArgumentException("Preview account not found.")
        if (accounts.any { it.id != accountId && normalizeUsername(it.username) == email }) {
            throw IllegalArgumentException("A preview account already exists with this email.")
        }

        val updatedAccount = current.copy(username = email)
        writeAccounts(accounts.map { if (it.id == accountId) updatedAccount else it })

        val firstName = firstNameRaw.trim()
        val lastName = lastNameRaw.trim()
        val birthDate = normalizeBirthDate(birthDateRaw)
        val hasProfileInput = firstName.isNotEmpty() || lastName.isNotEmpty() || !birthDateRaw.isBlank()
        if (hasProfileInput) {
            require(firstName.isNotEmpty() && lastName.isNotEmpty()) { "Enter first name and last name to update the profile." }
            require(birthDate != null) { "Enter a valid birth date in YYYY-MM-DD format." }
            val previous = readProfile(accountId)
            val now = System.currentTimeMillis()
            val nextProfile = NativePlayerPreviewProfile(
                accountId = accountId,
                firstName = firstName,
                lastName = lastName,
                birthDate = birthDate,
                canonicalPlayerName = buildCanonicalPlayerName(firstName, lastName),
                createdAt = previous?.createdAt ?: now,
                updatedAt = now,
            )
            writeProfiles(readProfiles().toMutableMap().apply { put(accountId, nextProfile) })
        }

        val currentSession = readSession()
        if (currentSession?.accountId == accountId) {
            writeSession(
                currentSession.copy(
                    username = email,
                    lastActiveAt = System.currentTimeMillis(),
                )
            )
        }

        return updatedAccount
    }

    private fun readAccounts(): List<NativePlayerPreviewAccount> {
        val raw = prefs.getString(PLAYER_PREVIEW_ACCOUNTS, null) ?: return emptyList()
        return runCatching { JSONArray(raw).jsonObjects().map(::accountFromJson) }.getOrDefault(emptyList())
    }

    private fun writeAccounts(rows: List<NativePlayerPreviewAccount>) {
        prefs.edit().putString(
            PLAYER_PREVIEW_ACCOUNTS,
            JSONArray().apply { rows.forEach { put(it.toJson()) } }.toString(),
        ).apply()
    }

    private fun writeSession(session: NativePlayerPreviewSession?) {
        prefs.edit().apply {
            if (session == null) {
                remove(PLAYER_PREVIEW_SESSION)
            } else {
                putString(PLAYER_PREVIEW_SESSION, session.toJson().toString())
            }
        }.apply()
    }

    private fun readProfiles(): Map<String, NativePlayerPreviewProfile> {
        val raw = prefs.getString(PLAYER_PREVIEW_PROFILES, null) ?: return emptyMap()
        return runCatching {
            val root = JSONObject(raw)
            buildMap {
                root.keys().forEach { accountId ->
                    root.optJSONObject(accountId)?.let { put(accountId, profileFromJson(it)) }
                }
            }
        }.getOrDefault(emptyMap())
    }

    private fun writeProfiles(rows: Map<String, NativePlayerPreviewProfile>) {
        val root = JSONObject().apply {
            rows.forEach { (accountId, profile) -> put(accountId, profile.toJson()) }
        }
        prefs.edit().putString(PLAYER_PREVIEW_PROFILES, root.toString()).apply()
    }

    private fun readCalls(): List<NativePlayerPreviewCall> {
        val raw = prefs.getString(PLAYER_PREVIEW_CALLS, null) ?: return emptyList()
        return runCatching { JSONArray(raw).jsonObjects().map(::callFromJson) }.getOrDefault(emptyList())
    }

    private fun writeCalls(rows: List<NativePlayerPreviewCall>) {
        prefs.edit().putString(
            PLAYER_PREVIEW_CALLS,
            JSONArray().apply { rows.forEach { put(it.toJson()) } }.toString(),
        ).apply()
    }
}

fun buildNativePlayerAreaSnapshot(
    catalog: NativePublicCatalog,
    leaderboard: List<NativeLeaderboardEntry>,
    hallOfFame: List<NativeHallOfFameEntry>,
    liveBundle: NativeTournamentBundle?,
    store: NativePlayerPreviewStore,
): NativePlayerAreaSnapshot {
    val session = store.readSession()
    val profile = store.readProfile(session?.accountId)
    val results = profile?.let { buildNativePlayerResultSnapshot(it, leaderboard, hallOfFame) }
    val liveStatus = buildNativePlayerLiveStatus(catalog, liveBundle, profile, store)
    return NativePlayerAreaSnapshot(
        session = session,
        profile = profile,
        results = results,
        liveStatus = liveStatus,
        featureStatus = NativePlayerFeatureStatus(
            previewEnabled = true,
            remoteAuthPrepared = false,
            socialProvidersPrepared = listOf("Google", "Facebook", "Apple"),
            playerProfilesPrepared = true,
            playerCallsPrepared = false,
            refereeBypassPrepared = true,
        ),
    )
}

private fun buildNativePlayerResultSnapshot(
    profile: NativePlayerPreviewProfile,
    leaderboard: List<NativeLeaderboardEntry>,
    hallOfFame: List<NativeHallOfFameEntry>,
): NativePlayerResultSnapshot {
    val candidates = buildPlayerNameCandidates(profile)
    val matchedRows = leaderboard.filter { candidates.contains(normalizePlayerName(it.name)) }
    val awards = hallOfFame.filter { entry ->
        entry.playerNames.any { candidates.contains(normalizePlayerName(it)) }
    }
    val linkedTeams = buildSet {
        matchedRows.mapTo(this) { it.teamName }
        awards.mapNotNullTo(this) { it.teamName }
    }.toList().sorted()
    return NativePlayerResultSnapshot(
        canonicalPlayerName = profile.canonicalPlayerName,
        birthDate = profile.birthDate,
        leaderboardRows = matchedRows,
        awards = awards,
        linkedTeams = linkedTeams,
        totalGames = matchedRows.sumOf { it.gamesPlayed },
        totalPoints = matchedRows.sumOf { it.points },
        totalSoffi = matchedRows.sumOf { it.soffi },
    )
}

private fun buildNativePlayerLiveStatus(
    catalog: NativePublicCatalog,
    liveBundle: NativeTournamentBundle?,
    profile: NativePlayerPreviewProfile?,
    store: NativePlayerPreviewStore,
): NativePlayerLiveStatus {
    val liveTournament = catalog.liveTournament
    if (profile == null || liveBundle == null || liveTournament == null || liveBundle.tournament.id != liveTournament.id) {
        return NativePlayerLiveStatus(
            liveTournamentId = liveTournament?.id,
            liveTournamentName = liveTournament?.name,
            linkedTeam = null,
            nextMatch = null,
            nextMatchLabel = null,
            nextOpponentLabel = null,
            nextMatchTurn = null,
            turnsUntilPlay = null,
            refereeBypassEligible = false,
            activeCall = store.readActiveCall(profile?.accountId, liveTournament?.id),
        )
    }

    val candidates = buildPlayerNameCandidates(profile)
    val linkedTeam = liveBundle.teams.firstOrNull { team ->
        candidates.contains(normalizePlayerName(team.player1)) ||
            candidates.contains(normalizePlayerName(team.player2))
    }

    if (linkedTeam == null) {
        return NativePlayerLiveStatus(
            liveTournamentId = liveTournament.id,
            liveTournamentName = liveTournament.name,
            linkedTeam = null,
            nextMatch = null,
            nextMatchLabel = null,
            nextOpponentLabel = null,
            nextMatchTurn = null,
            turnsUntilPlay = null,
            refereeBypassEligible = false,
            activeCall = store.readActiveCall(profile.accountId, liveTournament.id),
        )
    }

    val visibleMatches = visiblePublicMatches(liveBundle)
        .filter { hasValidParticipants(liveBundle, it) }
        .sortedBy { it.orderIndex ?: Int.MAX_VALUE }
    val tablesPerTurn = max(liveBundle.tournament.refTables ?: 8, 1)
    val liveAnchorIndex = visibleMatches.indexOfFirst { it.status == "playing" }
    val pendingAnchorIndex = visibleMatches.indexOfFirst { it.status != "finished" && !it.played }
    val anchorIndex = when {
        liveAnchorIndex >= 0 -> liveAnchorIndex
        pendingAnchorIndex >= 0 -> pendingAnchorIndex
        else -> -1
    }
    val anchorTurn = if (anchorIndex >= 0) (anchorIndex / tablesPerTurn) + 1 else null
    val nextMatch = visibleMatches.firstOrNull { match ->
        match.status != "finished" && !match.played && matchContainsTeam(match, linkedTeam.id)
    }
    val nextIndex = nextMatch?.let { match -> visibleMatches.indexOfFirst { it.id == match.id } } ?: -1
    val nextTurn = nextIndex.takeIf { it >= 0 }?.let { (it / tablesPerTurn) + 1 }
    val turnsUntilPlay = nextTurn?.let { next -> max(0, next - (anchorTurn ?: next)) }
    val opponentLabel = nextMatch?.let { match: NativeMatchInfo ->
        val opponentId = when (linkedTeam.id) {
            match.teamAId -> match.teamBId
            match.teamBId -> match.teamAId
            else -> null
        }
        liveBundle.resolveTeamName(opponentId)
    }

    val isPlayer1Referee = candidates.contains(normalizePlayerName(linkedTeam.player1)) &&
        (linkedTeam.player1IsReferee || (linkedTeam.isReferee && !linkedTeam.player2IsReferee))
    val isPlayer2Referee = candidates.contains(normalizePlayerName(linkedTeam.player2)) && linkedTeam.player2IsReferee

    return NativePlayerLiveStatus(
        liveTournamentId = liveTournament.id,
        liveTournamentName = liveTournament.name,
        linkedTeam = linkedTeam,
        nextMatch = nextMatch,
        nextMatchLabel = nextMatch?.let { buildMatchLabel(liveBundle, it) },
        nextOpponentLabel = opponentLabel,
        nextMatchTurn = nextTurn,
        turnsUntilPlay = turnsUntilPlay,
        refereeBypassEligible = isPlayer1Referee || isPlayer2Referee,
        activeCall = store.readActiveCall(profile.accountId, liveTournament.id),
    )
}

private fun matchContainsTeam(match: NativeMatchInfo, teamId: String): Boolean =
    match.teamAId == teamId || match.teamBId == teamId

private fun buildMatchLabel(bundle: NativeTournamentBundle, match: NativeMatchInfo): String = buildString {
    val code = match.code?.trim().orEmpty()
    val round = match.roundName?.trim().orEmpty()
    val group = match.groupName?.trim().orEmpty()
    val prefix = listOf(code, round, group).filter { it.isNotEmpty() }.joinToString(" • ")
    if (prefix.isNotEmpty()) {
        append(prefix)
        append(" — ")
    }
    append(bundle.resolveTeamName(match.teamAId))
    append(" vs ")
    append(bundle.resolveTeamName(match.teamBId))
}

private fun NativeTournamentBundle.resolveTeamName(teamId: String?): String =
    teams.firstOrNull { it.id == teamId }?.name
        ?: teamId?.trim()?.takeIf { it.isNotEmpty() }
        ?: "TBD"

private fun buildPlayerNameCandidates(profile: NativePlayerPreviewProfile): Set<String> = buildSet {
    add(normalizePlayerName(profile.canonicalPlayerName))
    add(normalizePlayerName("${profile.firstName} ${profile.lastName}"))
}

private fun normalizePlayerName(value: String?): String =
    value.orEmpty().trim().lowercase().replace(Regex("\\s+"), " ")

private fun normalizeUsername(value: String): String =
    value.trim().lowercase().replace(Regex("\\s+"), "")

private fun normalizeBirthDate(raw: String): String? {
    val value = raw.trim()
    if (value.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) return value
    val slash = Regex("(\\d{2})/(\\d{2})/(\\d{4})").matchEntire(value)
    if (slash != null) {
        val (day, month, year) = slash.destructured
        return "$year-$month-$day"
    }
    return null
}

private fun buildCanonicalPlayerName(firstName: String, lastName: String): String =
    "$lastName $firstName".trim().replace(Regex("\\s+"), " ")

private fun buildPreviewId(prefix: String): String =
    "${prefix}_${System.currentTimeMillis().toString(36)}_${Random.nextInt(1000, 9999)}"

private fun NativePlayerPreviewAccount.toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("username", username)
    put("password", password)
    put("createdAt", createdAt)
    if (lastLoginAt != null) put("lastLoginAt", lastLoginAt) else put("lastLoginAt", JSONObject.NULL)
}

private fun accountFromJson(json: JSONObject): NativePlayerPreviewAccount = NativePlayerPreviewAccount(
    id = json.optString("id").trim(),
    username = json.optString("username").trim(),
    password = json.optString("password"),
    createdAt = json.optLong("createdAt"),
    lastLoginAt = if (json.has("lastLoginAt") && !json.isNull("lastLoginAt")) json.optLong("lastLoginAt") else null,
)

private fun NativePlayerPreviewSession.toJson(): JSONObject = JSONObject().apply {
    put("accountId", accountId)
    put("username", username)
    put("provider", provider)
    put("mode", mode)
    put("createdAt", createdAt)
    put("lastActiveAt", lastActiveAt)
}

private fun sessionFromJson(json: JSONObject): NativePlayerPreviewSession = NativePlayerPreviewSession(
    accountId = json.optString("accountId").trim(),
    username = json.optString("username").trim(),
    provider = json.optString("provider").ifBlank { "preview_password" },
    mode = json.optString("mode").ifBlank { "preview" },
    createdAt = json.optLong("createdAt"),
    lastActiveAt = json.optLong("lastActiveAt"),
)

private fun NativePlayerPreviewProfile.toJson(): JSONObject = JSONObject().apply {
    put("accountId", accountId)
    put("firstName", firstName)
    put("lastName", lastName)
    put("birthDate", birthDate)
    put("canonicalPlayerName", canonicalPlayerName)
    put("createdAt", createdAt)
    put("updatedAt", updatedAt)
}

private fun profileFromJson(json: JSONObject): NativePlayerPreviewProfile = NativePlayerPreviewProfile(
    accountId = json.optString("accountId").trim(),
    firstName = json.optString("firstName").trim(),
    lastName = json.optString("lastName").trim(),
    birthDate = json.optString("birthDate").trim(),
    canonicalPlayerName = json.optString("canonicalPlayerName").trim(),
    createdAt = json.optLong("createdAt"),
    updatedAt = json.optLong("updatedAt"),
)

private fun NativePlayerPreviewCall.toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("tournamentId", tournamentId)
    put("teamId", teamId)
    put("teamName", teamName)
    put("targetAccountId", targetAccountId)
    put("targetPlayerName", targetPlayerName)
    put("requestedAt", requestedAt)
    if (acknowledgedAt != null) put("acknowledgedAt", acknowledgedAt) else put("acknowledgedAt", JSONObject.NULL)
    if (cancelledAt != null) put("cancelledAt", cancelledAt) else put("cancelledAt", JSONObject.NULL)
    put("status", status)
    put("previewOnly", previewOnly)
}

private fun callFromJson(json: JSONObject): NativePlayerPreviewCall = NativePlayerPreviewCall(
    id = json.optString("id").trim(),
    tournamentId = json.optString("tournamentId").trim(),
    teamId = json.optString("teamId").trim(),
    teamName = json.optString("teamName").trim(),
    targetAccountId = json.optString("targetAccountId").trim(),
    targetPlayerName = json.optString("targetPlayerName").trim(),
    requestedAt = json.optLong("requestedAt"),
    acknowledgedAt = if (json.has("acknowledgedAt") && !json.isNull("acknowledgedAt")) json.optLong("acknowledgedAt") else null,
    cancelledAt = if (json.has("cancelledAt") && !json.isNull("cancelledAt")) json.optLong("cancelledAt") else null,
    status = json.optString("status").ifBlank { "ringing" },
    previewOnly = json.optBoolean("previewOnly", true),
)

private fun JSONArray.jsonObjects(): List<JSONObject> = buildList {
    for (index in 0 until length()) {
        optJSONObject(index)?.let { add(it) }
    }
}
