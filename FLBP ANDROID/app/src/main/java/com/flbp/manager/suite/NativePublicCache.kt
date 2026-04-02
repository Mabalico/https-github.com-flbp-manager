package com.flbp.manager.suite

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

private const val CACHE_PREFS = "flbp_native_public_cache"
private const val KEY_CATALOG = "catalog"
private const val KEY_LEADERBOARD = "leaderboard"
private const val KEY_HALL = "hall"
private const val KEY_BUNDLES = "bundles"

class NativePublicCache(context: Context) {
    private val prefs = context.getSharedPreferences(CACHE_PREFS, Context.MODE_PRIVATE)

    fun readCatalog(): NativePublicCatalog? {
        val raw = prefs.getString(KEY_CATALOG, null) ?: return null
        return runCatching {
            val root = JSONObject(raw)
            NativePublicCatalog(
                liveTournament = root.optJSONObject("liveTournament")?.let(::tournamentSummaryFromJson),
                history = root.optJSONArray("history").jsonObjects().map(::tournamentSummaryFromJson),
            )
        }.getOrNull()
    }

    fun writeCatalog(catalog: NativePublicCatalog) {
        val root = JSONObject().apply {
            if (catalog.liveTournament != null) {
                put("liveTournament", catalog.liveTournament.toJson())
            } else {
                put("liveTournament", JSONObject.NULL)
            }
            put("history", JSONArray().apply {
                catalog.history.forEach { put(it.toJson()) }
            })
        }
        prefs.edit().putString(KEY_CATALOG, root.toString()).apply()
    }

    fun readLeaderboard(): List<NativeLeaderboardEntry>? {
        val raw = prefs.getString(KEY_LEADERBOARD, null) ?: return null
        return runCatching {
            JSONArray(raw).jsonObjects().map(::leaderboardEntryFromJson)
        }.getOrNull()
    }

    fun writeLeaderboard(entries: List<NativeLeaderboardEntry>) {
        val payload = JSONArray().apply {
            entries.forEach { put(it.toJson()) }
        }
        prefs.edit().putString(KEY_LEADERBOARD, payload.toString()).apply()
    }

    fun readHallOfFame(): List<NativeHallOfFameEntry>? {
        val raw = prefs.getString(KEY_HALL, null) ?: return null
        return runCatching {
            JSONArray(raw).jsonObjects().map(::hallEntryFromJson)
        }.getOrNull()
    }

    fun writeHallOfFame(entries: List<NativeHallOfFameEntry>) {
        val payload = JSONArray().apply {
            entries.forEach { put(it.toJson()) }
        }
        prefs.edit().putString(KEY_HALL, payload.toString()).apply()
    }

    fun readTournamentBundle(tournamentId: String): NativeTournamentBundle? {
        val raw = prefs.getString(KEY_BUNDLES, null) ?: return null
        return runCatching {
            JSONObject(raw).optJSONObject(tournamentId)?.let(::tournamentBundleFromJson)
        }.getOrNull()
    }

    fun writeTournamentBundle(bundle: NativeTournamentBundle) {
        val existing = runCatching { JSONObject(prefs.getString(KEY_BUNDLES, "{}") ?: "{}") }.getOrElse { JSONObject() }
        existing.put(bundle.tournament.id, bundle.toJson())
        prefs.edit().putString(KEY_BUNDLES, existing.toString()).apply()
    }
}

private fun JSONArray?.jsonObjects(): List<JSONObject> = buildList {
    if (this@jsonObjects == null) return@buildList
    for (index in 0 until this@jsonObjects.length()) {
        this@jsonObjects.optJSONObject(index)?.let { add(it) }
    }
}

private fun NativeTournamentSummary.toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("name", name)
    put("startDate", startDate)
    put("type", type)
    put("isManual", isManual)
    put("status", status)
    if (advancingPerGroup != null) put("advancingPerGroup", advancingPerGroup) else put("advancingPerGroup", JSONObject.NULL)
    if (refTables != null) put("refTables", refTables) else put("refTables", JSONObject.NULL)
}

private fun tournamentSummaryFromJson(json: JSONObject): NativeTournamentSummary = NativeTournamentSummary(
    id = json.optString("id"),
    name = json.optString("name"),
    startDate = json.optString("startDate"),
    type = json.optString("type"),
    isManual = json.optBoolean("isManual"),
    status = json.optString("status"),
    advancingPerGroup = json.optIntOrNull("advancingPerGroup"),
    refTables = json.optIntOrNull("refTables"),
)

private fun NativeTeamInfo.toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("name", name)
    put("player1", player1)
    if (player2 != null) put("player2", player2) else put("player2", JSONObject.NULL)
    put("player1IsReferee", player1IsReferee)
    put("player2IsReferee", player2IsReferee)
    put("isReferee", isReferee)
}

private fun teamInfoFromJson(json: JSONObject): NativeTeamInfo = NativeTeamInfo(
    id = json.optString("id"),
    name = json.optString("name"),
    player1 = json.optString("player1"),
    player2 = json.optNullableString("player2"),
    player1IsReferee = json.optBoolean("player1IsReferee"),
    player2IsReferee = json.optBoolean("player2IsReferee"),
    isReferee = json.optBoolean("isReferee"),
)

private fun NativeGroupInfo.toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("name", name)
    if (orderIndex != null) put("orderIndex", orderIndex) else put("orderIndex", JSONObject.NULL)
    put("teamIds", JSONArray().apply { teamIds.forEach { put(it) } })
}

private fun groupInfoFromJson(json: JSONObject): NativeGroupInfo = NativeGroupInfo(
    id = json.optString("id"),
    name = json.optString("name"),
    orderIndex = json.optIntOrNull("orderIndex"),
    teamIds = json.optStringArray("teamIds"),
)

private fun NativeMatchInfo.toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    if (code != null) put("code", code) else put("code", JSONObject.NULL)
    if (phase != null) put("phase", phase) else put("phase", JSONObject.NULL)
    if (groupName != null) put("groupName", groupName) else put("groupName", JSONObject.NULL)
    if (round != null) put("round", round) else put("round", JSONObject.NULL)
    if (roundName != null) put("roundName", roundName) else put("roundName", JSONObject.NULL)
    if (orderIndex != null) put("orderIndex", orderIndex) else put("orderIndex", JSONObject.NULL)
    if (teamAId != null) put("teamAId", teamAId) else put("teamAId", JSONObject.NULL)
    if (teamBId != null) put("teamBId", teamBId) else put("teamBId", JSONObject.NULL)
    put("scoreA", scoreA)
    put("scoreB", scoreB)
    put("played", played)
    put("status", status)
    put("isBye", isBye)
    put("hidden", hidden)
}

private fun matchInfoFromJson(json: JSONObject): NativeMatchInfo = NativeMatchInfo(
    id = json.optString("id"),
    code = json.optNullableString("code"),
    phase = json.optNullableString("phase"),
    groupName = json.optNullableString("groupName"),
    round = json.optIntOrNull("round"),
    roundName = json.optNullableString("roundName"),
    orderIndex = json.optIntOrNull("orderIndex"),
    teamAId = json.optNullableString("teamAId"),
    teamBId = json.optNullableString("teamBId"),
    scoreA = json.optInt("scoreA"),
    scoreB = json.optInt("scoreB"),
    played = json.optBoolean("played"),
    status = json.optString("status"),
    isBye = json.optBoolean("isBye"),
    hidden = json.optBoolean("hidden"),
)

private fun NativeMatchStatInfo.toJson(): JSONObject = JSONObject().apply {
    put("matchId", matchId)
    put("teamId", teamId)
    put("playerName", playerName)
    put("canestri", canestri)
    put("soffi", soffi)
}

private fun matchStatFromJson(json: JSONObject): NativeMatchStatInfo = NativeMatchStatInfo(
    matchId = json.optString("matchId"),
    teamId = json.optString("teamId"),
    playerName = json.optString("playerName"),
    canestri = json.optInt("canestri"),
    soffi = json.optInt("soffi"),
)

private fun NativeTournamentBundle.toJson(): JSONObject = JSONObject().apply {
    put("tournament", tournament.toJson())
    put("teams", JSONArray().apply { teams.forEach { put(it.toJson()) } })
    put("groups", JSONArray().apply { groups.forEach { put(it.toJson()) } })
    put("matches", JSONArray().apply { matches.forEach { put(it.toJson()) } })
    put("stats", JSONArray().apply { stats.forEach { put(it.toJson()) } })
}

private fun tournamentBundleFromJson(json: JSONObject): NativeTournamentBundle = NativeTournamentBundle(
    tournament = tournamentSummaryFromJson(json.getJSONObject("tournament")),
    teams = json.optJSONArray("teams").jsonObjects().map(::teamInfoFromJson),
    groups = json.optJSONArray("groups").jsonObjects().map(::groupInfoFromJson),
    matches = json.optJSONArray("matches").jsonObjects().map(::matchInfoFromJson),
    stats = json.optJSONArray("stats").jsonObjects().map(::matchStatFromJson),
)

private fun NativeLeaderboardEntry.toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("name", name)
    put("teamName", teamName)
    put("gamesPlayed", gamesPlayed)
    put("points", points)
    put("soffi", soffi)
    put("avgPoints", avgPoints)
    put("avgSoffi", avgSoffi)
    put("u25", u25)
    if (yobLabel != null) put("yobLabel", yobLabel) else put("yobLabel", JSONObject.NULL)
}

private fun leaderboardEntryFromJson(json: JSONObject): NativeLeaderboardEntry = NativeLeaderboardEntry(
    id = json.optString("id"),
    name = json.optString("name"),
    teamName = json.optString("teamName"),
    gamesPlayed = json.optInt("gamesPlayed"),
    points = json.optInt("points"),
    soffi = json.optInt("soffi"),
    avgPoints = json.optDoubleOrZero("avgPoints"),
    avgSoffi = json.optDoubleOrZero("avgSoffi"),
    u25 = json.optBoolean("u25"),
    yobLabel = json.optNullableString("yobLabel"),
)

private fun NativeHallOfFameEntry.toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("year", year)
    put("tournamentId", tournamentId)
    put("tournamentName", tournamentName)
    put("type", type)
    if (teamName != null) put("teamName", teamName) else put("teamName", JSONObject.NULL)
    put("playerNames", JSONArray().apply { playerNames.forEach { put(it) } })
    if (value != null) put("value", value) else put("value", JSONObject.NULL)
}

private fun hallEntryFromJson(json: JSONObject): NativeHallOfFameEntry = NativeHallOfFameEntry(
    id = json.optString("id"),
    year = json.optString("year"),
    tournamentId = json.optString("tournamentId"),
    tournamentName = json.optString("tournamentName"),
    type = json.optString("type"),
    teamName = json.optNullableString("teamName"),
    playerNames = json.optStringArray("playerNames"),
    value = json.optIntOrNull("value"),
)

private fun JSONObject.optStringArray(key: String): List<String> {
    val value = optJSONArray(key) ?: return emptyList()
    return buildList {
        for (index in 0 until value.length()) {
            val item = value.optString(index).trim()
            if (item.isNotEmpty()) add(item)
        }
    }
}

private fun JSONObject.optNullableString(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return optString(key).trim().ifEmpty { null }
}

private fun JSONObject.optIntOrNull(key: String): Int? {
    if (!has(key) || isNull(key)) return null
    return when (val value = opt(key)) {
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
    return when (val value = opt(key)) {
        is Double -> value
        is Float -> value.toDouble()
        is Int -> value.toDouble()
        is Long -> value.toDouble()
        is Number -> value.toDouble()
        is String -> value.toDoubleOrNull() ?: 0.0
        else -> 0.0
    }
}
