package com.flbp.manager.suite

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

private enum class DetailSection(val label: String) {
    OVERVIEW("Overview"),
    GROUPS("Groups"),
    BRACKET("Bracket"),
    SCORERS("Scorers"),
}

private enum class LeaderboardSort(val label: String) {
    POINTS("Points"),
    SOFFI("Soffi"),
    GAMES("Games"),
    AVG_POINTS("Avg points"),
    AVG_SOFFI("Avg soffi"),
}

private enum class HofFilter(val label: String) {
    ALL("All"),
    WINNER("Winners"),
    MVP("MVP"),
    TOP_SCORER("Top scorers"),
    DEFENDER("Defenders"),
    U25("U25"),
}

@Composable
fun TopBar(
    selectedRoute: AppRoute,
    onRouteSelected: (AppRoute) -> Unit,
    onRefresh: () -> Unit,
) {
    Surface(shadowElevation = 6.dp) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "FLBP Manager Suite",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Black,
                    )
                    Text(
                        text = "Native public checkpoint wired to the same Supabase public data as FLBP ONLINE.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                TextButton(onClick = onRefresh) {
                    Text("Refresh")
                }
            }

            Row(
                modifier = Modifier
                    .horizontalScroll(rememberScrollState())
                    .fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                AppRoute.publicPrimaryRoutes.forEach { route ->
                    FilterChip(
                        selected = selectedRoute == route,
                        onClick = { onRouteSelected(route) },
                        label = { Text(route.label) },
                    )
                }
                AppRoute.toolsRoutes.forEach { route ->
                    FilterChip(
                        selected = selectedRoute == route,
                        onClick = { onRouteSelected(route) },
                        label = { Text(route.label) },
                    )
                }
            }
        }
    }
}

@Composable
fun HomeScreen(
    padding: PaddingValues,
    catalogLoading: Boolean,
    catalogError: String?,
    liveTournament: NativeTournamentSummary?,
    historyCount: Int,
    leaderboardCount: Int,
    hallCount: Int,
    onOpenTournaments: () -> Unit,
    onOpenLeaderboard: () -> Unit,
    onOpenHof: () -> Unit,
    onOpenAdmin: () -> Unit,
    onOpenReferees: () -> Unit,
    onRefresh: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            HeroCard(
                title = "Public home",
                body = if (liveTournament == null) {
                    "No live tournament is currently published. The native home stays empty-safe and falls back to archive, leaderboard and hall of fame."
                } else {
                    "${liveTournament.name} is currently live."
                },
            )
        }

        item {
            when {
                catalogLoading -> LoadingCard("Loading public data…")
                catalogError != null -> ErrorCard(catalogError, onRefresh)
                liveTournament != null -> PrimaryActionCard(
                    title = liveTournament.name,
                    subtitle = "${formatDateLabel(liveTournament.startDate)} • ${formatTournamentType(liveTournament.type)} • LIVE",
                    body = "Open the current tournament detail wired from public_tournaments + public_tournament_* tables.",
                    primaryLabel = "Open tournaments",
                    onPrimaryClick = onOpenTournaments,
                )
                else -> PrimaryActionCard(
                    title = "No live event",
                    subtitle = "Same fallback as the web app when liveTournament is null.",
                    body = "Archive, leaderboard and hall of fame stay available even when the live hero is absent.",
                    primaryLabel = "Open archive",
                    onPrimaryClick = onOpenTournaments,
                )
            }
        }

        item {
            QuickActionRow(
                first = Triple("Archive", "$historyCount tournaments", onOpenTournaments),
                second = Triple("Leaderboard", "$leaderboardCount players", onOpenLeaderboard),
            )
        }

        item {
            QuickActionRow(
                first = Triple("Hall of Fame", "$hallCount entries", onOpenHof),
                second = Triple("Admin", "Protected tools placeholder", onOpenAdmin),
            )
        }

        item {
            PrimaryActionCard(
                title = "Referees area",
                subtitle = "Protected tools route",
                body = "The web app includes OCR/report flows under Referees Area. This native checkpoint keeps the route but does not invent a mobile migration that is not already present in the native codebase.",
                primaryLabel = "Open referees route",
                onPrimaryClick = onOpenReferees,
            )
        }
    }
}

@Composable
fun TournamentListScreen(
    padding: PaddingValues,
    catalogLoading: Boolean,
    catalogError: String?,
    catalog: NativePublicCatalog,
    currentSelection: TournamentSelectionRef?,
    onRefresh: () -> Unit,
    onOpenTournament: (NativeTournamentSummary) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var yearFilter by rememberSaveable { mutableStateOf("all") }
    var typeFilter by rememberSaveable { mutableStateOf("all") }

    val years = remember(catalog.history) {
        catalog.history.mapNotNull { it.startDate.takeIf { value -> value.length >= 4 }?.substring(0, 4) }.distinct()
    }
    val filteredHistory = remember(catalog.history, query, yearFilter, typeFilter) {
        val loweredQuery = query.trim().lowercase()
        catalog.history.filter { tournament ->
            val year = tournament.startDate.takeIf { it.length >= 4 }?.substring(0, 4) ?: ""
            if (yearFilter != "all" && year != yearFilter) return@filter false
            if (typeFilter != "all" && tournament.type != typeFilter) return@filter false
            if (loweredQuery.isEmpty()) return@filter true
            val haystack = "${tournament.name} $year".lowercase()
            haystack.contains(loweredQuery)
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            HeroCard(
                title = "Tournament list",
                body = "This surface mirrors FLBP ONLINE/components/PublicTournaments.tsx and reads the same public_tournaments list from Supabase.",
            )
        }

        item {
            when {
                catalogLoading -> LoadingCard("Loading tournaments…")
                catalogError != null -> ErrorCard(catalogError, onRefresh)
                else -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    catalog.liveTournament?.let { live ->
                        PrimaryActionCard(
                            title = live.name,
                            subtitle = "${formatDateLabel(live.startDate)} • ${formatTournamentType(live.type)} • LIVE",
                            body = "The live hero is shown only when the public dataset exposes a live tournament, exactly like the web route.",
                            primaryLabel = "Open live detail",
                            onPrimaryClick = { onOpenTournament(live) },
                        )
                    }

                    SectionCard(title = "Archive filters") {
                        OutlinedTextField(
                            value = query,
                            onValueChange = { query = it },
                            label = { Text("Search tournament") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        FilterRow(
                            label = "Year",
                            options = listOf("all") + years,
                            selected = yearFilter,
                            onSelected = { yearFilter = it },
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        FilterRow(
                            label = "Format",
                            options = listOf("all", "elimination", "groups_elimination", "round_robin"),
                            selected = typeFilter,
                            onSelected = { typeFilter = it },
                            labelFormatter = { if (it == "all") "All" else formatTournamentType(it) },
                        )
                        if (currentSelection != null) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Current selected tournament: ${currentSelection.id}",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }

                    if (filteredHistory.isEmpty()) {
                        EmptyStateCard("No tournaments match the current search and filter state.")
                    } else {
                        filteredHistory.forEach { tournament ->
                            TournamentSummaryCard(
                                tournament = tournament,
                                onOpenTournament = onOpenTournament,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun TournamentDetailScreen(
    padding: PaddingValues,
    selection: TournamentSelectionRef?,
    bundle: NativeTournamentBundle?,
    detailLoading: Boolean,
    detailError: String?,
    hallOfFame: List<NativeHallOfFameEntry>,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
) {
    if (selection == null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentAlignment = Alignment.Center,
        ) {
            EmptyStateCard("No tournament has been selected. PublicRouteState should resolve this route back to the tournament list.")
        }
        return
    }

    if (detailLoading) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentAlignment = Alignment.Center,
        ) {
            LoadingCard("Loading tournament detail…")
        }
        return
    }

    if (detailError != null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentAlignment = Alignment.Center,
        ) {
            ErrorCard(detailError, onRefresh)
        }
        return
    }

    if (bundle == null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentAlignment = Alignment.Center,
        ) {
            EmptyStateCard("No tournament bundle is available for ${selection.id}.")
        }
        return
    }

    var section by rememberSaveable(bundle.tournament.id) { mutableStateOf(DetailSection.OVERVIEW.name) }
    val selectedSection = remember(section) {
        DetailSection.values().firstOrNull { it.name == section } ?: DetailSection.OVERVIEW
    }
    val tournamentAwards = remember(bundle.tournament.id, hallOfFame) {
        hallOfFame.filter { it.tournamentId == bundle.tournament.id }
    }
    val standingsByGroup = remember(bundle) {
        bundle.groups.associateWith { group -> computeGroupStandings(bundle, group) }
    }
    val bracketMatches = remember(bundle) { visiblePublicMatches(bundle).filter { it.phase != "groups" } }
    val playerRows = remember(bundle) { buildTournamentLeaderboard(bundle) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            PrimaryActionCard(
                title = bundle.tournament.name,
                subtitle = buildString {
                    append(formatDateLabel(bundle.tournament.startDate))
                    append(" • ")
                    append(formatTournamentType(bundle.tournament.type))
                    append(" • ")
                    append(if (bundle.tournament.status == "live") "LIVE" else "ARCHIVE")
                },
                body = "Native detail uses the same tournament id + public_tournament_* bundle contract as FLBP ONLINE/components/PublicTournamentDetail.tsx.",
                primaryLabel = "Back to list",
                onPrimaryClick = onBack,
                secondaryLabel = "Refresh",
                onSecondaryClick = onRefresh,
            )
        }

        item {
            Row(
                modifier = Modifier
                    .horizontalScroll(rememberScrollState())
                    .fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                DetailSection.values().forEach { candidate ->
                    val enabled = when (candidate) {
                        DetailSection.OVERVIEW -> true
                        DetailSection.GROUPS -> bundle.groups.isNotEmpty()
                        DetailSection.BRACKET -> bracketMatches.isNotEmpty()
                        DetailSection.SCORERS -> playerRows.isNotEmpty()
                    }
                    FilterChip(
                        selected = selectedSection == candidate,
                        onClick = { if (enabled) section = candidate.name },
                        enabled = enabled,
                        label = { Text(candidate.label) },
                    )
                }
            }
        }

        when (selectedSection) {
            DetailSection.OVERVIEW -> tournamentOverviewItems(bundle, tournamentAwards)
            DetailSection.GROUPS -> tournamentGroupsItems(bundle, standingsByGroup)
            DetailSection.BRACKET -> tournamentBracketItems(bundle, bracketMatches)
            DetailSection.SCORERS -> tournamentScorersItems(playerRows)
        }
    }
}

@Composable
fun LeaderboardScreen(
    padding: PaddingValues,
    loading: Boolean,
    error: String?,
    entries: List<NativeLeaderboardEntry>,
    onRefresh: () -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var onlyU25 by rememberSaveable { mutableStateOf(false) }
    var sort by rememberSaveable { mutableStateOf(LeaderboardSort.POINTS.name) }
    val selectedSort = remember(sort) {
        LeaderboardSort.values().firstOrNull { it.name == sort } ?: LeaderboardSort.POINTS
    }

    val filteredEntries = remember(entries, query, onlyU25, selectedSort) {
        entries
            .filter { !onlyU25 || it.u25 }
            .filter {
                if (query.isBlank()) true else "${it.name} ${it.teamName}".lowercase().contains(query.trim().lowercase())
            }
            .sortedWith(
                compareByDescending<NativeLeaderboardEntry> {
                    when (selectedSort) {
                        LeaderboardSort.POINTS -> it.points.toDouble()
                        LeaderboardSort.SOFFI -> it.soffi.toDouble()
                        LeaderboardSort.GAMES -> it.gamesPlayed.toDouble()
                        LeaderboardSort.AVG_POINTS -> it.avgPoints
                        LeaderboardSort.AVG_SOFFI -> it.avgSoffi
                    }
                }
                    .thenByDescending { it.points }
                    .thenByDescending { it.soffi }
                    .thenByDescending { it.gamesPlayed }
                    .thenBy { it.name.lowercase() }
            )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            HeroCard(
                title = "Historic leaderboard",
                body = "The native screen reads the same aggregated public_career_leaderboard that FLBP ONLINE uses when public DB read is enabled.",
            )
        }

        item {
            when {
                loading -> LoadingCard("Loading leaderboard…")
                error != null -> ErrorCard(error, onRefresh)
                else -> SectionCard(title = "Filters") {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        label = { Text("Search player") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    FilterRow(
                        label = "Sort",
                        options = LeaderboardSort.values().map { it.name },
                        selected = selectedSort.name,
                        onSelected = { sort = it },
                        labelFormatter = { raw -> LeaderboardSort.valueOf(raw).label },
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    FilterChip(
                        selected = onlyU25,
                        onClick = { onlyU25 = !onlyU25 },
                        label = { Text("U25 only") },
                    )
                }
            }
        }

        if (!loading && error == null) {
            if (filteredEntries.isEmpty()) {
                item { EmptyStateCard("No leaderboard rows match the current filters.") }
            } else {
                items(filteredEntries) { entry ->
                    LeaderboardEntryCard(
                        rank = filteredEntries.indexOf(entry) + 1,
                        entry = entry,
                    )
                }
            }
        }
    }
}

@Composable
fun HallOfFameScreen(
    padding: PaddingValues,
    loading: Boolean,
    error: String?,
    entries: List<NativeHallOfFameEntry>,
    onRefresh: () -> Unit,
) {
    var filter by rememberSaveable { mutableStateOf(HofFilter.ALL.name) }
    var query by rememberSaveable { mutableStateOf("") }
    val selectedFilter = remember(filter) {
        HofFilter.values().firstOrNull { it.name == filter } ?: HofFilter.ALL
    }
    val filteredEntries = remember(entries, selectedFilter, query) {
        entries.filter { entry ->
            val matchesFilter = when (selectedFilter) {
                HofFilter.ALL -> true
                HofFilter.WINNER -> entry.type == "winner"
                HofFilter.MVP -> entry.type == "mvp"
                HofFilter.TOP_SCORER -> entry.type == "top_scorer"
                HofFilter.DEFENDER -> entry.type == "defender"
                HofFilter.U25 -> entry.type == "top_scorer_u25" || entry.type == "defender_u25"
            }
            val matchesQuery = if (query.isBlank()) {
                true
            } else {
                val haystack = buildString {
                    append(entry.tournamentName)
                    append(' ')
                    append(entry.teamName.orEmpty())
                    append(' ')
                    append(entry.playerNames.joinToString(separator = " "))
                    append(' ')
                    append(entry.year)
                }.lowercase()
                haystack.contains(query.trim().lowercase())
            }
            matchesFilter && matchesQuery
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            HeroCard(
                title = "Hall of Fame",
                body = "This screen reads the same public_hall_of_fame_entries source that powers the web history view.",
            )
        }

        item {
            when {
                loading -> LoadingCard("Loading hall of fame…")
                error != null -> ErrorCard(error, onRefresh)
                else -> SectionCard(title = "Filters") {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        label = { Text("Search record") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    FilterRow(
                        label = "Category",
                        options = HofFilter.values().map { it.name },
                        selected = selectedFilter.name,
                        onSelected = { filter = it },
                        labelFormatter = { raw -> HofFilter.valueOf(raw).label },
                    )
                }
            }
        }

        if (!loading && error == null) {
            if (filteredEntries.isEmpty()) {
                item { EmptyStateCard("No hall of fame entries match the current filters.") }
            } else {
                items(filteredEntries) { entry ->
                    AwardCard(entry = entry)
                }
            }
        }
    }
}

@Composable
fun ToolsPlaceholderScreen(
    padding: PaddingValues,
    route: AppRoute,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(16.dp),
        contentAlignment = Alignment.Center,
    ) {
        SectionCard(title = route.label) {
            Text(
                text = if (route == AppRoute.ADMIN) {
                    "Admin remains a protected web-only surface in this checkpoint. The native apps do not invent Supabase Auth/admin tooling that is not already present in the native codebase."
                } else {
                    "Referees Area remains out of scope here. OCR/report workflows were explicitly preserved as no-regression rules from the web app."
                },
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Verified source: ${route.sourcePath} + ${route.note}",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}
