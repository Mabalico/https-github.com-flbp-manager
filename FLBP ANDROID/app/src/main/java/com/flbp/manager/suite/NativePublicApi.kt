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
)

data class NativeTeamInfo(
    val id: String,
    val name: String,
    val player1: String,
    val player2: String?,
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

object NativePublicApi {
    suspend fun fetchCatalog(): NativePublicCatalog = withContext(Dispatchers.IO) {
        val rows = requestArray(
            "public_tournaments" +
                "?workspace_id=eq.${encode(SUPABASE_WORKSPACE_ID)}" +
                "&select=id,name,start_date,type,config,is_manual,status" +
                "&order=start_date.asc"
        )

        val tournaments = buildList {
            for (index in 0 until rows.length()) {
                add(parseTournamentSummary(rows.getJSONObject(index)))
            }
        }

        NativePublicCatalog(
            liveTournament = tournaments.firstOrNull { it.status == "live" },
            history = tournaments
                .filter { it.status != "live" }
                .sortedByDescending { it.startDate },
        )
    }

    suspend fun fetchTournamentBundle(tournamentId: String): NativeTournamentBundle? = withContext(Dispatchers.IO) {
        val safeTournamentId = encode(tournamentId)
        val workspace = encode(SUPABASE_WORKSPACE_ID)

        val tournamentRows = requestArray(
            "public_tournaments" +
                "?workspace_id=eq.$workspace" +
                "&id=eq.$safeTournamentId" +
                "&select=id,name,start_date,type,config,is_manual,status" +
                "&limit=1"
        )

        if (tournamentRows.length() == 0) return@withContext null

        val tournament = parseTournamentSummary(tournamentRows.getJSONObject(0))
        val teamRows = requestArray(
            "public_tournament_teams" +
                "?workspace_id=eq.$workspace" +
                "&tournament_id=eq.$safeTournamentId" +
                "&select=id,name,player1,player2,created_at" +
                "&order=created_at.asc"
        )
        val groupRows = requestArray(
            "public_tournament_groups" +
                "?workspace_id=eq.$workspace" +
                "&tournament_id=eq.$safeTournamentId" +
                "&select=id,name,order_index" +
                "&order=order_index.asc"
        )
        val groupTeamRows = requestArray(
            "public_tournament_group_teams" +
                "?workspace_id=eq.$workspace" +
                "&tournament_id=eq.$safeTournamentId" +
                "&select=group_id,team_id,seed"
        )
        val matchRows = requestArray(
            "public_tournament_matches" +
                "?workspace_id=eq.$workspace" +
                "&tournament_id=eq.$safeTournamentId" +
                "&select=id,code,phase,group_name,round,round_name,order_index,team_a_id,team_b_id,score_a,score_b,played,status,is_bye,hidden" +
                "&order=order_index.asc"
        )
        val statRows = requestArray(
            "public_tournament_match_stats" +
                "?workspace_id=eq.$workspace" +
                "&tournament_id=eq.$safeTournamentId" +
                "&select=match_id,team_id,player_name,canestri,soffi"
        )

        val teams = buildList {
            for (index in 0 until teamRows.length()) {
                val row = teamRows.getJSONObject(index)
                add(
                    NativeTeamInfo(
                        id = row.requireString("id"),
                        name = row.optString("name"),
                        player1 = row.optString("player1"),
                        player2 = row.optNullableString("player2"),
                    )
                )
            }
        }

        val teamIdsByGroup = linkedMapOf<String, MutableList<String>>()
        for (index in 0 until groupTeamRows.length()) {
            val row = groupTeamRows.getJSONObject(index)
            val groupId = row.requireString("group_id")
            val teamId = row.requireString("team_id")
            teamIdsByGroup.getOrPut(groupId) { mutableListOf() }.add(teamId)
        }

        val groups = buildList {
            for (index in 0 until groupRows.length()) {
                val row = groupRows.getJSONObject(index)
                val groupId = row.requireString("id")
                add(
                    NativeGroupInfo(
                        id = groupId,
                        name = row.optString("name"),
                        orderIndex = row.optIntOrNull("order_index"),
                        teamIds = teamIdsByGroup[groupId]?.toList().orEmpty(),
                    )
                )
            }
        }

        val matches = buildList {
            for (index in 0 until matchRows.length()) {
                val row = matchRows.getJSONObject(index)
                add(
                    NativeMatchInfo(
                        id = row.requireString("id"),
                        code = row.optNullableString("code"),
                        phase = row.optNullableString("phase"),
                        groupName = row.optNullableString("group_name"),
                        round = row.optIntOrNull("round"),
                        roundName = row.optNullableString("round_name"),
                        orderIndex = row.optIntOrNull("order_index"),
                        teamAId = row.optNullableString("team_a_id"),
                        teamBId = row.optNullableString("team_b_id"),
                        scoreA = row.optInt("score_a"),
                        scoreB = row.optInt("score_b"),
                        played = row.optBoolean("played"),
                        status = row.optNullableString("status") ?: "scheduled",
                        isBye = row.optBoolean("is_bye"),
                        hidden = row.optBoolean("hidden"),
                    )
                )
            }
        }

        val stats = buildList {
            for (index in 0 until statRows.length()) {
                val row = statRows.getJSONObject(index)
                add(
                    NativeMatchStatInfo(
                        matchId = row.requireString("match_id"),
                        teamId = row.requireString("team_id"),
                        playerName = row.optString("player_name"),
                        canestri = row.optInt("canestri"),
                        soffi = row.optInt("soffi"),
                    )
                )
            }
        }

        NativeTournamentBundle(
            tournament = tournament,
            teams = teams,
            groups = groups,
            matches = matches.sortedBy { it.orderIndex ?: Int.MAX_VALUE },
            stats = stats,
        )
    }

    suspend fun fetchCareerLeaderboard(): List<NativeLeaderboardEntry> = withContext(Dispatchers.IO) {
        val rows = requestArray(
            "public_career_leaderboard" +
                "?workspace_id=eq.${encode(SUPABASE_WORKSPACE_ID)}" +
                "&select=id,name,team_name,games_played,points,soffi,avg_points,avg_soffi,u25,yob_label"
        )

        buildList {
            for (index in 0 until rows.length()) {
                val row = rows.getJSONObject(index)
                add(
                    NativeLeaderboardEntry(
                        id = row.requireString("id"),
                        name = row.optString("name"),
                        teamName = row.optString("team_name"),
                        gamesPlayed = row.optInt("games_played"),
                        points = row.optInt("points"),
                        soffi = row.optInt("soffi"),
                        avgPoints = row.optDoubleOrZero("avg_points"),
                        avgSoffi = row.optDoubleOrZero("avg_soffi"),
                        u25 = row.optBoolean("u25"),
                        yobLabel = row.optNullableString("yob_label"),
                    )
                )
            }
        }.sortedWith(
            compareByDescending<NativeLeaderboardEntry> { it.points }
                .thenByDescending { it.soffi }
                .thenByDescending { it.gamesPlayed }
                .thenBy { it.name.lowercase() }
        )
    }

    suspend fun fetchHallOfFame(): List<NativeHallOfFameEntry> = withContext(Dispatchers.IO) {
        val rows = requestArray(
            "public_hall_of_fame_entries" +
                "?workspace_id=eq.${encode(SUPABASE_WORKSPACE_ID)}" +
                "&select=id,year,tournament_id,tournament_name,type,team_name,player_names,value,created_at" +
                "&order=year.desc,created_at.desc"
        )

        buildList {
            for (index in 0 until rows.length()) {
                val row = rows.getJSONObject(index)
                add(
                    NativeHallOfFameEntry(
                        id = row.requireString("id"),
                        year = row.optString("year"),
                        tournamentId = row.optString("tournament_id"),
                        tournamentName = row.optString("tournament_name"),
                        type = row.optString("type"),
                        teamName = row.optNullableString("team_name"),
                        playerNames = row.optStringArray("player_names"),
                        value = row.optIntOrNull("value"),
                    )
                )
            }
        }
    }

    private fun parseTournamentSummary(row: JSONObject): NativeTournamentSummary {
        val config = row.optNullableObject("config")
        return NativeTournamentSummary(
            id = row.requireString("id"),
            name = row.optString("name"),
            startDate = row.optString("start_date"),
            type = row.optString("type"),
            isManual = row.optBoolean("is_manual"),
            status = row.optString("status"),
            advancingPerGroup = config?.optIntOrNull("advancingPerGroup"),
        )
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
