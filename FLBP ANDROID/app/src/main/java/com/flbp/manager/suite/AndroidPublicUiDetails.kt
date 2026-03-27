package com.flbp.manager.suite

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

fun LazyListScope.tournamentOverviewItems(
    bundle: NativeTournamentBundle,
    tournamentAwards: List<NativeHallOfFameEntry>,
) {
    item {
        SectionCard(title = "Overview") {
            MetadataRow("Status", if (bundle.tournament.status == "live") "Live" else "Archive")
            MetadataRow("Format", formatTournamentType(bundle.tournament.type))
            MetadataRow("Teams", visibleTeamCount(bundle).toString())
            MetadataRow("Visible matches", visiblePublicMatches(bundle).size.toString())
            bundle.tournament.advancingPerGroup?.let {
                MetadataRow("Advancing per group", it.toString())
            }
        }
    }

    if (bundle.teams.isNotEmpty()) {
        item {
            SectionCard(title = "Teams") {
                bundle.teams.forEach { team ->
                    TeamCard(team = team)
                }
            }
        }
    }

    if (tournamentAwards.isNotEmpty()) {
        item {
            SectionCard(title = "Awards") {
                tournamentAwards.forEach { award ->
                    AwardCard(entry = award)
                }
            }
        }
    }

    val liveAndUpcoming = visiblePublicMatches(bundle).filter {
        !it.played && it.status != "finished" && hasValidParticipants(bundle, it)
    }
    if (liveAndUpcoming.isNotEmpty()) {
        item {
            SectionCard(title = "Upcoming turns") {
                liveAndUpcoming.take(10).forEach { match ->
                    MatchCard(bundle = bundle, match = match)
                }
            }
        }
    }
}

fun LazyListScope.tournamentGroupsItems(
    bundle: NativeTournamentBundle,
    standingsByGroup: Map<NativeGroupInfo, List<GroupStandingRow>>,
) {
    items(bundle.groups.size) { index ->
        val group = bundle.groups[index]
        SectionCard(title = group.name.ifBlank { "Group" }) {
            val standings = standingsByGroup[group].orEmpty()
            if (standings.isEmpty()) {
                Text(
                    text = "No finished group matches are available yet. Teams are still listed below with an empty-safe fallback.",
                    style = MaterialTheme.typography.bodySmall,
                )
            } else {
                standings.forEachIndexed { rowIndex, row ->
                    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(
                                text = "${rowIndex + 1}. ${row.teamName}",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = "P ${row.played} • W ${row.wins} • L ${row.losses} • cups ${row.cupsFor}-${row.cupsAgainst} • soffi ${row.soffiFor}-${row.soffiAgainst}",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }

            val groupTeamNames = group.teamIds.mapNotNull { id -> bundle.teams.firstOrNull { it.id == id }?.name }
            if (groupTeamNames.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Teams: ${groupTeamNames.joinToString(separator = " • ")}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            val groupMatches = visiblePublicMatches(bundle).filter { it.groupName == group.name }
            if (groupMatches.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                groupMatches.forEach { match ->
                    MatchCard(bundle = bundle, match = match)
                }
            }
        }
    }
}

fun LazyListScope.tournamentBracketItems(
    bundle: NativeTournamentBundle,
    bracketMatches: List<NativeMatchInfo>,
) {
    val byRound = bracketMatches.groupBy { match ->
        match.roundName ?: match.round?.let { "Round $it" } ?: match.code ?: "Bracket"
    }

    items(byRound.entries.toList().size) { index ->
        val entry = byRound.entries.toList()[index]
        SectionCard(title = entry.key) {
            entry.value.sortedBy { it.orderIndex ?: Int.MAX_VALUE }.forEach { match ->
                MatchCard(bundle = bundle, match = match)
            }
        }
    }
}

fun LazyListScope.tournamentScorersItems(
    playerRows: List<TournamentPlayerRow>,
) {
    item {
        SectionCard(title = "Scorers") {
            if (playerRows.isEmpty()) {
                Text(
                    text = "No match stats are available in the public dataset.",
                    style = MaterialTheme.typography.bodySmall,
                )
            } else {
                playerRows.forEachIndexed { index, player ->
                    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(
                                text = "${index + 1}. ${player.name}",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = player.teamName,
                                style = MaterialTheme.typography.bodySmall,
                            )
                            Text(
                                text = "PT ${player.points} • SF ${player.soffi} • GP ${player.gamesPlayed} • AVG ${player.avgPoints}/${player.avgSoffi} • W% ${formatPercentOrNd(player.winRate, player.wins + player.losses > 0)}",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun HeroCard(title: String, body: String) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
            )
            Text(text = body, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun PrimaryActionCard(
    title: String,
    subtitle: String,
    body: String,
    primaryLabel: String,
    onPrimaryClick: () -> Unit,
    secondaryLabel: String? = null,
    onSecondaryClick: (() -> Unit)? = null,
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Black,
            )
            Text(text = subtitle, style = MaterialTheme.typography.labelLarge)
            Text(text = body, style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onPrimaryClick) {
                    Text(primaryLabel)
                }
                if (secondaryLabel != null && onSecondaryClick != null) {
                    OutlinedButton(onClick = onSecondaryClick) {
                        Text(secondaryLabel)
                    }
                }
            }
        }
    }
}

@Composable
fun QuickActionRow(
    first: Triple<String, String, () -> Unit>,
    second: Triple<String, String, () -> Unit>,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        QuickActionCard(
            modifier = Modifier.weight(1f),
            title = first.first,
            subtitle = first.second,
            onClick = first.third,
        )
        QuickActionCard(
            modifier = Modifier.weight(1f),
            title = second.first,
            subtitle = second.second,
            onClick = second.third,
        )
    }
}

@Composable
fun QuickActionCard(
    modifier: Modifier = Modifier,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
) {
    ElevatedCard(modifier = modifier.clickable(onClick = onClick)) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(text = title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(text = subtitle, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
fun SectionCard(
    title: String,
    content: @Composable Column.() -> Unit,
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            content()
        }
    }
}

@Composable
fun LoadingCard(message: String) {
    SectionCard(title = "Loading") {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CircularProgressIndicator(modifier = Modifier.width(24.dp).height(24.dp))
            Text(text = message, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun ErrorCard(message: String, onRetry: () -> Unit) {
    SectionCard(title = "Error") {
        Text(text = message, style = MaterialTheme.typography.bodyMedium)
        OutlinedButton(onClick = onRetry) {
            Text("Retry")
        }
    }
}

@Composable
fun EmptyStateCard(message: String) {
    SectionCard(title = "Nothing to show") {
        Text(text = message, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun TournamentSummaryCard(
    tournament: NativeTournamentSummary,
    onOpenTournament: (NativeTournamentSummary) -> Unit,
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = tournament.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "${formatDateLabel(tournament.startDate)} • ${formatTournamentType(tournament.type)}",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = if (tournament.isManual) {
                    "Manual archive sheet. Team and award data can exist even when matches are absent."
                } else {
                    "Structured public tournament."
                },
                style = MaterialTheme.typography.bodySmall,
            )
            Button(onClick = { onOpenTournament(tournament) }) {
                Text("Open detail")
            }
        }
    }
}

@Composable
fun MetadataRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = label, style = MaterialTheme.typography.bodySmall)
        Text(text = value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun TeamCard(team: NativeTeamInfo) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(text = team.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(text = listOfNotNull(team.player1, team.player2).joinToString(separator = " • "), style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
fun MatchCard(bundle: NativeTournamentBundle, match: NativeMatchInfo) {
    val teamA = bundle.teamNameFor(match.teamAId)
    val teamB = bundle.teamNameFor(match.teamBId)
    val scoreLabel = if (match.played || match.status == "finished" || match.status == "playing") {
        "${match.scoreA} - ${match.scoreB}"
    } else {
        "—"
    }
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = listOfNotNull(match.code, match.roundName, match.groupName).joinToString(separator = " • ").ifBlank { "Match" },
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(text = "$teamA vs $teamB", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
            Text(text = "Status: ${match.status} • Score: $scoreLabel", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
fun AwardCard(entry: NativeHallOfFameEntry) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = entry.tournamentName,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = buildString {
                    append(entry.year)
                    append(" • ")
                    append(formatAwardType(entry.type))
                },
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = when (entry.type) {
                    "winner" -> entry.teamName ?: entry.playerNames.joinToString(separator = " • ")
                    else -> entry.playerNames.joinToString(separator = ", ")
                },
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
            )
            if (!entry.teamName.isNullOrBlank() && entry.type != "winner") {
                Text(text = entry.teamName, style = MaterialTheme.typography.bodySmall)
            }
            entry.value?.let {
                Text(text = "Value: $it", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
fun LeaderboardEntryCard(rank: Int, entry: NativeLeaderboardEntry) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = "$rank. ${entry.name}",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
            )
            Text(text = entry.teamName, style = MaterialTheme.typography.bodySmall)
            Text(
                text = "GP ${entry.gamesPlayed} • PT ${entry.points} • SF ${entry.soffi} • AVG ${entry.avgPoints}/${entry.avgSoffi}${if (entry.u25) " • U25" else ""}${entry.yobLabel?.let { " • $it" } ?: ""}",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
fun FilterRow(
    label: String,
    options: List<String>,
    selected: String,
    onSelected: (String) -> Unit,
    labelFormatter: (String) -> String = { it },
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(text = label, style = MaterialTheme.typography.labelLarge)
        Row(
            modifier = Modifier
                .horizontalScroll(rememberScrollState())
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            options.forEach { option ->
                FilterChip(
                    selected = selected == option,
                    onClick = { onSelected(option) },
                    label = { Text(labelFormatter(option)) },
                )
            }
        }
    }
}

fun formatTournamentType(type: String): String {
    return when (type) {
        "groups_elimination" -> "Groups + elimination"
        "round_robin" -> "Round robin"
        else -> "Elimination"
    }
}

fun formatAwardType(type: String): String {
    return when (type) {
        "winner" -> "Winners"
        "mvp" -> "MVP"
        "top_scorer" -> "Top scorer"
        "defender" -> "Defender"
        "top_scorer_u25" -> "Top scorer U25"
        "defender_u25" -> "Defender U25"
        else -> type
    }
}

fun formatDateLabel(raw: String): String {
    if (raw.length < 10) return raw
    val iso = raw.substring(0, 10)
    val parts = iso.split("-")
    return if (parts.size == 3) "${parts[2]}/${parts[1]}/${parts[0]}" else raw
}
