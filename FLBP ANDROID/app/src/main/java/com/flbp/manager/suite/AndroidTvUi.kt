package com.flbp.manager.suite

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.rememberScrollState

@Composable
fun NativeTvModeScreen(
    projection: NativeTvProjection,
    selection: TournamentSelectionRef?,
    bundle: NativeTournamentBundle?,
    detailLoading: Boolean,
    detailError: String?,
    hallOfFame: List<NativeHallOfFameEntry>,
    onProjectionSelected: (NativeTvProjection) -> Unit,
    onExit: () -> Unit,
    onRefresh: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
    ) {
        when {
            selection == null -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                EmptyStateCard("TV mode needs a selected tournament. Open a tournament detail first.")
            }

            detailLoading -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                LoadingCard("Loading TV projection…")
            }

            detailError != null -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                ErrorCard(detailError, onRefresh)
            }

            bundle == null -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                EmptyStateCard("No tournament bundle is available for ${selection.id}.")
            }

            else -> {
                val tournamentAwards = remember(bundle.tournament.id, hallOfFame) {
                    hallOfFame.filter { it.tournamentId == bundle.tournament.id }
                }
                val standingsByGroup = remember(bundle) {
                    bundle.groups.associateWith { group -> computeGroupStandings(bundle, group) }
                }
                val bracketMatches = remember(bundle) {
                    visiblePublicMatches(bundle).filter { it.phase != "groups" }
                }
                val playerRows = remember(bundle) { buildTournamentLeaderboard(bundle) }

                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.surfaceContainerLowest),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item {
                        SectionCard(title = "TV mode") {
                            Text(
                                text = bundle.tournament.name,
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Black,
                            )
                            Text(
                                text = "${formatDateLabel(bundle.tournament.startDate)} • ${formatTournamentType(bundle.tournament.type)} • read-only",
                                style = MaterialTheme.typography.bodySmall,
                            )
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                NativeTvProjection.entries.forEach { candidate ->
                                    val enabled = when (candidate) {
                                        NativeTvProjection.GROUPS -> bundle.groups.isNotEmpty()
                                        NativeTvProjection.GROUPS_BRACKET -> bundle.groups.isNotEmpty() || bracketMatches.isNotEmpty()
                                        NativeTvProjection.BRACKET -> bracketMatches.isNotEmpty()
                                        NativeTvProjection.SCORERS -> playerRows.isNotEmpty()
                                    }
                                    FilterChip(
                                        selected = projection == candidate,
                                        onClick = { if (enabled) onProjectionSelected(candidate) },
                                        enabled = enabled,
                                        label = { Text(candidate.label) },
                                    )
                                }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = onRefresh) {
                                    Text("Refresh")
                                }
                                OutlinedButton(onClick = onExit) {
                                    Text("Exit TV")
                                }
                            }
                        }
                    }

                    when (projection) {
                        NativeTvProjection.GROUPS -> {
                            if (bundle.groups.isEmpty()) {
                                item { EmptyStateCard("No group data is available for this tournament.") }
                            } else {
                                tournamentGroupsItems(bundle, standingsByGroup, hideMatchCode = true)
                            }
                        }

                        NativeTvProjection.GROUPS_BRACKET -> {
                            if (bundle.groups.isEmpty() && bracketMatches.isEmpty()) {
                                item { EmptyStateCard("No public TV projection is available for this tournament yet.") }
                            } else {
                                if (bundle.groups.isNotEmpty()) {
                                    tournamentGroupsItems(bundle, standingsByGroup, hideMatchCode = true)
                                }
                                if (bracketMatches.isNotEmpty()) {
                                    tournamentBracketItems(bundle, bracketMatches, hideMatchCode = true)
                                }
                            }
                        }

                        NativeTvProjection.BRACKET -> {
                            if (bracketMatches.isEmpty()) {
                                item { EmptyStateCard("No bracket projection is available yet.") }
                            } else {
                                tournamentBracketItems(bundle, bracketMatches, hideMatchCode = true)
                            }
                        }

                        NativeTvProjection.SCORERS -> {
                            if (playerRows.isEmpty()) {
                                item { EmptyStateCard("No scorer data is available in the public dataset.") }
                            } else {
                                item {
                                    SectionCard(title = "Awards") {
                                        if (tournamentAwards.isEmpty()) {
                                            Text(
                                                text = "No tournament awards are currently available in the public dataset.",
                                                style = MaterialTheme.typography.bodySmall,
                                            )
                                        } else {
                                            tournamentAwards.forEach { award ->
                                                AwardCard(entry = award)
                                            }
                                        }
                                    }
                                }
                                tournamentScorersItems(playerRows)
                            }
                        }
                    }
                }
            }
        }
    }
}
