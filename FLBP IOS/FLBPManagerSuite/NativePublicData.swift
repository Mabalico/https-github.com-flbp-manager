import Foundation

struct NativeTournamentSummary: Identifiable, Equatable {
    let id: String
    let name: String
    let startDate: String
    let type: String
    let isManual: Bool
    let status: String
    let advancingPerGroup: Int?
}

struct NativeTeamInfo: Identifiable, Equatable {
    let id: String
    let name: String
    let player1: String
    let player2: String?
}

struct NativeGroupInfo: Identifiable, Equatable, Hashable {
    let id: String
    let name: String
    let orderIndex: Int?
    let teamIds: [String]
}

struct NativeMatchStatInfo: Equatable {
    let matchId: String
    let teamId: String
    let playerName: String
    let canestri: Int
    let soffi: Int
}

struct NativeMatchInfo: Identifiable, Equatable {
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

struct NativeTournamentBundle: Equatable {
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

struct NativePublicCatalog: Equatable {
    let liveTournament: NativeTournamentSummary?
    let history: [NativeTournamentSummary]
}

struct NativeLeaderboardEntry: Identifiable, Equatable {
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

struct NativeHallOfFameEntry: Identifiable, Equatable {
    let id: String
    let year: String
    let tournamentId: String
    let tournamentName: String
    let type: String
    let teamName: String?
    let playerNames: [String]
    let value: Int?
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

enum DetailSection: String, CaseIterable, Identifiable {
    case overview
    case groups
    case bracket
    case scorers

    var id: String { rawValue }

    var label: String {
        switch self {
        case .overview: return "Overview"
        case .groups: return "Groups"
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
        case .points: return "Points"
        case .soffi: return "Soffi"
        case .games: return "Games"
        case .avgPoints: return "Avg points"
        case .avgSoffi: return "Avg soffi"
        }
    }
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

@MainActor
final class NativeAppModel: ObservableObject {
    @Published var catalogLoading = true
    @Published var catalogError: String?
    @Published var catalog = NativePublicCatalog(liveTournament: nil, history: [])

    @Published var leaderboardLoading = true
    @Published var leaderboardError: String?
    @Published var leaderboard: [NativeLeaderboardEntry] = []

    @Published var hallLoading = true
    @Published var hallError: String?
    @Published var hallOfFame: [NativeHallOfFameEntry] = []

    @Published var detailLoading = false
    @Published var detailError: String?
    @Published var detailBundle: NativeTournamentBundle?

    func refreshAll() async {
        catalogLoading = true
        leaderboardLoading = true
        hallLoading = true
        catalogError = nil
        leaderboardError = nil
        hallError = nil

        do {
            catalog = try await NativePublicAPI.fetchCatalog()
        } catch {
            catalogError = error.localizedDescription
        }
        catalogLoading = false

        do {
            leaderboard = try await NativePublicAPI.fetchCareerLeaderboard()
        } catch {
            leaderboardError = error.localizedDescription
        }
        leaderboardLoading = false

        do {
            hallOfFame = try await NativePublicAPI.fetchHallOfFame()
        } catch {
            hallError = error.localizedDescription
        }
        hallLoading = false
    }

    func loadDetail(for selection: TournamentSelectionRef?) async {
        guard let selection else {
            detailLoading = false
            detailError = nil
            detailBundle = nil
            return
        }

        detailLoading = true
        detailError = nil
        do {
            detailBundle = try await NativePublicAPI.fetchTournamentBundle(id: selection.id)
            if detailBundle == nil {
                detailError = "The selected tournament is not available in the public dataset."
            }
        } catch {
            detailBundle = nil
            detailError = error.localizedDescription
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

    static func fetchCatalog() async throws -> NativePublicCatalog {
        let rows = try await requestArray(
            "public_tournaments?workspace_id=eq.\(encode(workspaceId))&select=id,name,start_date,type,config,is_manual,status&order=start_date.asc"
        )
        let tournaments = rows.map(parseTournamentSummary).sorted { $0.startDate > $1.startDate }
        return NativePublicCatalog(
            liveTournament: tournaments.first(where: { $0.status == "live" }),
            history: tournaments.filter { $0.status != "live" }
        )
    }

    static func fetchTournamentBundle(id: String) async throws -> NativeTournamentBundle? {
        let safeId = encode(id)
        let safeWorkspace = encode(workspaceId)

        let tournamentRows = try await requestArray(
            "public_tournaments?workspace_id=eq.\(safeWorkspace)&id=eq.\(safeId)&select=id,name,start_date,type,config,is_manual,status&limit=1"
        )
        guard let tournamentRow = tournamentRows.first else { return nil }
        let tournament = parseTournamentSummary(tournamentRow)

        let teamRows = try await requestArray(
            "public_tournament_teams?workspace_id=eq.\(safeWorkspace)&tournament_id=eq.\(safeId)&select=id,name,player1,player2,created_at&order=created_at.asc"
        )
        let groupRows = try await requestArray(
            "public_tournament_groups?workspace_id=eq.\(safeWorkspace)&tournament_id=eq.\(safeId)&select=id,name,order_index&order=order_index.asc"
        )
        let groupTeamRows = try await requestArray(
            "public_tournament_group_teams?workspace_id=eq.\(safeWorkspace)&tournament_id=eq.\(safeId)&select=group_id,team_id,seed"
        )
        let matchRows = try await requestArray(
            "public_tournament_matches?workspace_id=eq.\(safeWorkspace)&tournament_id=eq.\(safeId)&select=id,code,phase,group_name,round,round_name,order_index,team_a_id,team_b_id,score_a,score_b,played,status,is_bye,hidden&order=order_index.asc"
        )
        let statRows = try await requestArray(
            "public_tournament_match_stats?workspace_id=eq.\(safeWorkspace)&tournament_id=eq.\(safeId)&select=match_id,team_id,player_name,canestri,soffi"
        )

        let teams = teamRows.map { row in
            NativeTeamInfo(
                id: requiredString(row, key: "id"),
                name: stringValue(row["name"]),
                player1: stringValue(row["player1"]),
                player2: optionalString(row["player2"])
            )
        }

        let teamsByGroup = Dictionary(grouping: groupTeamRows) { stringValue($0["group_id"]) }
            .mapValues { rows in rows.compactMap { optionalString($0["team_id"]) } }

        let groups = groupRows.map { row in
            let groupId = requiredString(row, key: "id")
            return NativeGroupInfo(
                id: groupId,
                name: stringValue(row["name"]),
                orderIndex: intValue(row["order_index"]),
                teamIds: teamsByGroup[groupId] ?? []
            )
        }

        let matches = matchRows.map { row in
            NativeMatchInfo(
                id: requiredString(row, key: "id"),
                code: optionalString(row["code"]),
                phase: optionalString(row["phase"]),
                groupName: optionalString(row["group_name"]),
                round: intValue(row["round"]),
                roundName: optionalString(row["round_name"]),
                orderIndex: intValue(row["order_index"]),
                teamAId: optionalString(row["team_a_id"]),
                teamBId: optionalString(row["team_b_id"]),
                scoreA: intValue(row["score_a"]) ?? 0,
                scoreB: intValue(row["score_b"]) ?? 0,
                played: boolValue(row["played"]),
                status: optionalString(row["status"]) ?? "scheduled",
                isBye: boolValue(row["is_bye"]),
                hidden: boolValue(row["hidden"])
            )
        }.sorted { ($0.orderIndex ?? .max) < ($1.orderIndex ?? .max) }

        let stats = statRows.map { row in
            NativeMatchStatInfo(
                matchId: requiredString(row, key: "match_id"),
                teamId: requiredString(row, key: "team_id"),
                playerName: stringValue(row["player_name"]),
                canestri: intValue(row["canestri"]) ?? 0,
                soffi: intValue(row["soffi"]) ?? 0
            )
        }

        return NativeTournamentBundle(
            tournament: tournament,
            teams: teams,
            groups: groups,
            matches: matches,
            stats: stats
        )
    }

    static func fetchCareerLeaderboard() async throws -> [NativeLeaderboardEntry] {
        let rows = try await requestArray(
            "public_career_leaderboard?workspace_id=eq.\(encode(workspaceId))&select=id,name,team_name,games_played,points,soffi,avg_points,avg_soffi,u25,yob_label"
        )

        return rows.map { row in
            NativeLeaderboardEntry(
                id: requiredString(row, key: "id"),
                name: stringValue(row["name"]),
                teamName: stringValue(row["team_name"]),
                gamesPlayed: intValue(row["games_played"]) ?? 0,
                points: intValue(row["points"]) ?? 0,
                soffi: intValue(row["soffi"]) ?? 0,
                avgPoints: doubleValue(row["avg_points"]) ?? 0,
                avgSoffi: doubleValue(row["avg_soffi"]) ?? 0,
                u25: boolValue(row["u25"]),
                yobLabel: optionalString(row["yob_label"])
            )
        }
    }

    static func fetchHallOfFame() async throws -> [NativeHallOfFameEntry] {
        let rows = try await requestArray(
            "public_hall_of_fame_entries?workspace_id=eq.\(encode(workspaceId))&select=id,year,tournament_id,tournament_name,type,team_name,player_names,value,created_at&order=year.desc,created_at.desc"
        )
        return rows.map { row in
            NativeHallOfFameEntry(
                id: requiredString(row, key: "id"),
                year: stringValue(row["year"]),
                tournamentId: stringValue(row["tournament_id"]),
                tournamentName: stringValue(row["tournament_name"]),
                type: stringValue(row["type"]),
                teamName: optionalString(row["team_name"]),
                playerNames: stringArray(row["player_names"]),
                value: intValue(row["value"])
            )
        }
    }

    private static func parseTournamentSummary(_ row: [String: Any]) -> NativeTournamentSummary {
        let config = row["config"] as? [String: Any]
        return NativeTournamentSummary(
            id: requiredString(row, key: "id"),
            name: stringValue(row["name"]),
            startDate: stringValue(row["start_date"]),
            type: stringValue(row["type"]),
            isManual: boolValue(row["is_manual"]),
            status: stringValue(row["status"]),
            advancingPerGroup: intValue(config?["advancingPerGroup"])
        )
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
