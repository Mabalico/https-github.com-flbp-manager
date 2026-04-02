import Foundation

struct AuditedSurface: Identifiable {
    let id: String
    let label: String
    let sourcePath: String
    let note: String
}

struct AuditedRule: Identifiable {
    let id: String
    let rule: String
    let sourcePath: String
    let note: String
}

enum RouteGroup: String {
    case publicPrimary
    case publicChild
    case tools
}

enum NativeRoute: String, CaseIterable, Identifiable {
    case home
    case tournament
    case leaderboard
    case hof
    case playerArea = "player_area"
    case tournamentDetail = "tournament_detail"
    case admin
    case refereesArea = "referees_area"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .home: return "Home"
        case .tournament: return "Tournament list"
        case .leaderboard: return "Leaderboard"
        case .hof: return "Hall of Fame"
        case .playerArea: return "Player area"
        case .tournamentDetail: return "Tournament detail"
        case .admin: return "Admin"
        case .refereesArea: return "Referees area"
        }
    }

    var sourcePath: String { "App.tsx" }

    var note: String {
        switch self {
        case .home: return "Public entry surface."
        case .tournament: return "Public tournaments surface."
        case .leaderboard: return "Public ranking surface."
        case .hof: return "Public historical surface."
        case .playerArea: return "Optional player account surface with profile, personal results, live status and call alerts."
        case .tournamentDetail: return "Child public route reached from the tournament list when a tournament is selected."
        case .admin: return "Protected tools surface."
        case .refereesArea: return "Protected referees surface."
        }
    }

    var group: RouteGroup {
        switch self {
        case .home, .tournament, .leaderboard, .hof, .playerArea:
            return .publicPrimary
        case .tournamentDetail:
            return .publicChild
        case .admin, .refereesArea:
            return .tools
        }
    }

    var directlyNavigable: Bool {
        switch self {
        case .tournamentDetail:
            return false
        default:
            return true
        }
    }

    static var publicPrimaryRoutes: [NativeRoute] { allCases.filter { $0.group == .publicPrimary } }
    static var publicChildRoutes: [NativeRoute] { allCases.filter { $0.group == .publicChild } }
    static var toolsRoutes: [NativeRoute] { allCases.filter { $0.group == .tools } }
}

enum WebAuditCatalog {
    static let topLevelSurfaces: [AuditedSurface] = NativeRoute.allCases.map {
        .init(id: $0.id, label: $0.label, sourcePath: $0.sourcePath, note: $0.note)
    }

    static let tvProjections: [AuditedSurface] = [
        .init(id: "groups", label: "TV groups", sourcePath: "types.ts", note: "Read-only TV projection."),
        .init(id: "groups_bracket", label: "TV groups + bracket", sourcePath: "types.ts", note: "Read-only TV projection."),
        .init(id: "bracket", label: "TV bracket", sourcePath: "types.ts", note: "Read-only TV projection."),
        .init(id: "scorers", label: "TV scorers", sourcePath: "types.ts", note: "Read-only TV projection.")
    ]

    static let hardRules: [AuditedRule] = [
        .init(id: "bye", rule: "BYE is implicit in matches, hidden in UI, auto-advanced, never a real team", sourcePath: "scripts/check-invariants.mjs + services/tournamentEngine.ts", note: "Must stay preserved."),
        .init(id: "tbd", rule: "TBD is a placeholder, not a real team, and must not advance", sourcePath: "services/tournamentEngine.ts", note: "Must stay preserved."),
        .init(id: "tv", rule: "TV mode is read-only and must not expose destructive actions", sourcePath: "scripts/check-tv-readonly.mjs", note: "Must stay preserved."),
        .init(id: "ocr", rule: "OCR/report workflows are out of scope for this bootstrap", sourcePath: "components/RefereesArea.tsx + services/imageProcessingService.ts", note: "Do not regress.")
    ]
}
