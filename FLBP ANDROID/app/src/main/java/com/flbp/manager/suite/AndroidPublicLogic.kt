package com.flbp.manager.suite

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
