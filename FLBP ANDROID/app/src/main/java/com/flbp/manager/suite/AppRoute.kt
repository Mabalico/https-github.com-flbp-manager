package com.flbp.manager.suite

enum class RouteGroup {
    PUBLIC_PRIMARY,
    PUBLIC_CHILD,
    TOOLS
}

enum class AppRoute(
    val id: String,
    val label: String,
    val sourcePath: String,
    val note: String,
    val group: RouteGroup,
    val directlyNavigable: Boolean
) {
    HOME(
        id = "home",
        label = "Home",
        sourcePath = "App.tsx",
        note = "Public entry surface.",
        group = RouteGroup.PUBLIC_PRIMARY,
        directlyNavigable = true
    ),
    TOURNAMENT(
        id = "tournament",
        label = "Tournament list",
        sourcePath = "App.tsx",
        note = "Public tournaments surface.",
        group = RouteGroup.PUBLIC_PRIMARY,
        directlyNavigable = true
    ),
    LEADERBOARD(
        id = "leaderboard",
        label = "Leaderboard",
        sourcePath = "App.tsx",
        note = "Public ranking surface.",
        group = RouteGroup.PUBLIC_PRIMARY,
        directlyNavigable = true
    ),
    HOF(
        id = "hof",
        label = "Hall of Fame",
        sourcePath = "App.tsx",
        note = "Public historical surface.",
        group = RouteGroup.PUBLIC_PRIMARY,
        directlyNavigable = true
    ),
    TOURNAMENT_DETAIL(
        id = "tournament_detail",
        label = "Tournament detail",
        sourcePath = "App.tsx",
        note = "Child public route reached from the tournament list when a tournament is selected.",
        group = RouteGroup.PUBLIC_CHILD,
        directlyNavigable = false
    ),
    ADMIN(
        id = "admin",
        label = "Admin",
        sourcePath = "App.tsx",
        note = "Protected tools surface.",
        group = RouteGroup.TOOLS,
        directlyNavigable = true
    ),
    REFEREES_AREA(
        id = "referees_area",
        label = "Referees area",
        sourcePath = "App.tsx",
        note = "Protected referees surface.",
        group = RouteGroup.TOOLS,
        directlyNavigable = true
    );

    companion object {
        val publicPrimaryRoutes: List<AppRoute> = values().filter { it.group == RouteGroup.PUBLIC_PRIMARY }
        val publicChildRoutes: List<AppRoute> = values().filter { it.group == RouteGroup.PUBLIC_CHILD }
        val toolsRoutes: List<AppRoute> = values().filter { it.group == RouteGroup.TOOLS }

        fun fromId(id: String): AppRoute = values().firstOrNull { it.id == id } ?: HOME
    }
}
