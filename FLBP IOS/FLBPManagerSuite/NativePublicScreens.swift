import SwiftUI

func visibleTeamCount(_ bundle: NativeTournamentBundle) -> Int {
    bundle.teams.filter { team in
        let label = team.name.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return label != "BYE" && label != "TBD" && label != "SLOT LIBERO"
    }.count
}

func visiblePublicMatches(_ bundle: NativeTournamentBundle) -> [NativeMatchInfo] {
    bundle.matches.filter { match in
        !match.hidden && !match.isBye && !isByeLabel(bundle.teamName(for: match.teamAId)) && !isByeLabel(bundle.teamName(for: match.teamBId))
    }
}

private func isByeLabel(_ name: String) -> Bool {
    name.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == "BYE"
}

private func isPlaceholderLabel(_ name: String) -> Bool {
    let normalized = name.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    return normalized == "BYE" || normalized == "TBD" || normalized == "SLOT LIBERO" || normalized.hasPrefix("TBD-")
}

func hasValidParticipants(_ bundle: NativeTournamentBundle, _ match: NativeMatchInfo) -> Bool {
    !isPlaceholderLabel(bundle.teamName(for: match.teamAId)) && !isPlaceholderLabel(bundle.teamName(for: match.teamBId))
}

func computeGroupStandings(bundle: NativeTournamentBundle, group: NativeGroupInfo) -> [GroupStandingRow] {
    var rows = Dictionary(uniqueKeysWithValues: group.teamIds.map { teamId in
        (teamId, GroupStandingRow(
            id: teamId,
            teamName: bundle.teams.first(where: { $0.id == teamId })?.name ?? teamId,
            played: 0,
            wins: 0,
            losses: 0,
            cupsFor: 0,
            cupsAgainst: 0,
            cupsDiff: 0,
            soffiFor: 0,
            soffiAgainst: 0,
            soffiDiff: 0
        ))
    })

    let statsByMatchAndTeam = Dictionary(grouping: bundle.stats, by: { $0.matchId }).mapValues { items in
        Dictionary(grouping: items, by: { $0.teamId })
    }

    for match in visiblePublicMatches(bundle).filter({ $0.groupName == group.name && ($0.played || $0.status == "finished") }) {
        guard let teamAId = match.teamAId, let teamBId = match.teamBId,
              var rowA = rows[teamAId], var rowB = rows[teamBId] else { continue }

        let soffiA = statsByMatchAndTeam[match.id]?[teamAId]?.reduce(0, { $0 + $1.soffi }) ?? 0
        let soffiB = statsByMatchAndTeam[match.id]?[teamBId]?.reduce(0, { $0 + $1.soffi }) ?? 0

        rowA = GroupStandingRow(id: rowA.id, teamName: rowA.teamName, played: rowA.played + 1, wins: rowA.wins, losses: rowA.losses, cupsFor: rowA.cupsFor + match.scoreA, cupsAgainst: rowA.cupsAgainst + match.scoreB, cupsDiff: 0, soffiFor: rowA.soffiFor + soffiA, soffiAgainst: rowA.soffiAgainst + soffiB, soffiDiff: 0)
        rowB = GroupStandingRow(id: rowB.id, teamName: rowB.teamName, played: rowB.played + 1, wins: rowB.wins, losses: rowB.losses, cupsFor: rowB.cupsFor + match.scoreB, cupsAgainst: rowB.cupsAgainst + match.scoreA, cupsDiff: 0, soffiFor: rowB.soffiFor + soffiB, soffiAgainst: rowB.soffiAgainst + soffiA, soffiDiff: 0)

        if match.scoreA > match.scoreB {
            rowA = GroupStandingRow(id: rowA.id, teamName: rowA.teamName, played: rowA.played, wins: rowA.wins + 1, losses: rowA.losses, cupsFor: rowA.cupsFor, cupsAgainst: rowA.cupsAgainst, cupsDiff: 0, soffiFor: rowA.soffiFor, soffiAgainst: rowA.soffiAgainst, soffiDiff: 0)
            rowB = GroupStandingRow(id: rowB.id, teamName: rowB.teamName, played: rowB.played, wins: rowB.wins, losses: rowB.losses + 1, cupsFor: rowB.cupsFor, cupsAgainst: rowB.cupsAgainst, cupsDiff: 0, soffiFor: rowB.soffiFor, soffiAgainst: rowB.soffiAgainst, soffiDiff: 0)
        } else if match.scoreB > match.scoreA {
            rowB = GroupStandingRow(id: rowB.id, teamName: rowB.teamName, played: rowB.played, wins: rowB.wins + 1, losses: rowB.losses, cupsFor: rowB.cupsFor, cupsAgainst: rowB.cupsAgainst, cupsDiff: 0, soffiFor: rowB.soffiFor, soffiAgainst: rowB.soffiAgainst, soffiDiff: 0)
            rowA = GroupStandingRow(id: rowA.id, teamName: rowA.teamName, played: rowA.played, wins: rowA.wins, losses: rowA.losses + 1, cupsFor: rowA.cupsFor, cupsAgainst: rowA.cupsAgainst, cupsDiff: 0, soffiFor: rowA.soffiFor, soffiAgainst: rowA.soffiAgainst, soffiDiff: 0)
        }

        rows[teamAId] = rowA
        rows[teamBId] = rowB
    }

    return rows.values.map { row in
        GroupStandingRow(id: row.id, teamName: row.teamName, played: row.played, wins: row.wins, losses: row.losses, cupsFor: row.cupsFor, cupsAgainst: row.cupsAgainst, cupsDiff: row.cupsFor - row.cupsAgainst, soffiFor: row.soffiFor, soffiAgainst: row.soffiAgainst, soffiDiff: row.soffiFor - row.soffiAgainst)
    }
    .sorted {
        if $0.wins != $1.wins { return $0.wins > $1.wins }
        if $0.cupsDiff != $1.cupsDiff { return $0.cupsDiff > $1.cupsDiff }
        if $0.soffiDiff != $1.soffiDiff { return $0.soffiDiff > $1.soffiDiff }
        if $0.cupsFor != $1.cupsFor { return $0.cupsFor > $1.cupsFor }
        return $0.teamName.localizedCaseInsensitiveCompare($1.teamName) == .orderedAscending
    }
}

func buildTournamentLeaderboard(bundle: NativeTournamentBundle) -> [TournamentPlayerRow] {
    struct MutablePlayer {
        var name: String
        var teamName: String
        var gamesPlayed = 0
        var wins = 0
        var losses = 0
        var points = 0
        var soffi = 0
    }

    var players: [String: MutablePlayer] = [:]
    for team in bundle.teams {
        for playerName in [team.player1, team.player2].compactMap({ $0 }).filter({ !$0.isEmpty }) {
            let key = "\(playerName.lowercased())|\(team.name.lowercased())"
            if players[key] == nil {
                players[key] = MutablePlayer(name: playerName, teamName: team.name)
            }
        }
    }

    let statsByMatch = Dictionary(grouping: bundle.stats, by: { $0.matchId })
    for match in visiblePublicMatches(bundle).filter({ $0.played || $0.status == "finished" }) {
        let winnerId: String? = match.scoreA > match.scoreB ? match.teamAId : (match.scoreB > match.scoreA ? match.teamBId : nil)
        for stat in statsByMatch[match.id] ?? [] {
            let teamName = bundle.teamName(for: stat.teamId)
            if isPlaceholderLabel(teamName) { continue }
            let key = "\(stat.playerName.lowercased())|\(teamName.lowercased())"
            var player = players[key] ?? MutablePlayer(name: stat.playerName, teamName: teamName)
            player.gamesPlayed += 1
            player.points += stat.canestri
            player.soffi += stat.soffi
            if let winnerId {
                if winnerId == stat.teamId { player.wins += 1 } else { player.losses += 1 }
            }
            players[key] = player
        }
    }

    return players.map { key, value in
        let totalMatches = value.wins + value.losses
        return TournamentPlayerRow(id: key, name: value.name, teamName: value.teamName, gamesPlayed: value.gamesPlayed, wins: value.wins, losses: value.losses, winRate: totalMatches > 0 ? (Double(value.wins) / Double(totalMatches)) * 100.0 : 0, points: value.points, soffi: value.soffi, avgPoints: value.gamesPlayed > 0 ? Double(value.points) / Double(value.gamesPlayed) : 0, avgSoffi: value.gamesPlayed > 0 ? Double(value.soffi) / Double(value.gamesPlayed) : 0)
    }
    .filter { $0.gamesPlayed > 0 || $0.points > 0 || $0.soffi > 0 }
    .sorted {
        if $0.points != $1.points { return $0.points > $1.points }
        if $0.soffi != $1.soffi { return $0.soffi > $1.soffi }
        if $0.gamesPlayed != $1.gamesPlayed { return $0.gamesPlayed > $1.gamesPlayed }
        return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
    }
}

func formatPercentOrNd(_ value: Double, hasValue: Bool) -> String {
    guard hasValue else { return "ND" }
    return String(format: "%.1f%%", value)
}

struct TopBarView: View {
    let selectedRoute: NativeRoute
    let onRouteSelected: (NativeRoute) -> Void
    let onRefresh: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("FLBP Manager Suite")
                        .font(.title2.weight(.black))
                    Text("Native public checkpoint wired to the same Supabase public data as FLBP ONLINE.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Refresh", action: onRefresh)
                    .buttonStyle(.bordered)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(NativeRoute.publicPrimaryRoutes + NativeRoute.toolsRoutes) { route in
                        ChipButton(label: route.label, selected: selectedRoute == route, enabled: true, action: {
                            onRouteSelected(route)
                        })
                    }
                }
                .padding(.horizontal, 1)
            }
        }
    }
}

struct HomeScreenView: View {
    let catalogLoading: Bool
    let catalogError: String?
    let liveTournament: NativeTournamentSummary?
    let historyCount: Int
    let leaderboardCount: Int
    let hallCount: Int
    let onOpenTournaments: () -> Void
    let onOpenLeaderboard: () -> Void
    let onOpenHof: () -> Void
    let onOpenAdmin: () -> Void
    let onOpenReferees: () -> Void
    let onRefresh: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HeroCard(
                    title: "Public home",
                    body: liveTournament == nil
                        ? "No live tournament is currently published. The native home stays empty-safe and falls back to archive, leaderboard and hall of fame."
                        : "\(liveTournament!.name) is currently live."
                )

                if catalogLoading {
                    LoadingCard(message: "Loading public data…")
                } else if let catalogError {
                    ErrorCard(message: catalogError, onRetry: onRefresh)
                } else if let liveTournament {
                    PrimaryActionCard(
                        title: liveTournament.name,
                        subtitle: "\(formatDateLabel(liveTournament.startDate)) • \(formatTournamentType(liveTournament.type)) • LIVE",
                        bodyText: "Open the current tournament detail wired from public_tournaments + public_tournament_* tables.",
                        primaryLabel: "Open tournaments",
                        onPrimary: onOpenTournaments,
                        secondaryLabel: nil,
                        onSecondary: nil
                    )
                } else {
                    PrimaryActionCard(
                        title: "No live event",
                        subtitle: "Same fallback as the web app when liveTournament is nil.",
                        bodyText: "Archive, leaderboard and hall of fame stay available even when the live hero is absent.",
                        primaryLabel: "Open archive",
                        onPrimary: onOpenTournaments,
                        secondaryLabel: nil,
                        onSecondary: nil
                    )
                }

                QuickActionRow(
                    first: ("Archive", "\(historyCount) tournaments", onOpenTournaments),
                    second: ("Leaderboard", "\(leaderboardCount) players", onOpenLeaderboard)
                )
                QuickActionRow(
                    first: ("Hall of Fame", "\(hallCount) entries", onOpenHof),
                    second: ("Admin", "Protected tools placeholder", onOpenAdmin)
                )

                PrimaryActionCard(
                    title: "Referees area",
                    subtitle: "Protected tools route",
                    bodyText: "The web app includes OCR/report flows under Referees Area. This native checkpoint keeps the route but does not invent a mobile migration that is not already present in the native codebase.",
                    primaryLabel: "Open referees route",
                    onPrimary: onOpenReferees,
                    secondaryLabel: nil,
                    onSecondary: nil
                )
            }
            .padding(16)
        }
    }
}

struct TournamentListScreenView: View {
    let catalogLoading: Bool
    let catalogError: String?
    let catalog: NativePublicCatalog
    let currentSelection: TournamentSelectionRef?
    let onRefresh: () -> Void
    let onOpenTournament: (NativeTournamentSummary) -> Void

    @State private var query = ""
    @State private var yearFilter = "all"
    @State private var typeFilter = "all"

    private var years: [String] {
        Array(Set(catalog.history.compactMap { $0.startDate.count >= 4 ? String($0.startDate.prefix(4)) : nil })).sorted().reversed()
    }

    private var filteredHistory: [NativeTournamentSummary] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return catalog.history.filter { tournament in
            let year = tournament.startDate.count >= 4 ? String(tournament.startDate.prefix(4)) : ""
            if yearFilter != "all" && year != yearFilter { return false }
            if typeFilter != "all" && tournament.type != typeFilter { return false }
            if trimmedQuery.isEmpty { return true }
            let haystack = "\(tournament.name) \(year)".lowercased()
            return haystack.contains(trimmedQuery)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HeroCard(
                    title: "Tournament list",
                    body: "This surface mirrors FLBP ONLINE/components/PublicTournaments.tsx and reads the same public_tournaments list from Supabase."
                )

                if catalogLoading {
                    LoadingCard(message: "Loading tournaments…")
                } else if let catalogError {
                    ErrorCard(message: catalogError, onRetry: onRefresh)
                } else {
                    if let liveTournament = catalog.liveTournament {
                        PrimaryActionCard(
                            title: liveTournament.name,
                            subtitle: "\(formatDateLabel(liveTournament.startDate)) • \(formatTournamentType(liveTournament.type)) • LIVE",
                            bodyText: "The live hero is shown only when the public dataset exposes a live tournament, exactly like the web route.",
                            primaryLabel: "Open live detail",
                            onPrimary: { onOpenTournament(liveTournament) },
                            secondaryLabel: nil,
                            onSecondary: nil
                        )
                    }

                    SectionCard(title: "Archive filters") {
                        TextField("Search tournament", text: $query)
                            .textFieldStyle(.roundedBorder)
                        FilterRow(label: "Year", options: ["all"] + years, selected: yearFilter, onSelected: { yearFilter = $0 }, labelFormatter: { $0 == "all" ? "All" : $0 })
                        FilterRow(label: "Format", options: ["all", "elimination", "groups_elimination", "round_robin"], selected: typeFilter, onSelected: { typeFilter = $0 }, labelFormatter: { $0 == "all" ? "All" : formatTournamentType($0) })
                        if let currentSelection {
                            Text("Current selected tournament: \(currentSelection.id)")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if filteredHistory.isEmpty {
                        EmptyStateCard(message: "No tournaments match the current search and filter state.")
                    } else {
                        ForEach(filteredHistory) { tournament in
                            TournamentSummaryCard(tournament: tournament, onOpenTournament: onOpenTournament)
                        }
                    }
                }
            }
            .padding(16)
        }
    }
}

struct TournamentDetailScreenView: View {
    let selection: TournamentSelectionRef?
    let bundle: NativeTournamentBundle?
    let detailLoading: Bool
    let detailError: String?
    let hallOfFame: [NativeHallOfFameEntry]
    let onBack: () -> Void
    let onRefresh: () -> Void

    @State private var section: DetailSection = .overview

    var body: some View {
        Group {
            if detailLoading {
                ScrollView { LoadingCard(message: "Loading tournament detail…").padding(16) }
            } else if let detailError {
                ScrollView { ErrorCard(message: detailError, onRetry: onRefresh).padding(16) }
            } else if let selection, let bundle {
                let tournamentAwards = hallOfFame.filter { $0.tournamentId == bundle.tournament.id }
                let standingsByGroup = bundle.groups.reduce(into: [String: [GroupStandingRow]]()) { result, group in
                    result[group.id] = computeGroupStandings(bundle: bundle, group: group)
                }
                let bracketMatches = visiblePublicMatches(bundle).filter { $0.phase != "groups" }
                let playerRows = buildTournamentLeaderboard(bundle: bundle)

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        PrimaryActionCard(
                            title: bundle.tournament.name,
                            subtitle: "\(formatDateLabel(bundle.tournament.startDate)) • \(formatTournamentType(bundle.tournament.type)) • \(bundle.tournament.status == "live" ? "LIVE" : "ARCHIVE")",
                            bodyText: "Native detail uses the same tournament id + public_tournament_* bundle contract as FLBP ONLINE/components/PublicTournamentDetail.tsx.",
                            primaryLabel: "Back to list",
                            onPrimary: onBack,
                            secondaryLabel: "Refresh",
                            onSecondary: onRefresh
                        )

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(DetailSection.allCases) { candidate in
                            let enabled: Bool
                            switch candidate {
                            case .overview:
                                enabled = true
                            case .groups:
                                enabled = !bundle.groups.isEmpty
                            case .bracket:
                                enabled = !bracketMatches.isEmpty
                            case .scorers:
                                enabled = !playerRows.isEmpty
                            }
                            ChipButton(label: candidate.label, selected: section == candidate, enabled: enabled) {
                                if enabled { section = candidate }
                            }
                                }
                            }
                            .padding(.horizontal, 1)
                        }

                        switch section {
                        case .overview:
                            tournamentOverview(bundle: bundle, tournamentAwards: tournamentAwards)
                        case .groups:
                            tournamentGroups(bundle: bundle, standingsByGroup: standingsByGroup)
                        case .bracket:
                            tournamentBracket(bundle: bundle, bracketMatches: bracketMatches)
                        case .scorers:
                            tournamentScorers(playerRows: playerRows)
                        }
                    }
                    .padding(16)
                }
                .onChange(of: selection.id) { _ in
                    section = .overview
                }
            } else if let selection {
                ScrollView { EmptyStateCard(message: "No tournament bundle is available for \(selection.id).").padding(16) }
            } else {
                ScrollView { EmptyStateCard(message: "No tournament has been selected. PublicRouteState should resolve this route back to the tournament list.").padding(16) }
            }
        }
    }
}

struct LeaderboardScreenView: View {
    let loading: Bool
    let error: String?
    let entries: [NativeLeaderboardEntry]
    let onRefresh: () -> Void

    @State private var query = ""
    @State private var onlyU25 = false
    @State private var sort: LeaderboardSort = .points

    private var filteredEntries: [NativeLeaderboardEntry] {
        entries
            .filter { !onlyU25 || $0.u25 }
            .filter {
                let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                if trimmedQuery.isEmpty { return true }
                return "\($0.name) \($0.teamName)".lowercased().contains(trimmedQuery)
            }
            .sorted {
                let lhsMetric: Double
                let rhsMetric: Double
                switch sort {
                case .points:
                    lhsMetric = Double($0.points)
                    rhsMetric = Double($1.points)
                case .soffi:
                    lhsMetric = Double($0.soffi)
                    rhsMetric = Double($1.soffi)
                case .games:
                    lhsMetric = Double($0.gamesPlayed)
                    rhsMetric = Double($1.gamesPlayed)
                case .avgPoints:
                    lhsMetric = $0.avgPoints
                    rhsMetric = $1.avgPoints
                case .avgSoffi:
                    lhsMetric = $0.avgSoffi
                    rhsMetric = $1.avgSoffi
                }

                if lhsMetric != rhsMetric { return lhsMetric > rhsMetric }
                if $0.points != $1.points { return $0.points > $1.points }
                if $0.soffi != $1.soffi { return $0.soffi > $1.soffi }
                if $0.gamesPlayed != $1.gamesPlayed { return $0.gamesPlayed > $1.gamesPlayed }
                return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HeroCard(title: "Historic leaderboard", body: "The native screen reads the same aggregated public_career_leaderboard that FLBP ONLINE uses when public DB read is enabled.")

                if loading {
                    LoadingCard(message: "Loading leaderboard…")
                } else if let error {
                    ErrorCard(message: error, onRetry: onRefresh)
                } else {
                    SectionCard(title: "Filters") {
                        TextField("Search player", text: $query)
                            .textFieldStyle(.roundedBorder)
                        FilterRow(label: "Sort", options: LeaderboardSort.allCases.map(\.rawValue), selected: sort.rawValue, onSelected: { raw in
                            sort = LeaderboardSort(rawValue: raw) ?? .points
                        }, labelFormatter: { LeaderboardSort(rawValue: $0)?.label ?? $0 })
                        Toggle("U25 only", isOn: $onlyU25)
                    }

                    if filteredEntries.isEmpty {
                        EmptyStateCard(message: "No leaderboard rows match the current filters.")
                    } else {
                        ForEach(Array(filteredEntries.enumerated()), id: \.element.id) { index, entry in
                            LeaderboardEntryCard(rank: index + 1, entry: entry)
                        }
                    }
                }
            }
            .padding(16)
        }
    }
}

struct HallOfFameScreenView: View {
    let loading: Bool
    let error: String?
    let entries: [NativeHallOfFameEntry]
    let onRefresh: () -> Void

    @State private var query = ""
    @State private var filter: HofFilter = .all

    private var filteredEntries: [NativeHallOfFameEntry] {
        entries.filter { entry in
            let matchesFilter: Bool
            switch filter {
            case .all:
                matchesFilter = true
            case .winner:
                matchesFilter = entry.type == "winner"
            case .mvp:
                matchesFilter = entry.type == "mvp"
            case .topScorer:
                matchesFilter = entry.type == "top_scorer"
            case .defender:
                matchesFilter = entry.type == "defender"
            case .u25:
                matchesFilter = entry.type == "top_scorer_u25" || entry.type == "defender_u25"
            }
            let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if trimmedQuery.isEmpty { return matchesFilter }
            let haystack = "\(entry.tournamentName) \(entry.teamName ?? "") \(entry.playerNames.joined(separator: " ")) \(entry.year)".lowercased()
            return matchesFilter && haystack.contains(trimmedQuery)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HeroCard(title: "Hall of Fame", body: "This screen reads the same public_hall_of_fame_entries source that powers the web history view.")

                if loading {
                    LoadingCard(message: "Loading hall of fame…")
                } else if let error {
                    ErrorCard(message: error, onRetry: onRefresh)
                } else {
                    SectionCard(title: "Filters") {
                        TextField("Search record", text: $query)
                            .textFieldStyle(.roundedBorder)
                        FilterRow(label: "Category", options: HofFilter.allCases.map(\.rawValue), selected: filter.rawValue, onSelected: { raw in
                            filter = HofFilter(rawValue: raw) ?? .all
                        }, labelFormatter: { HofFilter(rawValue: $0)?.label ?? $0 })
                    }

                    if filteredEntries.isEmpty {
                        EmptyStateCard(message: "No hall of fame entries match the current filters.")
                    } else {
                        ForEach(filteredEntries) { entry in
                            AwardCard(entry: entry)
                        }
                    }
                }
            }
            .padding(16)
        }
    }
}

struct ToolsPlaceholderView: View {
    let route: NativeRoute

    var body: some View {
        ScrollView {
            SectionCard(title: route.label) {
                Text(route == .admin
                     ? "Admin remains a protected web-only surface in this checkpoint. The native apps do not invent Supabase Auth/admin tooling that is not already present in the native codebase."
                     : "Referees Area remains out of scope here. OCR/report workflows were explicitly preserved as no-regression rules from the web app.")
                Text("Verified source: \(route.sourcePath) + \(route.note)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding(16)
        }
    }
}

@ViewBuilder
private func tournamentOverview(bundle: NativeTournamentBundle, tournamentAwards: [NativeHallOfFameEntry]) -> some View {
    SectionCard(title: "Overview") {
        MetadataRow(label: "Status", value: bundle.tournament.status == "live" ? "Live" : "Archive")
        MetadataRow(label: "Format", value: formatTournamentType(bundle.tournament.type))
        MetadataRow(label: "Teams", value: "\(visibleTeamCount(bundle))")
        MetadataRow(label: "Visible matches", value: "\(visiblePublicMatches(bundle).count)")
        if let advancingPerGroup = bundle.tournament.advancingPerGroup {
            MetadataRow(label: "Advancing per group", value: "\(advancingPerGroup)")
        }
    }

    if !bundle.teams.isEmpty {
        SectionCard(title: "Teams") {
            ForEach(bundle.teams) { team in
                TeamCard(team: team)
            }
        }
    }

    if !tournamentAwards.isEmpty {
        SectionCard(title: "Awards") {
            ForEach(tournamentAwards) { award in
                AwardCard(entry: award)
            }
        }
    }

    let liveAndUpcoming = visiblePublicMatches(bundle).filter { !$0.played && $0.status != "finished" && hasValidParticipants(bundle, $0) }
    if !liveAndUpcoming.isEmpty {
        SectionCard(title: "Upcoming turns") {
            ForEach(Array(liveAndUpcoming.prefix(10))) { match in
                MatchCard(bundle: bundle, match: match)
            }
        }
    }
}

@ViewBuilder
private func tournamentGroups(bundle: NativeTournamentBundle, standingsByGroup: [String: [GroupStandingRow]]) -> some View {
    ForEach(bundle.groups) { group in
        SectionCard(title: group.name.isEmpty ? "Group" : group.name) {
            let standings = standingsByGroup[group.id] ?? []
            if standings.isEmpty {
                Text("No finished group matches are available yet. Teams are still listed below with an empty-safe fallback.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(Array(standings.enumerated()), id: \.element.id) { index, row in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(index + 1). \(row.teamName)")
                            .font(.headline)
                        Text("P \(row.played) • W \(row.wins) • L \(row.losses) • cups \(row.cupsFor)-\(row.cupsAgainst) • soffi \(row.soffiFor)-\(row.soffiAgainst)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemBackground)))
                }
            }

            let groupTeamNames = group.teamIds.compactMap { groupTeamId in
                bundle.teams.first(where: { $0.id == groupTeamId })?.name
            }
            if !groupTeamNames.isEmpty {
                Text("Teams: \(groupTeamNames.joined(separator: " • "))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            let groupMatches = visiblePublicMatches(bundle).filter { $0.groupName == group.name }
            if !groupMatches.isEmpty {
                ForEach(groupMatches) { match in
                    MatchCard(bundle: bundle, match: match)
                }
            }
        }
    }
}

@ViewBuilder
private func tournamentBracket(bundle: NativeTournamentBundle, bracketMatches: [NativeMatchInfo]) -> some View {
    let grouped = Dictionary(grouping: bracketMatches) { match in
        match.roundName ?? match.round.map { "Round \($0)" } ?? match.code ?? "Bracket"
    }
    let orderedKeys = grouped.keys.sorted()

    ForEach(orderedKeys, id: \.self) { key in
        SectionCard(title: key) {
            ForEach((grouped[key] ?? []).sorted(by: { ($0.orderIndex ?? .max) < ($1.orderIndex ?? .max) })) { match in
                MatchCard(bundle: bundle, match: match)
            }
        }
    }
}

@ViewBuilder
private func tournamentScorers(playerRows: [TournamentPlayerRow]) -> some View {
    SectionCard(title: "Scorers") {
        if playerRows.isEmpty {
            Text("No match stats are available in the public dataset.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        } else {
            ForEach(Array(playerRows.enumerated()), id: \.element.id) { index, player in
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(index + 1). \(player.name)")
                        .font(.headline)
                    Text(player.teamName)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("PT \(player.points) • SF \(player.soffi) • GP \(player.gamesPlayed) • AVG \(String(format: "%.1f", player.avgPoints))/\(String(format: "%.1f", player.avgSoffi)) • W% \(formatPercentOrNd(player.winRate, hasValue: player.wins + player.losses > 0))")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemBackground)))
            }
        }
    }
}

struct HeroCard: View {
    let title: String
    let body: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.title2.weight(.black))
            Text(body).font(.body)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 20).fill(Color(.secondarySystemBackground)))
    }
}

struct PrimaryActionCard: View {
    let title: String
    let subtitle: String
    let bodyText: String
    let primaryLabel: String
    let onPrimary: () -> Void
    let secondaryLabel: String?
    let onSecondary: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.title3.weight(.black))
            Text(subtitle).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
            Text(bodyText).font(.body)
            HStack(spacing: 8) {
                Button(primaryLabel, action: onPrimary).buttonStyle(.borderedProminent)
                if let secondaryLabel, let onSecondary {
                    Button(secondaryLabel, action: onSecondary).buttonStyle(.bordered)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 20).fill(Color(.secondarySystemBackground)))
    }
}

struct QuickActionRow: View {
    let first: (String, String, () -> Void)
    let second: (String, String, () -> Void)

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            QuickActionCard(title: first.0, subtitle: first.1, onTap: first.2)
            QuickActionCard(title: second.0, subtitle: second.1, onTap: second.2)
        }
    }
}

struct QuickActionCard: View {
    let title: String
    let subtitle: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Text(subtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 18).fill(Color(.secondarySystemBackground)))
        }
        .buttonStyle(.plain)
    }
}

struct SectionCard<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 20).fill(Color(.secondarySystemBackground)))
    }
}

struct LoadingCard: View {
    let message: String

    var body: some View {
        SectionCard(title: "Loading") {
            HStack(spacing: 12) {
                ProgressView()
                Text(message)
            }
        }
    }
}

struct ErrorCard: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        SectionCard(title: "Error") {
            Text(message)
            Button("Retry", action: onRetry)
                .buttonStyle(.bordered)
        }
    }
}

struct EmptyStateCard: View {
    let message: String

    var body: some View {
        SectionCard(title: "Nothing to show") {
            Text(message)
        }
    }
}

struct TournamentSummaryCard: View {
    let tournament: NativeTournamentSummary
    let onOpenTournament: (NativeTournamentSummary) -> Void

    var body: some View {
        SectionCard(title: tournament.name) {
            Text("\(formatDateLabel(tournament.startDate)) • \(formatTournamentType(tournament.type))")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Text(tournament.isManual
                 ? "Manual archive sheet. Team and award data can exist even when matches are absent."
                 : "Structured public tournament.")
                .font(.body)
            Button("Open detail") {
                onOpenTournament(tournament)
            }
            .buttonStyle(.borderedProminent)
        }
    }
}

struct MetadataRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.footnote)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.body.weight(.bold))
        }
    }
}

struct TeamCard: View {
    let team: NativeTeamInfo

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(team.name)
                .font(.headline)
            Text([team.player1, team.player2].compactMap { $0 }.joined(separator: " • "))
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemBackground)))
    }
}

struct MatchCard: View {
    let bundle: NativeTournamentBundle
    let match: NativeMatchInfo

    var body: some View {
        let scoreLabel = (match.played || match.status == "finished" || match.status == "playing")
            ? "\(match.scoreA) - \(match.scoreB)"
            : "—"
        let title = [match.code, match.roundName, match.groupName].compactMap { $0 }.joined(separator: " • ")

        VStack(alignment: .leading, spacing: 4) {
            Text(title.isEmpty ? "Match" : title)
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            Text("\(bundle.teamName(for: match.teamAId)) vs \(bundle.teamName(for: match.teamBId))")
                .font(.headline)
            Text("Status: \(match.status) • Score: \(scoreLabel)")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemBackground)))
    }
}

struct AwardCard: View {
    let entry: NativeHallOfFameEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(entry.tournamentName)
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            Text("\(entry.year) • \(formatAwardType(entry.type))")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Text(entry.type == "winner" ? (entry.teamName ?? entry.playerNames.joined(separator: " • ")) : entry.playerNames.joined(separator: ", "))
                .font(.headline)
            if let teamName = entry.teamName, entry.type != "winner" {
                Text(teamName)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if let value = entry.value {
                Text("Value: \(value)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemBackground)))
    }
}

struct LeaderboardEntryCard: View {
    let rank: Int
    let entry: NativeLeaderboardEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(rank). \(entry.name)")
                .font(.headline)
            Text(entry.teamName)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("GP \(entry.gamesPlayed) • PT \(entry.points) • SF \(entry.soffi) • AVG \(String(format: "%.1f", entry.avgPoints))/\(String(format: "%.1f", entry.avgSoffi))\(entry.u25 ? " • U25" : "")\(entry.yobLabel.map { " • \($0)" } ?? "")")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemBackground)))
    }
}

struct FilterRow: View {
    let label: String
    let options: [String]
    let selected: String
    let onSelected: (String) -> Void
    var labelFormatter: (String) -> String = { $0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(options, id: \.self) { option in
                        ChipButton(label: labelFormatter(option), selected: selected == option, enabled: true) {
                            onSelected(option)
                        }
                    }
                }
                .padding(.horizontal, 1)
            }
        }
    }
}

struct ChipButton: View {
    let label: String
    let selected: Bool
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(selected ? Color.white : (enabled ? Color.primary : Color.secondary))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Capsule().fill(selected ? Color.accentColor : Color(.systemBackground)))
                .overlay(
                    Capsule()
                        .stroke(enabled ? Color.accentColor.opacity(selected ? 0 : 0.35) : Color.gray.opacity(0.25), lineWidth: 1)
                )
                .opacity(enabled ? 1 : 0.45)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}
