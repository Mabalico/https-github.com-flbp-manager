import Foundation

struct NativeAdminSession: Codable, Equatable {
    let accessToken: String
    let refreshToken: String?
    let expiresAt: String?
    let email: String?
    let userId: String?
}

struct NativePlayerSupabaseSession: Codable, Equatable {
    let accessToken: String
    let refreshToken: String?
    let expiresAtEpochMs: Int64?
    let email: String?
    let userId: String?
    let provider: String
}

struct NativeAdminAccessResult: Equatable {
    let ok: Bool
    let email: String?
    let userId: String?
    let reason: String?
}

struct NativePlayerSupabaseProfileRow: Equatable {
    let workspaceId: String
    let userId: String
    let firstName: String
    let lastName: String
    let birthDate: String?
    let canonicalPlayerId: String?
    let canonicalPlayerName: String?
    let createdAt: String?
    let updatedAt: String?
}

struct NativePlayerSupabaseCallRow: Equatable {
    let id: String
    let workspaceId: String
    let tournamentId: String
    let teamId: String
    let teamName: String?
    let targetUserId: String
    let targetPlayerId: String?
    let targetPlayerName: String?
    let status: String
    let requestedAt: String?
    let acknowledgedAt: String?
    let cancelledAt: String?
}

struct NativeAdminPlayerAccountCatalogRow: Equatable {
    let userId: String
    let email: String?
    let primaryProvider: String?
    let providers: [String]
    let createdAt: String?
    let lastLoginAt: String?
    let hasProfile: Bool
    let linkedPlayerName: String?
    let birthDate: String?
    let canonicalPlayerId: String?
}

struct NativeRefereeAuthCheckResult: Equatable {
    let ok: Bool
    let reason: String?
    let authVersion: String?
}

struct NativeRefereeLiveStatePullResult: Equatable {
    let ok: Bool
    let reason: String?
    let authVersion: String?
    let updatedAt: String?
    let stateJSON: String?
}

struct NativeAdminOverview: Equatable {
    let workspaceStateUpdatedAt: String?
    let publicWorkspaceStateUpdatedAt: String?
}

struct NativeProtectedTrafficUsageRow: Identifiable, Equatable {
    let id: String
    let usageDate: String
    let bucket: String
    let requestCount: Int
    let requestBytes: Int
    let responseBytes: Int
}

struct NativeProtectedBillingCycleWindow: Equatable {
    let startDate: String
    let todayDate: String
    let nextResetDate: String
    let displayEndDate: String
}

struct NativeProtectedDateRangeWindow: Equatable {
    let startDate: String
    let endDate: String
}

struct NativeProtectedSiteViewsRow: Identifiable, Equatable {
    let id: String
    let viewDate: String
    let views: Int
}

struct NativeProtectedMatchBrief: Identifiable, Equatable {
    let id: String
    let match: NativeMatchInfo
    let title: String
    let teamALabel: String
    let teamBLabel: String
    let teamAPlayers: String
    let teamBPlayers: String
    let scoreLabel: String
    let playable: Bool
    let blockedByPlaceholder: Bool
}

struct NativeProtectedReportPlayerDraft: Identifiable, Equatable {
    let id: String
    let teamId: String
    let teamName: String
    let playerName: String
    let canestri: Int
    let soffi: Int
}

struct NativeProtectedReportTeamDraft: Identifiable, Equatable {
    let id: String
    let teamId: String
    let teamName: String
    let players: [NativeProtectedReportPlayerDraft]
    let derivedScore: Int
}

struct NativeProtectedReportDraft: Equatable {
    let match: NativeMatchInfo
    let title: String
    let playable: Bool
    let teams: [NativeProtectedReportTeamDraft]
    let derivedScoresByTeam: [String: Int]
    let winnerTeamId: String?
    let tieNotAllowed: Bool
    let hasStoredStats: Bool
    let totalPoints: Int
    let totalSoffi: Int
}

struct NativeProtectedReportSaveStat: Identifiable, Equatable {
    let id: String
    let teamId: String
    let teamName: String
    let playerName: String
    let canestri: Int
    let soffi: Int
}

struct NativeProtectedReportSaveDraft: Equatable {
    let matchId: String
    let title: String
    let scoreA: Int
    let scoreB: Int
    let scoreLabel: String
    let winnerTeamId: String?
    let winnerTeamName: String?
    let readyToSave: Bool
    let requiresOverwriteConfirm: Bool
    let blockReason: String?
    let backendReady: Bool
    let backendNote: String
    let stats: [NativeProtectedReportSaveStat]
}

struct NativeProtectedReportFormInput: Equatable {
    let canestriText: String
    let soffiText: String
}

struct NativeProtectedCodeLookupResult: Equatable {
    let normalizedCode: String
    let selectedMatch: NativeMatchInfo?
    let duplicateChoices: [NativeProtectedMatchBrief]
    let error: String?
}

struct NativeProtectedTournamentSnapshot: Equatable {
    let visibleTeamCount: Int
    let visibleMatchCount: Int
    let playedCount: Int
    let liveCount: Int
    let upcomingCount: Int
    let tbdCount: Int
    let turnsSnapshot: NativeTurnsSnapshot
    let featuredTurnBlocks: [NativeTurnBlock]
    let upcomingPlayableMatches: [NativeProtectedMatchBrief]
    let blockedMatches: [NativeProtectedMatchBrief]
}

final class NativeProtectedCache {
    private let defaults = UserDefaults.standard

    func readAdminSession() -> NativeAdminSession? {
        guard let data = defaults.data(forKey: "flbp.native.admin.session") else { return nil }
        return try? JSONDecoder().decode(NativeAdminSession.self, from: data)
    }

    func writeAdminSession(_ session: NativeAdminSession?) {
        if let session, let data = try? JSONEncoder().encode(session) {
            defaults.set(data, forKey: "flbp.native.admin.session")
        } else {
            defaults.removeObject(forKey: "flbp.native.admin.session")
        }
    }

    func readPlayerSession() -> NativePlayerSupabaseSession? {
        guard let data = defaults.data(forKey: "flbp.native.player.live.session") else { return nil }
        return try? JSONDecoder().decode(NativePlayerSupabaseSession.self, from: data)
    }

    func writePlayerSession(_ session: NativePlayerSupabaseSession?) {
        if let session, let data = try? JSONEncoder().encode(session) {
            defaults.set(data, forKey: "flbp.native.player.live.session")
        } else {
            defaults.removeObject(forKey: "flbp.native.player.live.session")
        }
    }

    func readOrCreatePlayerDeviceId() -> String {
        let key = "flbp.native.player.device.id"
        if let existing = defaults.string(forKey: key)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !existing.isEmpty {
            return existing
        }
        let next = "ios_" + UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(12)
        let value = String(next)
        defaults.set(value, forKey: key)
        return value
    }

    func readSelectedRefereeName(tournamentId: String) -> String? {
        let safeTournamentId = tournamentId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safeTournamentId.isEmpty else { return nil }
        let value = defaults.string(forKey: "flbp.native.referee.\(safeTournamentId)")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return value?.isEmpty == false ? value : nil
    }

    func writeSelectedRefereeName(tournamentId: String, refereeName: String?) {
        let safeTournamentId = tournamentId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safeTournamentId.isEmpty else { return }
        let key = "flbp.native.referee.\(safeTournamentId)"
        let normalized = refereeName?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let normalized, !normalized.isEmpty {
            defaults.set(normalized, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }
}

enum NativeProtectedAPI {
    private static let supabaseURL = "https://kgwhcemqkgqvtsctnwql.supabase.co"
    private static let anonKey = "sb_publishable_XhZ5hAdoycuWfDMeiQKaGA_7gD6nDhz"
    private static let workspaceId = "default"
    private static let adminEmail = "admin@flbp.local"

    static func defaultAdminEmail() -> String { adminEmail }

    static func isPlayerBackendPendingError(_ message: String) -> Bool {
        let safeMessage = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safeMessage.isEmpty else { return false }
        let pattern = "player_app_profiles|player_app_devices|player_app_calls|flbp_player_ack_call|flbp_player_cancel_call|flbp_player_call_team|flbp_admin_list_player_accounts|relation .*player_app_|function .*flbp_player_"
        return safeMessage.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }

    static func signInWithPassword(email: String, password: String) async throws -> NativeAdminSession {
        let safeEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let safePassword = password
        guard !safeEmail.isEmpty, !safePassword.isEmpty else {
            throw NSError(domain: "FLBP", code: 1, userInfo: [NSLocalizedDescriptionKey: "Inserisci email e password."])
        }

        let response = try await requestObject(
            path: "auth/v1/token?grant_type=password",
            method: "POST",
            bearer: nil,
            body: [
                "email": safeEmail,
                "password": safePassword,
            ]
        )

        let accessToken = stringValue(response["access_token"]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !accessToken.isEmpty else {
            throw NSError(domain: "FLBP", code: 2, userInfo: [NSLocalizedDescriptionKey: "Login fallito (token mancante)."])
        }

        let refreshToken = optionalString(response["refresh_token"])
        let expiresIn = intValue(response["expires_in"]) ?? 0
        let expiresAt: String? = expiresIn > 0 ? ISO8601DateFormatter().string(from: Date().addingTimeInterval(TimeInterval(expiresIn))) : nil
        let user = response["user"] as? [String: Any]

        return NativeAdminSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: expiresAt,
            email: optionalString(user?["email"]) ?? safeEmail,
            userId: optionalString(user?["id"])
        )
    }

    static func signOut(session: NativeAdminSession?) async {
        guard let session, !session.accessToken.isEmpty else { return }
        _ = try? await requestObject(
            path: "auth/v1/logout",
            method: "POST",
            bearer: session.accessToken,
            body: nil
        )
    }

    static func signInPlayerWithPassword(email: String, password: String) async throws -> NativePlayerSupabaseSession {
        let safeEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let safePassword = password
        guard !safeEmail.isEmpty, !safePassword.isEmpty else {
            throw NSError(domain: "FLBP", code: 100, userInfo: [NSLocalizedDescriptionKey: "Inserisci email e password."])
        }

        let response = try await requestObject(
            path: "auth/v1/token?grant_type=password",
            method: "POST",
            bearer: nil,
            body: [
                "email": safeEmail,
                "password": safePassword
            ]
        )

        return parsePlayerSession(response: response, fallbackEmail: safeEmail, providerHint: "password")
    }

    static func signUpPlayerWithPassword(
        email: String,
        password: String,
        metadata: [String: Any] = [:]
    ) async throws -> NativePlayerSupabaseSession {
        let safeEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let safePassword = password
        guard !safeEmail.isEmpty, !safePassword.isEmpty else {
            throw NSError(domain: "FLBP", code: 101, userInfo: [NSLocalizedDescriptionKey: "Inserisci email e password."])
        }

        let response = try await requestObject(
            path: "auth/v1/signup",
            method: "POST",
            bearer: nil,
            body: [
                "email": safeEmail,
                "password": safePassword,
                "data": metadata
            ]
        )

        return parsePlayerSession(response: response, fallbackEmail: safeEmail, providerHint: "password")
    }

    static func ensureFreshPlayerSession(cache: NativeProtectedCache) async -> NativePlayerSupabaseSession? {
        guard let session = cache.readPlayerSession() else { return nil }
        if let expiresAtEpochMs = session.expiresAtEpochMs,
           expiresAtEpochMs > Int64(Date().timeIntervalSince1970 * 1000) + 60_000 {
            return session
        }

        let refreshToken = session.refreshToken?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !refreshToken.isEmpty else {
            cache.writePlayerSession(nil)
            return nil
        }

        do {
            let response = try await requestObject(
                path: "auth/v1/token?grant_type=refresh_token",
                method: "POST",
                bearer: nil,
                body: [
                    "refresh_token": refreshToken
                ]
            )
            let refreshed = try parsePlayerSession(
                response: response,
                fallbackEmail: session.email,
                providerHint: session.provider
            )
            cache.writePlayerSession(refreshed)
            return refreshed
        } catch {
            cache.writePlayerSession(nil)
            return nil
        }
    }

    static func requestPlayerPasswordReset(_ email: String) async throws {
        let safeEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safeEmail.isEmpty else {
            throw NSError(domain: "FLBP", code: 102, userInfo: [NSLocalizedDescriptionKey: "Inserisci una email valida."])
        }

        _ = try await requestObject(
            path: "auth/v1/recover",
            method: "POST",
            bearer: nil,
            body: [
                "email": safeEmail
            ]
        )
    }

    static func signOutPlayer(session: NativePlayerSupabaseSession?) async {
        guard let session, !session.accessToken.isEmpty else { return }
        _ = try? await requestObject(
            path: "auth/v1/logout",
            method: "POST",
            bearer: session.accessToken,
            body: nil
        )
    }

    static func registerPlayerDevice(
        session: NativePlayerSupabaseSession,
        deviceId: String,
        platform: String = "ios",
        deviceToken: String? = nil,
        pushEnabled: Bool = true
    ) async throws {
        guard let userId = resolvePlayerSessionUserId(session), !userId.isEmpty else {
            throw NSError(domain: "FLBP", code: 103, userInfo: [NSLocalizedDescriptionKey: "Sessione player non valida."])
        }
        let safeDeviceId = deviceId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safeDeviceId.isEmpty else {
            throw NSError(domain: "FLBP", code: 104, userInfo: [NSLocalizedDescriptionKey: "Device id mancante."])
        }

        _ = try await requestArray(
            path: "rest/v1/player_app_devices?on_conflict=id&select=id",
            method: "POST",
            bearer: session.accessToken,
            body: [
                "id": safeDeviceId,
                "workspace_id": workspaceId,
                "user_id": userId,
                "platform": platform,
                "device_token": deviceToken?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty(or: nil) as Any? ?? NSNull(),
                "push_enabled": pushEnabled
            ],
            extraHeaders: [
                "Prefer": "resolution=merge-duplicates,return=representation"
            ]
        )
    }

    static func pullPlayerProfile(session: NativePlayerSupabaseSession) async throws -> NativePlayerSupabaseProfileRow? {
        guard let userId = resolvePlayerSessionUserId(session), !userId.isEmpty else { return nil }
        let rows = try await requestArray(
            path: "rest/v1/player_app_profiles" +
                "?workspace_id=eq.\(encode(workspaceId))" +
                "&user_id=eq.\(encode(userId))" +
                "&select=workspace_id,user_id,first_name,last_name,birth_date,canonical_player_id,canonical_player_name,created_at,updated_at" +
                "&limit=1",
            bearer: session.accessToken
        )
        return rows.first.map(playerProfileRowFromJson)
    }

    static func pushPlayerProfile(
        session: NativePlayerSupabaseSession,
        firstName: String,
        lastName: String,
        birthDate: String,
        canonicalPlayerId: String? = nil,
        canonicalPlayerName: String? = nil
    ) async throws -> NativePlayerSupabaseProfileRow {
        guard let userId = resolvePlayerSessionUserId(session), !userId.isEmpty else {
            throw NSError(domain: "FLBP", code: 105, userInfo: [NSLocalizedDescriptionKey: "Sessione player non valida."])
        }
        let rows = try await requestArray(
            path: "rest/v1/player_app_profiles?on_conflict=workspace_id,user_id&select=workspace_id,user_id,first_name,last_name,birth_date,canonical_player_id,canonical_player_name,created_at,updated_at",
            method: "POST",
            bearer: session.accessToken,
            body: [
                "workspace_id": workspaceId,
                "user_id": userId,
                "first_name": firstName.trimmingCharacters(in: .whitespacesAndNewlines),
                "last_name": lastName.trimmingCharacters(in: .whitespacesAndNewlines),
                "birth_date": birthDate.trimmingCharacters(in: .whitespacesAndNewlines),
                "canonical_player_id": canonicalPlayerId?.trimmingCharacters(in: .whitespacesAndNewlines) as Any? ?? NSNull(),
                "canonical_player_name": canonicalPlayerName?.trimmingCharacters(in: .whitespacesAndNewlines) as Any? ?? NSNull()
            ],
            extraHeaders: [
                "Prefer": "resolution=merge-duplicates,return=representation"
            ]
        )
        guard let first = rows.first else {
            throw NSError(domain: "FLBP", code: 106, userInfo: [NSLocalizedDescriptionKey: "Profilo player non restituito."])
        }
        return playerProfileRowFromJson(first)
    }

    static func pullPlayerCalls(session: NativePlayerSupabaseSession) async throws -> [NativePlayerSupabaseCallRow] {
        guard let userId = resolvePlayerSessionUserId(session), !userId.isEmpty else { return [] }
        let rows = try await requestArray(
            path: "rest/v1/player_app_calls" +
                "?workspace_id=eq.\(encode(workspaceId))" +
                "&target_user_id=eq.\(encode(userId))" +
                "&select=id,workspace_id,tournament_id,team_id,team_name,target_user_id,target_player_id,target_player_name,status,requested_at,acknowledged_at,cancelled_at" +
                "&order=requested_at.desc",
            bearer: session.accessToken
        )
        return rows.map(playerCallRowFromJson)
    }

    static func acknowledgePlayerCall(session: NativePlayerSupabaseSession, callId: String) async throws {
        _ = try await requestObject(
            path: "rest/v1/rpc/flbp_player_ack_call",
            method: "POST",
            bearer: session.accessToken,
            body: [
                "p_workspace_id": workspaceId,
                "p_call_id": callId.trimmingCharacters(in: .whitespacesAndNewlines)
            ]
        )
    }

    static func cancelPlayerCall(session: NativePlayerSupabaseSession, callId: String) async throws {
        _ = try await requestObject(
            path: "rest/v1/rpc/flbp_player_cancel_call",
            method: "POST",
            bearer: session.accessToken,
            body: [
                "p_workspace_id": workspaceId,
                "p_call_id": callId.trimmingCharacters(in: .whitespacesAndNewlines)
            ]
        )
    }

    static func pullAdminPlayerAccounts(
        session: NativeAdminSession,
        origin: String? = nil
    ) async throws -> [NativeAdminPlayerAccountCatalogRow] {
        let rows = try await requestArray(
            path: "rest/v1/rpc/flbp_admin_list_player_accounts",
            method: "POST",
            bearer: session.accessToken,
            body: [
                "p_workspace_id": workspaceId,
                "p_origin": origin?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() as Any? ?? NSNull()
            ],
            extraHeaders: [
                "Prefer": "params=single-object"
            ]
        )
        return rows.map(adminPlayerAccountRowFromJson)
    }

    static func pushAdminPlayerProfile(
        session: NativeAdminSession,
        userId: String,
        firstName: String,
        lastName: String,
        birthDate: String,
        canonicalPlayerId: String? = nil,
        canonicalPlayerName: String? = nil
    ) async throws -> NativePlayerSupabaseProfileRow {
        let rows = try await requestArray(
            path: "rest/v1/player_app_profiles?on_conflict=workspace_id,user_id&select=workspace_id,user_id,first_name,last_name,birth_date,canonical_player_id,canonical_player_name,created_at,updated_at",
            method: "POST",
            bearer: session.accessToken,
            body: [
                "workspace_id": workspaceId,
                "user_id": userId.trimmingCharacters(in: .whitespacesAndNewlines),
                "first_name": firstName.trimmingCharacters(in: .whitespacesAndNewlines),
                "last_name": lastName.trimmingCharacters(in: .whitespacesAndNewlines),
                "birth_date": birthDate.trimmingCharacters(in: .whitespacesAndNewlines),
                "canonical_player_id": canonicalPlayerId?.trimmingCharacters(in: .whitespacesAndNewlines) as Any? ?? NSNull(),
                "canonical_player_name": canonicalPlayerName?.trimmingCharacters(in: .whitespacesAndNewlines) as Any? ?? NSNull()
            ],
            extraHeaders: [
                "Prefer": "resolution=merge-duplicates,return=representation"
            ]
        )
        guard let first = rows.first else {
            throw NSError(domain: "FLBP", code: 107, userInfo: [NSLocalizedDescriptionKey: "Profilo player live non restituito."])
        }
        return playerProfileRowFromJson(first)
    }

    static func ensureAdminAccess(session: NativeAdminSession) async throws -> NativeAdminAccessResult {
        let resolvedUserId = session.userId ?? decodeJWTSub(token: session.accessToken)
        guard let resolvedUserId, !resolvedUserId.isEmpty else {
            return NativeAdminAccessResult(ok: false, email: session.email, userId: nil, reason: "Impossibile determinare l’utente autenticato.")
        }

        let rows = try await requestArray(
            path: "rest/v1/admin_users?user_id=eq.\(encode(resolvedUserId))&select=user_id,email&limit=1",
            bearer: session.accessToken
        )

        guard let row = rows.first else {
            return NativeAdminAccessResult(
                ok: false,
                email: session.email,
                userId: resolvedUserId,
                reason: "Questo account autenticato non ha ruolo admin in Supabase."
            )
        }

        return NativeAdminAccessResult(
            ok: true,
            email: optionalString(row["email"]) ?? session.email,
            userId: optionalString(row["user_id"]) ?? resolvedUserId,
            reason: nil
        )
    }

    static func fetchAdminOverview(session: NativeAdminSession) async throws -> NativeAdminOverview {
        async let workspaceRows = requestArray(
            path: "rest/v1/workspace_state?workspace_id=eq.\(encode(workspaceId))&select=updated_at&limit=1",
            bearer: session.accessToken
        )
        async let publicRows = requestArray(
            path: "rest/v1/public_workspace_state?workspace_id=eq.\(encode(workspaceId))&select=updated_at&limit=1",
            bearer: session.accessToken
        )

        let (workspace, publicState) = try await (workspaceRows, publicRows)
        return NativeAdminOverview(
            workspaceStateUpdatedAt: optionalString(workspace.first?["updated_at"]),
            publicWorkspaceStateUpdatedAt: optionalString(publicState.first?["updated_at"])
        )
    }

    static func fetchTrafficUsageRange(
        session: NativeAdminSession,
        startDate: String,
        endDate: String
    ) async throws -> [NativeProtectedTrafficUsageRow] {
        let rows = try await requestArray(
            path: "rest/v1/app_supabase_usage_daily" +
                "?workspace_id=eq.\(encode(workspaceId))" +
                "&usage_date=gte.\(encode(startDate))" +
                "&usage_date=lte.\(encode(endDate))" +
                "&select=usage_date,bucket,request_count,request_bytes,response_bytes" +
                "&order=usage_date.asc,bucket.asc",
            bearer: session.accessToken
        )

        return rows.enumerated().map { index, row in
            let usageDate = optionalString(row["usage_date"]) ?? ""
            let bucket = optionalString(row["bucket"]) ?? "unknown"
            let requestCount = intValue(row["request_count"]) ?? 0
            let requestBytes = intValue(row["request_bytes"]) ?? 0
            let responseBytes = intValue(row["response_bytes"]) ?? 0
            return NativeProtectedTrafficUsageRow(
                id: "\(usageDate)|\(bucket)|\(index)",
                usageDate: usageDate,
                bucket: bucket,
                requestCount: requestCount,
                requestBytes: requestBytes,
                responseBytes: responseBytes
            )
        }
    }

    static func fetchSiteViewsRange(
        session: NativeAdminSession,
        startDate: String,
        endDate: String
    ) async throws -> [NativeProtectedSiteViewsRow] {
        let rows = try await requestArray(
            path: "rest/v1/public_site_views_daily" +
                "?workspace_id=eq.\(encode(workspaceId))" +
                "&view_date=gte.\(encode(startDate))" +
                "&view_date=lte.\(encode(endDate))" +
                "&select=view_date,views" +
                "&order=view_date.asc",
            bearer: session.accessToken
        )
        return rows.enumerated().map { index, row in
            let viewDate = optionalString(row["view_date"]) ?? ""
            let views = intValue(row["views"]) ?? 0
            return NativeProtectedSiteViewsRow(
                id: "\(viewDate)|\(index)",
                viewDate: viewDate,
                views: views
            )
        }
    }

    static func verifyRefereePassword(tournamentId: String, refereePassword: String) async throws -> NativeRefereeAuthCheckResult {
        let safeTournamentId = tournamentId.trimmingCharacters(in: .whitespacesAndNewlines)
        let safePassword = refereePassword.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safeTournamentId.isEmpty, !safePassword.isEmpty else {
            throw NSError(domain: "FLBP", code: 3, userInfo: [NSLocalizedDescriptionKey: "Inserisci la password arbitri."])
        }

        let response = try await requestObject(
            path: "rest/v1/rpc/flbp_referee_auth_check",
            method: "POST",
            bearer: nil,
            body: [
                "p_workspace_id": workspaceId,
                "p_tournament_id": safeTournamentId,
                "p_referees_password": safePassword,
            ]
        )

        return NativeRefereeAuthCheckResult(
            ok: boolValue(response["ok"]),
            reason: optionalString(response["reason"]),
            authVersion: optionalString(response["auth_version"])
        )
    }

    static func pullRefereeLiveState(tournamentId: String, refereePassword: String) async throws -> NativeRefereeLiveStatePullResult {
        let safeTournamentId = tournamentId.trimmingCharacters(in: .whitespacesAndNewlines)
        let safePassword = refereePassword.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safeTournamentId.isEmpty, !safePassword.isEmpty else {
            throw NSError(domain: "FLBP", code: 4, userInfo: [NSLocalizedDescriptionKey: "Inserisci la password arbitri."])
        }

        let response: [String: Any]
        do {
            response = try await requestObject(
                path: "rest/v1/rpc/flbp_referee_pull_live_state",
                method: "POST",
                bearer: nil,
                body: [
                    "p_workspace_id": workspaceId,
                    "p_tournament_id": safeTournamentId,
                    "p_referees_password": safePassword,
                ]
            )
        } catch {
            let message = error.localizedDescription
            let missingRPC = message.localizedCaseInsensitiveContains("PGRST202") ||
                (message.localizedCaseInsensitiveContains("flbp_referee_pull_live_state") &&
                    message.localizedCaseInsensitiveContains("function"))
            if missingRPC {
                throw NSError(domain: "FLBP", code: 404, userInfo: [NSLocalizedDescriptionKey: "RPC flbp_referee_pull_live_state non disponibile su questo progetto Supabase."])
            }
            throw error
        }

        let stateJSONString: String?
        if let stateObject = response["state"] {
            if JSONSerialization.isValidJSONObject(stateObject),
               let data = try? JSONSerialization.data(withJSONObject: stateObject, options: [.sortedKeys]),
               let string = String(data: data, encoding: .utf8) {
                stateJSONString = string
            } else if let string = stateObject as? String {
                stateJSONString = string
            } else {
                stateJSONString = nil
            }
        } else {
            stateJSONString = nil
        }

        return NativeRefereeLiveStatePullResult(
            ok: boolValue(response["ok"]),
            reason: optionalString(response["reason"]),
            authVersion: optionalString(response["auth_version"]),
            updatedAt: optionalString(response["updated_at"]),
            stateJSON: stateJSONString
        )
    }

    private static func requestArray(
        path: String,
        bearer: String?
    ) async throws -> [[String: Any]] {
        try await requestArray(path: path, method: "GET", bearer: bearer, body: nil, extraHeaders: [:])
    }

    private static func requestArray(
        path: String,
        method: String,
        bearer: String?,
        body: [String: Any]?,
        extraHeaders: [String: String] = [:]
    ) async throws -> [[String: Any]] {
        let json = try await requestJSON(path: path, method: method, bearer: bearer, body: body, extraHeaders: extraHeaders)
        if let rows = json as? [[String: Any]] { return rows }
        if let row = json as? [String: Any] { return [row] }
        return []
    }

    private static func requestObject(
        path: String,
        method: String,
        bearer: String?,
        body: [String: Any]?,
        extraHeaders: [String: String] = [:]
    ) async throws -> [String: Any] {
        let json = try await requestJSON(path: path, method: method, bearer: bearer, body: body, extraHeaders: extraHeaders)
        return json as? [String: Any] ?? [:]
    }

    private static func requestJSON(
        path: String,
        method: String,
        bearer: String?,
        body: [String: Any]?,
        extraHeaders: [String: String] = [:]
    ) async throws -> Any {
        guard let url = URL(string: "\(supabaseURL)/\(path)") else {
            throw NSError(domain: "FLBP", code: 10, userInfo: [NSLocalizedDescriptionKey: "Invalid Supabase URL."])
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 8
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        let bearerToken = (bearer?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 } ?? anonKey
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        for (key, value) in extraHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }

        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "FLBP", code: 11, userInfo: [NSLocalizedDescriptionKey: "Invalid response from Supabase."])
        }
        guard (200...299).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw NSError(domain: "FLBP", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: message])
        }
        if data.isEmpty {
            return [:]
        }
        return try JSONSerialization.jsonObject(with: data, options: [])
    }

    private static func decodeJWTSub(token: String) -> String? {
        let parts = token.split(separator: ".")
        guard parts.count > 1 else { return nil }
        var payload = String(parts[1])
        payload = payload.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let remainder = payload.count % 4
        if remainder != 0 {
            payload += String(repeating: "=", count: 4 - remainder)
        }
        guard let data = Data(base64Encoded: payload),
              let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] else {
            return nil
        }
        return optionalString(json["sub"])
    }

    private static func encode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
    }

    private static func resolvePlayerSessionUserId(_ session: NativePlayerSupabaseSession) -> String? {
        let direct = session.userId?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let direct, !direct.isEmpty { return direct }
        return decodeJWTSub(token: session.accessToken)
    }

    private static func parsePlayerSession(
        response: [String: Any],
        fallbackEmail: String?,
        providerHint: String
    ) throws -> NativePlayerSupabaseSession {
        let accessToken = stringValue(response["access_token"]).trimmingCharacters(in: .whitespacesAndNewlines)
        if accessToken.isEmpty {
            let user = response["user"] as? [String: Any]
            let userEmail = optionalString(user?["email"])
            let message = (userEmail?.isEmpty == false || fallbackEmail?.isEmpty == false)
                ? "Supabase ha creato l'account ma non ha restituito una sessione attiva. Verifica se il provider email richiede conferma."
                : "Login/registrazione player falliti (token mancante)."
            throw NSError(domain: "FLBP", code: 108, userInfo: [NSLocalizedDescriptionKey: message])
        }

        let refreshToken = optionalString(response["refresh_token"])
        let expiresAtEpochMs: Int64? = {
            if let raw = int64Value(response["expires_at"]), raw > 0 {
                return raw > 1_000_000_000_000 ? raw : raw * 1000
            }
            if let expiresIn = int64Value(response["expires_in"]), expiresIn > 0 {
                return Int64(Date().timeIntervalSince1970 * 1000) + (expiresIn * 1000)
            }
            return nil
        }()
        let user = response["user"] as? [String: Any]
        let appMetadata = user?["app_metadata"] as? [String: Any]
        let provider = optionalString(appMetadata?["provider"]) ?? providerHint.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty(or: "password")

        return NativePlayerSupabaseSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAtEpochMs: expiresAtEpochMs,
            email: optionalString(user?["email"]) ?? fallbackEmail?.trimmingCharacters(in: .whitespacesAndNewlines),
            userId: optionalString(user?["id"]) ?? decodeJWTSub(token: accessToken),
            provider: provider
        )
    }

    private static func playerProfileRowFromJson(_ json: [String: Any]) -> NativePlayerSupabaseProfileRow {
        NativePlayerSupabaseProfileRow(
            workspaceId: optionalString(json["workspace_id"]) ?? "",
            userId: optionalString(json["user_id"]) ?? "",
            firstName: optionalString(json["first_name"]) ?? "",
            lastName: optionalString(json["last_name"]) ?? "",
            birthDate: optionalString(json["birth_date"]),
            canonicalPlayerId: optionalString(json["canonical_player_id"]),
            canonicalPlayerName: optionalString(json["canonical_player_name"]),
            createdAt: optionalString(json["created_at"]),
            updatedAt: optionalString(json["updated_at"])
        )
    }

    private static func playerCallRowFromJson(_ json: [String: Any]) -> NativePlayerSupabaseCallRow {
        NativePlayerSupabaseCallRow(
            id: optionalString(json["id"]) ?? "",
            workspaceId: optionalString(json["workspace_id"]) ?? "",
            tournamentId: optionalString(json["tournament_id"]) ?? "",
            teamId: optionalString(json["team_id"]) ?? "",
            teamName: optionalString(json["team_name"]),
            targetUserId: optionalString(json["target_user_id"]) ?? "",
            targetPlayerId: optionalString(json["target_player_id"]),
            targetPlayerName: optionalString(json["target_player_name"]),
            status: optionalString(json["status"]) ?? "ringing",
            requestedAt: optionalString(json["requested_at"]),
            acknowledgedAt: optionalString(json["acknowledged_at"]),
            cancelledAt: optionalString(json["cancelled_at"])
        )
    }

    private static func adminPlayerAccountRowFromJson(_ json: [String: Any]) -> NativeAdminPlayerAccountCatalogRow {
        NativeAdminPlayerAccountCatalogRow(
            userId: optionalString(json["user_id"]) ?? "",
            email: optionalString(json["email"]),
            primaryProvider: optionalString(json["primary_provider"]),
            providers: parsePlayerProviders(json["providers"]),
            createdAt: optionalString(json["created_at"]),
            lastLoginAt: optionalString(json["last_login_at"]),
            hasProfile: boolValue(json["has_profile"]),
            linkedPlayerName: optionalString(json["linked_player_name"]),
            birthDate: optionalString(json["birth_date"]),
            canonicalPlayerId: optionalString(json["canonical_player_id"])
        )
    }

    private static func parsePlayerProviders(_ value: Any?) -> [String] {
        if let items = value as? [Any] {
            return items.compactMap(optionalString)
        }
        if let text = optionalString(value) {
            return [text]
        }
        return []
    }
}

private let protectedBillingAnchorDay = 22

func buildProtectedBillingCycleWindow(anchorDay: Int = protectedBillingAnchorDay, now: Date = Date()) -> NativeProtectedBillingCycleWindow {
    let calendar = Calendar(identifier: .gregorian)
    let reference = calendar.startOfDay(for: now)
    let currentMonthAnchor = cycleAnchorDate(referenceMonth: reference, anchorDay: anchorDay, calendar: calendar)
    if reference >= currentMonthAnchor {
        let nextMonth = calendar.date(byAdding: .month, value: 1, to: reference) ?? reference
        let nextReset = cycleAnchorDate(referenceMonth: nextMonth, anchorDay: anchorDay, calendar: calendar)
        let displayEnd = calendar.date(byAdding: .day, value: -1, to: nextReset) ?? nextReset
        return NativeProtectedBillingCycleWindow(
            startDate: formatProtectedDate(currentMonthAnchor, calendar: calendar),
            todayDate: formatProtectedDate(reference, calendar: calendar),
            nextResetDate: formatProtectedDate(nextReset, calendar: calendar),
            displayEndDate: formatProtectedDate(displayEnd, calendar: calendar)
        )
    }

    let previousMonth = calendar.date(byAdding: .month, value: -1, to: reference) ?? reference
    let previousAnchor = cycleAnchorDate(referenceMonth: previousMonth, anchorDay: anchorDay, calendar: calendar)
    let displayEnd = calendar.date(byAdding: .day, value: -1, to: currentMonthAnchor) ?? currentMonthAnchor
    return NativeProtectedBillingCycleWindow(
        startDate: formatProtectedDate(previousAnchor, calendar: calendar),
        todayDate: formatProtectedDate(reference, calendar: calendar),
        nextResetDate: formatProtectedDate(currentMonthAnchor, calendar: calendar),
        displayEndDate: formatProtectedDate(displayEnd, calendar: calendar)
    )
}

func buildProtectedPastDaysRange(days: Int, now: Date = Date()) -> NativeProtectedDateRangeWindow {
    let calendar = Calendar(identifier: .gregorian)
    let endDate = calendar.startOfDay(for: now)
    let startDate = calendar.date(byAdding: .day, value: -(days - 1), to: endDate) ?? endDate
    return NativeProtectedDateRangeWindow(
        startDate: formatProtectedDate(startDate, calendar: calendar),
        endDate: formatProtectedDate(endDate, calendar: calendar)
    )
}

private func cycleAnchorDate(referenceMonth: Date, anchorDay: Int, calendar: Calendar) -> Date {
    let monthStart = calendar.date(from: calendar.dateComponents([.year, .month], from: referenceMonth)) ?? referenceMonth
    let validRange = calendar.range(of: .day, in: .month, for: monthStart) ?? 1..<29
    let day = min(anchorDay, validRange.upperBound - 1)
    return calendar.date(byAdding: .day, value: day - 1, to: monthStart) ?? monthStart
}

private func formatProtectedDate(_ date: Date, calendar: Calendar) -> String {
    let components = calendar.dateComponents([.year, .month, .day], from: date)
    let year = components.year ?? 1970
    let month = String(format: "%02d", components.month ?? 1)
    let day = String(format: "%02d", components.day ?? 1)
    return "\(year)-\(month)-\(day)"
}

private func optionalString(_ value: Any?) -> String? {
    let text = stringValue(value).trimmingCharacters(in: .whitespacesAndNewlines)
    return text.isEmpty ? nil : text
}

private func stringValue(_ value: Any?) -> String {
    if let text = value as? String { return text }
    if let number = value as? NSNumber { return number.stringValue }
    return ""
}

private func intValue(_ value: Any?) -> Int? {
    if let number = value as? Int { return number }
    if let number = value as? NSNumber { return number.intValue }
    if let text = value as? String { return Int(text) }
    return nil
}

private func int64Value(_ value: Any?) -> Int64? {
    if let number = value as? Int64 { return number }
    if let number = value as? Int { return Int64(number) }
    if let number = value as? NSNumber { return number.int64Value }
    if let text = value as? String { return Int64(text) }
    return nil
}

private func boolValue(_ value: Any?) -> Bool {
    if let bool = value as? Bool { return bool }
    if let number = value as? NSNumber { return number.boolValue }
    if let text = value as? String { return ["true", "1", "yes"].contains(text.lowercased()) }
    return false
}

private extension String {
    func nonEmpty(or fallback: String) -> String {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }
}

func buildProtectedTournamentSnapshot(bundle: NativeTournamentBundle) -> NativeProtectedTournamentSnapshot {
    let turnsSnapshot = buildTurnsSnapshot(bundle)
    let visibleMatches = visiblePublicMatches(bundle)
    let briefs = visibleMatches.map { buildProtectedMatchBrief(bundle: bundle, match: $0) }
    let upcomingPlayableMatches = Array(briefs.filter { !$0.match.played && $0.match.status != "finished" && $0.playable }.prefix(8))
    let blockedMatches = briefs.filter { !$0.match.played && $0.match.status != "finished" && $0.blockedByPlaceholder }

    return NativeProtectedTournamentSnapshot(
        visibleTeamCount: visibleTeamCount(bundle),
        visibleMatchCount: visibleMatches.count,
        playedCount: visibleMatches.filter { $0.played || $0.status == "finished" }.count,
        liveCount: visibleMatches.filter { $0.status == "playing" }.count,
        upcomingCount: upcomingPlayableMatches.count,
        tbdCount: turnsSnapshot.tbdMatches.count,
        turnsSnapshot: turnsSnapshot,
        featuredTurnBlocks: buildProtectedFeaturedTurnBlocks(snapshot: turnsSnapshot),
        upcomingPlayableMatches: upcomingPlayableMatches,
        blockedMatches: blockedMatches
    )
}

func buildProtectedFeaturedTurnBlocks(snapshot: NativeTurnsSnapshot) -> [NativeTurnBlock] {
    var featured: [NativeTurnBlock] = []
    if let live = snapshot.activeBlocks.first(where: { $0.isLive }) {
        featured.append(live)
    }
    if let next = snapshot.activeBlocks.first(where: { candidate in
        candidate.isNext && !featured.contains(where: { $0.id == candidate.id })
    }) {
        featured.append(next)
    }
    if featured.isEmpty, let first = snapshot.activeBlocks.first {
        featured.append(first)
    }
    return featured
}

func buildProtectedAvailableReferees(bundle: NativeTournamentBundle) -> [String] {
    var names: [String: String] = [:]
    for team in bundle.teams {
        let player1Legacy = team.isReferee && !team.player2IsReferee
        let player1Referee = team.player1IsReferee || player1Legacy
        let player2Referee = team.player2IsReferee
        if player1Referee, let normalized = normalizeProtectedRefereeName(team.player1) {
            names[normalized.lowercased()] = normalized
        }
        if player2Referee, let normalized = normalizeProtectedRefereeName(team.player2) {
            names[normalized.lowercased()] = normalized
        }
    }
    return names.values.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
}

func buildProtectedReportForm(draft: NativeProtectedReportDraft) -> [String: NativeProtectedReportFormInput] {
    Dictionary(
        uniqueKeysWithValues: draft.teams.flatMap { team in
            team.players.map { player in
                (
                    player.key,
                    NativeProtectedReportFormInput(
                        canestriText: String(player.canestri),
                        soffiText: String(player.soffi)
                    )
                )
            }
        }
    )
}

func buildProtectedReportDraft(
    bundle: NativeTournamentBundle,
    match: NativeMatchInfo,
    form: [String: NativeProtectedReportFormInput] = [:]
) -> NativeProtectedReportDraft {
    let seededStats = Dictionary(
        uniqueKeysWithValues: bundle.stats
            .filter { $0.matchId == match.id }
            .map { ("\($0.teamId)||\($0.playerName.trimmingCharacters(in: .whitespacesAndNewlines))", $0) }
    )

    let teams: [NativeProtectedReportTeamDraft] = Array([match.teamAId, match.teamBId].compactMap { $0 }).reduce(into: []) { partial, teamId in
        guard !partial.contains(where: { $0.teamId == teamId }) else { return }
        let team = bundle.teams.first(where: { $0.id == teamId })
        let teamName = bundle.teamName(for: teamId)
        let players = [team?.player1, team?.player2]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .map { playerName in
                let key = "\(teamId)||\(playerName)"
                let existing = seededStats[key]
                let override = form[key]
                return NativeProtectedReportPlayerDraft(
                    id: key,
                    teamId: teamId,
                    teamName: teamName,
                    playerName: playerName,
                    canestri: protectedReportStatValue(override?.canestriText) ?? existing?.canestri ?? 0,
                    soffi: protectedReportStatValue(override?.soffiText) ?? existing?.soffi ?? 0
                )
            }
        partial.append(
            NativeProtectedReportTeamDraft(
                id: teamId,
                teamId: teamId,
                teamName: teamName,
                players: players,
                derivedScore: players.reduce(0) { $0 + $1.canestri }
            )
        )
    }

    let derivedScoresByTeam = Dictionary(uniqueKeysWithValues: teams.map { ($0.teamId, $0.derivedScore) })
    let maxScore = derivedScoresByTeam.values.max() ?? 0
    let leaderIds = maxScore > 0 ? derivedScoresByTeam.filter { $0.value == maxScore }.map(\.key) : []

    return NativeProtectedReportDraft(
        match: match,
        title: [match.code, match.roundName, match.groupName].compactMap { $0 }.joined(separator: " • ").isEmpty
            ? "Report draft"
            : [match.code, match.roundName, match.groupName].compactMap { $0 }.joined(separator: " • "),
        playable: hasValidParticipants(bundle, match),
        teams: teams,
        derivedScoresByTeam: derivedScoresByTeam,
        winnerTeamId: leaderIds.count == 1 ? leaderIds[0] : nil,
        tieNotAllowed: maxScore > 0 && leaderIds.count != 1,
        hasStoredStats: !seededStats.isEmpty,
        totalPoints: teams.reduce(0) { $0 + $1.derivedScore },
        totalSoffi: teams.reduce(0) { partial, team in
            partial + team.players.reduce(0) { $0 + $1.soffi }
        }
    )
}

func buildProtectedReportSaveDraft(draft: NativeProtectedReportDraft) -> NativeProtectedReportSaveDraft {
    let teamADraft = draft.match.teamAId.flatMap { teamId in draft.teams.first(where: { $0.teamId == teamId }) }
    let teamBDraft = draft.match.teamBId.flatMap { teamId in draft.teams.first(where: { $0.teamId == teamId }) }
    let scoreA = teamADraft?.derivedScore ?? draft.match.scoreA
    let scoreB = teamBDraft?.derivedScore ?? draft.match.scoreB
    let stats = draft.teams.flatMap { team in
        team.players.map { player in
            NativeProtectedReportSaveStat(
                id: player.id,
                teamId: team.teamId,
                teamName: team.teamName,
                playerName: player.playerName,
                canestri: player.canestri,
                soffi: player.soffi
            )
        }
    }
    let blockReason: String? = {
        if !draft.playable { return "Blocked by BYE/TBD/slot libero." }
        if draft.tieNotAllowed { return "A unique winner is still required before saving." }
        if stats.isEmpty { return "No player stats are available for this match." }
        return nil
    }()
    let winnerTeamName = draft.winnerTeamId.flatMap { winnerId in
        draft.teams.first(where: { $0.teamId == winnerId })?.teamName
    }

    return NativeProtectedReportSaveDraft(
        matchId: draft.match.id,
        title: draft.title,
        scoreA: scoreA,
        scoreB: scoreB,
        scoreLabel: "\(scoreA) - \(scoreB)",
        winnerTeamId: draft.winnerTeamId,
        winnerTeamName: winnerTeamName,
        readyToSave: blockReason == nil,
        requiresOverwriteConfirm: draft.match.status == "finished",
        blockReason: blockReason,
        backendReady: false,
        backendNote: "The additive protected full-state read path is now prepared in the repo, but it still has to be applied on the real Supabase project before native save can be wired safely.",
        stats: stats
    )
}

func lookupProtectedMatchByCode(bundle: NativeTournamentBundle, rawCode: String?) -> NativeProtectedCodeLookupResult {
    let code = (rawCode ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    guard !code.isEmpty else {
        return NativeProtectedCodeLookupResult(
            normalizedCode: "",
            selectedMatch: nil,
            duplicateChoices: [],
            error: "Enter a report code."
        )
    }

    let hitsAll = visiblePublicMatches(bundle).filter {
        ($0.code ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == code
    }

    guard !hitsAll.isEmpty else {
        return NativeProtectedCodeLookupResult(
            normalizedCode: code,
            selectedMatch: nil,
            duplicateChoices: [],
            error: "Report code not found in the live tournament."
        )
    }

    let hits = hitsAll.filter { protectedMatchValidationError(bundle: bundle, match: $0) == nil }
    if hitsAll.count == 1, hits.isEmpty {
        return NativeProtectedCodeLookupResult(
            normalizedCode: code,
            selectedMatch: nil,
            duplicateChoices: [],
            error: protectedMatchValidationError(bundle: bundle, match: hitsAll[0]) ?? "Match not valid."
        )
    }

    if hits.count > 1 {
        let choices = hits
            .sorted {
                let leftRank = protectedMatchStatusRank($0)
                let rightRank = protectedMatchStatusRank($1)
                if leftRank != rightRank { return leftRank < rightRank }
                return ($0.orderIndex ?? .max) < ($1.orderIndex ?? .max)
            }
            .map { buildProtectedMatchBrief(bundle: bundle, match: $0) }
        return NativeProtectedCodeLookupResult(
            normalizedCode: code,
            selectedMatch: nil,
            duplicateChoices: choices,
            error: "Duplicate report code. Choose the correct match from the list below."
        )
    }

    guard let hit = hits.first else {
        return NativeProtectedCodeLookupResult(
            normalizedCode: code,
            selectedMatch: nil,
            duplicateChoices: [],
            error: "Match not valid."
        )
    }

    return NativeProtectedCodeLookupResult(
        normalizedCode: hit.code?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? code,
        selectedMatch: hit,
        duplicateChoices: [],
        error: nil
    )
}

private func buildProtectedMatchBrief(bundle: NativeTournamentBundle, match: NativeMatchInfo) -> NativeProtectedMatchBrief {
    let teamA = bundle.teams.first(where: { $0.id == match.teamAId })
    let teamB = bundle.teams.first(where: { $0.id == match.teamBId })
    let scoreLabel = (match.played || match.status == "finished" || match.status == "playing")
        ? "\(match.scoreA) - \(match.scoreB)"
        : "—"
    return NativeProtectedMatchBrief(
        id: match.id,
        match: match,
        title: [match.code, match.roundName, match.groupName].compactMap { $0 }.joined(separator: " • ").isEmpty
            ? "Match"
            : [match.code, match.roundName, match.groupName].compactMap { $0 }.joined(separator: " • "),
        teamALabel: bundle.teamName(for: match.teamAId),
        teamBLabel: bundle.teamName(for: match.teamBId),
        teamAPlayers: [teamA?.player1, teamA?.player2].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " • "),
        teamBPlayers: [teamB?.player1, teamB?.player2].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " • "),
        scoreLabel: scoreLabel,
        playable: hasValidParticipants(bundle, match),
        blockedByPlaceholder: !hasValidParticipants(bundle, match)
    )
}

private func protectedMatchStatusRank(_ match: NativeMatchInfo) -> Int {
    switch match.status {
    case "playing":
        return 0
    case "scheduled":
        return 1
    default:
        return 2
    }
}

private func protectedMatchValidationError(bundle: NativeTournamentBundle, match: NativeMatchInfo) -> String? {
    let participantIds = [match.teamAId, match.teamBId]
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    if participantIds.isEmpty {
        return "Match not valid (missing participants)."
    }

    let labels = participantIds.map { bundle.teamName(for: $0) }
    if labels.contains(where: isProtectedByeLabel) {
        return "This code resolves to a BYE. No report is required."
    }
    if labels.contains(where: isProtectedPlaceholderLabel) {
        return "This match still contains TBD/slot libero, so the report stays blocked."
    }

    return nil
}

private func isProtectedByeLabel(_ name: String) -> Bool {
    name.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == "BYE"
}

private func isProtectedPlaceholderLabel(_ name: String) -> Bool {
    let normalized = name.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    return normalized == "BYE" || normalized == "TBD" || normalized == "SLOT LIBERO" || normalized.hasPrefix("TBD-")
}

private func normalizeProtectedRefereeName(_ raw: String?) -> String? {
    guard let raw else { return nil }
    let normalized = raw
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    guard !normalized.isEmpty else { return nil }
    let upper = normalized.uppercased()
    switch upper {
    case "BYE", "TBD", "SLOT LIBERO":
        return nil
    default:
        return upper.hasPrefix("TBD-") ? nil : normalized
    }
}

private func protectedReportStatValue(_ raw: String?) -> Int? {
    guard let raw else { return nil }
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return 0 }
    guard let parsed = Int(trimmed) else { return 0 }
    return max(0, parsed)
}
