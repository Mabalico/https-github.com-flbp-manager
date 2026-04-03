import SwiftUI

struct AdminToolsScreenView: View {
    let session: NativeAdminSession?
    let access: NativeAdminAccessResult?
    let overview: NativeAdminOverview?
    let trafficRows: [NativeProtectedTrafficUsageRow]
    let trafficLoading: Bool
    let trafficError: String?
    let viewsRows: [NativeProtectedSiteViewsRow]
    let viewsLoading: Bool
    let viewsError: String?
    let busy: Bool
    let error: String?
    let catalog: NativePublicCatalog
    let leaderboardCount: Int
    let hallCount: Int
    let playerAccountRows: [NativePlayerAdminAccountRow]
    let liveBundle: NativeTournamentBundle?
    let liveBundleLoading: Bool
    let liveBundleError: String?
    let onLogin: (String, String) -> Void
    let onLogout: () -> Void
    let onRefreshAccess: () -> Void
    let onRefreshLiveBundle: () -> Void
    let onSavePlayerAccount: (String, String, String, String, String) async throws -> String

    @State private var email = NativeProtectedAPI.defaultAdminEmail()
    @State private var password = ""
    @State private var accountSearch = ""
    @State private var accountFilter = "all"
    @State private var selectedAccountId = ""
    @State private var selectedAccountEmail = ""
    @State private var selectedAccountFirstName = ""
    @State private var selectedAccountLastName = ""
    @State private var selectedAccountBirthDate = ""
    @State private var playerAccountsInfo: String?
    @State private var playerAccountsError: String?

    private var publishedTournamentCount: Int {
        catalog.history.count + (catalog.liveTournament == nil ? 0 : 1)
    }

    private var turnsSnapshot: NativeTurnsSnapshot? {
        liveBundle.map(buildTurnsSnapshot)
    }

    private var protectedSnapshot: NativeProtectedTournamentSnapshot? {
        liveBundle.map(buildProtectedTournamentSnapshot)
    }

    private var billingCycleWindow: NativeProtectedBillingCycleWindow {
        buildProtectedBillingCycleWindow()
    }

    private var trafficSummary: NativeProtectedTrafficSummary {
        buildProtectedTrafficSummary(rows: trafficRows)
    }

    private var siteViewsSummary: NativeProtectedSiteViewsSummary {
        buildProtectedSiteViewsSummary(rows: viewsRows)
    }

    private var filteredAccountRows: [NativePlayerAdminAccountRow] {
        buildFilteredNativeAdminAccountRows(
            rows: playerAccountRows,
            query: accountSearch,
            providerFilter: accountFilter
        )
    }

    private var selectedAccount: NativePlayerAdminAccountRow? {
        filteredAccountRows.first(where: { $0.id == selectedAccountId })
            ?? playerAccountRows.first(where: { $0.id == selectedAccountId })
            ?? filteredAccountRows.first
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HeroCard(
                    title: "Admin",
                    body: "This native checkpoint now uses the same Supabase Auth + admin_users gate as FLBP ONLINE. The full admin dashboard is still web-first and will be migrated screen by screen."
                )

                if busy {
                    LoadingCard(message: "Checking admin access…")
                } else if session == nil {
                    SectionCard(title: "Supabase admin login") {
                        Text("Use the same admin account configured in Supabase Auth for the web app.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        TextField("Admin email", text: $email)
                            .textFieldStyle(.roundedBorder)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        SecureField("Password", text: $password)
                            .textFieldStyle(.roundedBorder)
                        if let error, !error.isEmpty {
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(.red)
                        }
                        Button("Sign in") {
                            onLogin(email, password)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                } else if access?.ok == true {
                    SectionCard(title: "Authenticated admin session") {
                        Text(access?.email ?? session?.email ?? NativeProtectedAPI.defaultAdminEmail())
                            .font(.title3.weight(.black))
                        Text("Admin role verified against public.admin_users. Native write tools are not migrated yet, but the protected entry gate now matches the real web app.")
                            .font(.body)
                        if let userId = access?.userId, !userId.isEmpty {
                            Text("User id: \(userId)")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        HStack(spacing: 8) {
                            Button("Re-check access", action: onRefreshAccess)
                                .buttonStyle(.bordered)
                            Button("Sign out", action: onLogout)
                                .buttonStyle(.bordered)
                        }
                    }

                    SectionCard(title: "Published workspace snapshot") {
                        MetadataRow(label: "Workspace", value: "default")
                        MetadataRow(label: "Admin snapshot", value: formatProtectedTimestamp(overview?.workspaceStateUpdatedAt))
                        MetadataRow(label: "Public snapshot", value: formatProtectedTimestamp(overview?.publicWorkspaceStateUpdatedAt))
                        MetadataRow(label: "Published tournaments", value: "\(publishedTournamentCount)")
                        MetadataRow(label: "Career leaderboard", value: "\(leaderboardCount)")
                        MetadataRow(label: "Hall of fame", value: "\(hallCount)")
                    }

                    SectionCard(title: "Supabase traffic") {
                        Text("Read-only estimate from app_supabase_usage_daily for the current billing cycle.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        MetadataRow(
                            label: "Cycle window",
                            value: "\(formatProtectedDateLabel(billingCycleWindow.startDate)) → \(formatProtectedDateLabel(billingCycleWindow.displayEndDate))"
                        )
                        MetadataRow(
                            label: "Next reset",
                            value: formatProtectedDateLabel(billingCycleWindow.nextResetDate)
                        )
                        if trafficLoading {
                            Text("Loading traffic usage…")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        } else if let trafficError, !trafficError.isEmpty {
                            Text(trafficError)
                                .font(.footnote)
                                .foregroundStyle(.red)
                        } else if trafficRows.isEmpty {
                            Text("No usage rows available for the current billing cycle yet.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        } else {
                            let remainingBytes = max(0, protectedMonthlyBudgetBytes - trafficSummary.totalBytes)
                            MetadataRow(label: "Cycle total", value: formatProtectedBytes(trafficSummary.totalBytes))
                            MetadataRow(label: "Budget", value: formatProtectedBytes(protectedMonthlyBudgetBytes))
                            MetadataRow(label: "Remaining", value: formatProtectedBytes(remainingBytes))
                            MetadataRow(label: "Requests", value: "\(trafficSummary.totalRequests)")
                            Text("Buckets")
                                .font(.subheadline.weight(.semibold))
                            ForEach(trafficSummary.bucketRows) { bucket in
                                MetadataRow(
                                    label: protectedBucketLabel(bucket.bucket),
                                    value: "\(formatProtectedBytes(bucket.totalBytes)) • \(bucket.requestCount) req"
                                )
                            }
                        }
                    }

                    SectionCard(title: "Public site views") {
                        Text("Read-only public counter from public_site_views_daily over the last 30 days.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        if viewsLoading {
                            Text("Loading public views…")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        } else if let viewsError, !viewsError.isEmpty {
                            Text(viewsError)
                                .font(.footnote)
                                .foregroundStyle(.red)
                        } else if viewsRows.isEmpty {
                            Text("No site-view rows available for the last 30 days yet.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        } else {
                            MetadataRow(label: "Range", value: "Last 30 days")
                            MetadataRow(label: "Total views", value: "\(siteViewsSummary.totalViews)")
                            MetadataRow(label: "Average / day", value: String(format: "%.1f", siteViewsSummary.averagePerDay))
                            MetadataRow(label: "Peak day", value: siteViewsSummary.peakDayLabel)
                        }
                    }

                    SectionCard(title: "Player accounts") {
                        Text("This native catalog mirrors the web 'Account giocatori' section and prefers live Supabase data when available. Password reset stays disabled here until Supabase Auth + SMTP are activated live.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        TextField("Search email or linked player", text: $accountSearch)
                            .textFieldStyle(.roundedBorder)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Picker("Provider", selection: $accountFilter) {
                            ForEach(nativeAdminAccountFilterOptions(), id: \.id) { option in
                                Text(option.label).tag(option.id)
                            }
                        }
                        .pickerStyle(.menu)
                        if filteredAccountRows.isEmpty {
                            Text(playerAccountRows.isEmpty ? "No player accounts are available yet." : "No player accounts match the current filter.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        } else {
                            Text("Accounts")
                                .font(.subheadline.weight(.semibold))
                            ForEach(Array(filteredAccountRows.prefix(12))) { row in
                                Button(buildNativeAdminAccountButtonLabel(row)) {
                                    selectedAccountId = row.id
                                    hydrateSelectedAccountForm(row)
                                }
                                .buttonStyle(.bordered)
                            }
                        }

                        if let selectedAccount {
                            Text("Selected account")
                                .font(.subheadline.weight(.semibold))
                            MetadataRow(label: "Mode", value: "\(selectedAccount.mode) • \(selectedAccount.providers.joined(separator: ", "))")
                            MetadataRow(label: "Created", value: formatProtectedTimestamp(selectedAccount.createdAt))
                            MetadataRow(label: "Last login", value: formatProtectedTimestamp(selectedAccount.lastLoginAt))
                            MetadataRow(
                                label: "Linked player",
                                value: selectedAccount.canonicalPlayerName ?? selectedAccount.linkedPlayerName ?? "Not linked yet"
                            )
                            MetadataRow(label: "Career baskets", value: "\(selectedAccount.totalCanestri)")
                            MetadataRow(label: "Career soffi", value: "\(selectedAccount.totalSoffi)")
                            MetadataRow(label: "Titles", value: "\(selectedAccount.totalTitles)")
                            TextField("Email", text: $selectedAccountEmail)
                                .textFieldStyle(.roundedBorder)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                            HStack(spacing: 8) {
                                TextField("First name", text: $selectedAccountFirstName)
                                    .textFieldStyle(.roundedBorder)
                                TextField("Last name", text: $selectedAccountLastName)
                                    .textFieldStyle(.roundedBorder)
                            }
                            TextField("Birth date (YYYY-MM-DD)", text: $selectedAccountBirthDate)
                                .textFieldStyle(.roundedBorder)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                            Text("Password recovery here will stay read-only until we connect a real admin sender/SMTP on the live rollout.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            if let playerAccountsError, !playerAccountsError.isEmpty {
                                Text(playerAccountsError)
                                    .font(.footnote)
                                    .foregroundStyle(.red)
                            }
                            if let playerAccountsInfo, !playerAccountsInfo.isEmpty {
                                Text(playerAccountsInfo)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            Button("Save account") {
                                Task {
                                    do {
                                        let message = try await onSavePlayerAccount(
                                            selectedAccount.id,
                                            selectedAccountEmail,
                                            selectedAccountFirstName,
                                            selectedAccountLastName,
                                            selectedAccountBirthDate
                                        )
                                        playerAccountsInfo = message
                                        playerAccountsError = nil
                                    } catch {
                                        playerAccountsError = error.localizedDescription
                                        playerAccountsInfo = nil
                                    }
                                }
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }

                    if catalog.liveTournament == nil {
                        EmptyStateCard(message: "No live tournament is currently published.")
                    } else if liveBundleLoading && liveBundle == nil {
                        LoadingCard(message: "Loading live tournament snapshot…")
                    } else if let liveBundleError, liveBundle == nil {
                        ErrorCard(message: liveBundleError, onRetry: onRefreshLiveBundle)
                    } else if let liveBundle, let snapshot = protectedSnapshot {
                        SectionCard(title: "Live tournament snapshot") {
                            MetadataRow(label: "Tournament", value: liveBundle.tournament.name)
                            MetadataRow(label: "Date", value: formatDateLabel(liveBundle.tournament.startDate))
                            MetadataRow(label: "Format", value: formatTournamentType(liveBundle.tournament.type))
                            MetadataRow(label: "Visible teams", value: "\(snapshot.visibleTeamCount)")
                            MetadataRow(label: "Visible matches", value: "\(snapshot.visibleMatchCount)")
                            MetadataRow(label: "Played", value: "\(snapshot.playedCount)")
                            MetadataRow(label: "Playing", value: "\(snapshot.liveCount)")
                            MetadataRow(label: "Upcoming", value: "\(snapshot.upcomingCount)")
                            MetadataRow(label: "Tables / turn", value: "\(snapshot.turnsSnapshot.tablesPerTurn)")

                            if !snapshot.featuredTurnBlocks.isEmpty {
                                Text("Turn monitor")
                                    .font(.subheadline.weight(.semibold))
                                ForEach(snapshot.featuredTurnBlocks) { block in
                                    Text("Turn \(block.turnNumber) • \(block.statusLabel)")
                                        .font(.footnote.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                    ForEach(Array(block.matches.prefix(3))) { match in
                                        MatchCard(bundle: liveBundle, match: match)
                                    }
                                }
                            }

                            if snapshot.tbdCount > 0 {
                                Text("TBD blocked matches: \(snapshot.tbdCount)")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    } else {
                        EmptyStateCard(message: "Live tournament snapshot not available yet.")
                    }
                } else {
                    SectionCard(title: "Admin access denied") {
                        Text(error ?? access?.reason ?? "This authenticated account does not have admin access.")
                            .foregroundStyle(.red)
                        Button("Clear session", action: onLogout)
                            .buttonStyle(.bordered)
                    }
                }
            }
            .padding(16)
        }
        .onAppear {
            if let sessionEmail = session?.email, !sessionEmail.isEmpty {
                email = sessionEmail
            }
            if selectedAccountId.isEmpty {
                selectedAccountId = filteredAccountRows.first?.id ?? ""
                hydrateSelectedAccountForm(selectedAccount)
            }
        }
        .onChange(of: filteredAccountRows.map(\.id).joined(separator: "|")) { _ in
            if filteredAccountRows.contains(where: { $0.id == selectedAccountId }) == false {
                selectedAccountId = filteredAccountRows.first?.id ?? ""
                hydrateSelectedAccountForm(selectedAccount)
            }
        }
        .onChange(of: selectedAccountId) { _ in
            hydrateSelectedAccountForm(selectedAccount)
        }
    }

    private func hydrateSelectedAccountForm(_ row: NativePlayerAdminAccountRow?) {
        selectedAccountEmail = row?.email ?? ""
        selectedAccountBirthDate = row?.birthDate ?? ""
        let parts = splitNativeCanonicalPlayerName(row?.linkedPlayerName)
        selectedAccountLastName = parts.lastName
        selectedAccountFirstName = parts.firstName
        playerAccountsInfo = nil
        playerAccountsError = nil
    }
}

private let protectedMonthlyBudgetBytes = 5 * 1024 * 1024 * 1024

private struct NativeProtectedTrafficBucketSummary: Identifiable {
    let id: String
    let bucket: String
    let requestCount: Int
    let totalBytes: Int
}

private struct NativeProtectedTrafficSummary {
    let totalRequests: Int
    let totalBytes: Int
    let bucketRows: [NativeProtectedTrafficBucketSummary]
}

private struct NativeProtectedSiteViewsSummary {
    let totalViews: Int
    let averagePerDay: Double
    let peakDayLabel: String
}

private struct NativeAdminAccountFilterOption: Identifiable {
    let id: String
    let label: String
}

private struct NativeCanonicalNameParts {
    let lastName: String
    let firstName: String
}

private func nativeAdminAccountFilterOptions() -> [NativeAdminAccountFilterOption] {
    [
        NativeAdminAccountFilterOption(id: "all", label: "All"),
        NativeAdminAccountFilterOption(id: "in_app", label: "In app"),
        NativeAdminAccountFilterOption(id: "google", label: "Google"),
        NativeAdminAccountFilterOption(id: "facebook", label: "Facebook"),
        NativeAdminAccountFilterOption(id: "apple", label: "Apple"),
        NativeAdminAccountFilterOption(id: "other", label: "Other"),
    ]
}

private func buildFilteredNativeAdminAccountRows(
    rows: [NativePlayerAdminAccountRow],
    query: String,
    providerFilter: String
) -> [NativePlayerAdminAccountRow] {
    let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return rows.filter { row in
        let matchesProvider: Bool = {
            switch providerFilter {
            case "all":
                return true
            case "in_app":
                return row.origin.lowercased() == "in_app" || row.provider.lowercased().contains("password")
            case "other":
                let provider = row.provider.lowercased()
                return !["preview_password", "google", "facebook", "apple"].contains(provider)
            default:
                return row.provider.lowercased() == providerFilter.lowercased()
                    || row.providers.contains(where: { $0.lowercased() == providerFilter.lowercased() })
            }
        }()
        let matchesQuery = normalizedQuery.isEmpty
            || row.email.lowercased().contains(normalizedQuery)
            || (row.linkedPlayerName?.lowercased().contains(normalizedQuery) ?? false)
            || (row.canonicalPlayerName?.lowercased().contains(normalizedQuery) ?? false)
        return matchesProvider && matchesQuery
    }
}

private func buildNativeAdminAccountButtonLabel(_ row: NativePlayerAdminAccountRow) -> String {
    let linkedLabel = row.canonicalPlayerName ?? row.linkedPlayerName ?? "Profile pending"
    return "\(row.email) • \(linkedLabel)"
}

private func splitNativeCanonicalPlayerName(_ rawName: String?) -> NativeCanonicalNameParts {
    let safeName = rawName?
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression) ?? ""
    guard !safeName.isEmpty else {
        return NativeCanonicalNameParts(lastName: "", firstName: "")
    }
    guard let firstSpaceIndex = safeName.firstIndex(of: " ") else {
        return NativeCanonicalNameParts(lastName: safeName, firstName: "")
    }
    let lastName = String(safeName[..<firstSpaceIndex]).trimmingCharacters(in: .whitespacesAndNewlines)
    let firstName = String(safeName[safeName.index(after: firstSpaceIndex)...]).trimmingCharacters(in: .whitespacesAndNewlines)
    return NativeCanonicalNameParts(lastName: lastName, firstName: firstName)
}

private func buildProtectedTrafficSummary(rows: [NativeProtectedTrafficUsageRow]) -> NativeProtectedTrafficSummary {
    var totalsByBucket: [String: NativeProtectedTrafficBucketSummary] = [:]
    var totalRequests = 0
    var totalBytes = 0
    for row in rows {
        let bucket = row.bucket.isEmpty ? "unknown" : row.bucket
        let rowTotalBytes = row.requestBytes + row.responseBytes
        totalRequests += row.requestCount
        totalBytes += rowTotalBytes
        let current = totalsByBucket[bucket]
        totalsByBucket[bucket] = NativeProtectedTrafficBucketSummary(
            id: bucket,
            bucket: bucket,
            requestCount: (current?.requestCount ?? 0) + row.requestCount,
            totalBytes: (current?.totalBytes ?? 0) + rowTotalBytes
        )
    }
    return NativeProtectedTrafficSummary(
        totalRequests: totalRequests,
        totalBytes: totalBytes,
        bucketRows: totalsByBucket.values.sorted { $0.totalBytes > $1.totalBytes }
    )
}

private func protectedBucketLabel(_ bucket: String) -> String {
    switch bucket.lowercased() {
    case "public":
        return "Public"
    case "tv":
        return "TV"
    case "admin":
        return "Admin"
    case "referee":
        return "Referee"
    case "sync":
        return "Sync"
    default:
        return "Unknown"
    }
}

private func formatProtectedBytes(_ value: Int) -> String {
    if value <= 0 { return "0 B" }
    let bytes = Double(value)
    if bytes >= 1024 * 1024 * 1024 {
        return String(format: "%.2f GB", bytes / (1024 * 1024 * 1024))
    }
    if bytes >= 1024 * 1024 {
        return String(format: "%.2f MB", bytes / (1024 * 1024))
    }
    if bytes >= 1024 {
        return String(format: "%.1f KB", bytes / 1024)
    }
    return "\(value) B"
}

private func formatProtectedDateLabel(_ raw: String) -> String {
    let parser = DateFormatter()
    parser.locale = Locale(identifier: "en_US_POSIX")
    parser.dateFormat = "yyyy-MM-dd"
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "dd MMM yyyy"
    if let date = parser.date(from: raw) {
        return formatter.string(from: date)
    }
    return raw
}

private func buildProtectedSiteViewsSummary(rows: [NativeProtectedSiteViewsRow]) -> NativeProtectedSiteViewsSummary {
    let totalViews = rows.reduce(0) { $0 + $1.views }
    let averagePerDay = rows.isEmpty ? 0.0 : Double(totalViews) / Double(rows.count)
    let peakRow = rows.max(by: { $0.views < $1.views })
    let peakDayLabel = peakRow.map { "\(formatProtectedDateLabel($0.viewDate)) • \($0.views)" } ?? "ND"
    return NativeProtectedSiteViewsSummary(
        totalViews: totalViews,
        averagePerDay: averagePerDay,
        peakDayLabel: peakDayLabel
    )
}

struct RefereesToolsScreenView: View {
    let liveTournament: NativeTournamentSummary?
    let authedTournamentId: String?
    let busy: Bool
    let error: String?
    let liveBundle: NativeTournamentBundle?
    let liveBundleLoading: Bool
    let liveBundleError: String?
    let onVerifyPassword: (String) -> Void
    let onLogout: () -> Void
    let onRefreshLiveBundle: () -> Void
    private let protectedCache = NativeProtectedCache()

    @State private var password = ""
    @State private var selectedReferee = ""
    @State private var manualRefereeName = ""
    @State private var refereeIdentityError: String?
    @State private var reportCode = ""
    @State private var reportCodeError: String?
    @State private var codeChoices: [NativeProtectedMatchBrief] = []
    @State private var selectedMatchId: String?
    @State private var reportForm: [String: NativeProtectedReportFormInput] = [:]

    private var isAuthed: Bool {
        guard let liveTournament else { return false }
        return authedTournamentId == liveTournament.id
    }

    private var protectedSnapshot: NativeProtectedTournamentSnapshot? {
        liveBundle.map(buildProtectedTournamentSnapshot)
    }

    private var availableReferees: [String] {
        liveBundle.map(buildProtectedAvailableReferees) ?? []
    }

    private var selectedMatch: NativeMatchInfo? {
        guard let liveBundle, let selectedMatchId else { return nil }
        return liveBundle.matches.first(where: { $0.id == selectedMatchId })
    }

    private var selectedReportDraft: NativeProtectedReportDraft? {
        guard let liveBundle, let selectedMatch else { return nil }
        return buildProtectedReportDraft(bundle: liveBundle, match: selectedMatch, form: reportForm)
    }

    private var selectedSaveDraft: NativeProtectedReportSaveDraft? {
        selectedReportDraft.map(buildProtectedReportSaveDraft)
    }

    private func openMatch(_ match: NativeMatchInfo) {
        if isAuthed && selectedReferee.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            refereeIdentityError = "Select referee identity first."
            return
        }
        selectedMatchId = match.id
        reportCode = (match.code ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        reportCodeError = nil
        codeChoices = []
        refereeIdentityError = nil
        if let liveBundle {
            reportForm = buildProtectedReportForm(draft: buildProtectedReportDraft(bundle: liveBundle, match: match))
        } else {
            reportForm = [:]
        }
    }

    private func applyCodeLookup(_ result: NativeProtectedCodeLookupResult) {
        reportCode = result.normalizedCode
        reportCodeError = result.error
        codeChoices = result.duplicateChoices
        selectedMatchId = result.selectedMatch?.id
        if let liveBundle, let match = result.selectedMatch {
            reportForm = buildProtectedReportForm(draft: buildProtectedReportDraft(bundle: liveBundle, match: match))
        } else if result.selectedMatch == nil {
            reportForm = [:]
        }
    }

    private func useRefereeIdentity(_ rawName: String) {
        let normalized = rawName
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        guard !normalized.isEmpty else {
            refereeIdentityError = "Enter a valid referee name."
            return
        }
        selectedReferee = normalized
        manualRefereeName = normalized
        refereeIdentityError = nil
        if let liveTournament {
            protectedCache.writeSelectedRefereeName(tournamentId: liveTournament.id, refereeName: normalized)
        }
    }

    private func updateReportForm(playerKey: String, canestriText: String? = nil, soffiText: String? = nil) {
        let current = reportForm[playerKey] ?? NativeProtectedReportFormInput(canestriText: "", soffiText: "")
        reportForm[playerKey] = NativeProtectedReportFormInput(
            canestriText: canestriText ?? current.canestriText,
            soffiText: soffiText ?? current.soffiText
        )
    }

    private func resetReportForm() {
        guard let liveBundle, let selectedMatch else {
            reportForm = [:]
            return
        }
        reportForm = buildProtectedReportForm(draft: buildProtectedReportDraft(bundle: liveBundle, match: selectedMatch))
    }

    private func clearReportForm() {
        guard let selectedReportDraft else {
            reportForm = [:]
            return
        }
        reportForm = Dictionary(
            uniqueKeysWithValues: selectedReportDraft.teams.flatMap { team in
                team.players.map { player in
                    (player.id, NativeProtectedReportFormInput(canestriText: "0", soffiText: "0"))
                }
            }
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HeroCard(
                    title: "Referees area",
                    body: "This native checkpoint now verifies the real referee password through the live tournament RPC and, when the additive rollout is available, also tries to pull the live state before refreshing the local read-only bundle. Full OCR/report entry stays web-first until we migrate that workflow deliberately."
                )

                if let liveTournament {
                    PrimaryActionCard(
                        title: liveTournament.name,
                        subtitle: "\(formatDateLabel(liveTournament.startDate)) • \(formatTournamentType(liveTournament.type)) • LIVE",
                        bodyText: isAuthed
                            ? "Referee access for this live tournament is active on this device."
                            : "Use the live tournament password to unlock the protected referee route on this device.",
                        primaryLabel: isAuthed ? "Forget access" : "Refresh live detail",
                        onPrimary: isAuthed ? onLogout : onRefreshLiveBundle,
                        secondaryLabel: isAuthed ? "Refresh live detail" : nil,
                        onSecondary: isAuthed ? onRefreshLiveBundle : nil
                    )

                    if !isAuthed {
                        SectionCard(title: "Referee password") {
                            SecureField("Tournament password", text: $password)
                                .textFieldStyle(.roundedBorder)
                            if let error, !error.isEmpty {
                                Text(error)
                                    .font(.footnote)
                                    .foregroundStyle(.red)
                            }
                            Button(busy ? "Checking…" : "Unlock referees route") {
                                onVerifyPassword(password)
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(busy)
                        }
                    }

                    if liveBundleLoading {
                        LoadingCard(message: "Loading live tournament detail…")
                    } else if let liveBundleError, liveBundle == nil {
                        ErrorCard(message: liveBundleError, onRetry: onRefreshLiveBundle)
                    } else if let liveBundle, let snapshot = protectedSnapshot {
                        SectionCard(title: "Turn monitor") {
                            MetadataRow(label: "Tables / turn", value: "\(snapshot.turnsSnapshot.tablesPerTurn)")
                            MetadataRow(label: "Visible matches", value: "\(snapshot.visibleMatchCount)")
                            MetadataRow(label: "Playing now", value: "\(snapshot.liveCount)")
                            MetadataRow(label: "Played", value: "\(snapshot.playedCount)")
                            MetadataRow(label: "TBD blocked", value: "\(snapshot.tbdCount)")

                            if !snapshot.featuredTurnBlocks.isEmpty {
                                ForEach(snapshot.featuredTurnBlocks) { block in
                                    Text("Turn \(block.turnNumber) • \(block.statusLabel)")
                                        .font(.footnote.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                    ForEach(Array(block.matches.prefix(4))) { match in
                                        MatchCard(bundle: liveBundle, match: match) { openMatch(match) }
                                    }
                                }
                            }
                        }

                        if isAuthed {
                            SectionCard(title: "Referee identity") {
                                Text("Choose the referee identity used on this device before opening a live report draft.")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)

                                if !selectedReferee.isEmpty {
                                    MetadataRow(label: "Selected", value: selectedReferee)
                                }

                                if availableReferees.isEmpty {
                                    Text("No referee roster is currently exposed in the public tournament teams. You can still use a manual referee name on this device.")
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                } else {
                                    ForEach(availableReferees, id: \.self) { refereeName in
                                        Button(refereeName) {
                                            useRefereeIdentity(refereeName)
                                        }
                                        .buttonStyle(.bordered)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                }

                                TextField("Manual referee name", text: $manualRefereeName)
                                    .textFieldStyle(.roundedBorder)
                                    .autocorrectionDisabled()

                                HStack(spacing: 8) {
                                    Button("Use this name") {
                                        useRefereeIdentity(manualRefereeName)
                                    }
                                    .buttonStyle(.borderedProminent)

                                    Button("Clear") {
                                        selectedReferee = ""
                                        manualRefereeName = ""
                                        selectedMatchId = nil
                                        reportForm = [:]
                                        reportCodeError = nil
                                        refereeIdentityError = nil
                                        if let liveTournament {
                                            protectedCache.writeSelectedRefereeName(tournamentId: liveTournament.id, refereeName: nil)
                                        }
                                    }
                                    .buttonStyle(.bordered)
                                }

                                if let refereeIdentityError, !refereeIdentityError.isEmpty {
                                    Text(refereeIdentityError)
                                        .font(.footnote)
                                        .foregroundStyle(.red)
                                }
                            }

                            SectionCard(title: "Open report by code") {
                                Text("Use the paper report code when you have it. If the code is duplicated, choose the correct match from the list below.")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                TextField(
                                    "Report code",
                                    text: Binding(
                                        get: { reportCode },
                                        set: { newValue in
                                            reportCode = newValue.uppercased()
                                            if reportCodeError != nil { reportCodeError = nil }
                                            if !codeChoices.isEmpty { codeChoices = [] }
                                        }
                                    )
                                )
                                .textFieldStyle(.roundedBorder)
                                .textInputAutocapitalization(.characters)
                                .autocorrectionDisabled()

                                Button("Open match") {
                                    applyCodeLookup(lookupProtectedMatchByCode(bundle: liveBundle, rawCode: reportCode))
                                }
                                .buttonStyle(.borderedProminent)
                                .disabled(selectedReferee.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                                if let reportCodeError, !reportCodeError.isEmpty {
                                    Text(reportCodeError)
                                        .font(.footnote)
                                        .foregroundStyle(.red)
                                }

                                if !codeChoices.isEmpty {
                                    Text("Duplicate report code")
                                        .font(.subheadline.weight(.semibold))
                                    ForEach(Array(codeChoices.prefix(6))) { brief in
                                        ProtectedMatchBriefCard(bundle: liveBundle, brief: brief) {
                                            openMatch(brief.match)
                                        }
                                    }
                                }
                            }
                        }

                        SectionCard(title: "Upcoming playable matches") {
                            if snapshot.upcomingPlayableMatches.isEmpty {
                                Text("No upcoming playable matches are currently visible in the public bundle.")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            } else {
                                ForEach(snapshot.upcomingPlayableMatches) { brief in
                                    ProtectedMatchBriefCard(bundle: liveBundle, brief: brief) {
                                        openMatch(brief.match)
                                    }
                                }
                            }
                        }

                        if !snapshot.blockedMatches.isEmpty {
                            SectionCard(title: "Blocked by placeholders") {
                                Text("These matches stay blocked because at least one participant is still BYE/TBD/slot libero.")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                ForEach(Array(snapshot.blockedMatches.prefix(6))) { brief in
                                    ProtectedMatchBriefCard(bundle: liveBundle, brief: brief) {
                                        openMatch(brief.match)
                                    }
                                }
                            }
                        }

                        if isAuthed {
                            SectionCard(title: "Report draft") {
                                if selectedReferee.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                    Text("Select referee identity first to inspect the report draft.")
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                } else if let selectedReportDraft, let selectedSaveDraft {
                                    MetadataRow(label: "Referee", value: selectedReferee)
                                    ProtectedReportDraftCard(
                                        draft: selectedReportDraft,
                                        saveDraft: selectedSaveDraft,
                                        form: reportForm,
                                        onCanestriChange: { playerKey, nextValue in
                                            updateReportForm(
                                                playerKey: playerKey,
                                                canestriText: String(nextValue.filter { $0.isNumber })
                                            )
                                        },
                                        onSoffiChange: { playerKey, nextValue in
                                            updateReportForm(
                                                playerKey: playerKey,
                                                soffiText: String(nextValue.filter { $0.isNumber })
                                            )
                                        },
                                        onResetForm: resetReportForm,
                                        onClearForm: clearReportForm
                                    )
                                } else {
                                    Text("Select a live match to inspect the native report draft.")
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }

                        if isAuthed {
                            SectionCard(title: "Live teams") {
                                ForEach(liveBundle.teams.filter {
                                    let label = $0.name.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
                                    return label != "BYE" && label != "TBD" && label != "SLOT LIBERO"
                                }) { team in
                                    TeamCard(team: team)
                                }
                            }
                        }
                    } else {
                        EmptyStateCard(message: "Live bundle not available yet.")
                    }
                } else {
                    EmptyStateCard(message: "No live tournament is currently published, so the native referees route stays empty-safe.")
                }
            }
            .padding(16)
        }
        .onAppear {
            guard selectedReferee.isEmpty, let liveTournament else { return }
            if let cachedName = protectedCache.readSelectedRefereeName(tournamentId: liveTournament.id) {
                selectedReferee = cachedName
                if manualRefereeName.isEmpty {
                    manualRefereeName = cachedName
                }
            }
        }
    }
}

private func formatProtectedTimestamp(_ raw: String?) -> String {
    guard let raw, !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "ND" }
    return raw.replacingOccurrences(of: "T", with: " ").split(separator: ".").first.map(String.init) ?? raw
}

private func formatProtectedTimestamp(_ raw: TimeInterval?) -> String {
    guard let raw, raw > 0 else { return "ND" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
    return formatter.string(from: Date(timeIntervalSince1970: raw))
}

private struct ProtectedMatchBriefCard: View {
    let bundle: NativeTournamentBundle
    let brief: NativeProtectedMatchBrief
    let onTap: () -> Void

    var body: some View {
        SectionCard(title: brief.title) {
            MatchCard(bundle: bundle, match: brief.match, onTap: onTap)
            Text("\(brief.teamALabel): \(brief.teamAPlayers.isEmpty ? "Roster pending" : brief.teamAPlayers)")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Text("\(brief.teamBLabel): \(brief.teamBPlayers.isEmpty ? "Roster pending" : brief.teamBPlayers)")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}

private struct ProtectedReportDraftCard: View {
    let draft: NativeProtectedReportDraft
    let saveDraft: NativeProtectedReportSaveDraft
    let form: [String: NativeProtectedReportFormInput]
    let onCanestriChange: (String, String) -> Void
    let onSoffiChange: (String, String) -> Void
    let onResetForm: () -> Void
    let onClearForm: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("This mirrors the web manual referee form: you can edit baskets/soffi locally on the device, while native save/OCR stays out of scope until the protected write path is migrated.")
                .font(.footnote)
                .foregroundStyle(.secondary)

            MetadataRow(label: "Match", value: draft.title)
            MetadataRow(label: "Stored stats", value: draft.hasStoredStats ? "Yes" : "No")
            MetadataRow(label: "Derived total baskets", value: "\(draft.totalPoints)")
            MetadataRow(label: "Derived total soffi", value: "\(draft.totalSoffi)")
            if let winnerTeamId,
               let winnerTeam = draft.teams.first(where: { $0.teamId == winnerTeamId }) {
                MetadataRow(label: "Derived winner", value: winnerTeam.teamName)
            }

            if !draft.playable {
                Text("This match is still blocked by BYE/TBD/slot libero, so the report draft stays locked.")
                    .font(.footnote)
                    .foregroundStyle(.red)
            } else if draft.tieNotAllowed {
                Text("Tie still detected in the derived score. The web flow would require a unique winner before saving the report.")
                    .font(.footnote)
                    .foregroundStyle(.red)
            }

            Button("Reset from stored stats", action: onResetForm)
                .buttonStyle(.bordered)

            Button("Clear all stats", action: onClearForm)
                .buttonStyle(.bordered)

            Text(saveDraft.readyToSave ? "Save draft looks internally valid." : "Save draft still blocked.")
                .font(.subheadline.weight(.semibold))
            MetadataRow(label: "Planned score", value: saveDraft.scoreLabel)
            MetadataRow(label: "Winner", value: saveDraft.winnerTeamName ?? "ND")
            MetadataRow(label: "Overwrite confirm", value: saveDraft.requiresOverwriteConfirm ? "Required" : "Not needed")
            MetadataRow(label: "Remote backend", value: saveDraft.backendReady ? "Ready" : "Not ready")
            if let blockReason = saveDraft.blockReason {
                Text(blockReason)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
            Text(saveDraft.backendNote)
                .font(.footnote)
                .foregroundStyle(.secondary)

            ForEach(draft.teams) { team in
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(team.teamName) • \(team.derivedScore)")
                        .font(.subheadline.weight(.semibold))
                    if team.players.isEmpty {
                        Text("Roster pending")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(team.players) { player in
                            let input = form[player.id] ?? NativeProtectedReportFormInput(
                                canestriText: String(player.canestri),
                                soffiText: String(player.soffi)
                            )
                            VStack(alignment: .leading, spacing: 6) {
                                Text(player.playerName)
                                    .font(.footnote)
                                TextField(
                                    "CAN",
                                    text: Binding(
                                        get: { input.canestriText },
                                        set: { onCanestriChange(player.id, $0) }
                                    )
                                )
                                .textFieldStyle(.roundedBorder)
                                .keyboardType(.numberPad)
                                TextField(
                                    "SF",
                                    text: Binding(
                                        get: { input.soffiText },
                                        set: { onSoffiChange(player.id, $0) }
                                    )
                                )
                                .textFieldStyle(.roundedBorder)
                                .keyboardType(.numberPad)
                                Text("Derived: CAN \(player.canestri) • SF \(player.soffi)")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .padding(.top, 4)
            }
        }
    }
}
