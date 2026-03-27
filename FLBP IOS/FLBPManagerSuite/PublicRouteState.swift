import Foundation

struct TournamentSelectionRef: Equatable {
    let id: String
    let isLive: Bool

    static func fromSaved(id: String, isLive: Bool) -> TournamentSelectionRef? {
        let normalized = id.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty ? nil : TournamentSelectionRef(id: normalized, isLive: isLive)
    }
}

struct PublicRouteState: Equatable {
    let route: NativeRoute
    let selectedTournament: TournamentSelectionRef?

    init(route: NativeRoute = .home, selectedTournament: TournamentSelectionRef? = nil) {
        precondition(route.group == .publicPrimary || route == .tournamentDetail, "PublicRouteState accepts only public routes.")
        self.route = route
        self.selectedTournament = selectedTournament
    }

    var resolvedRoute: NativeRoute {
        if route == .tournamentDetail && selectedTournament == nil {
            return .tournament
        }
        return route
    }

    func navigateToPrimary(_ route: NativeRoute) -> PublicRouteState {
        precondition(route.group == .publicPrimary, "navigateToPrimary accepts only public primary routes.")
        return PublicRouteState(route: route, selectedTournament: selectedTournament)
    }

    func openTournamentDetailOrFallback() -> PublicRouteState {
        if selectedTournament == nil {
            return PublicRouteState(route: .tournament, selectedTournament: nil)
        }
        return PublicRouteState(route: .tournamentDetail, selectedTournament: selectedTournament)
    }

    func withTournamentSelection(_ selection: TournamentSelectionRef?) -> PublicRouteState {
        let nextRoute: NativeRoute = (selection == nil && route == .tournamentDetail) ? .tournament : route
        return PublicRouteState(route: nextRoute, selectedTournament: selection)
    }
}
