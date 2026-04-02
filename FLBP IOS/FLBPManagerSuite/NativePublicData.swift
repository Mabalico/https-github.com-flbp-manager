import Foundation

struct NativeTournamentSummary: Identifiable, Equatable, Codable {
    let id: String
    let name: String
    let startDate: String
    let type: String
    let isManual: Bool
    let status: String
    let advancingPerGroup: Int?
    let refTables: Int?
}

struct NativeTeamInfo: Identifiable, Equatable, Codable {
    let id: String
    let name: String
    let player1: String
    let player2: String?
    let player1IsReferee: Bool
    let player2IsReferee: Bool
    let isReferee: Bool

    init(
        id: String,
        name: String,
        player1: String,
        player2: String?,
        player1IsReferee: Bool,
        player2IsReferee: Bool,
        isReferee: Bool
    ) {
        self.id = id
        self.name = name
        self.player1 = player1
        self.player2 = player2
        self.player1IsReferee = player1IsReferee
        self.player2IsReferee = player2IsReferee
        self.isReferee = isReferee
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case name
        case player1
        case player2
        case player1IsReferee
        case player2IsReferee
        case isReferee
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        player1 = try container.decode(String.self, forKey: .player1)
        player2 = try container.decodeIfPresent(String.self, forKey: .player2)
        player1IsReferee = try container.decodeIfPresent(Bool.self, forKey: .player1IsReferee) ?? false
        player2IsReferee = try container.decodeIfPresent(Bool.self, forKey: .player2IsReferee) ?? false
        isReferee = try container.decodeIfPresent(Bool.self, forKey: .isReferee) ?? false
    }
}

struct NativeGroupInfo: Identifiable, Equatable, Hashable, Codable {
    let id: String
    let name: String
    let orderIndex: Int?
    let teamIds: [String]
}

struct NativeMatchStatInfo: Equatable, Codable {
    let matchId: String
    let teamId: String
    let playerName: String
    let canestri: Int
    let soffi: Int
}

struct NativeMatchInfo: Identifiable, Equatable, Codable {
    let id: String
    let code: String?
    let phase: String?
    let groupName: String?
    let round: Int?
    let roundName: String?
    let orderIndex: Int?
    let teamAId: String?
    let teamBId: String?
    let scoreA: Int
    let scoreB: Int
    let played: Bool
    let status: String
    let isBye: Bool
    let hidden: Bool
}

struct NativeTournamentBundle: Equatable, Codable {
    let tournament: NativeTournamentSummary
    let teams: [NativeTeamInfo]
    let groups: [NativeGroupInfo]
    let matches: [NativeMatchInfo]
    let stats: [NativeMatchStatInfo]

    func teamName(for teamId: String?) -> String {
        guard let teamId, !teamId.isEmpty else { return "TBD" }
        return teams.first(where: { $0.id == teamId })?.name ?? teamId
    }
}

struct NativePublicCatalog: Equatable, Codable {
    let liveTournament: NativeTournamentSummary?
    let history: [NativeTournamentSummary]
}

struct NativeLeaderboardEntry: Identifiable, Equatable, Codable {
    let id: String
    let name: String
    let teamName: String
    let gamesPlayed: Int
    let points: Int
    let soffi: Int
    let avgPoints: Double
    let avgSoffi: Double
    let u25: Bool
    let yobLabel: String?
}

struct NativeHallOfFameEntry: Identifiable, Equatable, Codable {
    let id: String
    let year: String
    let tournamentId: String
    let tournamentName: String
    let type: String
    let teamName: String?
    let playerNames: [String]
    let value: Int?
}

struct NativePublicProjectionPayload: Equatable {
    let catalog: NativePublicCatalog
    let leaderboard: [NativeLeaderboardEntry]
    let hallOfFame: [NativeHallOfFameEntry]
}

struct GroupStandingRow: Identifiable, Equatable {
    let id: String
    let teamName: String
    let played: Int
    let wins: Int
    let losses: Int
    let cupsFor: Int
    let cupsAgainst: Int
    let cupsDiff: Int
    let soffiFor: Int
    let soffiAgainst: Int
    let soffiDiff: Int
}

struct TournamentPlayerRow: Identifiable, Equatable {
    let id: String
    let name: String
    let teamName: String
    let gamesPlayed: Int
    let wins: Int
    let losses: Int
    let winRate: Double
    let points: Int
    let soffi: Int
    let avgPoints: Double
    let avgSoffi: Double
}

struct NativeTurnBlock: Identifiable, Equatable {
    let id: String
    let turnNumber: Int
    let statusLabel: String
    let matches: [NativeMatchInfo]
    let isLive: Bool
    let isNext: Bool
    let isPlayed: Bool
}

struct NativeTurnsSnapshot: Equatable {
    let tablesPerTurn: Int
    let activeBlocks: [NativeTurnBlock]
    let playedBlocks: [NativeTurnBlock]
    let tbdMatches: [NativeMatchInfo]
}

struct NativeTitledHallPlayerRow: Identifiable, Equatable {
    let key: String
    let name: String
    let total: Int
    let win: Int
    let mvp: Int
    let ts: Int
    let def: Int
    let ts25: Int
    let def25: Int
    let u25Total: Int

    var id: String { key }
}

enum DetailSection: String, CaseIterable, Identifiable {
    case overview
    case turns
    case groups
    case bracket
    case scorers

    var id: String { rawValue }

    var label: String {
        switch self {
        case .overview: return "Overview"
        case .turns: return "Turns"
        case .groups: return "Groups"
        case .bracket: return "Bracket"
        case .scorers: return "Scorers"
        }
    }
}

enum TurnFilter: String, CaseIterable, Identifiable {
    case all
    case live
    case next
    case played
    case tbd

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All"
        case .live: return "Live"
        case .next: return "Next"
        case .played: return "Played"
        case .tbd: return "TBD"
        }
    }
}

enum NativeTvProjection: String, CaseIterable, Identifiable {
    case groups = "groups"
    case groupsBracket = "groups_bracket"
    case bracket = "bracket"
    case scorers = "scorers"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .groups: return "Groups"
        case .groupsBracket: return "Groups + bracket"
        case .bracket: return "Bracket"
        case .scorers: return "Scorers"
        }
    }
}

enum LeaderboardSort: String, CaseIterable, Identifiable {
    case points
    case soffi
    case games
    case avgPoints
    case avgSoffi

    var id: String { rawValue }

    var label: String {
        switch self {
        case .points: return "Baskets"
        case .soffi: return "Soffi"
        case .games: return "Games"
        case .avgPoints: return "Avg baskets"
        case .avgSoffi: return "Avg soffi"
        }
    }
}

func possibleAliasNames(reference: String, candidates: [String], limit: Int = 3) -> [String] {
    guard let base = parseComparableAliasName(reference) else { return [] }

    return candidates.compactMap { candidate -> ScoredAlias? in
        guard let parsed = parseComparableAliasName(candidate) else { return nil }
        guard let score = aliasSimilarityScore(reference: base, candidate: parsed) else { return nil }
        return ScoredAlias(name: parsed.raw, score: score)
    }
    .sorted {
        if $0.score != $1.score { return $0.score < $1.score }
        return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
    }
    .map(\.name)
    .filter { $0 != base.raw }
    .reduce(into: [String]()) { result, name in
        if !result.contains(name) && result.count < limit {
            result.append(name)
        }
    }
}

func buildPossibleAliasNote(referenceNames: [String], candidates: [String], limitPerName: Int = 3) -> String? {
    let normalizedNames = Array(
        Set(
            referenceNames
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .map { $0.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression) }
                .filter { !$0.isEmpty }
        )
    ).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }

    guard !normalizedNames.isEmpty else { return nil }

    let notes = normalizedNames.compactMap { reference -> String? in
        let matches = possibleAliasNames(reference: reference, candidates: candidates, limit: limitPerName)
        guard !matches.isEmpty else { return nil }
        if normalizedNames.count == 1 {
            return matches.joined(separator: ", ")
        }
        return "\(reference) -> \(matches.joined(separator: ", "))"
    }

    guard !notes.isEmpty else { return nil }
    if normalizedNames.count == 1 {
        return "Possible alias: \(notes[0])"
    }
    return "Possible aliases: \(notes.joined(separator: " • "))"
}

func buildTitledHallOfFameRows(entries: [NativeHallOfFameEntry]) -> [NativeTitledHallPlayerRow] {
    struct MutableHallRow {
        var name: String
        var breakdown: [String: Int] = [:]
    }

    var rows: [String: MutableHallRow] = [:]
    var order: [String] = []

    func addPlayer(_ rawName: String, type: String) {
        let displayName = rawName
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        guard !displayName.isEmpty else { return }
        let key = normalizeAliasComponent(displayName)
        guard !key.isEmpty else { return }
        if rows[key] == nil {
            rows[key] = MutableHallRow(name: displayName)
            order.append(key)
        }
        rows[key]?.breakdown[type, default: 0] += 1
    }

    for entry in entries {
        for playerName in entry.playerNames {
            addPlayer(playerName, type: entry.type)
        }
    }

    return order.compactMap { key -> NativeTitledHallPlayerRow? in
        guard let row = rows[key] else { return nil }
        let win = row.breakdown["winner"] ?? 0
        let mvp = row.breakdown["mvp"] ?? 0
        let ts = row.breakdown["top_scorer"] ?? 0
        let def = row.breakdown["defender"] ?? 0
        let ts25 = row.breakdown["top_scorer_u25"] ?? 0
        let def25 = row.breakdown["defender_u25"] ?? 0
        return NativeTitledHallPlayerRow(
            key: key,
            name: row.name,
            total: win + mvp + ts + def,
            win: win,
            mvp: mvp,
            ts: ts,
            def: def,
            ts25: ts25,
            def25: def25,
            u25Total: ts25 + def25
        )
    }
    .sorted {
        if $0.total != $1.total { return $0.total > $1.total }
        if $0.win != $1.win { return $0.win > $1.win }
        if $0.mvp != $1.mvp { return $0.mvp > $1.mvp }
        if $0.ts != $1.ts { return $0.ts > $1.ts }
        if $0.def != $1.def { return $0.def > $1.def }
        if $0.u25Total != $1.u25Total { return $0.u25Total > $1.u25Total }
        return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
    }
}

private struct ComparableAliasName {
    let raw: String
    let normalized: String
    let surname: String
    let givenNames: String
}

private struct ScoredAlias {
    let name: String
    let score: Int
}

private func parseComparableAliasName(_ raw: String) -> ComparableAliasName? {
    let compact = raw
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    guard !compact.isEmpty else { return nil }
    let normalized = normalizeAliasComponent(compact)
    let tokens = normalized.split(separator: " ").map(String.init)
    guard tokens.count >= 2 else { return nil }
    return ComparableAliasName(
        raw: compact,
        normalized: normalized,
        surname: tokens[0],
        givenNames: tokens.dropFirst().joined(separator: " ")
    )
}

private func normalizeAliasComponent(_ raw: String) -> String {
    let decomposed = raw.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
    return decomposed
        .replacingOccurrences(of: "[^a-z0-9 ]", with: " ", options: .regularExpression)
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
}

private func aliasSimilarityScore(reference: ComparableAliasName, candidate: ComparableAliasName) -> Int? {
    if reference.raw == candidate.raw { return nil }

    if reference.normalized == candidate.normalized {
        return 0
    }

    if reference.surname == candidate.givenNames && reference.givenNames == candidate.surname {
        return 1
    }

    if reference.surname == candidate.surname {
        let distance = levenshteinDistance(reference.givenNames, candidate.givenNames)
        if (1...3).contains(distance) { return 10 + distance }
    }

    if reference.givenNames == candidate.givenNames {
        let distance = levenshteinDistance(reference.surname, candidate.surname)
        if (1...3).contains(distance) { return 20 + distance }
    }

    return nil
}

private func levenshteinDistance(_ left: String, _ right: String) -> Int {
    if left == right { return 0 }
    if left.isEmpty { return right.count }
    if right.isEmpty { return left.count }

    let leftChars = Array(left)
    let rightChars = Array(right)
    var costs = Array(0...rightChars.count)

    for i in 1...leftChars.count {
        var previousDiagonal = costs[0]
        costs[0] = i
        for j in 1...rightChars.count {
            let previousAbove = costs[j]
            let substitutionCost = leftChars[i - 1] == rightChars[j - 1] ? 0 : 1
            costs[j] = min(
                costs[j] + 1,
                costs[j - 1] + 1,
                previousDiagonal + substitutionCost
            )
            previousDiagonal = previousAbove
        }
    }

    return costs[rightChars.count]
}

enum HofFilter: String, CaseIterable, Identifiable {
    case all
    case winner
    case mvp
    case topScorer
    case defender
    case u25

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All"
        case .winner: return "Winners"
        case .mvp: return "MVP"
        case .topScorer: return "Top scorers"
        case .defender: return "Defenders"
        case .u25: return "U25"
        }
    }
}

enum HofViewMode: String, CaseIterable, Identifiable {
    case players
    case records

    var id: String { rawValue }

    var label: String {
        switch self {
        case .players: return "Titled players"
        case .records: return "Records"
        }
    }
}

@MainActor
final class NativeAppModel: ObservableObject {
    private let cache = NativePublicCache()

    @Published var catalogLoading: Bool
    @Published var catalogError: String?
    @Published var catalog: NativePublicCatalog

    @Published var leaderboardLoading: Bool
    @Published var leaderboardError: String?
    @Published var leaderboard: [NativeLeaderboardEntry]

    @Published var hallLoading: Bool
    @Published var hallError: String?
    @Published var hallOfFame: [NativeHallOfFameEntry]

    @Published var detailLoading = false
    @Published var detailError: String?
    @Published var detailBundle: NativeTournamentBundle?

    init() {
        let cachedCatalog = cache.readCatalog()
        let cachedLeaderboard = cache.readLeaderboard()
        let cachedHall = cache.readHallOfFame()

        self.catalog = cachedCatalog ?? NativePublicCatalog(liveTournament: nil, history: [])
        self.catalogLoading = cachedCatalog == nil
        self.catalogError = nil

        self.leaderboard = cachedLeaderboard ?? []
        self.leaderboardLoading = cachedLeaderboard == nil
        self.leaderboardError = nil

        self.hallOfFame = cachedHall ?? []
        self.hallLoading = cachedHall == nil
        self.hallError = nil
    }

    func refreshAll() async {
        let hadCatalogData = catalog.liveTournament != nil || !catalog.history.isEmpty
        let hadLeaderboardData = !leaderboard.isEmpty
        let hadHallData = !hallOfFame.isEmpty

        if !hadCatalogData { catalogLoading = true }
        if !hadLeaderboardData { leaderboardLoading = true }
        if !hadHallData { hallLoading = true }
        catalogError = nil
        leaderboardError = nil
        hallError = nil

        do {
            let payload = try await NativePublicAPI.fetchPublicProjection()
            catalog = payload.catalog
            leaderboard = payload.leaderboard
            hallOfFame = payload.hallOfFame
            cache.writeCatalog(payload.catalog)
            cache.writeLeaderboard(payload.leaderboard)
            cache.writeHallOfFame(payload.hallOfFame)
        } catch {
            if !hadCatalogData {
                catalogError = error.localizedDescription
            }
            if !hadLeaderboardData {
                leaderboardError = error.localizedDescription
            }
            if !hadHallData {
                hallError = error.localizedDescription
            }
        }
        catalogLoading = false
        leaderboardLoading = false
        hallLoading = false
    }

    func loadDetail(for selection: TournamentSelectionRef?) async {
        guard let selection else {
            detailLoading = false
            detailError = nil
            detailBundle = nil
            return
        }

        let cachedBundle = cache.readTournamentBundle(id: selection.id)
        if let cachedBundle {
            detailBundle = cachedBundle
            detailLoading = false
        } else {
            detailLoading = true
        }
        detailError = nil
        do {
            detailBundle = try await NativePublicAPI.fetchTournamentBundle(id: selection.id)
            if detailBundle == nil {
                detailError = "The selected tournament is not available in the public dataset."
            } else if let detailBundle {
                cache.writeTournamentBundle(detailBundle)
            }
        } catch {
            if cachedBundle == nil {
                detailBundle = nil
                detailError = error.localizedDescription
            }
        }
        detailLoading = false
    }

    func containsTournament(id: String) -> Bool {
        if catalog.liveTournament?.id == id { return true }
        return catalog.history.contains(where: { $0.id == id })
    }
}

enum NativePublicAPI {
    private static let supabaseURL = "https://kgwhcemqkgqvtsctnwql.supabase.co"
    private static let anonKey = "sb_publishable_XhZ5hAdoycuWfDMeiQKaGA_7gD6nDhz"
    private static let workspaceId = "default"

    static func fetchPublicProjection() async throws -> NativePublicProjectionPayload {
        let state = try await fetchPublicWorkspaceState()
        return NativePublicProjectionPayload(
            catalog: buildCatalog(from: state),
            leaderboard: buildLeaderboard(from: state),
            hallOfFame: buildHallOfFame(from: state)
        )
    }

    static func fetchCatalog() async throws -> NativePublicCatalog {
        try await fetchPublicProjection().catalog
    }

    static func fetchTournamentBundle(id: String) async throws -> NativeTournamentBundle? {
        let state = try await fetchPublicWorkspaceState()
        return deriveTournamentBundle(from: state, id: id)
    }

    static func fetchCareerLeaderboard() async throws -> [NativeLeaderboardEntry] {
        try await fetchPublicProjection().leaderboard
    }

    static func fetchHallOfFame() async throws -> [NativeHallOfFameEntry] {
        try await fetchPublicProjection().hallOfFame
    }

    private static func fetchPublicWorkspaceState() async throws -> [String: Any] {
        let rows = try await requestArray(
            "public_workspace_state?workspace_id=eq.\(encode(workspaceId))&select=state,updated_at&limit=1"
        )
        guard let row = rows.first else { return [:] }
        return row["state"] as? [String: Any] ?? [:]
    }

    private static func buildCatalog(from state: [String: Any]) -> NativePublicCatalog {
        let liveTournament = (state["tournament"] as? [String: Any]).flatMap { tournament -> NativeTournamentSummary? in
            let id = stringValue(tournament["id"]).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !id.isEmpty else { return nil }
            return parseSnapshotTournamentSummary(tournament)
        }
        let history = ((state["tournamentHistory"] as? [[String: Any]]) ?? [])
            .map(parseSnapshotTournamentSummary)
            .sorted { $0.startDate > $1.startDate }

        return NativePublicCatalog(
            liveTournament: liveTournament,
            history: history
        )
    }

    private static func deriveTournamentBundle(from state: [String: Any], id: String) -> NativeTournamentBundle? {
        let liveTournament = state["tournament"] as? [String: Any]
        let liveId = stringValue(liveTournament?["id"]).trimmingCharacters(in: .whitespacesAndNewlines)

        let selectedTournament: [String: Any]?
        let isLive: Bool
        if !liveId.isEmpty && liveId == id, let liveTournament {
            selectedTournament = liveTournament
            isLive = true
        } else {
            selectedTournament = ((state["tournamentHistory"] as? [[String: Any]]) ?? []).first {
                stringValue($0["id"]).trimmingCharacters(in: .whitespacesAndNewlines) == id
            }
            isLive = false
        }

        guard let selectedTournament else { return nil }

        let teams = ((selectedTournament["teams"] as? [[String: Any]]) ?? []).map { row in
            NativeTeamInfo(
                id: requiredString(row, key: "id"),
                name: stringValue(row["name"]),
                player1: stringValue(row["player1"]),
                player2: optionalString(row["player2"]),
                player1IsReferee: boolValue(row["player1IsReferee"]),
                player2IsReferee: boolValue(row["player2IsReferee"]),
                isReferee: boolValue(row["isReferee"])
            )
        }

        let groups = (((selectedTournament["groups"] as? [[String: Any]]) ?? []).enumerated()).map { index, row in
            let teamIds = ((row["teams"] as? [[String: Any]]) ?? []).compactMap { optionalString($0["id"]) }
            return NativeGroupInfo(
                id: optionalString(row["id"]) ?? "group-\(index + 1)",
                name: stringValue(row["name"]),
                orderIndex: intValue(row["orderIndex"]),
                teamIds: teamIds
            )
        }

        let matchRows = extractTournamentMatches(state: state, tournament: selectedTournament, isLive: isLive)
        let matches = matchRows.map { row in
            NativeMatchInfo(
                id: requiredString(row, key: "id"),
                code: optionalString(row["code"]),
                phase: optionalString(row["phase"]),
                groupName: optionalString(row["groupName"]),
                round: intValue(row["round"]),
                roundName: optionalString(row["roundName"]),
                orderIndex: intValue(row["orderIndex"]),
                teamAId: optionalString(row["teamAId"]),
                teamBId: optionalString(row["teamBId"]),
                scoreA: intValue(row["scoreA"]) ?? 0,
                scoreB: intValue(row["scoreB"]) ?? 0,
                played: boolValue(row["played"]),
                status: optionalString(row["status"]) ?? (boolValue(row["played"]) ? "finished" : "scheduled"),
                isBye: boolValue(row["isBye"]),
                hidden: boolValue(row["hidden"])
            )
        }.sorted { ($0.orderIndex ?? .max) < ($1.orderIndex ?? .max) }

        let stats = extractMatchStats(matchRows: matchRows)

        return NativeTournamentBundle(
            tournament: parseSnapshotTournamentSummary(selectedTournament),
            teams: teams,
            groups: groups,
            matches: matches,
            stats: stats
        )
    }

    private static func buildLeaderboard(from state: [String: Any]) -> [NativeLeaderboardEntry] {
        struct MutablePlayer {
            var id: String
            var name: String
            var teamName: String
            var gamesPlayed = 0
            var wins = 0
            var losses = 0
            var points = 0
            var soffi = 0
        }

        var players: [String: MutablePlayer] = [:]

        func ensurePlayer(name: String, teamName: String) -> MutablePlayer {
            let displayName = name.trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            let resolvedTeamName = teamName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Integrazioni" : teamName
            let key = buildPlayerKey(displayName)
            let current = players[key] ?? MutablePlayer(id: key, name: displayName, teamName: resolvedTeamName)
            return current
        }

        func writePlayer(_ player: MutablePlayer) {
            players[player.id] = player
        }

        func processMatch(_ match: [String: Any], teamsSource: [[String: Any]]) {
            let played = boolValue(match["played"]) || optionalString(match["status"]) == "finished"
            guard played else { return }
            let stats = (match["stats"] as? [[String: Any]]) ?? []
            guard !stats.isEmpty else { return }

            let winningTeamId = getWinningTeamId(match, teamsSource: teamsSource)
            for stat in stats {
                let playerName = stringValue(stat["playerName"]).trimmingCharacters(in: .whitespacesAndNewlines)
                let teamId = stringValue(stat["teamId"]).trimmingCharacters(in: .whitespacesAndNewlines)
                guard !playerName.isEmpty, !teamId.isEmpty else { continue }
                let teamName = lookupTeamName(teamId: teamId, teamsSource: teamsSource)
                if isPlaceholderTeamName(teamName) { continue }

                var player = ensurePlayer(name: playerName, teamName: teamName)
                player.gamesPlayed += 1
                player.points += intValue(stat["canestri"]) ?? 0
                player.soffi += intValue(stat["soffi"]) ?? 0
                if let winningTeamId, isCompetitiveTeamId(teamId, teamsSource: teamsSource) {
                    if winningTeamId == teamId {
                        player.wins += 1
                    } else {
                        player.losses += 1
                    }
                }
                writePlayer(player)
            }
        }

        if let liveTournament = state["tournament"] as? [String: Any] {
            let liveTeams = ((liveTournament["teams"] as? [[String: Any]])?.isEmpty == false)
                ? ((liveTournament["teams"] as? [[String: Any]]) ?? [])
                : ((state["teams"] as? [[String: Any]]) ?? [])
            for match in extractTournamentMatches(state: state, tournament: liveTournament, isLive: true) {
                processMatch(match, teamsSource: liveTeams)
            }
        }

        for tournament in ((state["tournamentHistory"] as? [[String: Any]]) ?? []) {
            let teams = (tournament["teams"] as? [[String: Any]]) ?? []
            for match in extractTournamentMatches(state: state, tournament: tournament, isLive: false) {
                processMatch(match, teamsSource: teams)
            }
        }

        for scorer in ((state["integrationsScorers"] as? [[String: Any]]) ?? []) {
            let playerName = stringValue(scorer["name"]).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !playerName.isEmpty else { continue }
            var player = ensurePlayer(name: playerName, teamName: optionalString(scorer["teamName"]) ?? "Integrazioni")
            player.gamesPlayed += intValue(scorer["games"]) ?? 0
            player.points += intValue(scorer["points"]) ?? 0
            player.soffi += intValue(scorer["soffi"]) ?? 0
            writePlayer(player)
        }

        return players.values.map { player in
            NativeLeaderboardEntry(
                id: player.id,
                name: player.name,
                teamName: player.teamName,
                gamesPlayed: player.gamesPlayed,
                points: player.points,
                soffi: player.soffi,
                avgPoints: player.gamesPlayed > 0 ? Double(player.points) / Double(player.gamesPlayed) : 0,
                avgSoffi: player.gamesPlayed > 0 ? Double(player.soffi) / Double(player.gamesPlayed) : 0,
                u25: false,
                yobLabel: nil
            )
        }
        .sorted {
            if $0.points != $1.points { return $0.points > $1.points }
            if $0.soffi != $1.soffi { return $0.soffi > $1.soffi }
            if $0.gamesPlayed != $1.gamesPlayed { return $0.gamesPlayed > $1.gamesPlayed }
            return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    private static func buildHallOfFame(from state: [String: Any]) -> [NativeHallOfFameEntry] {
        var tournamentDates: [String: String] = [:]
        if let liveTournament = state["tournament"] as? [String: Any] {
            let id = stringValue(liveTournament["id"]).trimmingCharacters(in: .whitespacesAndNewlines)
            let startDate = stringValue(liveTournament["startDate"]).trimmingCharacters(in: .whitespacesAndNewlines)
            if !id.isEmpty, !startDate.isEmpty {
                tournamentDates[id] = startDate
            }
        }
        for tournament in ((state["tournamentHistory"] as? [[String: Any]]) ?? []) {
            let id = stringValue(tournament["id"]).trimmingCharacters(in: .whitespacesAndNewlines)
            let startDate = stringValue(tournament["startDate"]).trimmingCharacters(in: .whitespacesAndNewlines)
            if !id.isEmpty, !startDate.isEmpty {
                tournamentDates[id] = startDate
            }
        }

        let sourceRows = (state["hallOfFame"] as? [[String: Any]]) ?? []
        return sourceRows.sorted {
            let leftValue = hallSortValue(entry: $0, tournamentDates: tournamentDates)
            let rightValue = hallSortValue(entry: $1, tournamentDates: tournamentDates)
            if leftValue != rightValue { return leftValue > rightValue }

            let leftYear = Int(stringValue($0["year"])) ?? 0
            let rightYear = Int(stringValue($1["year"])) ?? 0
            if leftYear != rightYear { return leftYear > rightYear }

            let leftTournament = stringValue($0["tournamentName"])
            let rightTournament = stringValue($1["tournamentName"])
            let byTournament = leftTournament.localizedCaseInsensitiveCompare(rightTournament)
            if byTournament != .orderedSame { return byTournament == .orderedDescending }

            return stringValue($0["id"]).localizedCaseInsensitiveCompare(stringValue($1["id"])) == .orderedDescending
        }.map { row in
            NativeHallOfFameEntry(
                id: requiredString(row, key: "id"),
                year: stringValue(row["year"]),
                tournamentId: stringValue(row["tournamentId"]),
                tournamentName: stringValue(row["tournamentName"]),
                type: stringValue(row["type"]),
                teamName: optionalString(row["teamName"]),
                playerNames: stringArray(row["playerNames"]),
                value: intValue(row["value"])
            )
        }
    }

    private static func parseSnapshotTournamentSummary(_ row: [String: Any]) -> NativeTournamentSummary {
        let config = row["config"] as? [String: Any]
        return NativeTournamentSummary(
            id: requiredString(row, key: "id"),
            name: stringValue(row["name"]),
            startDate: stringValue(row["startDate"]),
            type: stringValue(row["type"]),
            isManual: boolValue(row["isManual"]),
            status: optionalString(row["status"]) ?? "archive",
            advancingPerGroup: intValue(config?["advancingPerGroup"]),
            refTables: intValue(config?["refTables"])
        )
    }

    private static func extractTournamentMatches(state: [String: Any], tournament: [String: Any], isLive: Bool) -> [[String: Any]] {
        let directMatches = (tournament["matches"] as? [[String: Any]]) ?? []
        if !directMatches.isEmpty { return directMatches }
        if isLive {
            let liveMatches = (state["tournamentMatches"] as? [[String: Any]]) ?? []
            if !liveMatches.isEmpty { return liveMatches }
        }
        let rounds = (tournament["rounds"] as? [[[String: Any]]]) ?? []
        return rounds.flatMap { $0 }
    }

    private static func extractMatchStats(matchRows: [[String: Any]]) -> [NativeMatchStatInfo] {
        matchRows.flatMap { match -> [NativeMatchStatInfo] in
            let matchId = stringValue(match["id"]).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !matchId.isEmpty else { return [] }
            return ((match["stats"] as? [[String: Any]]) ?? []).compactMap { stat in
                let teamId = stringValue(stat["teamId"]).trimmingCharacters(in: .whitespacesAndNewlines)
                let playerName = stringValue(stat["playerName"]).trimmingCharacters(in: .whitespacesAndNewlines)
                guard !teamId.isEmpty, !playerName.isEmpty else { return nil }
                return NativeMatchStatInfo(
                    matchId: matchId,
                    teamId: teamId,
                    playerName: playerName,
                    canestri: intValue(stat["canestri"]) ?? 0,
                    soffi: intValue(stat["soffi"]) ?? 0
                )
            }
        }
    }

    private static func buildPlayerKey(_ name: String) -> String {
        let compact = name
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "\\s+", with: "_", options: .regularExpression)
        return "\(compact)_ND"
    }

    private static func isCompetitiveTeamId(_ teamId: String?, teamsSource: [[String: Any]]) -> Bool {
        guard let teamId, !teamId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        let team = teamsSource.first { stringValue($0["id"]).trimmingCharacters(in: .whitespacesAndNewlines) == teamId }
        if boolValue(team?["isBye"]) || boolValue(team?["hidden"]) { return false }
        let label = lookupTeamName(teamId: teamId, teamsSource: teamsSource).trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return label != "BYE" && label != "TBD" && label != "SLOT LIBERO"
    }

    private static func getWinningTeamId(_ match: [String: Any], teamsSource: [[String: Any]]) -> String? {
        if boolValue(match["isBye"]) { return nil }

        if let teamIds = match["teamIds"] as? [String], let scoresByTeam = match["scoresByTeam"] as? [String: Any], !teamIds.isEmpty {
            let competitiveTeamIds = teamIds.filter { isCompetitiveTeamId($0, teamsSource: teamsSource) }
            guard competitiveTeamIds.count >= 2 else { return nil }

            var winningTeamId: String?
            var bestScore = -Double.infinity
            var tie = false

            for teamId in competitiveTeamIds {
                let score = doubleValue(scoresByTeam[teamId]) ?? 0
                if score > bestScore {
                    bestScore = score
                    winningTeamId = teamId
                    tie = false
                } else if score == bestScore {
                    tie = true
                }
            }

            return tie ? nil : winningTeamId
        }

        let teamAId = optionalString(match["teamAId"])
        let teamBId = optionalString(match["teamBId"])
        guard isCompetitiveTeamId(teamAId, teamsSource: teamsSource), isCompetitiveTeamId(teamBId, teamsSource: teamsSource) else { return nil }
        let scoreA = intValue(match["scoreA"]) ?? 0
        let scoreB = intValue(match["scoreB"]) ?? 0
        guard scoreA != scoreB else { return nil }
        return scoreA > scoreB ? teamAId : teamBId
    }

    private static func lookupTeamName(teamId: String, teamsSource: [[String: Any]]) -> String {
        teamsSource.first { stringValue($0["id"]).trimmingCharacters(in: .whitespacesAndNewlines) == teamId }
            .map { stringValue($0["name"]) }
            .flatMap { $0.isEmpty ? nil : $0 }
            ?? teamId
    }

    private static func isPlaceholderTeamName(_ name: String) -> Bool {
        let normalized = name.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return normalized == "BYE" || normalized == "TBD" || normalized == "SLOT LIBERO" || normalized.hasPrefix("TBD-")
    }

    private static func hallSortValue(entry: [String: Any], tournamentDates: [String: String]) -> TimeInterval {
        let tournamentId = stringValue(entry["tournamentId"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let sourceTournamentId = stringValue(entry["sourceTournamentId"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let sourceTournamentDate = stringValue(entry["sourceTournamentDate"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let directDate = tournamentDates[tournamentId]
            ?? tournamentDates[sourceTournamentId]
            ?? (isValidIsoDate(sourceTournamentDate) ? sourceTournamentDate : nil)
            ?? extractIsoDateFromKey(tournamentId)
            ?? extractIsoDateFromKey(sourceTournamentId)
            ?? extractIsoDateFromKey(stringValue(entry["id"]))

        if let directDate, let ts = dateValueFromISO(directDate) {
            return ts
        }

        if let year = Int(stringValue(entry["year"])), year > 0 {
            return dateValueFromISO(String(format: "%04d-01-01", year)) ?? 0
        }
        return 0
    }

    private static func isValidIsoDate(_ value: String) -> Bool {
        value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
    }

    private static func extractIsoDateFromKey(_ value: String?) -> String? {
        let raw = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !raw.isEmpty else { return nil }
        guard let match = raw.range(of: #"(^|_)(\d{4}-\d{2}-\d{2})(_|$)"#, options: .regularExpression) else { return nil }
        let result = String(raw[match])
        let inner = result.replacingOccurrences(of: "_", with: "")
        let dateMatch = inner.range(of: #"\d{4}-\d{2}-\d{2}"#, options: .regularExpression)
        guard let dateMatch else { return nil }
        let iso = String(inner[dateMatch])
        return isValidIsoDate(iso) ? iso : nil
    }

    private static func dateValueFromISO(_ value: String) -> TimeInterval? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: value)?.timeIntervalSince1970 ?? nil
    }

    private static func requestArray(_ path: String) async throws -> [[String: Any]] {
        guard let url = URL(string: "\(supabaseURL)/rest/v1/\(path)") else {
            throw NSError(domain: "FLBP", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid Supabase URL."])
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 5
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "FLBP", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid response from Supabase."])
        }
        guard (200...299).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw NSError(domain: "FLBP", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: message])
        }

        let json = try JSONSerialization.jsonObject(with: data, options: [])
        return json as? [[String: Any]] ?? []
    }

    private static func encode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
    }
}

func formatDateLabel(_ raw: String) -> String {
    guard raw.count >= 10 else { return raw }
    let value = String(raw.prefix(10))
    let parts = value.split(separator: "-")
    guard parts.count == 3 else { return raw }
    return "\(parts[2])/\(parts[1])/\(parts[0])"
}

func formatTournamentType(_ type: String) -> String {
    switch type {
    case "groups_elimination": return "Groups + elimination"
    case "round_robin": return "Round robin"
    default: return "Elimination"
    }
}

func formatAwardType(_ type: String) -> String {
    switch type {
    case "winner": return "Winners"
    case "mvp": return "MVP"
    case "top_scorer": return "Top scorer"
    case "defender": return "Defender"
    case "top_scorer_u25": return "Top scorer U25"
    case "defender_u25": return "Defender U25"
    default: return type
    }
}

private func requiredString(_ row: [String: Any], key: String) -> String {
    let value = stringValue(row[key])
    if value.isEmpty { return key }
    return value
}

private func stringValue(_ value: Any?) -> String {
    if let text = value as? String { return text }
    if let number = value as? NSNumber { return number.stringValue }
    return ""
}

private func optionalString(_ value: Any?) -> String? {
    let text = stringValue(value).trimmingCharacters(in: .whitespacesAndNewlines)
    return text.isEmpty ? nil : text
}

private func intValue(_ value: Any?) -> Int? {
    if let number = value as? Int { return number }
    if let number = value as? NSNumber { return number.intValue }
    if let text = value as? String { return Int(text) }
    return nil
}

private func doubleValue(_ value: Any?) -> Double? {
    if let number = value as? Double { return number }
    if let number = value as? NSNumber { return number.doubleValue }
    if let text = value as? String { return Double(text) }
    return nil
}

private func boolValue(_ value: Any?) -> Bool {
    if let bool = value as? Bool { return bool }
    if let number = value as? NSNumber { return number.boolValue }
    if let text = value as? String { return ["true", "1", "yes"].contains(text.lowercased()) }
    return false
}

private func stringArray(_ value: Any?) -> [String] {
    (value as? [Any])?.compactMap { optionalString($0) } ?? []
}

struct NativePlayerPreviewAccount: Codable, Equatable, Identifiable {
    let id: String
    let username: String
    let password: String
    let createdAt: TimeInterval
    let lastLoginAt: TimeInterval?
}

struct NativePlayerPreviewSession: Codable, Equatable {
    let accountId: String
    let username: String
    let provider: String
    let mode: String
    let createdAt: TimeInterval
    let lastActiveAt: TimeInterval
}

struct NativePlayerAdminAccountRow: Identifiable, Equatable {
    let id: String
    let email: String
    let provider: String
    let origin: String
    let mode: String
    let providers: [String]
    let createdAt: TimeInterval
    let lastLoginAt: TimeInterval?
    let linkedPlayerName: String?
    let birthDate: String?
    let canonicalPlayerName: String?
    let totalTitles: Int
    let totalCanestri: Int
    let totalSoffi: Int
    let hasProfile: Bool
    let hasPasswordRecovery: Bool
}

struct NativePlayerPreviewProfile: Codable, Equatable {
    let accountId: String
    let firstName: String
    let lastName: String
    let birthDate: String
    let canonicalPlayerName: String
    let createdAt: TimeInterval
    let updatedAt: TimeInterval
}

struct NativePlayerPreviewCall: Codable, Equatable, Identifiable {
    let id: String
    let tournamentId: String
    let teamId: String
    let teamName: String
    let targetAccountId: String
    let targetPlayerName: String
    let requestedAt: TimeInterval
    let acknowledgedAt: TimeInterval?
    let cancelledAt: TimeInterval?
    let status: String
    let previewOnly: Bool
}

struct NativePlayerFeatureStatus: Equatable {
    let previewEnabled: Bool
    let remoteAuthPrepared: Bool
    let socialProvidersPrepared: [String]
    let playerProfilesPrepared: Bool
    let playerCallsPrepared: Bool
    let refereeBypassPrepared: Bool
}

struct NativePlayerResultSnapshot: Equatable {
    let canonicalPlayerName: String
    let birthDate: String
    let leaderboardRows: [NativeLeaderboardEntry]
    let awards: [NativeHallOfFameEntry]
    let linkedTeams: [String]
    let totalGames: Int
    let totalPoints: Int
    let totalSoffi: Int
}

struct NativePlayerLiveStatus: Equatable {
    let liveTournamentId: String?
    let liveTournamentName: String?
    let linkedTeam: NativeTeamInfo?
    let nextMatch: NativeMatchInfo?
    let nextMatchLabel: String?
    let nextOpponentLabel: String?
    let nextMatchTurn: Int?
    let turnsUntilPlay: Int?
    let refereeBypassEligible: Bool
    let activeCall: NativePlayerPreviewCall?
}

struct NativePlayerAreaSnapshot: Equatable {
    let session: NativePlayerPreviewSession?
    let profile: NativePlayerPreviewProfile?
    let results: NativePlayerResultSnapshot?
    let liveStatus: NativePlayerLiveStatus
    let featureStatus: NativePlayerFeatureStatus
}

final class NativePlayerPreviewStore {
    private let defaults = UserDefaults.standard

    private enum Keys {
        static let accounts = "flbp.native.player.accounts"
        static let session = "flbp.native.player.session"
        static let profiles = "flbp.native.player.profiles"
        static let calls = "flbp.native.player.calls"
    }

    func readSession() -> NativePlayerPreviewSession? {
        decodeValue(NativePlayerPreviewSession.self, forKey: Keys.session)
    }

    func signOut() {
        defaults.removeObject(forKey: Keys.session)
    }

    @discardableResult
    func registerAccount(username: String, password: String) throws -> NativePlayerPreviewSession {
        let safeUsername = normalizePreviewUsername(username)
        let safePassword = password.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safeUsername.isEmpty else {
            throw previewError("Enter a valid email address.")
        }
        guard !safePassword.isEmpty else {
            throw previewError("Enter a valid password.")
        }

        var accounts = readAccounts()
        if accounts.contains(where: { $0.username == safeUsername }) {
            throw previewError("A preview account already exists with this email.")
        }

        let now = previewNow()
        let account = NativePlayerPreviewAccount(
            id: buildPreviewId(prefix: "preview"),
            username: safeUsername,
            password: safePassword,
            createdAt: now,
            lastLoginAt: now
        )
        let session = NativePlayerPreviewSession(
            accountId: account.id,
            username: account.username,
            provider: "preview_password",
            mode: "preview",
            createdAt: now,
            lastActiveAt: now
        )
        accounts.append(account)
        writeAccounts(accounts)
        writeSession(session)
        return session
    }

    @discardableResult
    func signIn(username: String, password: String) throws -> NativePlayerPreviewSession {
        let safeUsername = normalizePreviewUsername(username)
        let safePassword = password.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safeUsername.isEmpty, !safePassword.isEmpty else {
            throw previewError("Enter email and password.")
        }

        var accounts = readAccounts()
        guard let index = accounts.firstIndex(where: { $0.username == safeUsername && $0.password == safePassword }) else {
            throw previewError("Preview credentials are not valid.")
        }

        let now = previewNow()
        accounts[index] = NativePlayerPreviewAccount(
            id: accounts[index].id,
            username: accounts[index].username,
            password: accounts[index].password,
            createdAt: accounts[index].createdAt,
            lastLoginAt: now
        )
        writeAccounts(accounts)
        let session = NativePlayerPreviewSession(
            accountId: accounts[index].id,
            username: accounts[index].username,
            provider: "preview_password",
            mode: "preview",
            createdAt: accounts[index].createdAt,
            lastActiveAt: now
        )
        writeSession(session)
        return session
    }

    func readProfile(accountId: String?) -> NativePlayerPreviewProfile? {
        guard let accountId = accountId?.trimmingCharacters(in: .whitespacesAndNewlines), !accountId.isEmpty else {
            return nil
        }
        return readProfiles()[accountId]
    }

    @discardableResult
    func saveProfile(session: NativePlayerPreviewSession, firstName: String, lastName: String, birthDate: String) throws -> NativePlayerPreviewProfile {
        let safeFirstName = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let safeLastName = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safeFirstName.isEmpty, !safeLastName.isEmpty else {
            throw previewError("Enter first name and last name.")
        }
        guard let normalizedBirthDate = normalizePreviewBirthDate(birthDate) else {
            throw previewError("Enter a valid birth date in YYYY-MM-DD format.")
        }

        let previous = readProfile(accountId: session.accountId)
        let now = previewNow()
        let profile = NativePlayerPreviewProfile(
            accountId: session.accountId,
            firstName: safeFirstName,
            lastName: safeLastName,
            birthDate: normalizedBirthDate,
            canonicalPlayerName: buildPreviewCanonicalPlayerName(firstName: safeFirstName, lastName: safeLastName),
            createdAt: previous?.createdAt ?? now,
            updatedAt: now
        )
        var profiles = readProfiles()
        profiles[session.accountId] = profile
        writeProfiles(profiles)
        writeSession(
            NativePlayerPreviewSession(
                accountId: session.accountId,
                username: session.username,
                provider: session.provider,
                mode: session.mode,
                createdAt: session.createdAt,
                lastActiveAt: now
            )
        )
        return profile
    }

    func listAdminRows(leaderboard: [NativeLeaderboardEntry], hallOfFame: [NativeHallOfFameEntry]) -> [NativePlayerAdminAccountRow] {
        let profiles = readProfiles()
        return readAccounts()
            .map { account in
                let profile = profiles[account.id]
                let results = profile.map { buildNativePlayerResultSnapshot(profile: $0, leaderboard: leaderboard, hallOfFame: hallOfFame) }
                return NativePlayerAdminAccountRow(
                    id: account.id,
                    email: normalizePreviewUsername(account.username),
                    provider: "preview_password",
                    origin: "in_app",
                    mode: "preview",
                    providers: ["Email/Password"],
                    createdAt: account.createdAt,
                    lastLoginAt: account.lastLoginAt,
                    linkedPlayerName: profile?.canonicalPlayerName,
                    birthDate: profile?.birthDate,
                    canonicalPlayerName: profile?.canonicalPlayerName,
                    totalTitles: results?.awards.count ?? 0,
                    totalCanestri: results?.totalPoints ?? 0,
                    totalSoffi: results?.totalSoffi ?? 0,
                    hasProfile: profile != nil,
                    hasPasswordRecovery: false
                )
            }
            .sorted { lhs, rhs in
                let lhsLogin = lhs.lastLoginAt ?? 0
                let rhsLogin = rhs.lastLoginAt ?? 0
                if lhsLogin != rhsLogin {
                    return lhsLogin > rhsLogin
                }
                return lhs.email.localizedCaseInsensitiveCompare(rhs.email) == .orderedAscending
            }
    }

    @discardableResult
    func updateAdminAccount(
        accountId: String,
        email: String,
        firstName: String,
        lastName: String,
        birthDate: String
    ) throws -> NativePlayerPreviewAccount {
        let safeAccountId = accountId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safeAccountId.isEmpty else {
            throw previewError("Invalid account.")
        }
        let safeEmail = normalizePreviewUsername(email)
        guard !safeEmail.isEmpty else {
            throw previewError("Enter a valid email address.")
        }

        var accounts = readAccounts()
        guard let index = accounts.firstIndex(where: { $0.id == safeAccountId }) else {
            throw previewError("Preview account not found.")
        }
        if accounts.contains(where: { $0.id != safeAccountId && normalizePreviewUsername($0.username) == safeEmail }) {
            throw previewError("A preview account already exists with this email.")
        }

        let existingAccount = accounts[index]
        let updatedAccount = NativePlayerPreviewAccount(
            id: existingAccount.id,
            username: safeEmail,
            password: existingAccount.password,
            createdAt: existingAccount.createdAt,
            lastLoginAt: existingAccount.lastLoginAt
        )
        accounts[index] = updatedAccount
        writeAccounts(accounts)

        let trimmedFirstName = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedLastName = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBirthDate = birthDate.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedFirstName.isEmpty || !trimmedLastName.isEmpty || !trimmedBirthDate.isEmpty {
            guard !trimmedFirstName.isEmpty, !trimmedLastName.isEmpty else {
                throw previewError("Enter first name and last name.")
            }
            guard let normalizedBirthDate = normalizePreviewBirthDate(trimmedBirthDate) else {
                throw previewError("Enter a valid birth date in YYYY-MM-DD format.")
            }

            let existingProfile = readProfile(accountId: safeAccountId)
            let now = previewNow()
            let updatedProfile = NativePlayerPreviewProfile(
                accountId: safeAccountId,
                firstName: trimmedFirstName,
                lastName: trimmedLastName,
                birthDate: normalizedBirthDate,
                canonicalPlayerName: buildPreviewCanonicalPlayerName(firstName: trimmedFirstName, lastName: trimmedLastName),
                createdAt: existingProfile?.createdAt ?? now,
                updatedAt: now
            )
            var profiles = readProfiles()
            profiles[safeAccountId] = updatedProfile
            writeProfiles(profiles)
        }

        if var session = readSession(), session.accountId == safeAccountId {
            session = NativePlayerPreviewSession(
                accountId: session.accountId,
                username: safeEmail,
                provider: session.provider,
                mode: session.mode,
                createdAt: session.createdAt,
                lastActiveAt: previewNow()
            )
            writeSession(session)
        }

        return updatedAccount
    }

    func readActiveCall(accountId: String?, tournamentId: String?) -> NativePlayerPreviewCall? {
        guard let accountId = accountId?.trimmingCharacters(in: .whitespacesAndNewlines), !accountId.isEmpty else {
            return nil
        }
        let safeTournamentId = tournamentId?.trimmingCharacters(in: .whitespacesAndNewlines)
        return readCalls()
            .filter { $0.targetAccountId == accountId }
            .filter { call in
                guard let safeTournamentId, !safeTournamentId.isEmpty else { return true }
                return call.tournamentId == safeTournamentId
            }
            .filter { $0.status == "ringing" || $0.status == "acknowledged" }
            .sorted { $0.requestedAt > $1.requestedAt }
            .first
    }

    @discardableResult
    func acknowledgeCall(session: NativePlayerPreviewSession, callId: String) throws -> NativePlayerPreviewCall {
        let now = previewNow()
        var calls = readCalls()
        guard let index = calls.firstIndex(where: { $0.id == callId && $0.targetAccountId == session.accountId }) else {
            throw previewError("No active call exists for this account.")
        }
        let updated = NativePlayerPreviewCall(
            id: calls[index].id,
            tournamentId: calls[index].tournamentId,
            teamId: calls[index].teamId,
            teamName: calls[index].teamName,
            targetAccountId: calls[index].targetAccountId,
            targetPlayerName: calls[index].targetPlayerName,
            requestedAt: calls[index].requestedAt,
            acknowledgedAt: now,
            cancelledAt: calls[index].cancelledAt,
            status: "acknowledged",
            previewOnly: calls[index].previewOnly
        )
        calls[index] = updated
        writeCalls(calls)
        return updated
    }

    @discardableResult
    func clearCall(session: NativePlayerPreviewSession, callId: String) throws -> NativePlayerPreviewCall {
        let now = previewNow()
        var calls = readCalls()
        guard let index = calls.firstIndex(where: { $0.id == callId && $0.targetAccountId == session.accountId }) else {
            throw previewError("No active call exists for this account.")
        }
        let updated = NativePlayerPreviewCall(
            id: calls[index].id,
            tournamentId: calls[index].tournamentId,
            teamId: calls[index].teamId,
            teamName: calls[index].teamName,
            targetAccountId: calls[index].targetAccountId,
            targetPlayerName: calls[index].targetPlayerName,
            requestedAt: calls[index].requestedAt,
            acknowledgedAt: calls[index].acknowledgedAt,
            cancelledAt: now,
            status: "cancelled",
            previewOnly: calls[index].previewOnly
        )
        calls[index] = updated
        writeCalls(calls)
        return updated
    }

    private func readAccounts() -> [NativePlayerPreviewAccount] {
        decodeValue([NativePlayerPreviewAccount].self, forKey: Keys.accounts) ?? []
    }

    private func writeAccounts(_ accounts: [NativePlayerPreviewAccount]) {
        encodeValue(accounts, forKey: Keys.accounts)
    }

    private func writeSession(_ session: NativePlayerPreviewSession?) {
        if let session {
            encodeValue(session, forKey: Keys.session)
        } else {
            defaults.removeObject(forKey: Keys.session)
        }
    }

    private func readProfiles() -> [String: NativePlayerPreviewProfile] {
        decodeValue([String: NativePlayerPreviewProfile].self, forKey: Keys.profiles) ?? [:]
    }

    private func writeProfiles(_ profiles: [String: NativePlayerPreviewProfile]) {
        encodeValue(profiles, forKey: Keys.profiles)
    }

    private func readCalls() -> [NativePlayerPreviewCall] {
        decodeValue([NativePlayerPreviewCall].self, forKey: Keys.calls) ?? []
    }

    private func writeCalls(_ calls: [NativePlayerPreviewCall]) {
        encodeValue(calls, forKey: Keys.calls)
    }

    private func decodeValue<T: Decodable>(_ type: T.Type, forKey key: String) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func encodeValue<T: Encodable>(_ value: T, forKey key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        defaults.set(data, forKey: key)
    }
}

func buildNativePlayerAreaSnapshot(
    catalog: NativePublicCatalog,
    leaderboard: [NativeLeaderboardEntry],
    hallOfFame: [NativeHallOfFameEntry],
    liveBundle: NativeTournamentBundle?,
    store: NativePlayerPreviewStore
) -> NativePlayerAreaSnapshot {
    let session = store.readSession()
    let profile = store.readProfile(accountId: session?.accountId)
    let results = profile.map { buildNativePlayerResultSnapshot(profile: $0, leaderboard: leaderboard, hallOfFame: hallOfFame) }
    let liveStatus = buildNativePlayerLiveStatus(catalog: catalog, liveBundle: liveBundle, profile: profile, store: store)
    return NativePlayerAreaSnapshot(
        session: session,
        profile: profile,
        results: results,
        liveStatus: liveStatus,
        featureStatus: NativePlayerFeatureStatus(
            previewEnabled: true,
            remoteAuthPrepared: false,
            socialProvidersPrepared: ["Google", "Facebook", "Apple"],
            playerProfilesPrepared: true,
            playerCallsPrepared: false,
            refereeBypassPrepared: true
        )
    )
}

private func buildNativePlayerResultSnapshot(
    profile: NativePlayerPreviewProfile,
    leaderboard: [NativeLeaderboardEntry],
    hallOfFame: [NativeHallOfFameEntry]
) -> NativePlayerResultSnapshot {
    let candidates = buildPreviewPlayerNameCandidates(profile)
    let matchedRows = leaderboard.filter { candidates.contains(normalizePreviewPlayerName($0.name)) }
    let awards = hallOfFame.filter { entry in
        entry.playerNames.contains { candidates.contains(normalizePreviewPlayerName($0)) }
    }
    let linkedTeams = Set(matchedRows.map(\.teamName) + awards.compactMap(\.teamName))
        .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        .sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    return NativePlayerResultSnapshot(
        canonicalPlayerName: profile.canonicalPlayerName,
        birthDate: profile.birthDate,
        leaderboardRows: matchedRows,
        awards: awards,
        linkedTeams: linkedTeams,
        totalGames: matchedRows.reduce(0) { $0 + $1.gamesPlayed },
        totalPoints: matchedRows.reduce(0) { $0 + $1.points },
        totalSoffi: matchedRows.reduce(0) { $0 + $1.soffi }
    )
}

private func buildNativePlayerLiveStatus(
    catalog: NativePublicCatalog,
    liveBundle: NativeTournamentBundle?,
    profile: NativePlayerPreviewProfile?,
    store: NativePlayerPreviewStore
) -> NativePlayerLiveStatus {
    let liveTournament = catalog.liveTournament
    guard let profile, let liveBundle, let liveTournament, liveBundle.tournament.id == liveTournament.id else {
        return NativePlayerLiveStatus(
            liveTournamentId: liveTournament?.id,
            liveTournamentName: liveTournament?.name,
            linkedTeam: nil,
            nextMatch: nil,
            nextMatchLabel: nil,
            nextOpponentLabel: nil,
            nextMatchTurn: nil,
            turnsUntilPlay: nil,
            refereeBypassEligible: false,
            activeCall: store.readActiveCall(accountId: profile?.accountId, tournamentId: liveTournament?.id)
        )
    }

    let candidates = buildPreviewPlayerNameCandidates(profile)
    let linkedTeam = liveBundle.teams.first { team in
        candidates.contains(normalizePreviewPlayerName(team.player1)) ||
            candidates.contains(normalizePreviewPlayerName(team.player2))
    }

    guard let linkedTeam else {
        return NativePlayerLiveStatus(
            liveTournamentId: liveTournament.id,
            liveTournamentName: liveTournament.name,
            linkedTeam: nil,
            nextMatch: nil,
            nextMatchLabel: nil,
            nextOpponentLabel: nil,
            nextMatchTurn: nil,
            turnsUntilPlay: nil,
            refereeBypassEligible: false,
            activeCall: store.readActiveCall(accountId: profile.accountId, tournamentId: liveTournament.id)
        )
    }

    let visibleMatches = visiblePublicMatches(liveBundle)
        .filter { hasValidParticipants(liveBundle, $0) }
        .sorted { ($0.orderIndex ?? .max) < ($1.orderIndex ?? .max) }
    let tablesPerTurn = max(liveBundle.tournament.refTables ?? 8, 1)
    let liveAnchorIndex = visibleMatches.firstIndex(where: { $0.status == "playing" })
    let pendingAnchorIndex = visibleMatches.firstIndex(where: { $0.status != "finished" && !$0.played })
    let anchorIndex = liveAnchorIndex ?? pendingAnchorIndex
    let anchorTurn = anchorIndex.map { ($0 / tablesPerTurn) + 1 }
    let nextMatch = visibleMatches.first { match in
        match.status != "finished" && !match.played && previewMatchContainsTeam(match, teamId: linkedTeam.id)
    }
    let nextIndex = nextMatch.flatMap { match in visibleMatches.firstIndex(where: { $0.id == match.id }) }
    let nextTurn = nextIndex.map { ($0 / tablesPerTurn) + 1 }
    let turnsUntilPlay = nextTurn.map { next in max(0, next - (anchorTurn ?? next)) }
    let opponentLabel: String? = nextMatch.flatMap { match in
        let opponentId: String?
        switch linkedTeam.id {
        case match.teamAId:
            opponentId = match.teamBId
        case match.teamBId:
            opponentId = match.teamAId
        default:
            opponentId = nil
        }
        return liveBundle.teamName(for: opponentId)
    }

    let isPlayer1Referee = candidates.contains(normalizePreviewPlayerName(linkedTeam.player1)) &&
        (linkedTeam.player1IsReferee || (linkedTeam.isReferee && !linkedTeam.player2IsReferee))
    let isPlayer2Referee = candidates.contains(normalizePreviewPlayerName(linkedTeam.player2)) && linkedTeam.player2IsReferee

    return NativePlayerLiveStatus(
        liveTournamentId: liveTournament.id,
        liveTournamentName: liveTournament.name,
        linkedTeam: linkedTeam,
        nextMatch: nextMatch,
        nextMatchLabel: nextMatch.map { buildPreviewMatchLabel(bundle: liveBundle, match: $0) },
        nextOpponentLabel: opponentLabel,
        nextMatchTurn: nextTurn,
        turnsUntilPlay: turnsUntilPlay,
        refereeBypassEligible: isPlayer1Referee || isPlayer2Referee,
        activeCall: store.readActiveCall(accountId: profile.accountId, tournamentId: liveTournament.id)
    )
}

private func previewMatchContainsTeam(_ match: NativeMatchInfo, teamId: String) -> Bool {
    match.teamAId == teamId || match.teamBId == teamId
}

private func buildPreviewMatchLabel(bundle: NativeTournamentBundle, match: NativeMatchInfo) -> String {
    let prefix = [match.code, match.roundName, match.groupName]
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
        .joined(separator: " • ")
    let matchup = "\(bundle.teamName(for: match.teamAId)) vs \(bundle.teamName(for: match.teamBId))"
    return prefix.isEmpty ? matchup : "\(prefix) - \(matchup)"
}

private func buildPreviewPlayerNameCandidates(_ profile: NativePlayerPreviewProfile) -> Set<String> {
    Set([
        normalizePreviewPlayerName(profile.canonicalPlayerName),
        normalizePreviewPlayerName("\(profile.firstName) \(profile.lastName)")
    ])
}

private func normalizePreviewPlayerName(_ value: String?) -> String {
    value?
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression) ?? ""
}

private func normalizePreviewUsername(_ value: String) -> String {
    value
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
        .replacingOccurrences(of: "\\s+", with: "", options: .regularExpression)
}

private func normalizePreviewBirthDate(_ raw: String) -> String? {
    let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil {
        return value
    }
    if let match = value.range(of: #"^(\d{2})/(\d{2})/(\d{4})$"#, options: .regularExpression) {
        let full = String(value[match])
        let parts = full.split(separator: "/")
        if parts.count == 3 {
            return "\(parts[2])-\(parts[1])-\(parts[0])"
        }
    }
    return nil
}

private func buildPreviewCanonicalPlayerName(firstName: String, lastName: String) -> String {
    "\(lastName) \(firstName)"
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
}

private func buildPreviewId(prefix: String) -> String {
    let millis = Int(previewNow())
    let suffix = Int.random(in: 1000...9999)
    return "\(prefix)_\(String(millis, radix: 36))_\(suffix)"
}

private func previewNow() -> TimeInterval {
    Date().timeIntervalSince1970 * 1000
}

private func previewError(_ message: String) -> NSError {
    NSError(domain: "FLBPPlayerPreview", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}
