import Foundation

final class NativePublicCache {
    private enum Keys {
        static let catalog = "flbp.native.catalog"
        static let leaderboard = "flbp.native.leaderboard"
        static let hall = "flbp.native.hall"
        static let bundles = "flbp.native.bundles"
    }

    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func readCatalog() -> NativePublicCatalog? {
        readValue(forKey: Keys.catalog, as: NativePublicCatalog.self)
    }

    func writeCatalog(_ catalog: NativePublicCatalog) {
        writeValue(catalog, forKey: Keys.catalog)
    }

    func readLeaderboard() -> [NativeLeaderboardEntry]? {
        readValue(forKey: Keys.leaderboard, as: [NativeLeaderboardEntry].self)
    }

    func writeLeaderboard(_ leaderboard: [NativeLeaderboardEntry]) {
        writeValue(leaderboard, forKey: Keys.leaderboard)
    }

    func readHallOfFame() -> [NativeHallOfFameEntry]? {
        readValue(forKey: Keys.hall, as: [NativeHallOfFameEntry].self)
    }

    func writeHallOfFame(_ hallOfFame: [NativeHallOfFameEntry]) {
        writeValue(hallOfFame, forKey: Keys.hall)
    }

    func readTournamentBundle(id: String) -> NativeTournamentBundle? {
        let map = readValue(forKey: Keys.bundles, as: [String: NativeTournamentBundle].self) ?? [:]
        return map[id]
    }

    func writeTournamentBundle(_ bundle: NativeTournamentBundle) {
        var map = readValue(forKey: Keys.bundles, as: [String: NativeTournamentBundle].self) ?? [:]
        map[bundle.tournament.id] = bundle
        writeValue(map, forKey: Keys.bundles)
    }

    private func readValue<T: Decodable>(forKey key: String, as type: T.Type) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? decoder.decode(type, from: data)
    }

    private func writeValue<T: Encodable>(_ value: T, forKey key: String) {
        guard let data = try? encoder.encode(value) else { return }
        defaults.set(data, forKey: key)
    }
}
