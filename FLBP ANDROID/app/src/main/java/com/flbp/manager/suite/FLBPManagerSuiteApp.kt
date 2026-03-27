package com.flbp.manager.suite

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

@Composable
fun FLBPManagerSuiteApp() {
    MaterialTheme {
        Surface(modifier = Modifier) {
            NativeAppScreen()
        }
    }
}

@Composable
private fun NativeAppScreen() {
    var selectedToolsRouteId by rememberSaveable { mutableStateOf("") }
    var storedPublicRouteId by rememberSaveable { mutableStateOf(AppRoute.HOME.id) }
    var storedTournamentId by rememberSaveable { mutableStateOf("") }
    var storedTournamentIsLive by rememberSaveable { mutableStateOf(false) }
    var refreshNonce by rememberSaveable { mutableIntStateOf(0) }
    var detailRefreshNonce by rememberSaveable { mutableIntStateOf(0) }

    var catalogLoading by remember { mutableStateOf(true) }
    var catalogError by remember { mutableStateOf<String?>(null) }
    var catalog by remember { mutableStateOf(NativePublicCatalog(liveTournament = null, history = emptyList())) }

    var leaderboardLoading by remember { mutableStateOf(true) }
    var leaderboardError by remember { mutableStateOf<String?>(null) }
    var leaderboard by remember { mutableStateOf(emptyList<NativeLeaderboardEntry>()) }

    var hallLoading by remember { mutableStateOf(true) }
    var hallError by remember { mutableStateOf<String?>(null) }
    var hallOfFame by remember { mutableStateOf(emptyList<NativeHallOfFameEntry>()) }

    var detailLoading by remember { mutableStateOf(false) }
    var detailError by remember { mutableStateOf<String?>(null) }
    var detailBundle by remember { mutableStateOf<NativeTournamentBundle?>(null) }

    fun readPublicState(): PublicRouteState {
        val route = AppRoute.fromId(storedPublicRouteId).takeIf {
            it.group == RouteGroup.PUBLIC_PRIMARY || it == AppRoute.TOURNAMENT_DETAIL
        } ?: AppRoute.HOME

        return PublicRouteState(
            route = route,
            selectedTournament = TournamentSelectionRef.fromSaved(
                id = storedTournamentId,
                isLive = storedTournamentIsLive,
            ),
        )
    }

    fun writePublicState(next: PublicRouteState) {
        storedPublicRouteId = next.route.id
        storedTournamentId = next.selectedTournament?.id.orEmpty()
        storedTournamentIsLive = next.selectedTournament?.isLive ?: false
        selectedToolsRouteId = ""
    }

    val publicState = readPublicState()
    val selectedToolsRoute = AppRoute.fromId(selectedToolsRouteId).takeIf { it.group == RouteGroup.TOOLS }
    val selectedRoute = selectedToolsRoute ?: publicState.resolvedRoute

    LaunchedEffect(refreshNonce) {
        catalogLoading = true
        leaderboardLoading = true
        hallLoading = true
        catalogError = null
        leaderboardError = null
        hallError = null

        coroutineScope {
            val catalogRequest = async { runCatching { NativePublicApi.fetchCatalog() } }
            val leaderboardRequest = async { runCatching { NativePublicApi.fetchCareerLeaderboard() } }
            val hallRequest = async { runCatching { NativePublicApi.fetchHallOfFame() } }

            catalogRequest.await()
                .onSuccess { loaded ->
                    catalog = loaded
                    catalogLoading = false

                    val knownIds = buildSet {
                        loaded.liveTournament?.let { add(it.id) }
                        loaded.history.forEach { add(it.id) }
                    }
                    if (publicState.selectedTournament != null && !knownIds.contains(publicState.selectedTournament.id)) {
                        writePublicState(publicState.withTournamentSelection(null))
                    }
                }
                .onFailure { error ->
                    catalogLoading = false
                    catalogError = error.message ?: "Unable to load tournaments."
                }

            leaderboardRequest.await()
                .onSuccess {
                    leaderboard = it
                    leaderboardLoading = false
                }
                .onFailure { error ->
                    leaderboardLoading = false
                    leaderboardError = error.message ?: "Unable to load leaderboard."
                }

            hallRequest.await()
                .onSuccess {
                    hallOfFame = it
                    hallLoading = false
                }
                .onFailure { error ->
                    hallLoading = false
                    hallError = error.message ?: "Unable to load hall of fame."
                }
        }
    }

    LaunchedEffect(publicState.selectedTournament?.id, detailRefreshNonce) {
        val selection = publicState.selectedTournament
        if (selection == null) {
            detailBundle = null
            detailError = null
            detailLoading = false
            return@LaunchedEffect
        }

        detailLoading = true
        detailError = null
        runCatching { NativePublicApi.fetchTournamentBundle(selection.id) }
            .onSuccess { bundle ->
                detailBundle = bundle
                detailLoading = false
                if (bundle == null) {
                    detailError = "The selected tournament is not available in the public dataset."
                }
            }
            .onFailure { error ->
                detailLoading = false
                detailBundle = null
                detailError = error.message ?: "Unable to load tournament detail."
            }
    }

    Scaffold(
        topBar = {
            TopBar(
                selectedRoute = selectedRoute,
                onRouteSelected = { route ->
                    if (route.group == RouteGroup.TOOLS) {
                        selectedToolsRouteId = route.id
                    } else {
                        writePublicState(publicState.navigateToPrimary(route))
                    }
                },
                onRefresh = {
                    if (selectedRoute == AppRoute.TOURNAMENT_DETAIL) {
                        detailRefreshNonce += 1
                    } else {
                        refreshNonce += 1
                    }
                },
            )
        },
    ) { innerPadding ->
        when (selectedRoute) {
            AppRoute.HOME -> HomeScreen(
                padding = innerPadding,
                catalogLoading = catalogLoading,
                catalogError = catalogError,
                liveTournament = catalog.liveTournament,
                historyCount = catalog.history.size,
                leaderboardCount = leaderboard.size,
                hallCount = hallOfFame.size,
                onOpenTournaments = { writePublicState(publicState.navigateToPrimary(AppRoute.TOURNAMENT)) },
                onOpenLeaderboard = { writePublicState(publicState.navigateToPrimary(AppRoute.LEADERBOARD)) },
                onOpenHof = { writePublicState(publicState.navigateToPrimary(AppRoute.HOF)) },
                onOpenAdmin = { selectedToolsRouteId = AppRoute.ADMIN.id },
                onOpenReferees = { selectedToolsRouteId = AppRoute.REFEREES_AREA.id },
                onRefresh = { refreshNonce += 1 },
            )

            AppRoute.TOURNAMENT -> TournamentListScreen(
                padding = innerPadding,
                catalogLoading = catalogLoading,
                catalogError = catalogError,
                catalog = catalog,
                currentSelection = publicState.selectedTournament,
                onRefresh = { refreshNonce += 1 },
                onOpenTournament = { summary ->
                    val next = publicState.withTournamentSelection(
                        TournamentSelectionRef(id = summary.id, isLive = summary.status == "live")
                    )
                    writePublicState(next.openTournamentDetailOrFallback())
                },
            )

            AppRoute.TOURNAMENT_DETAIL -> TournamentDetailScreen(
                padding = innerPadding,
                selection = publicState.selectedTournament,
                bundle = detailBundle,
                detailLoading = detailLoading,
                detailError = detailError,
                hallOfFame = hallOfFame,
                onBack = { writePublicState(publicState.navigateToPrimary(AppRoute.TOURNAMENT)) },
                onRefresh = { detailRefreshNonce += 1 },
            )

            AppRoute.LEADERBOARD -> LeaderboardScreen(
                padding = innerPadding,
                loading = leaderboardLoading,
                error = leaderboardError,
                entries = leaderboard,
                onRefresh = { refreshNonce += 1 },
            )

            AppRoute.HOF -> HallOfFameScreen(
                padding = innerPadding,
                loading = hallLoading,
                error = hallError,
                entries = hallOfFame,
                onRefresh = { refreshNonce += 1 },
            )

            AppRoute.ADMIN,
            AppRoute.REFEREES_AREA -> ToolsPlaceholderScreen(
                padding = innerPadding,
                route = selectedRoute,
            )
        }
    }
}
