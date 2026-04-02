package com.flbp.manager.suite

import java.text.Normalizer

data class GroupStandingRow(
    val teamId: String,
    val teamName: String,
    val played: Int,
    val wins: Int,
    val losses: Int,
    val cupsFor: Int,
    val cupsAgainst: Int,
    val cupsDiff: Int,
    val soffiFor: Int,
    val soffiAgainst: Int,
    val soffiDiff: Int,
)

data class TournamentPlayerRow(
    val key: String,
    val name: String,
    val teamName: String,
    val gamesPlayed: Int,
    val wins: Int,
    val losses: Int,
    val winRate: Double,
    val points: Int,
    val soffi: Int,
    val avgPoints: Double,
    val avgSoffi: Double,
)

data class NativeTurnBlock(
    val turnNumber: Int,
    val statusLabel: String,
    val matches: List<NativeMatchInfo>,
    val isLive: Boolean,
    val isNext: Boolean,
    val isPlayed: Boolean,
)

data class NativeTurnsSnapshot(
    val tablesPerTurn: Int,
    val activeBlocks: List<NativeTurnBlock>,
    val playedBlocks: List<NativeTurnBlock>,
    val tbdMatches: List<NativeMatchInfo>,
)

data class TitledHallOfFamePlayerRow(
    val key: String,
    val name: String,
    val total: Int,
    val win: Int,
    val mvp: Int,
    val ts: Int,
    val def: Int,
    val ts25: Int,
    val def25: Int,
    val u25Total: Int,
)

enum class NativeTvProjection(val id: String, val label: String) {
    GROUPS("groups", "Groups"),
    GROUPS_BRACKET("groups_bracket", "Groups + bracket"),
    BRACKET("bracket", "Bracket"),
    SCORERS("scorers", "Scorers");

    companion object {
        fun fromId(raw: String?): NativeTvProjection? = entries.firstOrNull { it.id == raw }
    }
}

fun visibleTeamCount(bundle: NativeTournamentBundle): Int {
    return bundle.teams.count { team ->
        val label = team.name.trim().uppercase()
        label != "BYE" && label != "TBD" && label != "SLOT LIBERO"
    }
}

fun visiblePublicMatches(bundle: NativeTournamentBundle): List<NativeMatchInfo> {
    return bundle.matches.filterNot { match ->
        match.hidden || match.isBye || isByeLabel(bundle.teamNameFor(match.teamAId)) || isByeLabel(bundle.teamNameFor(match.teamBId))
    }
}

private fun isByeLabel(name: String): Boolean {
    val normalized = name.trim().uppercase()
    return normalized == "BYE"
}

private fun isPlaceholderLabel(name: String): Boolean {
    val normalized = name.trim().uppercase()
    return normalized == "BYE" || normalized == "TBD" || normalized == "SLOT LIBERO" || normalized.startsWith("TBD-")
}

fun hasValidParticipants(bundle: NativeTournamentBundle, match: NativeMatchInfo): Boolean {
    val teamA = bundle.teamNameFor(match.teamAId)
    val teamB = bundle.teamNameFor(match.teamBId)
    return !isPlaceholderLabel(teamA) && !isPlaceholderLabel(teamB)
}

fun NativeTournamentBundle.teamNameFor(teamId: String?): String {
    if (teamId.isNullOrBlank()) return "TBD"
    return teams.firstOrNull { it.id == teamId }?.name ?: teamId
}

fun computeGroupStandings(
    bundle: NativeTournamentBundle,
    group: NativeGroupInfo,
): List<GroupStandingRow> {
    val teamsById = bundle.teams.associateBy { it.id }
    val rows = group.teamIds.associateWith { teamId ->
        GroupStandingRow(
            teamId = teamId,
            teamName = teamsById[teamId]?.name ?: teamId,
            played = 0,
            wins = 0,
            losses = 0,
            cupsFor = 0,
            cupsAgainst = 0,
            cupsDiff = 0,
            soffiFor = 0,
            soffiAgainst = 0,
            soffiDiff = 0,
        )
    }.toMutableMap()

    val statsByMatchAndTeam = bundle.stats.groupBy { it.matchId }.mapValues { entry ->
        entry.value.groupBy { it.teamId }
    }

    visiblePublicMatches(bundle)
        .filter { it.groupName == group.name }
        .filter { it.played || it.status == "finished" }
        .forEach { match ->
            val teamAId = match.teamAId ?: return@forEach
            val teamBId = match.teamBId ?: return@forEach
            val rowA = rows[teamAId] ?: return@forEach
            val rowB = rows[teamBId] ?: return@forEach

            val teamAStats = statsByMatchAndTeam[match.id]?.get(teamAId).orEmpty()
            val teamBStats = statsByMatchAndTeam[match.id]?.get(teamBId).orEmpty()
            val soffiA = teamAStats.sumOf { it.soffi }
            val soffiB = teamBStats.sumOf { it.soffi }

            rows[teamAId] = rowA.copy(
                played = rowA.played + 1,
                cupsFor = rowA.cupsFor + match.scoreA,
                cupsAgainst = rowA.cupsAgainst + match.scoreB,
                soffiFor = rowA.soffiFor + soffiA,
                soffiAgainst = rowA.soffiAgainst + soffiB,
            )
            rows[teamBId] = rowB.copy(
                played = rowB.played + 1,
                cupsFor = rowB.cupsFor + match.scoreB,
                cupsAgainst = rowB.cupsAgainst + match.scoreA,
                soffiFor = rowB.soffiFor + soffiB,
                soffiAgainst = rowB.soffiAgainst + soffiA,
            )

            when {
                match.scoreA > match.scoreB -> {
                    rows[teamAId] = rows.getValue(teamAId).copy(wins = rows.getValue(teamAId).wins + 1)
                    rows[teamBId] = rows.getValue(teamBId).copy(losses = rows.getValue(teamBId).losses + 1)
                }
                match.scoreB > match.scoreA -> {
                    rows[teamBId] = rows.getValue(teamBId).copy(wins = rows.getValue(teamBId).wins + 1)
                    rows[teamAId] = rows.getValue(teamAId).copy(losses = rows.getValue(teamAId).losses + 1)
                }
            }
        }

    return rows.values
        .map { row ->
            row.copy(
                cupsDiff = row.cupsFor - row.cupsAgainst,
                soffiDiff = row.soffiFor - row.soffiAgainst,
            )
        }
        .sortedWith(
            compareByDescending<GroupStandingRow> { it.wins }
                .thenByDescending { it.cupsDiff }
                .thenByDescending { it.soffiDiff }
                .thenByDescending { it.cupsFor }
                .thenBy { it.teamName.lowercase() }
        )
}

fun buildTournamentLeaderboard(bundle: NativeTournamentBundle): List<TournamentPlayerRow> {
    data class MutablePlayer(
        val name: String,
        val teamName: String,
        var gamesPlayed: Int = 0,
        var wins: Int = 0,
        var losses: Int = 0,
        var points: Int = 0,
        var soffi: Int = 0,
    )

    val players = linkedMapOf<String, MutablePlayer>()
    bundle.teams.forEach { team ->
        listOfNotNull(team.player1.takeIf { it.isNotBlank() }, team.player2?.takeIf { it.isNotBlank() }).forEach { playerName ->
            val key = "${playerName.trim().lowercase()}|${team.name.trim().lowercase()}"
            players.putIfAbsent(key, MutablePlayer(name = playerName, teamName = team.name))
        }
    }

    val statsByMatch = bundle.stats.groupBy { it.matchId }
    visiblePublicMatches(bundle)
        .filter { it.played || it.status == "finished" }
        .forEach { match ->
            val winnerId = when {
                match.scoreA > match.scoreB -> match.teamAId
                match.scoreB > match.scoreA -> match.teamBId
                else -> null
            }

            statsByMatch[match.id].orEmpty().forEach { stat ->
                val teamName = bundle.teamNameFor(stat.teamId)
                if (isPlaceholderLabel(teamName)) return@forEach
                val key = "${stat.playerName.trim().lowercase()}|${teamName.trim().lowercase()}"
                val player = players.getOrPut(key) {
                    MutablePlayer(name = stat.playerName, teamName = teamName)
                }
                player.gamesPlayed += 1
                player.points += stat.canestri
                player.soffi += stat.soffi
                if (winnerId != null) {
                    if (winnerId == stat.teamId) player.wins += 1 else player.losses += 1
                }
            }
        }

    return players.entries.map { (key, value) ->
        TournamentPlayerRow(
            key = key,
            name = value.name,
            teamName = value.teamName,
            gamesPlayed = value.gamesPlayed,
            wins = value.wins,
            losses = value.losses,
            winRate = if (value.wins + value.losses > 0) {
                ((value.wins.toDouble() / (value.wins + value.losses).toDouble()) * 100.0)
            } else {
                0.0
            },
            points = value.points,
            soffi = value.soffi,
            avgPoints = if (value.gamesPlayed > 0) value.points.toDouble() / value.gamesPlayed.toDouble() else 0.0,
            avgSoffi = if (value.gamesPlayed > 0) value.soffi.toDouble() / value.gamesPlayed.toDouble() else 0.0,
        )
    }
        .filter { it.gamesPlayed > 0 || it.points > 0 || it.soffi > 0 }
        .sortedWith(
            compareByDescending<TournamentPlayerRow> { it.points }
                .thenByDescending { it.soffi }
                .thenByDescending { it.gamesPlayed }
                .thenBy { it.name.lowercase() }
        )
}

fun formatPercentOrNd(value: Double, hasValue: Boolean): String {
    if (!hasValue) return "ND"
    return String.format("%.1f%%", value)
}

fun buildTurnsSnapshot(bundle: NativeTournamentBundle): NativeTurnsSnapshot {
    val tablesPerTurn = (bundle.tournament.refTables ?: 8).coerceAtLeast(1)
    val visibleMatches = visiblePublicMatches(bundle).sortedBy { it.orderIndex ?: Int.MAX_VALUE }
    val playedMatches = visibleMatches.filter { it.played || it.status == "finished" }
    val upcomingMatches = visibleMatches.filterNot { it.played || it.status == "finished" }
    val playableUpcoming = upcomingMatches.filter { hasValidParticipants(bundle, it) }
    val tbdMatches = upcomingMatches.filterNot { hasValidParticipants(bundle, it) }

    val liveChunks = playableUpcoming.chunked(tablesPerTurn)
    val currentChunkIndex = liveChunks.indexOfFirst { chunk -> chunk.any { it.status == "playing" } }

    val activeBlocks = liveChunks.mapIndexed { index, matches ->
        val hasLive = matches.any { it.status == "playing" }
        val isNext = if (currentChunkIndex >= 0) {
            index == currentChunkIndex + 1
        } else {
            index == 0
        }
        NativeTurnBlock(
            turnNumber = index + 1,
            statusLabel = when {
                hasLive -> "Live"
                isNext -> "Next"
                else -> "Upcoming"
            },
            matches = matches,
            isLive = hasLive,
            isNext = isNext,
            isPlayed = false,
        )
    }

    val playedBlocks = playedMatches.chunked(tablesPerTurn).mapIndexed { index, matches ->
        NativeTurnBlock(
            turnNumber = index + 1,
            statusLabel = "Played",
            matches = matches,
            isLive = false,
            isNext = false,
            isPlayed = true,
        )
    }

    return NativeTurnsSnapshot(
        tablesPerTurn = tablesPerTurn,
        activeBlocks = activeBlocks,
        playedBlocks = playedBlocks,
        tbdMatches = tbdMatches,
    )
}

fun buildTitledHallOfFameRows(entries: List<NativeHallOfFameEntry>): List<TitledHallOfFamePlayerRow> {
    data class MutableHallRow(
        var name: String,
        val breakdown: MutableMap<String, Int> = mutableMapOf(),
    )

    val rows = linkedMapOf<String, MutableHallRow>()

    fun addPlayer(rawName: String, type: String) {
        val displayName = rawName.trim().replace(Regex("\\s+"), " ")
        if (displayName.isBlank()) return
        val key = normalizeAliasComponent(displayName)
        if (key.isBlank()) return
        val row = rows.getOrPut(key) { MutableHallRow(name = displayName) }
        row.breakdown[type] = (row.breakdown[type] ?: 0) + 1
    }

    entries.forEach { entry ->
        entry.playerNames.forEach { playerName ->
            addPlayer(playerName, entry.type)
        }
    }

    return rows.entries.map { (key, row) ->
        val win = row.breakdown["winner"] ?: 0
        val mvp = row.breakdown["mvp"] ?: 0
        val ts = row.breakdown["top_scorer"] ?: 0
        val def = row.breakdown["defender"] ?: 0
        val ts25 = row.breakdown["top_scorer_u25"] ?: 0
        val def25 = row.breakdown["defender_u25"] ?: 0
        TitledHallOfFamePlayerRow(
            key = key,
            name = row.name,
            total = win + mvp + ts + def,
            win = win,
            mvp = mvp,
            ts = ts,
            def = def,
            ts25 = ts25,
            def25 = def25,
            u25Total = ts25 + def25,
        )
    }.sortedWith(
        compareByDescending<TitledHallOfFamePlayerRow> { it.total }
            .thenByDescending { it.win }
            .thenByDescending { it.mvp }
            .thenByDescending { it.ts }
            .thenByDescending { it.def }
            .thenByDescending { it.u25Total }
            .thenBy { it.name.lowercase() }
    )
}

fun possibleAliasNames(
    reference: String,
    candidates: Collection<String>,
    limit: Int = 3,
): List<String> {
    val base = parseComparableAliasName(reference) ?: return emptyList()
    return candidates.asSequence()
        .mapNotNull { candidate ->
            val parsed = parseComparableAliasName(candidate) ?: return@mapNotNull null
            val score = aliasSimilarityScore(base, parsed) ?: return@mapNotNull null
            scoredAlias(base.raw, parsed.raw, score)
        }
        .sortedWith(compareBy<ScoredAlias> { it.score }.thenBy { it.name.lowercase() })
        .map { it.name }
        .distinct()
        .filter { it != base.raw }
        .take(limit)
        .toList()
}

fun buildPossibleAliasNote(
    referenceNames: Collection<String>,
    candidates: Collection<String>,
    limitPerName: Int = 3,
): String? {
    val normalizedNames = referenceNames
        .map { it.trim().replace(Regex("\\s+"), " ") }
        .filter { it.isNotBlank() }
        .distinct()
    if (normalizedNames.isEmpty()) return null

    val notes = normalizedNames.mapNotNull { reference ->
        val matches = possibleAliasNames(reference, candidates, limitPerName)
        if (matches.isEmpty()) {
            null
        } else if (normalizedNames.size == 1) {
            matches.joinToString(separator = ", ")
        } else {
            "$reference -> ${matches.joinToString(separator = ", ")}"
        }
    }

    if (notes.isEmpty()) return null
    return if (normalizedNames.size == 1) {
        "Possible alias: ${notes.first()}"
    } else {
        "Possible aliases: ${notes.joinToString(separator = " • ")}"
    }
}

private data class ComparableAliasName(
    val raw: String,
    val normalized: String,
    val surname: String,
    val givenNames: String,
)

private data class ScoredAlias(
    val name: String,
    val score: Int,
)

private fun scoredAlias(referenceRaw: String, candidateRaw: String, score: Int): ScoredAlias {
    val normalizedReference = referenceRaw.trim().replace(Regex("\\s+"), " ")
    val normalizedCandidate = candidateRaw.trim().replace(Regex("\\s+"), " ")
    return if (normalizedCandidate == normalizedReference) {
        ScoredAlias(normalizedCandidate, score)
    } else {
        ScoredAlias(normalizedCandidate, score)
    }
}

private fun parseComparableAliasName(raw: String): ComparableAliasName? {
    val compact = raw.trim().replace(Regex("\\s+"), " ")
    if (compact.isBlank()) return null
    val normalized = normalizeAliasComponent(compact)
    val tokens = normalized.split(' ').filter { it.isNotBlank() }
    if (tokens.size < 2) return null
    return ComparableAliasName(
        raw = compact,
        normalized = normalized,
        surname = tokens.first(),
        givenNames = tokens.drop(1).joinToString(separator = " "),
    )
}

private fun normalizeAliasComponent(raw: String): String {
    val decomposed = Normalizer.normalize(raw, Normalizer.Form.NFD)
    return decomposed
        .replace(Regex("\\p{M}+"), "")
        .lowercase()
        .replace(Regex("[^a-z0-9 ]"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()
}

private fun aliasSimilarityScore(
    reference: ComparableAliasName,
    candidate: ComparableAliasName,
): Int? {
    if (reference.raw == candidate.raw) return null

    if (reference.normalized == candidate.normalized) {
        return 0
    }

    if (reference.surname == candidate.givenNames && reference.givenNames == candidate.surname) {
        return 1
    }

    if (reference.surname == candidate.surname) {
        val distance = levenshteinDistance(reference.givenNames, candidate.givenNames)
        if (distance in 1..3) return 10 + distance
    }

    if (reference.givenNames == candidate.givenNames) {
        val distance = levenshteinDistance(reference.surname, candidate.surname)
        if (distance in 1..3) return 20 + distance
    }

    return null
}

private fun levenshteinDistance(left: String, right: String): Int {
    if (left == right) return 0
    if (left.isEmpty()) return right.length
    if (right.isEmpty()) return left.length

    val costs = IntArray(right.length + 1) { it }
    for (i in 1..left.length) {
        var previousDiagonal = costs[0]
        costs[0] = i
        for (j in 1..right.length) {
            val previousAbove = costs[j]
            val substitutionCost = if (left[i - 1] == right[j - 1]) 0 else 1
            costs[j] = minOf(
                costs[j] + 1,
                costs[j - 1] + 1,
                previousDiagonal + substitutionCost,
            )
            previousDiagonal = previousAbove
        }
    }
    return costs[right.length]
}
