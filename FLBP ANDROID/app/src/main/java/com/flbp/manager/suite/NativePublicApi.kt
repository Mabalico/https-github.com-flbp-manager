package com.flbp.manager.suite

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

private const val SUPABASE_URL = "https://kgwhcemqkgqvtsctnwql.supabase.co"
private const val SUPABASE_ANON_KEY = "sb_publishable_XhZ5hAdoycuWfDMeiQKaGA_7gD6nDhz"
private const val SUPABASE_WORKSPACE_ID = "default"

data class NativeTournamentSummary(
    val id: String,
    val name: String,
    val startDate: String,
    val type: String,
    val isManual: Boolean,
    val status: String,
    val advancingPerGroup: Int?,
    val refTables: Int?,
)

data class NativeTeamInfo(
    val id: String,
    val name: String,
    val player1: String,
    val player2: String?,
    val player1IsReferee: Boolean,
    val player2IsReferee: Boolean,
    val isReferee: Boolean,
)

data class NativeGroupInfo(
    val id: String,
    val name: String,
    val orderIndex: Int?,
    val teamIds: List<String>,
)

data class NativeMatchStatInfo(
    val matchId: String,
    val teamId: String,
    val playerName: String,
    val canestri: Int,
    val soffi: Int,
)

data class NativeMatchInfo(
    val id: String,
    val code: String?,
    val phase: String?,
    val groupName: String?,
    val round: Int?,
    val roundName: String?,
    val orderIndex: Int?,
    val teamAId: String?,
    val teamBId: String?,
    val scoreA: Int,
    val scoreB: Int,
    val played: Boolean,
    val status: String,
    val isBye: Boolean,
    val hidden: Boolean,
)

data class NativeTournamentBundle(
    val tournament: NativeTournamentSummary,
    val teams: List<NativeTeamInfo>,
    val groups: List<NativeGroupInfo>,
    val matches: List<NativeMatchInfo>,
    val stats: List<NativeMatchStatInfo>,
)

data class NativePublicCatalog(
    val liveTournament: NativeTournamentSummary?,
    val history: List<NativeTournamentSummary>,
)

data class NativeLeaderboardEntry(
    val id: String,
    val name: String,
    val teamName: String,
    val gamesPlayed: Int,
    val points: Int,
    val soffi: Int,
    val avgPoints: Double,
    val avgSoffi: Double,
    val u25: Boolean,
    val yobLabel: String?,
)

data class NativeHallOfFameEntry(
    val id: String,
    val year: String,
    val tournamentId: String,
    val tournamentName: String,
    val type: String,
    val teamName: String?,
    val playerNames: List<String>,
    val value: Int?,
)

data class NativePublicProjectionPayload(
    val catalog: NativePublicCatalog,
    val leaderboard: List<NativeLeaderboardEntry>,
    val hallOfFame: List<NativeHallOfFameEntry>,
)

private data class MutableLeaderboardRow(
    val id: String,
    var name: String,
    var teamName: String,
    var gamesPlayed: Int = 0,
    var wins: Int = 0,
    var losses: Int = 0,
    var points: Int = 0,
    var soffi: Int = 0,
)

object NativePublicApi {
    suspend fun fetchPublicProjection(): NativePublicProjectionPayload = withContext(Dispatchers.IO) {
        val state = requestPublicWorkspaceState()
        NativePublicProjectionPayload(
            catalog = runCatching { buildCatalogFromState(state) }
                .getOrElse { NativePublicCatalog(liveTournament = null, history = emptyList()) },
            leaderboard = runCatching { buildLeaderboardFromState(state) }
                .getOrElse { emptyList() },
            hallOfFame = runCatching { buildHallOfFameFromState(state) }
                .getOrElse { emptyList() },
        )
    }

    suspend fun fetchCatalog(): NativePublicCatalog =
        fetchPublicProjection().catalog

    suspend fun fetchTournamentBundle(tournamentId: String): NativeTournamentBundle? = withContext(Dispatchers.IO) {
        deriveTournamentBundleFromState(requestPublicWorkspaceState(), tournamentId)
    }

    suspend fun fetchCareerLeaderboard(): List<NativeLeaderboardEntry> =
        fetchPublicProjection().leaderboard

    suspend fun fetchHallOfFame(): List<NativeHallOfFameEntry> =
        fetchPublicProjection().hallOfFame

    private fun requestPublicWorkspaceState(): JSONObject {
        val rows = requestArray(
            "public_workspace_state" +
                "?workspace_id=eq.${encode(SUPABASE_WORKSPACE_ID)}" +
                "&select=state,updated_at" +
                "&limit=1"
        )
        if (rows.length() == 0) return JSONObject()
        return rows.optJSONObject(0)?.optNullableObject("state") ?: JSONObject()
    }

    private fun buildCatalogFromState(state: JSONObject): NativePublicCatalog {
        val liveTournament = state.optNullableObject("tournament")
            ?.takeIf { it.optString("id").trim().isNotEmpty() }
            ?.let(::parseTournamentSummaryFromState)

        val history = state.optObjectArray("tournamentHistory")
            .map(::parseTournamentSummaryFromState)
            .sortedByDescending { it.startDate }

        return NativePublicCatalog(
            liveTournament = liveTournament,
            history = history,
        )
    }

    private fun deriveTournamentBundleFromState(state: JSONObject, tournamentId: String): NativeTournamentBundle? {
        val liveTournament = state.optNullableObject("tournament")
        val liveId = liveTournament?.optString("id")?.trim().orEmpty()
        val selectedTournament = when {
            liveId.isNotEmpty() && liveId == tournamentId -> liveTournament
            else -> state.optObjectArray("tournamentHistory")
                .firstOrNull { it.optString("id").trim() == tournamentId }
        } ?: return null

        val isLive = liveId.isNotEmpty() && liveId == tournamentId
        val teams = selectedTournament.optObjectArray("teams").map(::parseTeamFromState)
        val groups = parseGroupsFromState(selectedTournament)
        val matchRows = extractTournamentMatches(state, selectedTournament, isLive)
        val matches = matchRows.map(::parseMatchFromState).sortedBy { it.orderIndex ?: Int.MAX_VALUE }
        val stats = extractMatchStats(matchRows)

        return NativeTournamentBundle(
            tournament = parseTournamentSummaryFromState(selectedTournament),
            teams = teams,
            groups = groups,
            matches = matches,
            stats = stats,
        )
    }

    private fun buildLeaderboardFromState(state: JSONObject): List<NativeLeaderboardEntry> {
        val rows = linkedMapOf<String, MutableLeaderboardRow>()

        fun ensurePlayer(name: String, teamName: String): MutableLeaderboardRow {
            val displayName = name.trim().replace(Regex("\\s+"), " ")
            val safeTeamName = teamName.trim().ifEmpty { "Integrazioni" }
            val key = buildPlayerKey(displayName)
            return rows.getOrPut(key) {
                MutableLeaderboardRow(
                    id = key,
                    name = displayName,
                    teamName = safeTeamName,
                )
            }.also { row ->
                if (row.teamName.isBlank() && safeTeamName.isNotBlank()) {
                    row.teamName = safeTeamName
                }
                if (row.name.isBlank() && displayName.isNotBlank()) {
                    row.name = displayName
                }
            }
        }

        fun processMatch(match: JSONObject, teamsSource: List<JSONObject>) {
            val played = match.optBoolean("played") || (match.optNullableString("status") == "finished")
            if (!played) return
            val stats = match.optObjectArray("stats")
            if (stats.isEmpty()) return

            val winningTeamId = getWinningTeamId(match, teamsSource)
            stats.forEach { stat ->
                val playerName = stat.optString("playerName").trim()
                val teamId = stat.optString("teamId").trim()
                if (playerName.isEmpty() || teamId.isEmpty()) return@forEach
                val teamName = lookupTeamName(teamId, teamsSource)
                if (isPlaceholderTeamName(teamName)) return@forEach

                val row = ensurePlayer(playerName, teamName)
                row.gamesPlayed += 1
                row.points += stat.optInt("canestri")
                row.soffi += stat.optInt("soffi")
                if (winningTeamId != null && isCompetitiveTeamId(teamId, teamsSource)) {
                    if (winningTeamId == teamId) row.wins += 1 else row.losses += 1
                }
            }
        }

        state.optNullableObject("tournament")?.let { liveTournament ->
            val liveTeams = liveTournament.optObjectArray("teams").ifEmpty { state.optObjectArray("teams") }
            extractTournamentMatches(state, liveTournament, isLive = true).forEach { match ->
                processMatch(match, liveTeams)
            }
        }

        state.optObjectArray("tournamentHistory").forEach { tournament ->
            val tournamentTeams = tournament.optObjectArray("teams")
            extractTournamentMatches(state, tournament, isLive = false).forEach { match ->
                processMatch(match, tournamentTeams)
            }
        }

        state.optObjectArray("integrationsScorers").forEach { scorer ->
            val playerName = scorer.optString("name").trim()
            if (playerName.isEmpty()) return@forEach
            val row = ensurePlayer(playerName, scorer.optNullableString("teamName") ?: "Integrazioni")
            row.gamesPlayed += scorer.optInt("games")
            row.points += scorer.optInt("points")
            row.soffi += scorer.optInt("soffi")
        }

        return rows.values.map { row ->
            NativeLeaderboardEntry(
                id = row.id,
                name = row.name,
                teamName = row.teamName,
                gamesPlayed = row.gamesPlayed,
                points = row.points,
                soffi = row.soffi,
                avgPoints = if (row.gamesPlayed > 0) row.points.toDouble() / row.gamesPlayed.toDouble() else 0.0,
                avgSoffi = if (row.gamesPlayed > 0) row.soffi.toDouble() / row.gamesPlayed.toDouble() else 0.0,
                u25 = false,
                yobLabel = null,
            )
        }.sortedWith(
            compareByDescending<NativeLeaderboardEntry> { it.points }
                .thenByDescending { it.soffi }
                .thenByDescending { it.gamesPlayed }
                .thenBy { it.name.lowercase() }
        )
    }

    private fun buildHallOfFameFromState(state: JSONObject): List<NativeHallOfFameEntry> {
        val tournamentDates = linkedMapOf<String, String>()
        state.optNullableObject("tournament")?.let { tournament ->
            val id = tournament.optString("id").trim()
            val startDate = normalizeIsoDateCandidate(tournament.optString("startDate"))
            if (id.isNotEmpty() && startDate.isNotEmpty()) {
                tournamentDates[id] = startDate
            }
        }
        state.optObjectArray("tournamentHistory").forEach { tournament ->
            val id = tournament.optString("id").trim()
            val startDate = normalizeIsoDateCandidate(tournament.optString("startDate"))
            if (id.isNotEmpty() && startDate.isNotEmpty()) {
                tournamentDates[id] = startDate
            }
        }

        val sourceRows = state.optObjectArray("hallOfFame")
        return sourceRows.sortedWith(
            compareByDescending<JSONObject> { hallSortValue(it, tournamentDates) }
                .thenByDescending { it.optString("year").toIntOrNull() ?: 0 }
                .thenByDescending { it.optString("tournamentName").lowercase() }
                .thenByDescending { it.optString("id").lowercase() }
        ).map(::parseHallEntryFromState)
    }

    private fun hallSortValue(entry: JSONObject, tournamentDates: Map<String, String>): Long {
        val tournamentId = entry.optString("tournamentId").trim()
        val sourceTournamentId = entry.optString("sourceTournamentId").trim()
        val manualDate = normalizeIsoDateCandidate(entry.optString("sourceTournamentDate"))
        val directDate = normalizeIsoDateCandidate(tournamentDates[tournamentId])
            ?: normalizeIsoDateCandidate(tournamentDates[sourceTournamentId])
            ?: manualDate
            ?: extractIsoDateFromKey(tournamentId)
            ?: extractIsoDateFromKey(sourceTournamentId)
            ?: extractIsoDateFromKey(entry.optString("id"))
        val parsed = directDate?.let { runCatching { java.time.Instant.parse("${it}T00:00:00Z").toEpochMilli() }.getOrNull() }
        if (parsed != null) return parsed
        val year = entry.optString("year").toLongOrNull() ?: 0L
        return if (year > 0L) runCatching {
            java.time.Instant.parse("${year.toString().padStart(4, '0')}-01-01T00:00:00Z").toEpochMilli()
        }.getOrDefault(0L) else 0L
    }

    private fun parseTournamentSummaryFromState(row: JSONObject): NativeTournamentSummary {
        val config = row.optNullableObject("config")
        return NativeTournamentSummary(
            id = row.requireString("id"),
            name = row.optString("name"),
            startDate = row.optString("startDate"),
            type = row.optString("type"),
            isManual = row.optBoolean("isManual"),
            status = row.optNullableString("status") ?: "archive",
            advancingPerGroup = config?.optIntOrNull("advancingPerGroup"),
            refTables = config?.optIntOrNull("refTables"),
        )
    }

    private fun parseTeamFromState(row: JSONObject): NativeTeamInfo = NativeTeamInfo(
        id = row.requireString("id"),
        name = row.optString("name"),
        player1 = row.optString("player1"),
        player2 = row.optNullableString("player2"),
        player1IsReferee = row.optBoolean("player1IsReferee"),
        player2IsReferee = row.optBoolean("player2IsReferee"),
        isReferee = row.optBoolean("isReferee"),
    )

    private fun parseGroupsFromState(tournament: JSONObject): List<NativeGroupInfo> {
        return tournament.optObjectArray("groups").mapIndexed { index, group ->
            val teamIds = group.optObjectArray("teams").mapNotNull { team ->
                team.optNullableString("id")
            }
            NativeGroupInfo(
                id = group.optNullableString("id") ?: "group-${index + 1}",
                name = group.optString("name"),
                orderIndex = group.optIntOrNull("orderIndex"),
                teamIds = teamIds,
            )
        }
    }

    private fun extractTournamentMatches(state: JSONObject, tournament: JSONObject, isLive: Boolean): List<JSONObject> {
        val directMatches = tournament.optObjectArray("matches")
        if (directMatches.isNotEmpty()) return directMatches
        if (isLive) {
            val liveMatches = state.optObjectArray("tournamentMatches")
            if (liveMatches.isNotEmpty()) return liveMatches
        }
        return flattenRounds(tournament.optJSONArray("rounds"))
    }

    private fun flattenRounds(rounds: JSONArray?): List<JSONObject> = buildList {
        if (rounds == null) return@buildList
        for (roundIndex in 0 until rounds.length()) {
            val round = rounds.optJSONArray(roundIndex) ?: continue
            for (matchIndex in 0 until round.length()) {
                round.optJSONObject(matchIndex)?.let { add(it) }
            }
        }
    }

    private fun extractMatchStats(matchRows: List<JSONObject>): List<NativeMatchStatInfo> = buildList {
        matchRows.forEach { match ->
            val matchId = match.optString("id").trim()
            if (matchId.isEmpty()) return@forEach
            match.optObjectArray("stats").forEach { stat ->
                val teamId = stat.optString("teamId").trim()
                val playerName = stat.optString("playerName").trim()
                if (teamId.isEmpty() || playerName.isEmpty()) return@forEach
                add(
                    NativeMatchStatInfo(
                        matchId = matchId,
                        teamId = teamId,
                        playerName = playerName,
                        canestri = stat.optInt("canestri"),
                        soffi = stat.optInt("soffi"),
                    )
                )
            }
        }
    }

    private fun parseMatchFromState(row: JSONObject): NativeMatchInfo = NativeMatchInfo(
        id = row.requireString("id"),
        code = row.optNullableString("code"),
        phase = row.optNullableString("phase"),
        groupName = row.optNullableString("groupName"),
        round = row.optIntOrNull("round"),
        roundName = row.optNullableString("roundName"),
        orderIndex = row.optIntOrNull("orderIndex"),
        teamAId = row.optNullableString("teamAId"),
        teamBId = row.optNullableString("teamBId"),
        scoreA = row.optInt("scoreA"),
        scoreB = row.optInt("scoreB"),
        played = row.optBoolean("played"),
        status = row.optNullableString("status") ?: if (row.optBoolean("played")) "finished" else "scheduled",
        isBye = row.optBoolean("isBye"),
        hidden = row.optBoolean("hidden"),
    )

    private fun parseHallEntryFromState(row: JSONObject): NativeHallOfFameEntry = NativeHallOfFameEntry(
        id = row.requireString("id"),
        year = row.optString("year"),
        tournamentId = row.optString("tournamentId"),
        tournamentName = row.optString("tournamentName"),
        type = row.optString("type"),
        teamName = row.optNullableString("teamName"),
        playerNames = row.optStringArray("playerNames"),
        value = row.optIntOrNull("value"),
    )

    private fun buildPlayerKey(name: String): String =
        "${name.trim().lowercase().replace(Regex("\\s+"), "_")}_ND"

    private fun isCompetitiveTeamId(teamId: String?, teamsSource: List<JSONObject>): Boolean {
        val safeTeamId = teamId?.trim().orEmpty()
        if (safeTeamId.isEmpty()) return false
        val team = teamsSource.firstOrNull { it.optString("id").trim() == safeTeamId }
        if (team?.optBoolean("isBye") == true || team?.optBoolean("hidden") == true) return false
        val label = lookupTeamName(safeTeamId, teamsSource).trim().uppercase()
        return label != "BYE" && label != "TBD" && label != "SLOT LIBERO"
    }

    private fun getWinningTeamId(match: JSONObject, teamsSource: List<JSONObject>): String? {
        if (match.optBoolean("isBye")) return null

        val teamIds = match.optJSONArray("teamIds")
        val scoresByTeam = match.optNullableObject("scoresByTeam")
        if (teamIds != null && scoresByTeam != null && teamIds.length() > 0) {
            val competitiveTeamIds = buildList {
                for (index in 0 until teamIds.length()) {
                    val teamId = teamIds.optString(index).trim()
                    if (isCompetitiveTeamId(teamId, teamsSource)) add(teamId)
                }
            }
            if (competitiveTeamIds.size < 2) return null

            var winningTeamId: String? = null
            var bestScore = Double.NEGATIVE_INFINITY
            var tie = false

            competitiveTeamIds.forEach { teamId ->
                val score = scoresByTeam.optDoubleOrZero(teamId)
                if (score > bestScore) {
                    bestScore = score
                    winningTeamId = teamId
                    tie = false
                } else if (score == bestScore) {
                    tie = true
                }
            }

            return if (tie) null else winningTeamId
        }

        val teamAId = match.optNullableString("teamAId")
        val teamBId = match.optNullableString("teamBId")
        if (!isCompetitiveTeamId(teamAId, teamsSource) || !isCompetitiveTeamId(teamBId, teamsSource)) return null
        val scoreA = match.optInt("scoreA")
        val scoreB = match.optInt("scoreB")
        if (scoreA == scoreB) return null
        return if (scoreA > scoreB) teamAId else teamBId
    }

    private fun lookupTeamName(teamId: String?, teamsSource: List<JSONObject>): String {
        val safeTeamId = teamId?.trim().orEmpty()
        if (safeTeamId.isEmpty()) return "TBD"
        return teamsSource.firstOrNull { it.optString("id").trim() == safeTeamId }
            ?.optString("name")
            ?.takeIf { it.isNotBlank() }
            ?: safeTeamId
    }

    private fun isPlaceholderTeamName(raw: String): Boolean {
        val normalized = raw.trim().uppercase()
        return normalized == "BYE" || normalized == "TBD" || normalized == "SLOT LIBERO" || normalized.startsWith("TBD-")
    }

    private fun isValidIsoDate(value: String): Boolean =
        Regex("""^\d{4}-\d{2}-\d{2}$""").matches(value)

    private fun normalizeIsoDateCandidate(value: String?): String {
        val raw = value?.trim().orEmpty()
        if (raw.isEmpty()) return ""
        val direct = Regex("""\d{4}-\d{2}-\d{2}""").find(raw)?.value.orEmpty()
        return direct.takeIf(::isValidIsoDate).orEmpty()
    }

    private fun extractIsoDateFromKey(value: String?): String? {
        val raw = value?.trim().orEmpty()
        if (raw.isEmpty()) return null
        val match = Regex("""(^|_)(\d{4}-\d{2}-\d{2})(_|$)""").find(raw) ?: return null
        val iso = match.groupValues.getOrNull(2).orEmpty()
        return iso.takeIf(::isValidIsoDate)
    }

    private fun requestArray(path: String): JSONArray {
        val endpoint = "${SUPABASE_URL.trimEnd('/')}/rest/v1/$path"
        val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 5_000
            readTimeout = 5_000
            setRequestProperty("apikey", SUPABASE_ANON_KEY)
            setRequestProperty("Authorization", "Bearer $SUPABASE_ANON_KEY")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
        }

        return try {
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val body = stream.readTextSafe()
            if (code !in 200..299) {
                throw IllegalStateException(body.ifBlank { "HTTP $code" })
            }
            JSONArray(body.ifBlank { "[]" })
        } finally {
            connection.disconnect()
        }
    }

    private fun encode(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8.toString())
}

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

private fun JSONObject.requireString(key: String): String {
    val value = optString(key).trim()
    if (value.isEmpty()) {
        throw IllegalStateException("Missing required field: $key")
    }
    return value
}

private fun JSONObject.optNullableString(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return optString(key).trim().ifEmpty { null }
}

private fun JSONObject.optIntOrNull(key: String): Int? {
    if (!has(key) || isNull(key)) return null
    val value = opt(key)
    return when (value) {
        is Int -> value
        is Long -> value.toInt()
        is Double -> value.toInt()
        is Float -> value.toInt()
        is Number -> value.toInt()
        is String -> value.toIntOrNull()
        else -> null
    }
}

private fun JSONObject.optDoubleOrZero(key: String): Double {
    if (!has(key) || isNull(key)) return 0.0
    val value = opt(key)
    return when (value) {
        is Double -> value
        is Float -> value.toDouble()
        is Int -> value.toDouble()
        is Long -> value.toDouble()
        is Number -> value.toDouble()
        is String -> value.toDoubleOrNull() ?: 0.0
        else -> 0.0
    }
}

private fun JSONObject.optNullableObject(key: String): JSONObject? {
    if (!has(key) || isNull(key)) return null
    val value = opt(key)
    return value as? JSONObject
}

private fun JSONObject.optObjectArray(key: String): List<JSONObject> =
    optJSONArray(key).jsonObjects()

private fun JSONObject.optStringArray(key: String): List<String> {
    if (!has(key) || isNull(key)) return emptyList()
    val value = opt(key)
    if (value !is JSONArray) return emptyList()
    return buildList {
        for (index in 0 until value.length()) {
            val item = value.optString(index).trim()
            if (item.isNotEmpty()) add(item)
        }
    }
}

private fun JSONArray?.jsonObjects(): List<JSONObject> = buildList {
    if (this@jsonObjects == null) return@buildList
    for (index in 0 until this@jsonObjects.length()) {
        this@jsonObjects.optJSONObject(index)?.let { add(it) }
    }
}
