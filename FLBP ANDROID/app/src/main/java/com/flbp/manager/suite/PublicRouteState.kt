package com.flbp.manager.suite

data class TournamentSelectionRef(
    val id: String,
    val isLive: Boolean
) {
    companion object {
        fun fromSaved(id: String, isLive: Boolean): TournamentSelectionRef? {
            val normalized = id.trim()
            return if (normalized.isEmpty()) null else TournamentSelectionRef(id = normalized, isLive = isLive)
        }
    }
}

data class PublicRouteState(
    val route: AppRoute = AppRoute.HOME,
    val selectedTournament: TournamentSelectionRef? = null
) {
    init {
        require(route.group == RouteGroup.PUBLIC_PRIMARY || route == AppRoute.TOURNAMENT_DETAIL) {
            "PublicRouteState accepts only public routes."
        }
    }

    val resolvedRoute: AppRoute
        get() = when {
            route == AppRoute.TOURNAMENT_DETAIL && selectedTournament == null -> AppRoute.TOURNAMENT
            else -> route
        }

    fun navigateToPrimary(route: AppRoute): PublicRouteState {
        require(route.group == RouteGroup.PUBLIC_PRIMARY) {
            "navigateToPrimary accepts only public primary routes."
        }
        return copy(route = route)
    }

    fun openTournamentDetailOrFallback(): PublicRouteState {
        return if (selectedTournament == null) {
            copy(route = AppRoute.TOURNAMENT)
        } else {
            copy(route = AppRoute.TOURNAMENT_DETAIL)
        }
    }

    fun withTournamentSelection(selection: TournamentSelectionRef?): PublicRouteState {
        val nextRoute = if (selection == null && route == AppRoute.TOURNAMENT_DETAIL) {
            AppRoute.TOURNAMENT
        } else {
            route
        }
        return copy(route = nextRoute, selectedTournament = selection)
    }
}
