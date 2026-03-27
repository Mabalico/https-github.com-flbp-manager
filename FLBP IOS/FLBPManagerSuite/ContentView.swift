import SwiftUI

struct ContentView: View {
    @StateObject private var model = NativeAppModel()

    @SceneStorage("flbp.public.route") private var storedPublicRouteId = NativeRoute.home.rawValue
    @SceneStorage("flbp.public.tournament.id") private var storedTournamentId = ""
    @SceneStorage("flbp.public.tournament.live") private var storedTournamentIsLive = false

    @State private var selectedToolsRouteId = ""
    @State private var refreshToken = UUID()
    @State private var detailRefreshToken = UUID()

    private var publicState: PublicRouteState {
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
        NativeRoute(rawValue: selectedToolsRouteId).flatMap { $0.group == .tools ? $0 : nil }
    }

    private var selectedRoute: NativeRoute {
        selectedToolsRoute ?? publicState.resolvedRoute
    }

    var body: some View {
        NavigationView {
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
                        if selectedRoute == .tournamentDetail {
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
            .navigationBarHidden(true)
        }
        .navigationViewStyle(.stack)
        .task(id: refreshToken) {
            await model.refreshAll()
        }
        .task(id: detailTaskKey) {
            await model.loadDetail(for: publicState.selectedTournament)
        }
        .onChange(of: model.catalog) { _ in
            guard let selectedTournament = publicState.selectedTournament else { return }
            if !model.containsTournament(id: selectedTournament.id) {
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

        case .admin, .refereesArea:
            ToolsPlaceholderView(route: selectedRoute)
        }
    }

    private var detailTaskKey: String {
        "\(publicState.selectedTournament?.id ?? "none")|\(detailRefreshToken.uuidString)"
    }

    private func writePublicState(_ next: PublicRouteState) {
        storedPublicRouteId = next.route.rawValue
        storedTournamentId = next.selectedTournament?.id ?? ""
        storedTournamentIsLive = next.selectedTournament?.isLive ?? false
        selectedToolsRouteId = ""
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
