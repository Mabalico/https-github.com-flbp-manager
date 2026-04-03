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

private func formatBirthIdentityLabel(_ raw: String?) -> String? {
    guard let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
    if trimmed.uppercased() == "ND" { return nil }

    let isoRegex = try! NSRegularExpression(pattern: #"^\d{4}-\d{2}-\d{2}$"#)
    let fullYearRegex = try! NSRegularExpression(pattern: #"^\d{4}$"#)
    let shortYearRegex = try! NSRegularExpression(pattern: #"^\d{2}$"#)
    let range = NSRange(location: 0, length: trimmed.utf16.count)

    if isoRegex.firstMatch(in: trimmed, options: [], range: range) != nil {
        let parts = trimmed.split(separator: "-").map(String.init)
        if parts.count == 3 {
            return "\(parts[2])/\(parts[1])/\(parts[0])"
        }
    }
    if fullYearRegex.firstMatch(in: trimmed, options: [], range: range) != nil {
        return trimmed
    }
    if shortYearRegex.firstMatch(in: trimmed, options: [], range: range) != nil, let parsed = Int(trimmed) {
        let currentYear = Calendar.current.component(.year, from: Date()) % 100
        return String(format: "%04d", parsed <= currentYear ? 2000 + parsed : 1900 + parsed)
    }
    return trimmed
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

func buildTurnsSnapshot(bundle: NativeTournamentBundle) -> NativeTurnsSnapshot {
    let tablesPerTurn = max(bundle.tournament.refTables ?? 8, 1)
    let visibleMatches = visiblePublicMatches(bundle).sorted { ($0.orderIndex ?? .max) < ($1.orderIndex ?? .max) }
    let playedMatches = visibleMatches.filter { $0.played || $0.status == "finished" }
    let upcomingMatches = visibleMatches.filter { !$0.played && $0.status != "finished" }
    let playableUpcoming = upcomingMatches.filter { hasValidParticipants(bundle, $0) }
    let tbdMatches = upcomingMatches.filter { !hasValidParticipants(bundle, $0) }

    let liveChunks = stride(from: 0, to: playableUpcoming.count, by: tablesPerTurn).map { start in
        Array(playableUpcoming[start..<min(start + tablesPerTurn, playableUpcoming.count)])
    }
    let playedChunks = stride(from: 0, to: playedMatches.count, by: tablesPerTurn).map { start in
        Array(playedMatches[start..<min(start + tablesPerTurn, playedMatches.count)])
    }

    let currentChunkIndex = liveChunks.firstIndex { chunk in
        chunk.contains { $0.status == "playing" }
    }

    let activeBlocks = liveChunks.enumerated().map { index, matches in
        let hasLive = matches.contains { $0.status == "playing" }
        let isNext = currentChunkIndex != nil ? index == currentChunkIndex! + 1 : index == 0
        return NativeTurnBlock(
            id: "active-\(index + 1)",
            turnNumber: index + 1,
            statusLabel: hasLive ? "Live" : (isNext ? "Next" : "Upcoming"),
            matches: matches,
            isLive: hasLive,
            isNext: isNext,
            isPlayed: false
        )
    }

    let archivedBlocks = playedChunks.enumerated().map { index, matches in
        NativeTurnBlock(
            id: "played-\(index + 1)",
            turnNumber: index + 1,
            statusLabel: "Played",
            matches: matches,
            isLive: false,
            isNext: false,
            isPlayed: true
        )
    }

    return NativeTurnsSnapshot(
        tablesPerTurn: tablesPerTurn,
        activeBlocks: activeBlocks,
        playedBlocks: archivedBlocks,
        tbdMatches: tbdMatches
    )
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
                    Text("Native public checkpoint wired to the same public workspace snapshot as FLBP ONLINE.")
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
                        bodyText: "Open the current tournament detail derived from the same public workspace snapshot used by FLBP ONLINE.",
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
                    body: "This surface mirrors FLBP ONLINE/components/PublicTournaments.tsx and derives archive/live tournaments from the same public workspace snapshot."
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
    let onEnterTv: (NativeTvProjection) -> Void
    let onBack: () -> Void
    let onRefresh: () -> Void

    @State private var section: DetailSection = .overview
    @State private var turnFilter: TurnFilter = .all
    @State private var selectedMatch: NativeMatchInfo?

    var body: some View {
        Group {
            if detailLoading {
                ScrollView { LoadingCard(message: "Loading tournament detail…").padding(16) }
            } else if let detailError {
                ScrollView { ErrorCard(message: detailError, onRetry: onRefresh).padding(16) }
            } else if let selection, let bundle {
                let tournamentAwards = hallOfFame.filter { $0.tournamentId == bundle.tournament.id }
                let tournamentAliasPool = Array(
                    Set(
                        bundle.teams.flatMap { [$0.player1, $0.player2].compactMap { $0 } } +
                        bundle.stats.map(\.playerName) +
                        tournamentAwards.flatMap(\.playerNames)
                    )
                ).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
                let standingsByGroup = bundle.groups.reduce(into: [String: [GroupStandingRow]]()) { result, group in
                    result[group.id] = computeGroupStandings(bundle: bundle, group: group)
                }
                let bracketMatches = visiblePublicMatches(bundle).filter { $0.phase != "groups" }
                let playerRows = buildTournamentLeaderboard(bundle: bundle)
                let turnsSnapshot = buildTurnsSnapshot(bundle: bundle)
                let hasTurnsContent = !turnsSnapshot.activeBlocks.isEmpty || !turnsSnapshot.playedBlocks.isEmpty || !turnsSnapshot.tbdMatches.isEmpty

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        PrimaryActionCard(
                            title: bundle.tournament.name,
                            subtitle: "\(formatDateLabel(bundle.tournament.startDate)) • \(formatTournamentType(bundle.tournament.type)) • \(bundle.tournament.status == "live" ? "LIVE" : "ARCHIVE")",
                            bodyText: "Native detail derives the selected tournament from the same public workspace snapshot used by FLBP ONLINE/components/PublicTournamentDetail.tsx.",
                            primaryLabel: "Back to list",
                            onPrimary: onBack,
                            secondaryLabel: "Refresh",
                            onSecondary: onRefresh
                        )

                        SectionCard(title: "TV read-only") {
                            Text("The native TV mode uses the same public tournament bundle and keeps all projections read-only.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(NativeTvProjection.allCases) { projection in
                                        let enabled: Bool
                                        switch projection {
                                        case .groups:
                                            enabled = !bundle.groups.isEmpty
                                        case .groupsBracket:
                                            enabled = !bundle.groups.isEmpty || !bracketMatches.isEmpty
                                        case .bracket:
                                            enabled = !bracketMatches.isEmpty
                                        case .scorers:
                                            enabled = !playerRows.isEmpty
                                        }
                                        ChipButton(label: projection.label, selected: false, enabled: enabled) {
                                            if enabled { onEnterTv(projection) }
                                        }
                                    }
                                }
                                .padding(.horizontal, 1)
                            }
                        }

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(DetailSection.allCases) { candidate in
                                    let enabled: Bool
                                    switch candidate {
                                    case .overview:
                                        enabled = true
                                    case .turns:
                                        enabled = hasTurnsContent
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
                            tournamentOverview(bundle: bundle, tournamentAwards: tournamentAwards, aliasPool: tournamentAliasPool)
                        case .turns:
                            tournamentTurns(
                                bundle: bundle,
                                turnsSnapshot: turnsSnapshot,
                                selectedFilter: turnFilter,
                                onFilterSelected: { turnFilter = $0 },
                                onMatchSelected: { selectedMatch = $0 }
                            )
                        case .groups:
                            tournamentGroups(bundle: bundle, standingsByGroup: standingsByGroup)
                        case .bracket:
                            tournamentBracket(bundle: bundle, bracketMatches: bracketMatches)
                        case .scorers:
                            tournamentScorers(playerRows: playerRows, aliasPool: tournamentAliasPool)
                        }
                    }
                    .padding(16)
                }
                .onChange(of: selection.id) { _ in
                    section = .overview
                    turnFilter = .all
                    selectedMatch = nil
                }
                .sheet(item: $selectedMatch) { match in
                    MatchDetailSheet(bundle: bundle, match: match)
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

    private var aliasPool: [String] {
        Array(Set(entries.map(\.name))).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

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
                HeroCard(title: "Historic leaderboard", body: "The native screen derives the historic leaderboard from the same public workspace snapshot used by FLBP ONLINE.")

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
                            LeaderboardEntryCard(rank: index + 1, entry: entry, aliasPool: aliasPool)
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
    @State private var viewMode: HofViewMode = .players

    private var aliasPool: [String] {
        Array(Set(entries.flatMap(\.playerNames))).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    private var titledRows: [NativeTitledHallPlayerRow] {
        buildTitledHallOfFameRows(entries: entries)
    }

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

    private var filteredTitledRows: [NativeTitledHallPlayerRow] {
        titledRows.filter { row in
            let matchesFilter: Bool
            switch filter {
            case .all:
                matchesFilter = row.total > 0 || row.u25Total > 0
            case .winner:
                matchesFilter = row.win > 0
            case .mvp:
                matchesFilter = row.mvp > 0
            case .topScorer:
                matchesFilter = row.ts > 0
            case .defender:
                matchesFilter = row.def > 0
            case .u25:
                matchesFilter = row.u25Total > 0
            }
            let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if trimmedQuery.isEmpty { return matchesFilter }
            return matchesFilter && row.name.lowercased().contains(trimmedQuery)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HeroCard(title: "Hall of Fame", body: "This screen derives Hall of Fame data from the same public workspace snapshot as the web app and also exposes an identity-safe titled-player summary so awards do not split across the same player on mobile.")

                if loading {
                    LoadingCard(message: "Loading hall of fame…")
                } else if let error {
                    ErrorCard(message: error, onRetry: onRefresh)
                } else {
                    SectionCard(title: "Filters") {
                        TextField("Search Hall of Fame", text: $query)
                            .textFieldStyle(.roundedBorder)
                        FilterRow(label: "Category", options: HofFilter.allCases.map(\.rawValue), selected: filter.rawValue, onSelected: { raw in
                            filter = HofFilter(rawValue: raw) ?? .all
                        }, labelFormatter: { HofFilter(rawValue: $0)?.label ?? $0 })
                        FilterRow(label: "View", options: HofViewMode.allCases.map(\.rawValue), selected: viewMode.rawValue, onSelected: { raw in
                            viewMode = HofViewMode(rawValue: raw) ?? .players
                        }, labelFormatter: { HofViewMode(rawValue: $0)?.label ?? $0 })
                    }

                    if viewMode == .players {
                        if filteredTitledRows.isEmpty {
                            EmptyStateCard(message: "No titled players match the current filters.")
                        } else {
                            ForEach(Array(filteredTitledRows.enumerated()), id: \.element.id) { index, row in
                                TitledHallPlayerCard(rank: index + 1, row: row, aliasPool: aliasPool)
                            }
                        }
                    } else {
                        if filteredEntries.isEmpty {
                            EmptyStateCard(message: "No hall of fame entries match the current filters.")
                        } else {
                            ForEach(filteredEntries) { entry in
                                AwardCard(entry: entry, aliasPool: aliasPool)
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
    }
}

struct NativeTVModeScreenView: View {
    let projection: NativeTvProjection
    let selection: TournamentSelectionRef?
    let bundle: NativeTournamentBundle?
    let detailLoading: Bool
    let detailError: String?
    let hallOfFame: [NativeHallOfFameEntry]
    let onProjectionSelected: (NativeTvProjection) -> Void
    let onExit: () -> Void
    let onRefresh: () -> Void

    var body: some View {
        Group {
            if detailLoading {
                ScrollView { LoadingCard(message: "Loading TV projection…").padding(16) }
            } else if let detailError {
                ScrollView { ErrorCard(message: detailError, onRetry: onRefresh).padding(16) }
            } else if let selection, let bundle {
                let tournamentAwards = hallOfFame.filter { $0.tournamentId == bundle.tournament.id }
                let tournamentAliasPool = Array(
                    Set(
                        bundle.teams.flatMap { [$0.player1, $0.player2].compactMap { $0 } } +
                        bundle.stats.map(\.playerName) +
                        tournamentAwards.flatMap(\.playerNames)
                    )
                ).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
                let standingsByGroup = bundle.groups.reduce(into: [String: [GroupStandingRow]]()) { result, group in
                    result[group.id] = computeGroupStandings(bundle: bundle, group: group)
                }
                let bracketMatches = visiblePublicMatches(bundle).filter { $0.phase != "groups" }
                let playerRows = buildTournamentLeaderboard(bundle: bundle)

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionCard(title: "TV mode") {
                            Text(bundle.tournament.name)
                                .font(.title2.weight(.black))
                            Text("\(formatDateLabel(bundle.tournament.startDate)) • \(formatTournamentType(bundle.tournament.type)) • read-only")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(NativeTvProjection.allCases) { candidate in
                                        let enabled: Bool
                                        switch candidate {
                                        case .groups:
                                            enabled = !bundle.groups.isEmpty
                                        case .groupsBracket:
                                            enabled = !bundle.groups.isEmpty || !bracketMatches.isEmpty
                                        case .bracket:
                                            enabled = !bracketMatches.isEmpty
                                        case .scorers:
                                            enabled = !playerRows.isEmpty
                                        }
                                        ChipButton(label: candidate.label, selected: projection == candidate, enabled: enabled) {
                                            if enabled { onProjectionSelected(candidate) }
                                        }
                                    }
                                }
                                .padding(.horizontal, 1)
                            }
                            HStack(spacing: 8) {
                                Button("Refresh", action: onRefresh)
                                    .buttonStyle(.bordered)
                                Button("Exit TV", action: onExit)
                                    .buttonStyle(.bordered)
                            }
                        }

                        switch projection {
                        case .groups:
                            if bundle.groups.isEmpty {
                                EmptyStateCard(message: "No group data is available for this tournament.")
                            } else {
                                tournamentGroups(bundle: bundle, standingsByGroup: standingsByGroup, hideMatchCode: true)
                            }
                        case .groupsBracket:
                            if bundle.groups.isEmpty && bracketMatches.isEmpty {
                                EmptyStateCard(message: "No public TV projection is available for this tournament yet.")
                            } else {
                                if !bundle.groups.isEmpty {
                                    tournamentGroups(bundle: bundle, standingsByGroup: standingsByGroup, hideMatchCode: true)
                                }
                                if !bracketMatches.isEmpty {
                                    tournamentBracket(bundle: bundle, bracketMatches: bracketMatches, hideMatchCode: true)
                                }
                            }
                        case .bracket:
                            if bracketMatches.isEmpty {
                                EmptyStateCard(message: "No bracket projection is available yet.")
                            } else {
                                tournamentBracket(bundle: bundle, bracketMatches: bracketMatches, hideMatchCode: true)
                            }
                        case .scorers:
                            if playerRows.isEmpty {
                                EmptyStateCard(message: "No scorer data is available in the public dataset.")
                            } else {
                                SectionCard(title: "Awards") {
                                    if tournamentAwards.isEmpty {
                                        Text("No tournament awards are currently available in the public dataset.")
                                            .font(.footnote)
                                            .foregroundStyle(.secondary)
                                    } else {
                                        ForEach(tournamentAwards) { award in
                                            AwardCard(entry: award, aliasPool: tournamentAliasPool)
                                        }
                                    }
                                }
                                tournamentScorers(playerRows: playerRows, aliasPool: tournamentAliasPool)
                            }
                        }
                    }
                    .padding(16)
                }
            } else if let selection {
                ScrollView { EmptyStateCard(message: "No tournament bundle is available for \(selection.id).").padding(16) }
            } else {
                ScrollView { EmptyStateCard(message: "TV mode needs a selected tournament. Open a tournament detail first.").padding(16) }
            }
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
private func tournamentOverview(
    bundle: NativeTournamentBundle,
    tournamentAwards: [NativeHallOfFameEntry],
    aliasPool: [String],
    hideMatchCode: Bool = false
) -> some View {
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
                TeamCard(team: team, aliasPool: aliasPool)
            }
        }
    }

    if !tournamentAwards.isEmpty {
        SectionCard(title: "Awards") {
            ForEach(tournamentAwards) { award in
                AwardCard(entry: award, aliasPool: aliasPool)
            }
        }
    }

    let liveAndUpcoming = visiblePublicMatches(bundle).filter { !$0.played && $0.status != "finished" && hasValidParticipants(bundle, $0) }
    if !liveAndUpcoming.isEmpty {
        SectionCard(title: "Upcoming turns") {
            ForEach(Array(liveAndUpcoming.prefix(10))) { match in
                MatchCard(bundle: bundle, match: match, hideCode: hideMatchCode)
            }
        }
    }
}

@ViewBuilder
private func tournamentTurns(
    bundle: NativeTournamentBundle,
    turnsSnapshot: NativeTurnsSnapshot,
    selectedFilter: TurnFilter,
    onFilterSelected: @escaping (TurnFilter) -> Void,
    onMatchSelected: @escaping (NativeMatchInfo) -> Void
) -> some View {
    let activeBlocks: [NativeTurnBlock]
    switch selectedFilter {
    case .all:
        activeBlocks = turnsSnapshot.activeBlocks
    case .live:
        activeBlocks = turnsSnapshot.activeBlocks.filter { $0.isLive }
    case .next:
        activeBlocks = turnsSnapshot.activeBlocks.filter { $0.isNext }
    case .played, .tbd:
        activeBlocks = []
    }

    let playedBlocks = (selectedFilter == .all || selectedFilter == .played) ? turnsSnapshot.playedBlocks : []
    let tbdMatches = (selectedFilter == .all || selectedFilter == .tbd) ? turnsSnapshot.tbdMatches : []
    let counts: [TurnFilter: Int] = [
        .all: turnsSnapshot.activeBlocks.reduce(0) { $0 + $1.matches.count } + turnsSnapshot.playedBlocks.reduce(0) { $0 + $1.matches.count } + turnsSnapshot.tbdMatches.count,
        .live: turnsSnapshot.activeBlocks.filter { $0.isLive }.reduce(0) { $0 + $1.matches.count },
        .next: turnsSnapshot.activeBlocks.filter { $0.isNext }.reduce(0) { $0 + $1.matches.count },
        .played: turnsSnapshot.playedBlocks.reduce(0) { $0 + $1.matches.count },
        .tbd: turnsSnapshot.tbdMatches.count
    ]

    SectionCard(title: "Turns") {
        Text("Matches are grouped into referee turns using the tournament table count, just like the web live detail.")
            .font(.footnote)
            .foregroundStyle(.secondary)
        MetadataRow(label: "Tables per turn", value: "\(turnsSnapshot.tablesPerTurn)")
        FilterRow(
            label: "Filter",
            options: TurnFilter.allCases.map(\.rawValue),
            selected: selectedFilter.rawValue,
            onSelected: { raw in
                onFilterSelected(TurnFilter(rawValue: raw) ?? .all)
            },
            labelFormatter: { raw in
                let filter = TurnFilter(rawValue: raw) ?? .all
                return "\(filter.label) (\(counts[filter] ?? 0))"
            }
        )
    }

    if activeBlocks.isEmpty && playedBlocks.isEmpty && tbdMatches.isEmpty {
        EmptyStateCard(message: "No matches are available for the selected turns filter.")
    }

    ForEach(activeBlocks) { block in
        SectionCard(title: "Turn \(block.turnNumber)") {
            MetadataRow(label: "State", value: block.statusLabel)
            MetadataRow(label: "Matches", value: "\(block.matches.count)/\(turnsSnapshot.tablesPerTurn)")
            ForEach(block.matches) { match in
                MatchCard(bundle: bundle, match: match, onTap: {
                    onMatchSelected(match)
                })
            }
        }
    }

    ForEach(playedBlocks) { block in
        SectionCard(title: "Played turn \(block.turnNumber)") {
            MetadataRow(label: "State", value: block.statusLabel)
            MetadataRow(label: "Matches", value: "\(block.matches.count)/\(turnsSnapshot.tablesPerTurn)")
            ForEach(block.matches) { match in
                MatchCard(bundle: bundle, match: match, onTap: {
                    onMatchSelected(match)
                })
            }
        }
    }

    if !tbdMatches.isEmpty {
        SectionCard(title: "Waiting for TBD") {
            Text("These matches are published but do not have valid participants yet, so they are not part of a playable turn.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            ForEach(tbdMatches) { match in
                MatchCard(bundle: bundle, match: match, onTap: {
                    onMatchSelected(match)
                })
            }
        }
    }
}

@ViewBuilder
private func tournamentGroups(
    bundle: NativeTournamentBundle,
    standingsByGroup: [String: [GroupStandingRow]],
    hideMatchCode: Bool = false
) -> some View {
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
                    MatchCard(bundle: bundle, match: match, hideCode: hideMatchCode)
                }
            }
        }
    }
}

@ViewBuilder
private func tournamentBracket(
    bundle: NativeTournamentBundle,
    bracketMatches: [NativeMatchInfo],
    hideMatchCode: Bool = false
) -> some View {
    let grouped = Dictionary(grouping: bracketMatches) { match in
        match.roundName ?? match.round.map { "Round \($0)" } ?? (hideMatchCode ? "Bracket" : (match.code ?? "Bracket"))
    }
    let orderedKeys = grouped.keys.sorted()

    ForEach(orderedKeys, id: \.self) { key in
        SectionCard(title: key) {
            ForEach((grouped[key] ?? []).sorted(by: { ($0.orderIndex ?? .max) < ($1.orderIndex ?? .max) })) { match in
                MatchCard(bundle: bundle, match: match, hideCode: hideMatchCode)
            }
        }
    }
}

@ViewBuilder
private func tournamentScorers(playerRows: [TournamentPlayerRow], aliasPool: [String]) -> some View {
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
                    if let aliasNote = buildPossibleAliasNote(referenceNames: [player.name], candidates: aliasPool) {
                        Text(aliasNote)
                            .font(.footnote)
                            .foregroundStyle(.tertiary)
                    }
                    Text("CAN \(player.points) • SF \(player.soffi) • GP \(player.gamesPlayed) • AVG \(String(format: "%.1f", player.avgPoints))/\(String(format: "%.1f", player.avgSoffi)) • W% \(formatPercentOrNd(player.winRate, hasValue: player.wins + player.losses > 0))")
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
    var aliasPool: [String] = []

    var body: some View {
        let aliasNote = buildPossibleAliasNote(referenceNames: [team.player1, team.player2].compactMap { $0 }, candidates: aliasPool)
        VStack(alignment: .leading, spacing: 4) {
            Text(team.name)
                .font(.headline)
            Text([team.player1, team.player2].compactMap { $0 }.joined(separator: " • "))
                .font(.footnote)
                .foregroundStyle(.secondary)
            if let aliasNote {
                Text(aliasNote)
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemBackground)))
    }
}

struct MatchCard: View {
    let bundle: NativeTournamentBundle
    let match: NativeMatchInfo
    var onTap: (() -> Void)? = nil
    var hideCode: Bool = false

    var body: some View {
        let scoreLabel = (match.played || match.status == "finished" || match.status == "playing")
            ? "\(match.scoreA) - \(match.scoreB)"
            : "—"
        let title = [hideCode ? nil : match.code, match.roundName, match.groupName].compactMap { $0 }.joined(separator: " • ")

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
        .contentShape(Rectangle())
        .onTapGesture {
            onTap?()
        }
    }
}

struct MatchDetailSheet: View {
    let bundle: NativeTournamentBundle
    let match: NativeMatchInfo
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                SectionCard(title: "Match detail") {
                    MetadataRow(label: "Teams", value: "\(bundle.teamName(for: match.teamAId)) vs \(bundle.teamName(for: match.teamBId))")
                    MetadataRow(label: "Status", value: match.status)
                    MetadataRow(
                        label: "Score",
                        value: (match.played || match.status == "finished" || match.status == "playing")
                            ? "\(match.scoreA) - \(match.scoreB)"
                            : "—"
                    )
                    if let phase = match.phase, !phase.isEmpty {
                        MetadataRow(label: "Phase", value: phase)
                    }
                    if let groupName = match.groupName, !groupName.isEmpty {
                        MetadataRow(label: "Group", value: groupName)
                    }
                    if let roundName = match.roundName, !roundName.isEmpty {
                        MetadataRow(label: "Round", value: roundName)
                    }
                    if let code = match.code, !code.isEmpty {
                        MetadataRow(label: "Code", value: code)
                    }
                }
                .padding(16)
            }
            .navigationTitle("Match")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
    }
}

struct AwardCard: View {
    let entry: NativeHallOfFameEntry
    var aliasPool: [String] = []

    var body: some View {
        let aliasNote = buildPossibleAliasNote(referenceNames: entry.playerNames, candidates: aliasPool)
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
            if let aliasNote {
                Text(aliasNote)
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
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

struct TitledHallPlayerCard: View {
    let rank: Int
    let row: NativeTitledHallPlayerRow
    var aliasPool: [String] = []

    var body: some View {
        let aliasNote = buildPossibleAliasNote(referenceNames: [row.name], candidates: aliasPool)
        VStack(alignment: .leading, spacing: 4) {
            Text("\(rank). \(row.name)")
                .font(.headline)
            if let aliasNote {
                Text(aliasNote)
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
            }
            Text("TOT \(row.total) • W \(row.win) • MVP \(row.mvp) • TS \(row.ts) • DEF \(row.def)")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if row.u25Total > 0 {
                Text("U25 • TS25 \(row.ts25) • DEF25 \(row.def25)")
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
    var aliasPool: [String] = []

    var body: some View {
        let birthIdentityLabel = formatBirthIdentityLabel(entry.yobLabel)
        let aliasNote = buildPossibleAliasNote(referenceNames: [entry.name], candidates: aliasPool)
        VStack(alignment: .leading, spacing: 4) {
            Text("\(rank). \(entry.name)")
                .font(.headline)
            Text(entry.teamName)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if let aliasNote {
                Text(aliasNote)
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
            }
            Text("GP \(entry.gamesPlayed) • CAN \(entry.points) • SF \(entry.soffi) • AVG \(String(format: "%.1f", entry.avgPoints))/\(String(format: "%.1f", entry.avgSoffi))\(entry.u25 ? " • U25" : "")\(birthIdentityLabel.map { " • \($0)" } ?? "")")
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

struct PlayerAreaScreenView: View {
    let snapshot: NativePlayerAreaSnapshot
    let infoMessage: String?
    let errorMessage: String?
    let onRegister: (String, String, String, String, String) -> Void
    let onSignIn: (String, String) -> Void
    let onSaveProfile: (String, String, String) -> Void
    let onSignOut: () -> Void
    let onAcknowledgeCall: (String) -> Void
    let onClearCall: (String) -> Void
    let onOpenReferees: () -> Void
    let onResetPreviewData: () -> Void

    @State private var username: String
    @State private var password = ""
    @State private var firstName: String
    @State private var lastName: String
    @State private var birthDate: String
    @State private var emailPanelExpanded = true

    private var playerAliasPool: [String] {
        Array(
            Set(
                [
                    snapshot.profile?.canonicalPlayerName,
                    snapshot.results?.canonicalPlayerName
                ].compactMap { $0 } +
                (snapshot.results?.leaderboardRows.map(\.name) ?? []) +
                (snapshot.results?.awards.flatMap(\.playerNames) ?? [])
            )
        ).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    init(
        snapshot: NativePlayerAreaSnapshot,
        infoMessage: String?,
        errorMessage: String?,
        onRegister: @escaping (String, String, String, String, String) -> Void,
        onSignIn: @escaping (String, String) -> Void,
        onSaveProfile: @escaping (String, String, String) -> Void,
        onSignOut: @escaping () -> Void,
        onAcknowledgeCall: @escaping (String) -> Void,
        onClearCall: @escaping (String) -> Void,
        onOpenReferees: @escaping () -> Void,
        onResetPreviewData: @escaping () -> Void
    ) {
        self.snapshot = snapshot
        self.infoMessage = infoMessage
        self.errorMessage = errorMessage
        self.onRegister = onRegister
        self.onSignIn = onSignIn
        self.onSaveProfile = onSaveProfile
        self.onSignOut = onSignOut
        self.onAcknowledgeCall = onAcknowledgeCall
        self.onClearCall = onClearCall
        self.onOpenReferees = onOpenReferees
        self.onResetPreviewData = onResetPreviewData
        _username = State(initialValue: snapshot.session?.username ?? "")
        _firstName = State(initialValue: snapshot.profile?.firstName ?? "")
        _lastName = State(initialValue: snapshot.profile?.lastName ?? "")
        _birthDate = State(initialValue: snapshot.profile?.birthDate ?? "")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HeroCard(
                    title: "Player area",
                    body: "Optional account surface. Tournament participation stays open to everyone, while the linked profile unlocks personal results, live team status and future call alerts."
                )

                if let infoMessage, !infoMessage.isEmpty {
                    SectionCard(title: "Status") {
                        Text(infoMessage)
                    }
                }

                if let errorMessage, !errorMessage.isEmpty {
                    SectionCard(title: "Action blocked") {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }

                if snapshot.session == nil {
                    SectionCard(title: "Register or sign in") {
                        Text("Choose the access method first. Tournament participation stays open to everyone, while the account unlocks the extra player area.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Button("Continue with Facebook") {}
                            .buttonStyle(.bordered)
                            .disabled(true)
                        Button("Continue with Google") {}
                            .buttonStyle(.bordered)
                            .disabled(true)
                        Text("or")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                        Button(emailPanelExpanded ? "Hide email access" : "Continue with email") {
                            emailPanelExpanded.toggle()
                        }
                        .buttonStyle(.borderedProminent)
                        Text("Google/Facebook live auth stays backend-pending. Email/password is already prepared as the primary path.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        if emailPanelExpanded {
                            TextField("Email", text: $username)
                                .textFieldStyle(.roundedBorder)
                            SecureField("Password", text: $password)
                                .textFieldStyle(.roundedBorder)
                            Text("Password recovery will use this email address once live auth plus a real administrator sender email are enabled.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            TextField("First name", text: $firstName)
                                .textFieldStyle(.roundedBorder)
                            TextField("Last name", text: $lastName)
                                .textFieldStyle(.roundedBorder)
                            TextField("Birth date (YYYY-MM-DD)", text: $birthDate)
                                .textFieldStyle(.roundedBorder)
                            Text("Name, surname and birth date are used when creating the player profile linked to the account.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            HStack(spacing: 8) {
                                Button("Sign in") {
                                    onSignIn(username, password)
                                }
                                .buttonStyle(.borderedProminent)
                                Button("Register") {
                                    onRegister(username, password, firstName, lastName, birthDate)
                                }
                                .buttonStyle(.bordered)
                            }
                        }
                    }
                } else {
                    SectionCard(title: "Linked account") {
                        Text(snapshot.session?.username ?? "")
                            .font(.title3.weight(.black))
                        Text("Provider: \(snapshot.session?.provider ?? "preview_password") - Mode: \(snapshot.session?.mode ?? "preview")")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Text("This preview keeps the email locally on device. Real password reset stays backend-pending until SMTP / administrator sender email are configured.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        if let profile = snapshot.profile {
                            MetadataRow(label: "Linked profile", value: formatBirthIdentityLabel(profile.birthDate).map { "\(profile.canonicalPlayerName) - \($0)" } ?? profile.canonicalPlayerName)
                            if let aliasNote = buildPossibleAliasNote(referenceNames: [profile.canonicalPlayerName], candidates: playerAliasPool) {
                                Text(aliasNote)
                                    .font(.footnote)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        Button("Sign out") {
                            onSignOut()
                        }
                        .buttonStyle(.bordered)
                    }
                }

                SectionCard(title: snapshot.profile == nil ? "Complete your profile" : "Player profile") {
                    Text("Name, surname and birth date are used for rankings, U25 eligibility and duplicate-name handling.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    TextField("First name", text: $firstName)
                        .textFieldStyle(.roundedBorder)
                        .disabled(snapshot.session == nil)
                    TextField("Last name", text: $lastName)
                        .textFieldStyle(.roundedBorder)
                        .disabled(snapshot.session == nil)
                    TextField("Birth date (YYYY-MM-DD)", text: $birthDate)
                        .textFieldStyle(.roundedBorder)
                        .disabled(snapshot.session == nil)
                    Button(snapshot.profile == nil ? "Save profile" : "Update profile") {
                        onSaveProfile(firstName, lastName, birthDate)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(snapshot.session == nil)
                }

                SectionCard(title: "Social sign-in rollout") {
                    Text("Google, Facebook and Apple are planned for v1 once the live auth providers are enabled. Instagram stays intentionally out of the first rollout.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(snapshot.featureStatus.socialProvidersPrepared, id: \.self) { provider in
                                ChipButton(label: provider, selected: false, enabled: false) {}
                            }
                        }
                    }
                }

                SectionCard(title: "Your results") {
                    if let results = snapshot.results, !results.leaderboardRows.isEmpty || !results.awards.isEmpty {
                        MetadataRow(label: "Canonical player", value: results.canonicalPlayerName)
                        if let aliasNote = buildPossibleAliasNote(referenceNames: [results.canonicalPlayerName], candidates: playerAliasPool) {
                            Text(aliasNote)
                                .font(.footnote)
                                .foregroundStyle(.tertiary)
                        }
                        MetadataRow(label: "Birth date", value: formatBirthIdentityLabel(results.birthDate) ?? "")
                        MetadataRow(label: "Games", value: "\(results.totalGames)")
                        MetadataRow(label: "Baskets", value: "\(results.totalPoints)")
                        MetadataRow(label: "Soffi", value: "\(results.totalSoffi)")
                        if !results.linkedTeams.isEmpty {
                            MetadataRow(label: "Teams", value: results.linkedTeams.joined(separator: " • "))
                        }
                        if !results.leaderboardRows.isEmpty {
                            Text("Leaderboard rows")
                                .font(.headline)
                            ForEach(results.leaderboardRows) { row in
                                PlayerSectionSubCard(
                                    title: row.teamName,
                                    body: "GP \(row.gamesPlayed) • CAN \(row.points) • SF \(row.soffi) • AVG \(String(format: "%.1f", row.avgPoints))/\(String(format: "%.1f", row.avgSoffi))"
                                )
                            }
                        }
                        if !results.awards.isEmpty {
                            Text("Awards")
                                .font(.headline)
                            ForEach(results.awards) { award in
                                PlayerSectionSubCard(
                                    title: "\(award.year) • \(formatAwardType(award.type))",
                                    body: buildPlayerAwardLine(award)
                                )
                            }
                        }
                    } else {
                        Text("No personal results are available yet for this linked profile.")
                    }
                }

                SectionCard(title: "Live status") {
                    if snapshot.liveStatus.liveTournamentId == nil {
                        Text("No live tournament is currently published.")
                    } else {
                        MetadataRow(label: "Tournament", value: snapshot.liveStatus.liveTournamentName ?? snapshot.liveStatus.liveTournamentId ?? "ND")
                        MetadataRow(label: "Linked team", value: snapshot.liveStatus.linkedTeam?.name ?? "Not linked")
                        MetadataRow(label: "Next match", value: snapshot.liveStatus.nextMatchLabel ?? "No scheduled match found")
                        MetadataRow(label: "Opponent", value: snapshot.liveStatus.nextOpponentLabel ?? "ND")
                        MetadataRow(label: "Next turn", value: snapshot.liveStatus.nextMatchTurn.map(String.init) ?? "ND")
                        MetadataRow(label: "Turns until play", value: snapshot.liveStatus.turnsUntilPlay.map(String.init) ?? "ND")
                        if snapshot.liveStatus.refereeBypassEligible {
                            Text("This linked player is flagged as a live referee and can open the referees area without the tournament password on this device.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            Button("Open referees area") {
                                onOpenReferees()
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                }

                SectionCard(title: "Team call alerts") {
                    if let activeCall = snapshot.liveStatus.activeCall {
                        MetadataRow(label: "Team", value: activeCall.teamName)
                        MetadataRow(label: "State", value: activeCall.status)
                        MetadataRow(label: "Requested", value: formatPlayerTimestampLabel(activeCall.requestedAt))
                        if let acknowledgedAt = activeCall.acknowledgedAt {
                            MetadataRow(label: "Acknowledged", value: formatPlayerTimestampLabel(acknowledgedAt))
                        }
                        if let cancelledAt = activeCall.cancelledAt {
                            MetadataRow(label: "Cancelled", value: formatPlayerTimestampLabel(cancelledAt))
                        }
                        HStack(spacing: 8) {
                            Button("Confirm receipt") {
                                onAcknowledgeCall(activeCall.id)
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(activeCall.status != "ringing")
                            Button("Clear") {
                                onClearCall(activeCall.id)
                            }
                            .buttonStyle(.bordered)
                            .disabled(!(activeCall.status == "ringing" || activeCall.status == "acknowledged"))
                        }
                    } else {
                        Text("No active team call is available. Real push/live alerts remain backend-pending; this screen is already shaped for the final flow.")
                    }
                }

                SectionCard(title: "Activation status") {
                    PlayerStatusRowView(label: "Preview mode", value: snapshot.featureStatus.previewEnabled)
                    PlayerStatusRowView(label: "Remote auth", value: snapshot.featureStatus.remoteAuthPrepared)
                    PlayerStatusRowView(label: "Player profile", value: snapshot.featureStatus.playerProfilesPrepared)
                    PlayerStatusRowView(label: "Live call alerts", value: snapshot.featureStatus.playerCallsPrepared)
                    PlayerStatusRowView(label: "Referee bypass", value: snapshot.featureStatus.refereeBypassPrepared)
                    Button("Reset local preview data") {
                        onResetPreviewData()
                    }
                    .buttonStyle(.bordered)
                }
            }
            .padding(16)
        }
        .onChange(of: snapshot.session?.accountId) { _ in
            username = snapshot.session?.username ?? ""
        }
        .onChange(of: snapshot.profile?.updatedAt) { _ in
            firstName = snapshot.profile?.firstName ?? ""
            lastName = snapshot.profile?.lastName ?? ""
            birthDate = snapshot.profile?.birthDate ?? ""
        }
    }
}

private struct PlayerStatusRowView: View {
    let label: String
    let value: Bool

    var body: some View {
        MetadataRow(label: label, value: value ? "Prepared" : "Pending backend")
    }
}

private struct PlayerSectionSubCard: View {
    let title: String
    let body: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.headline)
            Text(body)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.systemBackground)))
    }
}

private func formatPlayerTimestampLabel(_ value: TimeInterval) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "dd/MM/yyyy HH:mm"
    return formatter.string(from: Date(timeIntervalSince1970: value / 1000))
}

private func buildPlayerAwardLine(_ award: NativeHallOfFameEntry) -> String {
    var parts: [String] = [award.tournamentName]
    if let teamName = award.teamName, !teamName.isEmpty {
        parts.append(teamName)
    }
    if let value = award.value {
        parts.append("value \(value)")
    }
    return parts.joined(separator: " • ")
}
