package com.flbp.manager.suite

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

private data class NativeAdminBootstrapPayload(
    val access: NativeAdminAccessResult,
    val overview: NativeAdminOverview,
    val trafficRows: List<NativeProtectedTrafficUsageRow>,
    val viewsRows: List<NativeProtectedSiteViewsRow>,
)

private fun isMissingNativeRefereePullRpc(error: Throwable): Boolean {
    val message = error.message.orEmpty()
    return message.contains("flbp_referee_pull_live_state", ignoreCase = true) ||
        message.contains("PGRST202", ignoreCase = true)
}

private fun buildNativeRuntimeCanonicalName(firstNameRaw: String, lastNameRaw: String): String =
    "${lastNameRaw.trim()} ${firstNameRaw.trim()}".trim().replace(Regex("\\s+"), " ")

@Composable
fun FLBPManagerSuiteApp() {
    MaterialTheme {
        Surface(modifier = Modifier, color = NativeFlbpPalette.page) {
            if (NativeWebMirrorConfig.enabled) {
                NativeWebMirrorHost(
                    fallback = { NativeAppScreen() },
                )
            } else {
                NativeAppScreen()
            }
        }
    }
}

@Composable
private fun NativeAppScreen() {
    val context = LocalContext.current.applicationContext
    val cache = remember(context) { NativePublicCache(context) }
    val protectedCache = remember(context) { NativeProtectedCache(context) }
    val playerStore = remember(context) { NativePlayerPreviewStore(context) }
    val uiScope = rememberCoroutineScope()
    val cachedCatalog = remember(cache) { cache.readCatalog() }
    val cachedLeaderboard = remember(cache) { cache.readLeaderboard() }
    val cachedHall = remember(cache) { cache.readHallOfFame() }

    var selectedToolsRouteId by rememberSaveable { mutableStateOf("") }
    var storedPublicRouteId by rememberSaveable { mutableStateOf(AppRoute.HOME.id) }
    var storedTournamentId by rememberSaveable { mutableStateOf("") }
    var storedTournamentIsLive by rememberSaveable { mutableStateOf(false) }
    var tvModeId by rememberSaveable { mutableStateOf<String?>(null) }
    var refreshNonce by rememberSaveable { mutableIntStateOf(0) }
    var detailRefreshNonce by rememberSaveable { mutableIntStateOf(0) }
    var toolsRefreshNonce by rememberSaveable { mutableIntStateOf(0) }

    var catalogLoading by remember { mutableStateOf(cachedCatalog == null) }
    var catalogError by remember { mutableStateOf<String?>(null) }
    var catalog by remember { mutableStateOf(cachedCatalog ?: NativePublicCatalog(liveTournament = null, history = emptyList())) }

    var leaderboardLoading by remember { mutableStateOf(cachedLeaderboard == null) }
    var leaderboardError by remember { mutableStateOf<String?>(null) }
    var leaderboard by remember { mutableStateOf(cachedLeaderboard.orEmpty()) }

    var hallLoading by remember { mutableStateOf(cachedHall == null) }
    var hallError by remember { mutableStateOf<String?>(null) }
    var hallOfFame by remember { mutableStateOf(cachedHall.orEmpty()) }

    var detailLoading by remember { mutableStateOf(false) }
    var detailError by remember { mutableStateOf<String?>(null) }
    var detailBundle by remember { mutableStateOf<NativeTournamentBundle?>(null) }
    var adminSession by remember { mutableStateOf(protectedCache.readAdminSession()) }
    var adminAccess by remember { mutableStateOf<NativeAdminAccessResult?>(null) }
    var adminOverview by remember { mutableStateOf<NativeAdminOverview?>(null) }
    var adminTrafficRows by remember { mutableStateOf<List<NativeProtectedTrafficUsageRow>>(emptyList()) }
    var adminTrafficLoading by remember { mutableStateOf(false) }
    var adminTrafficError by remember { mutableStateOf<String?>(null) }
    var adminViewsRows by remember { mutableStateOf<List<NativeProtectedSiteViewsRow>>(emptyList()) }
    var adminViewsLoading by remember { mutableStateOf(false) }
    var adminViewsError by remember { mutableStateOf<String?>(null) }
    var adminBusy by remember { mutableStateOf(false) }
    var adminError by remember { mutableStateOf<String?>(null) }
    var refereesBusy by remember { mutableStateOf(false) }
    var refereesError by remember { mutableStateOf<String?>(null) }
    var refereesAuthedTournamentId by rememberSaveable { mutableStateOf("") }
    var playerPreviewNonce by rememberSaveable { mutableIntStateOf(0) }
    var playerLiveNonce by rememberSaveable { mutableIntStateOf(0) }
    var playerInfoMessage by remember { mutableStateOf<String?>(null) }
    var playerError by remember { mutableStateOf<String?>(null) }
    var playerLiveSession by remember { mutableStateOf(protectedCache.readPlayerSession()) }
    var playerLiveProfile by remember { mutableStateOf<NativePlayerSupabaseProfileRow?>(null) }
    var playerLiveCalls by remember { mutableStateOf<List<NativePlayerSupabaseCallRow>>(emptyList()) }
    var playerLiveAdminRows by remember { mutableStateOf<List<NativeAdminPlayerAccountCatalogRow>>(emptyList()) }
    var playerBackendReady by remember { mutableStateOf(true) }
    var toolsLiveBundle by remember { mutableStateOf<NativeTournamentBundle?>(null) }
    var toolsLiveBundleLoading by remember { mutableStateOf(false) }
    var toolsLiveBundleError by remember { mutableStateOf<String?>(null) }
    var didForceLaunchHome by remember { mutableStateOf(false) }

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

    val publicState = if (didForceLaunchHome) {
        readPublicState()
    } else {
        PublicRouteState(route = AppRoute.HOME, selectedTournament = null)
    }
    val tvMode = NativeTvProjection.fromId(tvModeId)
    val selectedToolsRoute = if (didForceLaunchHome) {
        AppRoute.fromId(selectedToolsRouteId).takeIf { it.group == RouteGroup.TOOLS }
    } else {
        null
    }
    val selectedRoute = selectedToolsRoute ?: publicState.resolvedRoute
    val playerLiveBundle = remember(catalog.liveTournament?.id, toolsLiveBundle) {
        val liveTournamentId = catalog.liveTournament?.id ?: return@remember null
        toolsLiveBundle?.takeIf { it.tournament.id == liveTournamentId }
    }
    val playerSnapshot = remember(
        playerPreviewNonce,
        playerLiveNonce,
        catalog,
        leaderboard,
        hallOfFame,
        playerLiveBundle,
        playerLiveSession,
        playerLiveProfile,
        playerLiveCalls,
        playerBackendReady,
    ) {
        buildSafeNativePlayerAreaSnapshot(
            catalog = catalog,
            leaderboard = leaderboard,
            hallOfFame = hallOfFame,
            liveBundle = playerLiveBundle,
            store = playerStore,
            liveSession = playerLiveSession,
            liveProfile = playerLiveProfile,
            liveCalls = playerLiveCalls,
            backendReady = playerBackendReady,
        )
    }
    val adminPlayerAccountRows = remember(
        playerPreviewNonce,
        playerLiveNonce,
        leaderboard,
        hallOfFame,
        adminAccess?.ok,
        playerLiveAdminRows,
    ) {
        buildNativePlayerAdminRows(
            leaderboard = leaderboard,
            hallOfFame = hallOfFame,
            store = playerStore,
            liveRows = if (adminAccess?.ok == true) playerLiveAdminRows else emptyList(),
        )
    }

    LaunchedEffect(Unit) {
        storedPublicRouteId = AppRoute.HOME.id
        storedTournamentId = ""
        storedTournamentIsLive = false
        selectedToolsRouteId = ""
        tvModeId = null
        didForceLaunchHome = true
    }

    LaunchedEffect(playerPreviewNonce) {
        val repairMessage = playerStore.repairCorruptedState() ?: return@LaunchedEffect
        val repairedSnapshot = buildSafeNativePlayerAreaSnapshot(
            catalog = catalog,
            leaderboard = leaderboard,
            hallOfFame = hallOfFame,
            liveBundle = playerLiveBundle,
            store = playerStore,
            liveSession = playerLiveSession,
            liveProfile = playerLiveProfile,
            liveCalls = playerLiveCalls,
            backendReady = playerBackendReady,
        )
        if (!repairedSnapshot.liveStatus.refereeBypassEligible &&
            refereesAuthedTournamentId == catalog.liveTournament?.id
        ) {
            refereesAuthedTournamentId = ""
        }
        playerPreviewNonce += 1
        playerInfoMessage = repairMessage
        playerError = null
    }

    LaunchedEffect(playerPreviewNonce, playerLiveNonce) {
        val refreshedSession = NativeProtectedApi.ensureFreshPlayerSession(protectedCache)
        playerLiveSession = refreshedSession
        if (refreshedSession == null) {
            playerLiveProfile = null
            playerLiveCalls = emptyList()
            playerBackendReady = true
            return@LaunchedEffect
        }

        var backendPending = false
        runCatching {
            NativeProtectedApi.registerPlayerDevice(
                session = refreshedSession,
                deviceId = protectedCache.readOrCreatePlayerDeviceId(),
            )
        }.onFailure { error ->
            if (NativeProtectedApi.isPlayerBackendPendingError(error.message.orEmpty())) {
                backendPending = true
            }
        }

        playerLiveProfile = runCatching {
            NativeProtectedApi.pullPlayerProfile(refreshedSession)
        }.getOrElse { error ->
            if (NativeProtectedApi.isPlayerBackendPendingError(error.message.orEmpty())) {
                backendPending = true
            }
            null
        }

        playerLiveCalls = runCatching {
            NativeProtectedApi.pullPlayerCalls(refreshedSession)
        }.getOrElse { error ->
            if (NativeProtectedApi.isPlayerBackendPendingError(error.message.orEmpty())) {
                backendPending = true
            }
            emptyList()
        }

        playerBackendReady = !backendPending
    }

    LaunchedEffect(refreshNonce) {
        val hadCatalogData = catalog.liveTournament != null || catalog.history.isNotEmpty()
        val hadLeaderboardData = leaderboard.isNotEmpty()
        val hadHallData = hallOfFame.isNotEmpty()

        if (!hadCatalogData) catalogLoading = true
        if (!hadLeaderboardData) leaderboardLoading = true
        if (!hadHallData) hallLoading = true
        catalogError = null
        leaderboardError = null
        hallError = null

        runCatching { NativePublicApi.fetchPublicProjection() }
            .onSuccess { payload ->
                catalog = payload.catalog
                leaderboard = payload.leaderboard
                hallOfFame = payload.hallOfFame

                catalogLoading = false
                leaderboardLoading = false
                hallLoading = false

                cache.writeCatalog(payload.catalog)
                cache.writeLeaderboard(payload.leaderboard)
                cache.writeHallOfFame(payload.hallOfFame)

                val knownIds = buildSet {
                    payload.catalog.liveTournament?.let { add(it.id) }
                    payload.catalog.history.forEach { add(it.id) }
                }
                if (publicState.selectedTournament != null && !knownIds.contains(publicState.selectedTournament.id)) {
                    tvModeId = null
                    writePublicState(publicState.withTournamentSelection(null))
                }
            }
            .onFailure { error ->
                catalogLoading = false
                leaderboardLoading = false
                hallLoading = false

                if (!hadCatalogData) {
                    catalogError = error.message ?: "Unable to load public workspace snapshot."
                }
                if (!hadLeaderboardData) {
                    leaderboardError = error.message ?: "Unable to derive leaderboard from the public workspace snapshot."
                }
                if (!hadHallData) {
                    hallError = error.message ?: "Unable to derive hall of fame from the public workspace snapshot."
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

        val cachedBundle = cache.readTournamentBundle(selection.id)
        if (cachedBundle != null) {
            detailBundle = cachedBundle
            detailLoading = false
        } else {
            detailLoading = true
        }
        detailError = null
        runCatching { NativePublicApi.fetchTournamentBundle(selection.id) }
            .onSuccess { bundle ->
                detailBundle = bundle
                detailLoading = false
                if (bundle == null) {
                    detailError = "The selected tournament is not available in the public dataset."
                } else {
                    cache.writeTournamentBundle(bundle)
                }
            }
            .onFailure { error ->
                detailLoading = false
                if (cachedBundle == null) {
                    detailBundle = null
                    detailError = error.message ?: "Unable to load tournament detail."
                }
            }
    }

    LaunchedEffect(selectedRoute, adminSession?.accessToken, toolsRefreshNonce) {
        if (selectedRoute != AppRoute.ADMIN || adminSession == null) return@LaunchedEffect
        adminBusy = true
        adminTrafficLoading = true
        adminViewsLoading = true
        adminError = null
        adminTrafficError = null
        adminViewsError = null
        val billingWindow = buildProtectedBillingCycleWindow()
        val siteViewsWindow = buildProtectedPastDaysRange(30)
        coroutineScope {
            val accessRequest = async { runCatching { NativeProtectedApi.ensureAdminAccess(adminSession!!) } }
            val overviewRequest = async { runCatching { NativeProtectedApi.fetchAdminOverview(adminSession!!) } }
            val trafficRequest = async {
                runCatching {
                    NativeProtectedApi.fetchTrafficUsageRange(
                        session = adminSession!!,
                        startDate = billingWindow.startDate,
                        endDate = billingWindow.todayDate,
                    )
                }
            }
            val viewsRequest = async {
                runCatching {
                    NativeProtectedApi.fetchSiteViewsRange(
                        session = adminSession!!,
                        startDate = siteViewsWindow.startDate,
                        endDate = siteViewsWindow.endDate,
                    )
                }
            }
            val playerAccountsRequest = async {
                runCatching {
                    NativeProtectedApi.pullAdminPlayerAccounts(adminSession!!)
                }
            }
            val accessResult = accessRequest.await()
            val overviewResult = overviewRequest.await()
            val trafficResult = trafficRequest.await()
            val viewsResult = viewsRequest.await()
            val playerAccountsResult = playerAccountsRequest.await()

            accessResult.onSuccess { access ->
                adminAccess = access
                if (access.ok) {
                    val nextSession = adminSession!!.copy(
                        email = access.email ?: adminSession!!.email,
                        userId = access.userId ?: adminSession!!.userId,
                    )
                    adminSession = nextSession
                    protectedCache.writeAdminSession(nextSession)
                } else {
                    adminError = access.reason ?: "Questo account autenticato non ha ruolo admin."
                }
            }.onFailure { error ->
                adminAccess = null
                adminError = error.message ?: "Unable to verify admin access."
            }
            overviewResult.onSuccess { overview ->
                adminOverview = overview
            }.onFailure {
                adminOverview = null
            }
            trafficResult.onSuccess { rows ->
                adminTrafficRows = rows
                adminTrafficError = null
            }.onFailure { error ->
                adminTrafficRows = emptyList()
                adminTrafficError = error.message ?: "Unable to load traffic usage."
            }
            viewsResult.onSuccess { rows ->
                adminViewsRows = rows
                adminViewsError = null
            }.onFailure { error ->
                adminViewsRows = emptyList()
                adminViewsError = error.message ?: "Unable to load public views."
            }
            playerAccountsResult.onSuccess { rows ->
                playerLiveAdminRows = rows
                playerLiveNonce += 1
            }.onFailure { error ->
                playerLiveAdminRows = emptyList()
                if (!NativeProtectedApi.isPlayerBackendPendingError(error.message.orEmpty())) {
                    adminError = adminError ?: error.message ?: "Unable to load live player accounts."
                }
            }
        }
        adminBusy = false
        adminTrafficLoading = false
        adminViewsLoading = false
    }

    LaunchedEffect(selectedRoute, catalog.liveTournament?.id, toolsRefreshNonce) {
        if (selectedRoute != AppRoute.REFEREES_AREA && selectedRoute != AppRoute.ADMIN && selectedRoute != AppRoute.PLAYER_AREA) return@LaunchedEffect
        val liveTournament = catalog.liveTournament
        if (liveTournament == null) {
            toolsLiveBundle = null
            toolsLiveBundleError = null
            toolsLiveBundleLoading = false
            if (selectedRoute == AppRoute.REFEREES_AREA) {
                refereesAuthedTournamentId = ""
            }
            return@LaunchedEffect
        }

        val cachedBundle = cache.readTournamentBundle(liveTournament.id)
        if (cachedBundle != null) {
            toolsLiveBundle = cachedBundle
            toolsLiveBundleLoading = false
        } else {
            toolsLiveBundleLoading = true
        }
        toolsLiveBundleError = null
        runCatching { NativePublicApi.fetchTournamentBundle(liveTournament.id) }
            .onSuccess { bundle ->
                toolsLiveBundle = bundle
                toolsLiveBundleLoading = false
                if (bundle != null) {
                    cache.writeTournamentBundle(bundle)
                } else {
                    toolsLiveBundleError = "The live tournament bundle is not currently available."
                }
            }
            .onFailure { error ->
                toolsLiveBundleLoading = false
                if (cachedBundle == null) {
                    toolsLiveBundle = null
                    toolsLiveBundleError = error.message ?: "Unable to load live tournament detail."
                }
            }
    }

    LaunchedEffect(
        selectedRoute,
        catalog.liveTournament?.id,
        playerPreviewNonce,
        playerSnapshot.liveStatus.refereeBypassEligible,
        playerSnapshot.profile?.canonicalPlayerName,
    ) {
        val liveTournament = catalog.liveTournament ?: return@LaunchedEffect
        if (selectedRoute == AppRoute.REFEREES_AREA && playerSnapshot.liveStatus.refereeBypassEligible) {
            refereesAuthedTournamentId = liveTournament.id
            playerSnapshot.profile?.canonicalPlayerName?.takeIf { it.isNotBlank() }?.let {
                protectedCache.writeSelectedRefereeName(liveTournament.id, it)
            }
            refereesError = null
        }
    }

    if (tvMode != null) {
        NativeTvModeScreen(
            projection = tvMode,
            selection = publicState.selectedTournament,
            bundle = detailBundle,
            detailLoading = detailLoading,
            detailError = detailError,
            hallOfFame = hallOfFame,
            onProjectionSelected = { next -> tvModeId = next.id },
            onExit = { tvModeId = null },
            onRefresh = {
                refreshNonce += 1
                detailRefreshNonce += 1
            },
        )
        return
    }

    Scaffold(
        containerColor = NativeFlbpPalette.page,
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
                    if (selectedRoute.group == RouteGroup.TOOLS) {
                        toolsRefreshNonce += 1
                    } else if (selectedRoute == AppRoute.TOURNAMENT_DETAIL) {
                        refreshNonce += 1
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
                onOpenPlayerArea = { writePublicState(publicState.navigateToPrimary(AppRoute.PLAYER_AREA)) },
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
                onEnterTv = { projection -> tvModeId = projection.id },
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

            AppRoute.PLAYER_AREA -> PlayerAreaScreen(
                padding = innerPadding,
                snapshot = playerSnapshot,
                infoMessage = playerInfoMessage,
                errorMessage = playerError,
                onRegister = { email, password, firstName, lastName, birthDate ->
                    uiScope.launch {
                        runCatching {
                            val liveSession = NativeProtectedApi.signUpPlayerWithPassword(email, password)
                            protectedCache.writePlayerSession(liveSession)
                            playerLiveSession = liveSession
                            if (firstName.isNotBlank() && lastName.isNotBlank() && birthDate.isNotBlank()) {
                                playerLiveProfile = NativeProtectedApi.pushPlayerProfile(
                                    session = liveSession,
                                    firstName = firstName,
                                    lastName = lastName,
                                    birthDate = birthDate,
                                    canonicalPlayerName = buildNativeRuntimeCanonicalName(firstName, lastName),
                                )
                            }
                            NativeProtectedApi.registerPlayerDevice(
                                session = liveSession,
                                deviceId = protectedCache.readOrCreatePlayerDeviceId(),
                            )
                            playerLiveCalls = NativeProtectedApi.pullPlayerCalls(liveSession)
                            playerBackendReady = true
                        }.onSuccess {
                            playerPreviewNonce += 1
                            playerLiveNonce += 1
                            playerInfoMessage = "Account player live creato."
                            playerError = null
                        }.onFailure { error ->
                            playerError = error.message ?: "Unable to create the player account."
                            playerInfoMessage = null
                        }
                    }
                },
                onSignIn = { username, password ->
                    uiScope.launch {
                        runCatching {
                            val liveSession = NativeProtectedApi.signInPlayerWithPassword(username, password)
                            protectedCache.writePlayerSession(liveSession)
                            playerLiveSession = liveSession
                            NativeProtectedApi.registerPlayerDevice(
                                session = liveSession,
                                deviceId = protectedCache.readOrCreatePlayerDeviceId(),
                            )
                            playerLiveProfile = NativeProtectedApi.pullPlayerProfile(liveSession)
                            playerLiveCalls = NativeProtectedApi.pullPlayerCalls(liveSession)
                            playerBackendReady = true
                        }.onSuccess {
                            playerPreviewNonce += 1
                            playerLiveNonce += 1
                            playerInfoMessage = "Accesso player live completato."
                            playerError = null
                        }.onFailure { error ->
                            playerError = error.message ?: "Unable to sign in."
                            playerInfoMessage = null
                        }
                    }
                },
                onRequestPasswordReset = { email ->
                    uiScope.launch {
                        runCatching {
                            NativeProtectedApi.requestPlayerPasswordReset(email)
                        }.onSuccess {
                            playerInfoMessage = "Password reset email requested."
                            playerError = null
                        }.onFailure { error ->
                            playerError = error.message ?: "Unable to request password reset."
                            playerInfoMessage = null
                        }
                    }
                },
                onSaveProfile = { firstName, lastName, birthDate ->
                    val liveSession = playerLiveSession
                    if (liveSession != null) {
                        uiScope.launch {
                            runCatching {
                                playerLiveProfile = NativeProtectedApi.pushPlayerProfile(
                                    session = liveSession,
                                    firstName = firstName,
                                    lastName = lastName,
                                    birthDate = birthDate,
                                    canonicalPlayerId = playerLiveProfile?.canonicalPlayerId,
                                    canonicalPlayerName = buildNativeRuntimeCanonicalName(firstName, lastName),
                                )
                                playerLiveCalls = NativeProtectedApi.pullPlayerCalls(liveSession)
                            }.onSuccess {
                                playerPreviewNonce += 1
                                playerLiveNonce += 1
                                playerInfoMessage = "Profilo player live salvato."
                                playerError = null
                            }.onFailure { error ->
                                playerError = error.message ?: "Unable to save the player profile."
                                playerInfoMessage = null
                            }
                        }
                    } else {
                        val session = playerStore.readSession()
                        if (session == null) {
                            playerError = "Sign in first to save the player profile."
                            playerInfoMessage = null
                        } else {
                            runCatching { playerStore.saveProfile(session, firstName, lastName, birthDate) }
                                .onSuccess {
                                    playerPreviewNonce += 1
                                    playerInfoMessage = "Player profile saved."
                                    playerError = null
                                }
                                .onFailure { error ->
                                    playerError = error.message ?: "Unable to save the player profile."
                                    playerInfoMessage = null
                                }
                        }
                    }
                },
                onSignOut = {
                    uiScope.launch {
                        val hadLiveSession = playerLiveSession != null
                        val shouldClearBypass = playerSnapshot.liveStatus.refereeBypassEligible &&
                            refereesAuthedTournamentId == catalog.liveTournament?.id
                        if (playerLiveSession != null) {
                            NativeProtectedApi.signOutPlayer(playerLiveSession)
                            protectedCache.writePlayerSession(null)
                            playerLiveSession = null
                            playerLiveProfile = null
                            playerLiveCalls = emptyList()
                        } else {
                            playerStore.signOut()
                        }
                        if (shouldClearBypass) {
                            refereesAuthedTournamentId = ""
                        }
                        playerPreviewNonce += 1
                        playerLiveNonce += 1
                        playerInfoMessage = if (hadLiveSession) {
                            "Signed out from the live player account."
                        } else {
                            "Signed out from the preview account."
                        }
                        playerError = null
                    }
                },
                onAcknowledgeCall = { callId ->
                    val liveSession = playerLiveSession
                    if (liveSession != null) {
                        uiScope.launch {
                            runCatching {
                                NativeProtectedApi.acknowledgePlayerCall(liveSession, callId)
                                playerLiveCalls = NativeProtectedApi.pullPlayerCalls(liveSession)
                            }.onSuccess {
                                playerPreviewNonce += 1
                                playerLiveNonce += 1
                                playerInfoMessage = "Team call receipt confirmed."
                                playerError = null
                            }.onFailure { error ->
                                playerError = error.message ?: "Unable to confirm the team call."
                                playerInfoMessage = null
                            }
                        }
                    } else {
                        val session = playerStore.readSession()
                        if (session == null) {
                            playerError = "Sign in first to confirm the team call."
                            playerInfoMessage = null
                        } else {
                            runCatching { playerStore.acknowledgeCall(session, callId) }
                                .onSuccess {
                                    playerPreviewNonce += 1
                                    playerInfoMessage = "Team call receipt confirmed."
                                    playerError = null
                                }
                                .onFailure { error ->
                                    playerError = error.message ?: "Unable to confirm the team call."
                                    playerInfoMessage = null
                                }
                        }
                    }
                },
                onClearCall = { callId ->
                    if (playerSnapshot.liveStatus.activeCall?.previewOnly == false) {
                        playerError = "Live team calls can be cancelled only from Admin."
                        playerInfoMessage = null
                    } else {
                        val session = playerStore.readSession()
                        if (session == null) {
                            playerError = "Sign in first to clear the team call."
                            playerInfoMessage = null
                        } else {
                            runCatching { playerStore.clearCall(session, callId) }
                                .onSuccess {
                                    playerPreviewNonce += 1
                                    playerInfoMessage = "Team call cleared."
                                    playerError = null
                                }
                                .onFailure { error ->
                                    playerError = error.message ?: "Unable to clear the team call."
                                    playerInfoMessage = null
                                }
                        }
                    }
                },
                onOpenReferees = { selectedToolsRouteId = AppRoute.REFEREES_AREA.id },
                onResetPreviewData = {
                    val shouldClearBypass = refereesAuthedTournamentId == catalog.liveTournament?.id
                    playerStore.clearAllPreviewData()
                    if (shouldClearBypass) {
                        refereesAuthedTournamentId = ""
                    }
                    playerPreviewNonce += 1
                    playerInfoMessage = "Local preview data reset on this device."
                    playerError = null
                },
            )

            AppRoute.ADMIN -> AdminToolsScreen(
                padding = innerPadding,
                session = adminSession,
                access = adminAccess,
                overview = adminOverview,
                trafficRows = adminTrafficRows,
                trafficLoading = adminTrafficLoading,
                trafficError = adminTrafficError,
                viewsRows = adminViewsRows,
                viewsLoading = adminViewsLoading,
                viewsError = adminViewsError,
                busy = adminBusy,
                error = adminError,
                catalog = catalog,
                leaderboardCount = leaderboard.size,
                hallCount = hallOfFame.size,
                playerAccountRows = adminPlayerAccountRows,
                liveBundle = toolsLiveBundle,
                liveBundleLoading = toolsLiveBundleLoading,
                liveBundleError = toolsLiveBundleError,
                onLogin = { email, password ->
                    adminBusy = true
                    adminError = null
                    adminAccess = null
                    adminOverview = null
                    uiScope.launch {
                        runCatching {
                            val session = NativeProtectedApi.signInWithPassword(email, password)
                            val access = NativeProtectedApi.ensureAdminAccess(session)
                            if (!access.ok) {
                                NativeProtectedApi.signOut(session)
                                throw IllegalStateException(access.reason ?: "Questo account autenticato non ha ruolo admin.")
                            }
                            val overview = NativeProtectedApi.fetchAdminOverview(session)
                            val billingWindow = buildProtectedBillingCycleWindow()
                            val trafficRows = NativeProtectedApi.fetchTrafficUsageRange(
                                session = session,
                                startDate = billingWindow.startDate,
                                endDate = billingWindow.todayDate,
                            )
                            val viewsWindow = buildProtectedPastDaysRange(30)
                            val viewsRows = NativeProtectedApi.fetchSiteViewsRange(
                                session = session,
                                startDate = viewsWindow.startDate,
                                endDate = viewsWindow.endDate,
                            )
                            val accountRows = NativeProtectedApi.pullAdminPlayerAccounts(session)
                            session.copy(
                                email = access.email ?: session.email,
                                userId = access.userId ?: session.userId,
                            ) to NativeAdminBootstrapPayload(
                                access = access,
                                overview = overview,
                                trafficRows = trafficRows,
                                viewsRows = viewsRows,
                            ) to accountRows
                        }.onSuccess { (payload, accountRows) ->
                            val (session, result) = payload
                            adminSession = session
                            protectedCache.writeAdminSession(session)
                            adminAccess = result.access
                            adminOverview = result.overview
                            adminTrafficRows = result.trafficRows
                            adminTrafficError = null
                            adminViewsRows = result.viewsRows
                            adminViewsError = null
                            playerLiveAdminRows = accountRows
                            playerLiveNonce += 1
                        }.onFailure { error ->
                            adminSession = null
                            protectedCache.writeAdminSession(null)
                            adminAccess = null
                            adminOverview = null
                            adminTrafficRows = emptyList()
                            adminTrafficError = null
                            adminViewsRows = emptyList()
                            adminViewsError = null
                            playerLiveAdminRows = emptyList()
                            adminError = error.message ?: "Unable to sign in."
                        }
                        adminBusy = false
                        adminTrafficLoading = false
                        adminViewsLoading = false
                    }
                },
                onLogout = {
                    uiScope.launch {
                        NativeProtectedApi.signOut(adminSession)
                        adminSession = null
                        adminAccess = null
                        adminOverview = null
                        adminTrafficRows = emptyList()
                        adminTrafficError = null
                        adminViewsRows = emptyList()
                        adminViewsError = null
                        playerLiveAdminRows = emptyList()
                        adminError = null
                        protectedCache.writeAdminSession(null)
                    }
                },
                onRefreshAccess = { toolsRefreshNonce += 1 },
                onRefreshLiveBundle = { toolsRefreshNonce += 1 },
                onSavePlayerAccount = { accountId, email, firstName, lastName, birthDate ->
                    val liveRow = playerLiveAdminRows.firstOrNull { it.userId == accountId }
                    if (liveRow != null && adminSession != null) {
                        val saved = NativeProtectedApi.pushAdminPlayerProfile(
                            session = adminSession!!,
                            userId = accountId,
                            firstName = firstName,
                            lastName = lastName,
                            birthDate = birthDate,
                            canonicalPlayerId = liveRow.canonicalPlayerId,
                            canonicalPlayerName = buildNativeRuntimeCanonicalName(firstName, lastName),
                        )
                        playerLiveAdminRows = NativeProtectedApi.pullAdminPlayerAccounts(adminSession!!)
                        if (playerLiveSession?.userId == accountId) {
                            playerLiveProfile = saved
                        }
                        playerLiveNonce += 1
                        "Live player account updated from Admin."
                    } else {
                        playerStore.updateAdminAccount(
                            accountIdRaw = accountId,
                            emailRaw = email,
                            firstNameRaw = firstName,
                            lastNameRaw = lastName,
                            birthDateRaw = birthDate,
                        )
                        playerPreviewNonce += 1
                        "Preview player account updated from Admin."
                    }
                },
            )

            AppRoute.REFEREES_AREA -> RefereesToolsScreen(
                padding = innerPadding,
                liveTournament = catalog.liveTournament,
                authedTournamentId = refereesAuthedTournamentId.ifBlank { null },
                busy = refereesBusy,
                error = refereesError,
                liveBundle = toolsLiveBundle,
                liveBundleLoading = toolsLiveBundleLoading,
                liveBundleError = toolsLiveBundleError,
                onVerifyPassword = { password ->
                    val liveTournament = catalog.liveTournament
                    if (liveTournament == null) {
                        refereesError = "No live tournament is active."
                    } else {
                        refereesBusy = true
                        refereesError = null
                        uiScope.launch {
                            runCatching { NativeProtectedApi.verifyRefereePassword(liveTournament.id, password) }
                                .onSuccess { result ->
                                    if (result.ok) {
                                        refereesAuthedTournamentId = liveTournament.id
                                        runCatching {
                                            NativeProtectedApi.pullRefereeLiveState(liveTournament.id, password)
                                        }.onSuccess { pulled ->
                                            if (pulled.ok) {
                                                refreshNonce += 1
                                                detailRefreshNonce += 1
                                                toolsRefreshNonce += 1
                                            }
                                        }.onFailure { error ->
                                            if (!isMissingNativeRefereePullRpc(error)) {
                                                // Keep the referees route usable even if the additive pull path
                                                // is not yet available or temporarily fails.
                                            }
                                        }
                                    } else {
                                        refereesError = result.reason ?: "Password errata."
                                    }
                                }
                                .onFailure { error ->
                                    refereesError = error.message ?: "Referee password check failed."
                                }
                            refereesBusy = false
                        }
                    }
                },
                onLogout = {
                    refereesAuthedTournamentId = ""
                    refereesError = null
                },
                onRefreshLiveBundle = { toolsRefreshNonce += 1 },
            )
        }
    }
}
