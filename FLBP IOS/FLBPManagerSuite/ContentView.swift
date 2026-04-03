import SwiftUI

private func isMissingNativeRefereePullRPC(_ error: Error) -> Bool {
    let message = error.localizedDescription
    return message.localizedCaseInsensitiveContains("flbp_referee_pull_live_state") ||
        message.localizedCaseInsensitiveContains("PGRST202")
}

private func buildNativeRuntimeCanonicalName(firstNameRaw: String, lastNameRaw: String) -> String {
    "\(lastNameRaw.trimmingCharacters(in: .whitespacesAndNewlines)) \(firstNameRaw.trimmingCharacters(in: .whitespacesAndNewlines))"
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
}

struct ContentView: View {
    @StateObject private var model = NativeAppModel()
    private let protectedCache = NativeProtectedCache()
    private let playerStore = NativePlayerPreviewStore()

    @SceneStorage("flbp.public.route") private var storedPublicRouteId = NativeRoute.home.rawValue
    @SceneStorage("flbp.public.tournament.id") private var storedTournamentId = ""
    @SceneStorage("flbp.public.tournament.live") private var storedTournamentIsLive = false
    @SceneStorage("flbp.tv.mode") private var storedTvModeRaw = ""

    @State private var selectedToolsRouteId = ""
    @State private var refreshToken = UUID()
    @State private var detailRefreshToken = UUID()
    @State private var toolsRefreshToken = UUID()
    @State private var adminSession: NativeAdminSession? = NativeProtectedCache().readAdminSession()
    @State private var adminAccess: NativeAdminAccessResult?
    @State private var adminOverview: NativeAdminOverview?
    @State private var adminTrafficRows: [NativeProtectedTrafficUsageRow] = []
    @State private var adminTrafficLoading = false
    @State private var adminTrafficError: String?
    @State private var adminViewsRows: [NativeProtectedSiteViewsRow] = []
    @State private var adminViewsLoading = false
    @State private var adminViewsError: String?
    @State private var adminBusy = false
    @State private var adminError: String?
    @State private var refereesBusy = false
    @State private var refereesError: String?
    @State private var refereesAuthedTournamentId = ""
    @State private var playerPreviewToken = UUID()
    @State private var playerLiveToken = UUID()
    @State private var playerInfoMessage: String?
    @State private var playerError: String?
    @State private var playerLiveSession: NativePlayerSupabaseSession? = NativeProtectedCache().readPlayerSession()
    @State private var playerLiveProfile: NativePlayerSupabaseProfileRow?
    @State private var playerLiveCalls: [NativePlayerSupabaseCallRow] = []
    @State private var playerLiveAdminRows: [NativeAdminPlayerAccountCatalogRow] = []
    @State private var playerBackendReady = true
    @State private var toolsLiveBundle: NativeTournamentBundle?
    @State private var toolsLiveBundleLoading = false
    @State private var toolsLiveBundleError: String?
    @State private var didForceLaunchHome = false

    private var publicState: PublicRouteState {
        guard didForceLaunchHome else {
            return PublicRouteState(route: .home, selectedTournament: nil)
        }
        let route = NativeRoute(rawValue: storedPublicRouteId).flatMap { route in
            (route.group == .publicPrimary || route == .tournamentDetail) ? route : nil
        } ?? .home

        return PublicRouteState(
            route: route,
            selectedTournament: TournamentSelectionRef.fromSaved(
                id: storedTournamentId,
                isLive: storedTournamentIsLive
            )
        )
    }

    private var selectedToolsRoute: NativeRoute? {
        guard didForceLaunchHome else { return nil }
        NativeRoute(rawValue: selectedToolsRouteId).flatMap { $0.group == .tools ? $0 : nil }
    }

    private var selectedRoute: NativeRoute {
        selectedToolsRoute ?? publicState.resolvedRoute
    }

    private var activeTvMode: NativeTvProjection? {
        NativeTvProjection(rawValue: storedTvModeRaw)
    }

    private var playerLiveBundle: NativeTournamentBundle? {
        guard let liveTournamentId = model.catalog.liveTournament?.id else { return nil }
        guard let toolsLiveBundle, toolsLiveBundle.tournament.id == liveTournamentId else { return nil }
        return toolsLiveBundle
    }

    private var playerSnapshot: NativePlayerAreaSnapshot {
        _ = playerPreviewToken
        _ = playerLiveToken
        return buildSafeNativePlayerAreaSnapshot(
            catalog: model.catalog,
            leaderboard: model.leaderboard,
            hallOfFame: model.hallOfFame,
            liveBundle: playerLiveBundle,
            store: playerStore,
            liveSession: playerLiveSession,
            liveProfile: playerLiveProfile,
            liveCalls: playerLiveCalls,
            backendReady: playerBackendReady
        )
    }

    private var adminPlayerAccountRows: [NativePlayerAdminAccountRow] {
        _ = playerPreviewToken
        _ = playerLiveToken
        return buildNativePlayerAdminRows(
            leaderboard: model.leaderboard,
            hallOfFame: model.hallOfFame,
            store: playerStore,
            liveRows: accessCanUseLivePlayerRows ? playerLiveAdminRows : []
        )
    }

    private var accessCanUseLivePlayerRows: Bool {
        adminAccess?.ok == true
    }

    var body: some View {
        Group {
            if NativeWebMirrorConfig.enabled {
                NativeWebMirrorHostView(fallback: legacyBody)
            } else {
                legacyBody
            }
        }
    }

    private var legacyBody: some View {
        NavigationView {
            ZStack {
                NativeFlbpPalette.page.ignoresSafeArea()
                Group {
                    if let activeTvMode {
                        NativeTVModeScreenView(
                            projection: activeTvMode,
                            selection: publicState.selectedTournament,
                            bundle: model.detailBundle,
                            detailLoading: model.detailLoading,
                            detailError: model.detailError,
                            hallOfFame: model.hallOfFame,
                            onProjectionSelected: { storedTvModeRaw = $0.rawValue },
                            onExit: { storedTvModeRaw = "" },
                            onRefresh: {
                                refreshToken = UUID()
                                detailRefreshToken = UUID()
                            }
                        )
                    } else {
                        VStack(spacing: 0) {
                            TopBarView(
                                selectedRoute: selectedRoute,
                                onRouteSelected: { route in
                                    if route.group == .tools {
                                        selectedToolsRouteId = route.rawValue
                                    } else {
                                        writePublicState(publicState.navigateToPrimary(route))
                                    }
                                },
                                onRefresh: {
                                    if selectedRoute.group == .tools {
                                        toolsRefreshToken = UUID()
                                    } else if selectedRoute == .tournamentDetail {
                                        refreshToken = UUID()
                                        detailRefreshToken = UUID()
                                    } else {
                                        refreshToken = UUID()
                                    }
                                }
                            )
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                            .padding(.bottom, 8)

                            currentScreen
                        }
                    }
                }
            }
            .navigationBarHidden(true)
        }
        .navigationViewStyle(.stack)
        .task {
            guard !didForceLaunchHome else { return }
            storedPublicRouteId = NativeRoute.home.rawValue
            storedTournamentId = ""
            storedTournamentIsLive = false
            storedTvModeRaw = ""
            selectedToolsRouteId = ""
            didForceLaunchHome = true
        }
        .task(id: refreshToken) {
            await model.refreshAll()
        }
        .task(id: detailTaskKey) {
            await model.loadDetail(for: publicState.selectedTournament)
        }
        .task(id: adminTaskKey) {
            guard selectedRoute == .admin, let adminSession else { return }
            adminBusy = true
            adminTrafficLoading = true
            adminViewsLoading = true
            adminError = nil
            adminTrafficError = nil
            adminViewsError = nil
            let billingWindow = buildProtectedBillingCycleWindow()
            let siteViewsWindow = buildProtectedPastDaysRange(days: 30)
            do {
                async let accessRequest = NativeProtectedAPI.ensureAdminAccess(session: adminSession)
                async let overviewRequest = NativeProtectedAPI.fetchAdminOverview(session: adminSession)
                async let trafficRequest = NativeProtectedAPI.fetchTrafficUsageRange(
                    session: adminSession,
                    startDate: billingWindow.startDate,
                    endDate: billingWindow.todayDate
                )
                async let viewsRequest = NativeProtectedAPI.fetchSiteViewsRange(
                    session: adminSession,
                    startDate: siteViewsWindow.startDate,
                    endDate: siteViewsWindow.endDate
                )
                async let playerAccountsRequest = NativeProtectedAPI.pullAdminPlayerAccounts(session: adminSession)
                let (access, overview, trafficRows, viewsRows, playerAccountsRows) = try await (
                    accessRequest,
                    overviewRequest,
                    trafficRequest,
                    viewsRequest,
                    playerAccountsRequest
                )
                adminAccess = access
                adminOverview = overview
                adminTrafficRows = trafficRows
                adminTrafficError = nil
                adminViewsRows = viewsRows
                adminViewsError = nil
                playerLiveAdminRows = playerAccountsRows
                playerLiveToken = UUID()
                if access.ok {
                    let nextSession = NativeAdminSession(
                        accessToken: adminSession.accessToken,
                        refreshToken: adminSession.refreshToken,
                        expiresAt: adminSession.expiresAt,
                        email: access.email ?? adminSession.email,
                        userId: access.userId ?? adminSession.userId
                    )
                    self.adminSession = nextSession
                    protectedCache.writeAdminSession(nextSession)
                } else {
                    adminError = access.reason
                }
            } catch {
                adminAccess = nil
                adminOverview = nil
                adminTrafficRows = []
                adminTrafficError = error.localizedDescription
                adminViewsRows = []
                adminViewsError = error.localizedDescription
                playerLiveAdminRows = []
                adminError = error.localizedDescription
            }
            adminBusy = false
            adminTrafficLoading = false
            adminViewsLoading = false
        }
        .task(id: refereesTaskKey) {
            guard selectedRoute == .refereesArea || selectedRoute == .admin || selectedRoute == .playerArea else { return }
            guard let liveTournament = model.catalog.liveTournament else {
                toolsLiveBundle = nil
                toolsLiveBundleLoading = false
                toolsLiveBundleError = nil
                if selectedRoute == .refereesArea {
                    refereesAuthedTournamentId = ""
                }
                return
            }

            let localCache = NativePublicCache()
            let staleBundle = localCache.readTournamentBundle(id: liveTournament.id)
            if let staleBundle {
                toolsLiveBundle = staleBundle
                toolsLiveBundleLoading = false
            } else {
                toolsLiveBundleLoading = true
            }
            toolsLiveBundleError = nil

            do {
                toolsLiveBundle = try await NativePublicAPI.fetchTournamentBundle(id: liveTournament.id)
                if let toolsLiveBundle {
                    localCache.writeTournamentBundle(toolsLiveBundle)
                } else {
                    toolsLiveBundleError = "The live tournament bundle is not currently available."
                }
            } catch {
                if staleBundle == nil {
                    toolsLiveBundle = nil
                    toolsLiveBundleError = error.localizedDescription
                }
            }
            toolsLiveBundleLoading = false
        }
        .task(id: playerBypassTaskKey) {
            guard selectedRoute == .refereesArea else { return }
            guard let liveTournament = model.catalog.liveTournament else { return }
            guard playerSnapshot.liveStatus.refereeBypassEligible else { return }
            refereesAuthedTournamentId = liveTournament.id
            if let refereeName = playerSnapshot.profile?.canonicalPlayerName, !refereeName.isEmpty {
                protectedCache.writeSelectedRefereeName(tournamentId: liveTournament.id, refereeName: refereeName)
            }
            refereesError = nil
        }
        .task(id: playerPreviewToken) {
            guard let repairMessage = playerStore.repairCorruptedState() else { return }
            let repairedSnapshot = buildSafeNativePlayerAreaSnapshot(
                catalog: model.catalog,
                leaderboard: model.leaderboard,
                hallOfFame: model.hallOfFame,
                liveBundle: playerLiveBundle,
                store: playerStore,
                liveSession: playerLiveSession,
                liveProfile: playerLiveProfile,
                liveCalls: playerLiveCalls,
                backendReady: playerBackendReady
            )
            if !repairedSnapshot.liveStatus.refereeBypassEligible &&
                refereesAuthedTournamentId == model.catalog.liveTournament?.id {
                refereesAuthedTournamentId = ""
            }
            playerPreviewToken = UUID()
            playerInfoMessage = repairMessage
            playerError = nil
        }
        .task(id: playerLiveTaskKey) {
            let refreshedSession = await NativeProtectedAPI.ensureFreshPlayerSession(cache: protectedCache)
            playerLiveSession = refreshedSession
            if refreshedSession == nil {
                playerLiveProfile = nil
                playerLiveCalls = []
                playerBackendReady = true
                return
            }

            var backendPending = false

            do {
                let pushSnapshot = NativePushRegistry.currentSnapshot()
                try await NativeProtectedAPI.registerPlayerDevice(
                    session: refreshedSession!,
                    deviceId: protectedCache.readOrCreatePlayerDeviceId(),
                    deviceToken: pushSnapshot.deviceToken,
                    pushEnabled: pushSnapshot.permission == "granted" && pushSnapshot.deviceToken != nil
                )
            } catch {
                if NativeProtectedAPI.isPlayerBackendPendingError(error.localizedDescription) {
                    backendPending = true
                }
            }

            do {
                playerLiveProfile = try await NativeProtectedAPI.pullPlayerProfile(session: refreshedSession!)
            } catch {
                if NativeProtectedAPI.isPlayerBackendPendingError(error.localizedDescription) {
                    backendPending = true
                }
                playerLiveProfile = nil
            }

            do {
                playerLiveCalls = try await NativeProtectedAPI.pullPlayerCalls(session: refreshedSession!)
            } catch {
                if NativeProtectedAPI.isPlayerBackendPendingError(error.localizedDescription) {
                    backendPending = true
                }
                playerLiveCalls = []
            }

            playerBackendReady = !backendPending
        }
        .onChange(of: model.catalog) { _ in
            guard let selectedTournament = publicState.selectedTournament else { return }
            if !model.containsTournament(id: selectedTournament.id) {
                storedTvModeRaw = ""
                writePublicState(publicState.withTournamentSelection(nil))
            }
        }
    }

    @ViewBuilder
    private var currentScreen: some View {
        switch selectedRoute {
        case .home:
            HomeScreenView(
                catalogLoading: model.catalogLoading,
                catalogError: model.catalogError,
                liveTournament: model.catalog.liveTournament,
                historyCount: model.catalog.history.count,
                leaderboardCount: model.leaderboard.count,
                hallCount: model.hallOfFame.count,
                onOpenTournaments: { writePublicState(publicState.navigateToPrimary(.tournament)) },
                onOpenLeaderboard: { writePublicState(publicState.navigateToPrimary(.leaderboard)) },
                onOpenHof: { writePublicState(publicState.navigateToPrimary(.hof)) },
                onOpenPlayerArea: { writePublicState(publicState.navigateToPrimary(.playerArea)) },
                onOpenAdmin: { selectedToolsRouteId = NativeRoute.admin.rawValue },
                onOpenReferees: { selectedToolsRouteId = NativeRoute.refereesArea.rawValue },
                onRefresh: { refreshToken = UUID() }
            )

        case .tournament:
            TournamentListScreenView(
                catalogLoading: model.catalogLoading,
                catalogError: model.catalogError,
                catalog: model.catalog,
                currentSelection: publicState.selectedTournament,
                onRefresh: { refreshToken = UUID() },
                onOpenTournament: { tournament in
                    let next = publicState.withTournamentSelection(
                        TournamentSelectionRef(id: tournament.id, isLive: tournament.status == "live")
                    )
                    writePublicState(next.openTournamentDetailOrFallback())
                }
            )

        case .tournamentDetail:
            TournamentDetailScreenView(
                selection: publicState.selectedTournament,
                bundle: model.detailBundle,
                detailLoading: model.detailLoading,
                detailError: model.detailError,
                hallOfFame: model.hallOfFame,
                onEnterTv: { storedTvModeRaw = $0.rawValue },
                onBack: { writePublicState(publicState.navigateToPrimary(.tournament)) },
                onRefresh: { detailRefreshToken = UUID() }
            )

        case .leaderboard:
            LeaderboardScreenView(
                loading: model.leaderboardLoading,
                error: model.leaderboardError,
                entries: model.leaderboard,
                onRefresh: { refreshToken = UUID() }
            )

        case .hof:
            HallOfFameScreenView(
                loading: model.hallLoading,
                error: model.hallError,
                entries: model.hallOfFame,
                onRefresh: { refreshToken = UUID() }
            )

        case .playerArea:
            PlayerAreaScreenView(
                snapshot: playerSnapshot,
                infoMessage: playerInfoMessage,
                errorMessage: playerError,
                onRegister: { username, password, firstName, lastName, birthDate in
                    Task {
                        do {
                            let liveSession = try await NativeProtectedAPI.signUpPlayerWithPassword(
                                email: username,
                                password: password,
                                metadata: ["origin": "in_app"]
                            )
                            protectedCache.writePlayerSession(liveSession)
                            playerLiveSession = liveSession
                            if !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                                !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                                !birthDate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                playerLiveProfile = try await NativeProtectedAPI.pushPlayerProfile(
                                    session: liveSession,
                                    firstName: firstName,
                                    lastName: lastName,
                                    birthDate: birthDate,
                                    canonicalPlayerId: playerLiveProfile?.canonicalPlayerId,
                                    canonicalPlayerName: buildNativeRuntimeCanonicalName(firstNameRaw: firstName, lastNameRaw: lastName)
                                )
                            } else {
                                playerLiveProfile = try await NativeProtectedAPI.pullPlayerProfile(session: liveSession)
                            }
                            let pushSnapshot = NativePushRegistry.currentSnapshot()
                            try await NativeProtectedAPI.registerPlayerDevice(
                                session: liveSession,
                                deviceId: protectedCache.readOrCreatePlayerDeviceId(),
                                deviceToken: pushSnapshot.deviceToken,
                                pushEnabled: pushSnapshot.permission == "granted" && pushSnapshot.deviceToken != nil
                            )
                            playerLiveCalls = try await NativeProtectedAPI.pullPlayerCalls(session: liveSession)
                            playerBackendReady = true
                            playerPreviewToken = UUID()
                            playerLiveToken = UUID()
                            playerInfoMessage = "Account player live creato."
                            playerError = nil
                        } catch {
                            playerError = error.localizedDescription
                            playerInfoMessage = nil
                        }
                    }
                },
                onSignIn: { username, password in
                    Task {
                        do {
                            let liveSession = try await NativeProtectedAPI.signInPlayerWithPassword(email: username, password: password)
                            protectedCache.writePlayerSession(liveSession)
                            playerLiveSession = liveSession
                            let pushSnapshot = NativePushRegistry.currentSnapshot()
                            try await NativeProtectedAPI.registerPlayerDevice(
                                session: liveSession,
                                deviceId: protectedCache.readOrCreatePlayerDeviceId(),
                                deviceToken: pushSnapshot.deviceToken,
                                pushEnabled: pushSnapshot.permission == "granted" && pushSnapshot.deviceToken != nil
                            )
                            playerLiveProfile = try await NativeProtectedAPI.pullPlayerProfile(session: liveSession)
                            playerLiveCalls = try await NativeProtectedAPI.pullPlayerCalls(session: liveSession)
                            playerBackendReady = true
                            playerPreviewToken = UUID()
                            playerLiveToken = UUID()
                            playerInfoMessage = "Accesso player live completato."
                            playerError = nil
                        } catch {
                            playerError = error.localizedDescription
                            playerInfoMessage = nil
                        }
                    }
                },
                onRequestPasswordReset: { email in
                    Task {
                        do {
                            try await NativeProtectedAPI.requestPlayerPasswordReset(email)
                            playerInfoMessage = "Password reset email requested."
                            playerError = nil
                        } catch {
                            playerError = error.localizedDescription
                            playerInfoMessage = nil
                        }
                    }
                },
                onSaveProfile: { firstName, lastName, birthDate in
                    if let liveSession = playerLiveSession {
                        Task {
                            do {
                                playerLiveProfile = try await NativeProtectedAPI.pushPlayerProfile(
                                    session: liveSession,
                                    firstName: firstName,
                                    lastName: lastName,
                                    birthDate: birthDate,
                                    canonicalPlayerId: playerLiveProfile?.canonicalPlayerId,
                                    canonicalPlayerName: buildNativeRuntimeCanonicalName(firstNameRaw: firstName, lastNameRaw: lastName)
                                )
                                playerLiveCalls = try await NativeProtectedAPI.pullPlayerCalls(session: liveSession)
                                playerPreviewToken = UUID()
                                playerLiveToken = UUID()
                                playerInfoMessage = "Profilo player live salvato."
                                playerError = nil
                            } catch {
                                playerError = error.localizedDescription
                                playerInfoMessage = nil
                            }
                        }
                    } else {
                        guard let session = playerStore.readSession() else {
                            playerError = "Sign in first to save the player profile."
                            playerInfoMessage = nil
                            return
                        }
                        do {
                            _ = try playerStore.saveProfile(session: session, firstName: firstName, lastName: lastName, birthDate: birthDate)
                            playerPreviewToken = UUID()
                            playerInfoMessage = "Player profile saved."
                            playerError = nil
                        } catch {
                            playerError = error.localizedDescription
                            playerInfoMessage = nil
                        }
                    }
                },
                onSignOut: {
                    let liveTournamentId = model.catalog.liveTournament?.id ?? ""
                    let shouldClearBypass = playerSnapshot.liveStatus.refereeBypassEligible &&
                        !liveTournamentId.isEmpty &&
                        refereesAuthedTournamentId == liveTournamentId
                    Task {
                        let hadLiveSession = playerLiveSession != nil
                        if let liveSession = playerLiveSession {
                            await NativeProtectedAPI.signOutPlayer(session: liveSession)
                            protectedCache.writePlayerSession(nil)
                            playerLiveSession = nil
                            playerLiveProfile = nil
                            playerLiveCalls = []
                        } else {
                            playerStore.signOut()
                        }
                        if shouldClearBypass {
                            refereesAuthedTournamentId = ""
                        }
                        playerPreviewToken = UUID()
                        playerLiveToken = UUID()
                        playerInfoMessage = hadLiveSession ? "Signed out from the live player account." : "Signed out from the preview account."
                        playerError = nil
                    }
                },
                onAcknowledgeCall: { callId in
                    if let liveSession = playerLiveSession {
                        Task {
                            do {
                                try await NativeProtectedAPI.acknowledgePlayerCall(session: liveSession, callId: callId)
                                playerLiveCalls = try await NativeProtectedAPI.pullPlayerCalls(session: liveSession)
                                playerPreviewToken = UUID()
                                playerLiveToken = UUID()
                                playerInfoMessage = "Team call receipt confirmed."
                                playerError = nil
                            } catch {
                                playerError = error.localizedDescription
                                playerInfoMessage = nil
                            }
                        }
                    } else {
                        guard let session = playerStore.readSession() else {
                            playerError = "Sign in first to confirm the team call."
                            playerInfoMessage = nil
                            return
                        }
                        do {
                            _ = try playerStore.acknowledgeCall(session: session, callId: callId)
                            playerPreviewToken = UUID()
                            playerInfoMessage = "Team call receipt confirmed."
                            playerError = nil
                        } catch {
                            playerError = error.localizedDescription
                            playerInfoMessage = nil
                        }
                    }
                },
                onClearCall: { callId in
                    if playerSnapshot.liveStatus.activeCall?.previewOnly == false {
                        playerError = "Live team calls can be cancelled only from Admin."
                        playerInfoMessage = nil
                    } else {
                        guard let session = playerStore.readSession() else {
                            playerError = "Sign in first to clear the team call."
                            playerInfoMessage = nil
                            return
                        }
                        do {
                            _ = try playerStore.clearCall(session: session, callId: callId)
                            playerPreviewToken = UUID()
                            playerInfoMessage = "Team call cleared."
                            playerError = nil
                        } catch {
                            playerError = error.localizedDescription
                            playerInfoMessage = nil
                        }
                    }
                },
                onOpenReferees: { selectedToolsRouteId = NativeRoute.refereesArea.rawValue },
                onResetPreviewData: {
                    let liveTournamentId = model.catalog.liveTournament?.id ?? ""
                    if !liveTournamentId.isEmpty && refereesAuthedTournamentId == liveTournamentId {
                        refereesAuthedTournamentId = ""
                    }
                    playerStore.clearAllPreviewData()
                    playerPreviewToken = UUID()
                    playerInfoMessage = "Local preview data reset on this device."
                    playerError = nil
                }
            )

        case .admin:
            AdminToolsScreenView(
                session: adminSession,
                access: adminAccess,
                overview: adminOverview,
                trafficRows: adminTrafficRows,
                trafficLoading: adminTrafficLoading,
                trafficError: adminTrafficError,
                viewsRows: adminViewsRows,
                viewsLoading: adminViewsLoading,
                viewsError: adminViewsError,
                busy: adminBusy,
                error: adminError,
                catalog: model.catalog,
                leaderboardCount: model.leaderboard.count,
                hallCount: model.hallOfFame.count,
                playerAccountRows: adminPlayerAccountRows,
                liveBundle: toolsLiveBundle,
                liveBundleLoading: toolsLiveBundleLoading,
                liveBundleError: toolsLiveBundleError,
                onLogin: { email, password in
                    Task {
                        adminBusy = true
                        adminTrafficLoading = true
                        adminViewsLoading = true
                        adminError = nil
                        adminTrafficError = nil
                        adminViewsError = nil
                        adminAccess = nil
                        adminOverview = nil
                        do {
                            let session = try await NativeProtectedAPI.signInWithPassword(email: email, password: password)
                            let access = try await NativeProtectedAPI.ensureAdminAccess(session: session)
                            guard access.ok else {
                                await NativeProtectedAPI.signOut(session: session)
                                throw NSError(domain: "FLBP", code: 12, userInfo: [NSLocalizedDescriptionKey: access.reason ?? "Questo account autenticato non ha ruolo admin in Supabase."])
                            }
                            let overview = try await NativeProtectedAPI.fetchAdminOverview(session: session)
                            let billingWindow = buildProtectedBillingCycleWindow()
                            let trafficRows = try await NativeProtectedAPI.fetchTrafficUsageRange(
                                session: session,
                                startDate: billingWindow.startDate,
                                endDate: billingWindow.todayDate
                            )
                            let viewsWindow = buildProtectedPastDaysRange(days: 30)
                            let viewsRows = try await NativeProtectedAPI.fetchSiteViewsRange(
                                session: session,
                                startDate: viewsWindow.startDate,
                                endDate: viewsWindow.endDate
                            )
                            let accountRows = try await NativeProtectedAPI.pullAdminPlayerAccounts(session: session)
                            let nextSession = NativeAdminSession(
                                accessToken: session.accessToken,
                                refreshToken: session.refreshToken,
                                expiresAt: session.expiresAt,
                                email: access.email ?? session.email,
                                userId: access.userId ?? session.userId
                            )
                            adminSession = nextSession
                            adminAccess = access
                            adminOverview = overview
                            adminTrafficRows = trafficRows
                            adminTrafficError = nil
                            adminViewsRows = viewsRows
                            adminViewsError = nil
                            playerLiveAdminRows = accountRows
                            playerLiveToken = UUID()
                            protectedCache.writeAdminSession(nextSession)
                        } catch {
                            adminSession = nil
                            adminAccess = nil
                            adminOverview = nil
                            adminTrafficRows = []
                            adminTrafficError = nil
                            adminViewsRows = []
                            adminViewsError = nil
                            playerLiveAdminRows = []
                            adminError = error.localizedDescription
                            protectedCache.writeAdminSession(nil)
                        }
                        adminBusy = false
                        adminTrafficLoading = false
                        adminViewsLoading = false
                    }
                },
                onLogout: {
                    Task {
                        await NativeProtectedAPI.signOut(session: adminSession)
                        adminSession = nil
                        adminAccess = nil
                        adminOverview = nil
                        adminTrafficRows = []
                        adminTrafficError = nil
                        adminViewsRows = []
                        adminViewsError = nil
                        playerLiveAdminRows = []
                        adminError = nil
                        protectedCache.writeAdminSession(nil)
                    }
                },
                onRefreshAccess: { toolsRefreshToken = UUID() },
                onRefreshLiveBundle: { toolsRefreshToken = UUID() },
                onSavePlayerAccount: { accountId, email, firstName, lastName, birthDate in
                    if let liveRow = playerLiveAdminRows.first(where: { $0.userId == accountId }),
                       let adminSession {
                        let saved = try await NativeProtectedAPI.pushAdminPlayerProfile(
                            session: adminSession,
                            userId: accountId,
                            firstName: firstName,
                            lastName: lastName,
                            birthDate: birthDate,
                            canonicalPlayerId: liveRow.canonicalPlayerId,
                            canonicalPlayerName: buildNativeRuntimeCanonicalName(firstNameRaw: firstName, lastNameRaw: lastName)
                        )
                        playerLiveAdminRows = try await NativeProtectedAPI.pullAdminPlayerAccounts(session: adminSession)
                        if playerLiveSession?.userId == accountId {
                            playerLiveProfile = saved
                        }
                        playerLiveToken = UUID()
                        return "Live player account updated from Admin."
                    }

                    _ = try playerStore.updateAdminAccount(
                        accountId: accountId,
                        email: email,
                        firstName: firstName,
                        lastName: lastName,
                        birthDate: birthDate
                    )
                    playerPreviewToken = UUID()
                    return "Preview player account updated from Admin."
                }
            )

        case .refereesArea:
            RefereesToolsScreenView(
                liveTournament: model.catalog.liveTournament,
                authedTournamentId: refereesAuthedTournamentId.isEmpty ? nil : refereesAuthedTournamentId,
                busy: refereesBusy,
                error: refereesError,
                liveBundle: toolsLiveBundle,
                liveBundleLoading: toolsLiveBundleLoading,
                liveBundleError: toolsLiveBundleError,
                onVerifyPassword: { password in
                    guard let liveTournament = model.catalog.liveTournament else {
                        refereesError = "No live tournament is active."
                        return
                    }
                    Task {
                        refereesBusy = true
                        refereesError = nil
                        do {
                            let result = try await NativeProtectedAPI.verifyRefereePassword(tournamentId: liveTournament.id, refereePassword: password)
                            if result.ok {
                                refereesAuthedTournamentId = liveTournament.id
                                do {
                                    let pull = try await NativeProtectedAPI.pullRefereeLiveState(
                                        tournamentId: liveTournament.id,
                                        refereePassword: password
                                    )
                                    if pull.ok {
                                        refreshToken = UUID()
                                        detailRefreshToken = UUID()
                                        toolsRefreshToken = UUID()
                                    }
                                } catch {
                                    if !isMissingNativeRefereePullRPC(error) {
                                        // Keep native referee access usable even before the additive
                                        // rollout is enabled on the real Supabase project.
                                    }
                                }
                            } else {
                                refereesError = result.reason ?? "Password errata."
                            }
                        } catch {
                            refereesError = error.localizedDescription
                        }
                        refereesBusy = false
                    }
                },
                onLogout: {
                    refereesAuthedTournamentId = ""
                    refereesError = nil
                },
                onRefreshLiveBundle: { toolsRefreshToken = UUID() }
            )
        }
    }

    private var detailTaskKey: String {
        "\(publicState.selectedTournament?.id ?? "none")|\(detailRefreshToken.uuidString)"
    }

    private var adminTaskKey: String {
        "\(selectedRoute.rawValue)|\(adminSession?.accessToken ?? "none")|\(toolsRefreshToken.uuidString)"
    }

    private var refereesTaskKey: String {
        "\(selectedRoute.rawValue)|\(model.catalog.liveTournament?.id ?? "none")|\(toolsRefreshToken.uuidString)"
    }

    private var playerBypassTaskKey: String {
        "\(selectedRoute.rawValue)|\(model.catalog.liveTournament?.id ?? "none")|\(playerSnapshot.liveStatus.refereeBypassEligible)|\(playerSnapshot.profile?.canonicalPlayerName ?? "none")|\(playerPreviewToken.uuidString)"
    }

    private var playerLiveTaskKey: String {
        "\(playerPreviewToken.uuidString)|\(playerLiveToken.uuidString)"
    }

    private func writePublicState(_ next: PublicRouteState) {
        storedPublicRouteId = next.route.rawValue
        storedTournamentId = next.selectedTournament?.id ?? ""
        storedTournamentIsLive = next.selectedTournament?.isLive ?? false
        selectedToolsRouteId = ""
        storedTvModeRaw = ""
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
