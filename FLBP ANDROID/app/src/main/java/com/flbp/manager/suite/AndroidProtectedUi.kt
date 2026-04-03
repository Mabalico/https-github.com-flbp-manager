package com.flbp.manager.suite

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.launch

private const val PROTECTED_MONTHLY_BUDGET_BYTES = 5L * 1024L * 1024L * 1024L

@Composable
fun AdminToolsScreen(
    padding: PaddingValues,
    session: NativeAdminSession?,
    access: NativeAdminAccessResult?,
    overview: NativeAdminOverview?,
    trafficRows: List<NativeProtectedTrafficUsageRow>,
    trafficLoading: Boolean,
    trafficError: String?,
    viewsRows: List<NativeProtectedSiteViewsRow>,
    viewsLoading: Boolean,
    viewsError: String?,
    busy: Boolean,
    error: String?,
    catalog: NativePublicCatalog,
    leaderboardCount: Int,
    hallCount: Int,
    playerAccountRows: List<NativePlayerAdminAccountRow>,
    liveBundle: NativeTournamentBundle?,
    liveBundleLoading: Boolean,
    liveBundleError: String?,
    onLogin: (String, String) -> Unit,
    onLogout: () -> Unit,
    onRefreshAccess: () -> Unit,
    onRefreshLiveBundle: () -> Unit,
    onSavePlayerAccount: suspend (String, String, String, String, String) -> String,
) {
    val uiScope = rememberCoroutineScope()
    var email by rememberSaveable(session?.email) {
        mutableStateOf((session?.email ?: NativeProtectedApi.defaultAdminEmail()).trim())
    }
    var password by rememberSaveable { mutableStateOf("") }
    val publishedTournamentCount = catalog.history.size + if (catalog.liveTournament != null) 1 else 0
    val liveSnapshot = liveBundle?.let(::buildProtectedTournamentSnapshot)
    val billingCycleWindow = remember { buildProtectedBillingCycleWindow() }
    val trafficSummary = remember(trafficRows) { buildProtectedTrafficSummary(trafficRows) }
    val siteViewsSummary = remember(viewsRows) { buildProtectedSiteViewsSummary(viewsRows) }
    var accountSearch by rememberSaveable { mutableStateOf("") }
    var accountFilter by rememberSaveable { mutableStateOf("all") }
    val filteredAccountRows = remember(playerAccountRows, accountSearch, accountFilter) {
        buildFilteredAdminAccountRows(
            rows = playerAccountRows,
            query = accountSearch,
            providerFilter = accountFilter,
        )
    }
    val filteredAccountIdsKey = remember(filteredAccountRows) {
        filteredAccountRows.joinToString(separator = "|") { it.id }
    }
    var selectedAccountId by rememberSaveable(filteredAccountIdsKey) {
        mutableStateOf(filteredAccountRows.firstOrNull()?.id.orEmpty())
    }
    val selectedAccount = remember(selectedAccountId, filteredAccountRows, playerAccountRows) {
        filteredAccountRows.firstOrNull { it.id == selectedAccountId }
            ?: playerAccountRows.firstOrNull { it.id == selectedAccountId }
            ?: filteredAccountRows.firstOrNull()
    }
    var selectedAccountEmail by rememberSaveable(selectedAccount?.id) {
        mutableStateOf(selectedAccount?.email.orEmpty())
    }
    var selectedAccountFirstName by rememberSaveable(selectedAccount?.id) {
        mutableStateOf(splitCanonicalPlayerName(selectedAccount?.linkedPlayerName).second)
    }
    var selectedAccountLastName by rememberSaveable(selectedAccount?.id) {
        mutableStateOf(splitCanonicalPlayerName(selectedAccount?.linkedPlayerName).first)
    }
    var selectedAccountBirthDate by rememberSaveable(selectedAccount?.id) {
        mutableStateOf(selectedAccount?.birthDate.orEmpty())
    }
    var playerAccountsInfo by remember { mutableStateOf<String?>(null) }
    var playerAccountsError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(filteredAccountIdsKey) {
        if (filteredAccountRows.none { it.id == selectedAccountId }) {
            selectedAccountId = filteredAccountRows.firstOrNull()?.id.orEmpty()
        }
    }

    LaunchedEffect(selectedAccount?.id) {
        selectedAccountEmail = selectedAccount?.email.orEmpty()
        selectedAccountBirthDate = selectedAccount?.birthDate.orEmpty()
        val nameParts = splitCanonicalPlayerName(selectedAccount?.linkedPlayerName)
        selectedAccountLastName = nameParts.first
        selectedAccountFirstName = nameParts.second
        playerAccountsInfo = null
        playerAccountsError = null
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(16.dp),
    ) {
        item {
            HeroCard(
                title = "Admin",
                body = "This native checkpoint now uses the same Supabase Auth + admin_users gate as FLBP ONLINE. The full admin dashboard is still web-first and stays out of scope until we migrate it screen by screen.",
            )
        }

        item {
            when {
                busy -> LoadingCard("Checking admin access…")
                session == null -> SectionCard(title = "Supabase admin login") {
                    Text(
                        text = "Use the same admin account configured in Supabase Auth for the web app.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text("Admin email") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Password") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (!error.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = error,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(onClick = { onLogin(email, password) }) {
                        Text("Sign in")
                    }
                }

                access?.ok == true -> SectionCard(title = "Authenticated admin session") {
                    Text(
                        text = access.email ?: session.email ?: NativeProtectedApi.defaultAdminEmail(),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Admin role verified against public.admin_users. Native write tools are not migrated yet, but the protected entry gate now matches the real web app.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    if (!access.userId.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "User id: ${access.userId}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(onClick = onRefreshAccess) {
                        Text("Re-check access")
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(onClick = onLogout) {
                        Text("Sign out")
                    }
                }

                else -> SectionCard(title = "Admin access denied") {
                    Text(
                        text = error ?: access?.reason ?: "This authenticated account does not have admin access.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(onClick = onLogout) {
                        Text("Clear session")
                    }
                }
            }
        }

        if (access?.ok == true) {
            item {
                SectionCard(title = "Published workspace snapshot") {
                    MetadataRow("Workspace", "default")
                    MetadataRow("Admin snapshot", formatProtectedTimestamp(overview?.workspaceStateUpdatedAt))
                    MetadataRow("Public snapshot", formatProtectedTimestamp(overview?.publicWorkspaceStateUpdatedAt))
                    MetadataRow("Published tournaments", publishedTournamentCount.toString())
                    MetadataRow("Career leaderboard", leaderboardCount.toString())
                    MetadataRow("Hall of fame", hallCount.toString())
                }
            }

            item {
                SectionCard(title = "Supabase traffic") {
                    Text(
                        text = "Read-only estimate from app_supabase_usage_daily for the current billing cycle.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    MetadataRow(
                        "Cycle window",
                        "${formatProtectedDateLabel(billingCycleWindow.startDate)} → ${formatProtectedDateLabel(billingCycleWindow.displayEndDate)}"
                    )
                    MetadataRow(
                        "Next reset",
                        formatProtectedDateLabel(billingCycleWindow.nextResetDate)
                    )
                    when {
                        trafficLoading -> {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Loading traffic usage…",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }

                        !trafficError.isNullOrBlank() -> {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = trafficError,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }

                        trafficRows.isEmpty() -> {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "No usage rows available for the current billing cycle yet.",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }

                        else -> {
                            val remainingBytes = (PROTECTED_MONTHLY_BUDGET_BYTES - trafficSummary.totalBytes).coerceAtLeast(0L)
                            Spacer(modifier = Modifier.height(8.dp))
                            MetadataRow("Cycle total", formatProtectedBytes(trafficSummary.totalBytes))
                            MetadataRow("Budget", formatProtectedBytes(PROTECTED_MONTHLY_BUDGET_BYTES))
                            MetadataRow("Remaining", formatProtectedBytes(remainingBytes))
                            MetadataRow("Requests", trafficSummary.totalRequests.toString())
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Buckets",
                                style = MaterialTheme.typography.labelLarge,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            trafficSummary.bucketRows.forEach { bucket ->
                                MetadataRow(
                                    protectedBucketLabel(bucket.bucket),
                                    "${formatProtectedBytes(bucket.totalBytes)} • ${bucket.requestCount} req"
                                )
                            }
                        }
                    }
                }
            }

            item {
                SectionCard(title = "Public site views") {
                    Text(
                        text = "Read-only public counter from public_site_views_daily over the last 30 days.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    when {
                        viewsLoading -> {
                            Text(
                                text = "Loading public views…",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }

                        !viewsError.isNullOrBlank() -> {
                            Text(
                                text = viewsError,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }

                        viewsRows.isEmpty() -> {
                            Text(
                                text = "No site-view rows available for the last 30 days yet.",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }

                        else -> {
                            MetadataRow("Range", "Last 30 days")
                            MetadataRow("Total views", siteViewsSummary.totalViews.toString())
                            MetadataRow("Average / day", String.format(Locale.US, "%.1f", siteViewsSummary.averagePerDay))
                            MetadataRow("Peak day", siteViewsSummary.peakDayLabel)
                        }
                    }
                }
            }

            item {
                SectionCard(title = "Player accounts") {
                    Text(
                        text = "This native catalog mirrors the web 'Account giocatori' section and prefers live Supabase data when available. Password reset stays disabled here until Supabase Auth + SMTP are activated live.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = accountSearch,
                        onValueChange = { accountSearch = it },
                        label = { Text("Search email or linked player") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Provider filter",
                        style = MaterialTheme.typography.labelLarge,
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    adminAccountFilterRows().forEach { filterRow ->
                        Row(modifier = Modifier.fillMaxWidth()) {
                            filterRow.forEach { filter ->
                                Button(
                                    onClick = { accountFilter = filter.id },
                                    modifier = Modifier.weight(1f),
                                    enabled = accountFilter != filter.id,
                                ) {
                                    Text(filter.label)
                                }
                                if (filter != filterRow.last()) {
                                    Spacer(modifier = Modifier.width(8.dp))
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                    if (filteredAccountRows.isEmpty()) {
                        Text(
                            text = if (playerAccountRows.isEmpty()) {
                                "No player accounts are available yet."
                            } else {
                                "No player accounts match the current filter."
                            },
                            style = MaterialTheme.typography.bodySmall,
                        )
                    } else {
                        Text(
                            text = "Accounts",
                            style = MaterialTheme.typography.labelLarge,
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        filteredAccountRows.forEach { row ->
                            Button(
                                onClick = { selectedAccountId = row.id },
                                enabled = selectedAccountId != row.id,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(buildAdminAccountButtonLabel(row))
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                    }
                    if (selectedAccount != null) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Selected account",
                            style = MaterialTheme.typography.labelLarge,
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        MetadataRow(
                            "Mode",
                            "${selectedAccount.mode} • ${selectedAccount.providers.joinToString(separator = ", ") { formatAdminProviderLabel(it) }}"
                        )
                        MetadataRow("Created", formatProtectedTimestamp(selectedAccount.createdAt))
                        MetadataRow("Last login", formatProtectedTimestamp(selectedAccount.lastLoginAt))
                        MetadataRow(
                            "Linked player",
                            selectedAccount.canonicalPlayerName ?: selectedAccount.linkedPlayerName ?: "Not linked yet",
                        )
                        MetadataRow("Career baskets", selectedAccount.totalCanestri.toString())
                        MetadataRow("Career soffi", selectedAccount.totalSoffi.toString())
                        MetadataRow("Titles", selectedAccount.totalTitles.toString())
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = selectedAccountEmail,
                            onValueChange = { selectedAccountEmail = it },
                            label = { Text("Email") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(modifier = Modifier.fillMaxWidth()) {
                            OutlinedTextField(
                                value = selectedAccountFirstName,
                                onValueChange = { selectedAccountFirstName = it },
                                label = { Text("First name") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            OutlinedTextField(
                                value = selectedAccountLastName,
                                onValueChange = { selectedAccountLastName = it },
                                label = { Text("Last name") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = selectedAccountBirthDate,
                            onValueChange = { selectedAccountBirthDate = it },
                            label = { Text("Birth date (YYYY-MM-DD)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Password recovery here will stay read-only until we connect a real admin sender/SMTP on the live rollout.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        if (!playerAccountsError.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = playerAccountsError!!,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                        if (!playerAccountsInfo.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = playerAccountsInfo!!,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = {
                                uiScope.launch {
                                    runCatching {
                                        onSavePlayerAccount(
                                            selectedAccount.id,
                                            selectedAccountEmail,
                                            selectedAccountFirstName,
                                            selectedAccountLastName,
                                            selectedAccountBirthDate,
                                        )
                                    }.onSuccess { message ->
                                        playerAccountsInfo = message
                                        playerAccountsError = null
                                    }.onFailure { editError ->
                                        playerAccountsError = editError.message ?: "Unable to update the player account."
                                        playerAccountsInfo = null
                                    }
                                }
                            },
                        ) {
                            Text("Save account")
                        }
                    }
                }
            }

            item {
                when {
                    catalog.liveTournament == null -> EmptyStateCard("No live tournament is currently published.")
                    liveBundleLoading && liveBundle == null -> LoadingCard("Loading live tournament snapshot…")
                    liveBundleError != null && liveBundle == null -> ErrorCard(liveBundleError, onRefreshLiveBundle)
                    liveBundle == null -> EmptyStateCard("Live tournament snapshot not available yet.")
                    else -> {
                        val bundle = liveBundle
                        val snapshot = liveSnapshot!!
                        SectionCard(title = "Live tournament snapshot") {
                            MetadataRow("Tournament", bundle.tournament.name)
                            MetadataRow("Date", formatDateLabel(bundle.tournament.startDate))
                            MetadataRow("Format", formatTournamentType(bundle.tournament.type))
                            MetadataRow("Visible teams", snapshot.visibleTeamCount.toString())
                            MetadataRow("Visible matches", snapshot.visibleMatchCount.toString())
                            MetadataRow("Played", snapshot.playedCount.toString())
                            MetadataRow("Playing", snapshot.liveCount.toString())
                            MetadataRow("Upcoming", snapshot.upcomingCount.toString())
                            MetadataRow("Tables / turn", snapshot.turnsSnapshot.tablesPerTurn.toString())
                            if (snapshot.featuredTurnBlocks.isNotEmpty()) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = "Turn monitor",
                                    style = MaterialTheme.typography.labelLarge,
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                snapshot.featuredTurnBlocks.forEach { block ->
                                    Text(
                                        text = "Turn ${block.turnNumber} • ${block.statusLabel}",
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                    Spacer(modifier = Modifier.height(4.dp))
                                    block.matches.take(3).forEach { match ->
                                        MatchCard(bundle = bundle, match = match)
                                        Spacer(modifier = Modifier.height(8.dp))
                                    }
                                }
                            }
                            if (snapshot.tbdCount > 0) {
                                Text(
                                    text = "TBD blocked matches: ${snapshot.tbdCount}",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private data class ProtectedTrafficBucketSummary(
    val bucket: String,
    val requestCount: Long,
    val totalBytes: Long,
)

private data class ProtectedTrafficSummary(
    val totalRequests: Long,
    val totalBytes: Long,
    val bucketRows: List<ProtectedTrafficBucketSummary>,
)

private data class ProtectedSiteViewsSummary(
    val totalViews: Long,
    val averagePerDay: Double,
    val peakDayLabel: String,
)

private data class AdminAccountFilterOption(
    val id: String,
    val label: String,
)

private fun adminAccountFilterRows(): List<List<AdminAccountFilterOption>> = listOf(
    listOf(
        AdminAccountFilterOption("all", "All"),
        AdminAccountFilterOption("in_app", "In app"),
        AdminAccountFilterOption("google", "Google"),
    ),
    listOf(
        AdminAccountFilterOption("facebook", "Facebook"),
        AdminAccountFilterOption("apple", "Apple"),
        AdminAccountFilterOption("other", "Other"),
    ),
)

private fun buildFilteredAdminAccountRows(
    rows: List<NativePlayerAdminAccountRow>,
    query: String,
    providerFilter: String,
): List<NativePlayerAdminAccountRow> {
    val normalizedQuery = query.trim().lowercase(Locale.ROOT)
    return rows.filter { row ->
        val matchesProvider = when (providerFilter) {
            "all" -> true
            "in_app" -> row.origin.equals("in_app", ignoreCase = true)
                || row.provider.contains("password", ignoreCase = true)
            "other" -> {
                val provider = row.provider.lowercase(Locale.ROOT)
                provider !in setOf("preview_password", "google", "facebook", "apple")
            }
            else -> row.provider.equals(providerFilter, ignoreCase = true)
                || row.providers.any { it.equals(providerFilter, ignoreCase = true) }
        }
        val matchesQuery = normalizedQuery.isBlank()
            || row.email.lowercase(Locale.ROOT).contains(normalizedQuery)
            || (row.linkedPlayerName?.lowercase(Locale.ROOT)?.contains(normalizedQuery) == true)
            || (row.canonicalPlayerName?.lowercase(Locale.ROOT)?.contains(normalizedQuery) == true)
        matchesProvider && matchesQuery
    }
}

private fun buildAdminAccountButtonLabel(row: NativePlayerAdminAccountRow): String {
    val linkedLabel = row.canonicalPlayerName ?: row.linkedPlayerName ?: "Profile pending"
    return "${row.email} • $linkedLabel"
}

private fun formatAdminProviderLabel(value: String): String = when (value.trim().lowercase(Locale.ROOT)) {
    "in_app", "password", "preview_password" -> "Email/Password"
    "google" -> "Google"
    "facebook" -> "Facebook"
    "apple" -> "Apple"
    "" -> "Other"
    else -> value
}

private fun splitCanonicalPlayerName(name: String?): Pair<String, String> {
    val safeName = name
        ?.trim()
        ?.replace(Regex("\\s+"), " ")
        .orEmpty()
    if (safeName.isBlank()) return "" to ""
    val firstSpace = safeName.indexOf(' ')
    if (firstSpace <= 0) return safeName to ""
    val lastName = safeName.substring(0, firstSpace).trim()
    val firstName = safeName.substring(firstSpace + 1).trim()
    return lastName to firstName
}

private fun buildProtectedTrafficSummary(rows: List<NativeProtectedTrafficUsageRow>): ProtectedTrafficSummary {
    val bucketMap = linkedMapOf<String, ProtectedTrafficBucketSummary>()
    var totalRequests = 0L
    var totalBytes = 0L
    rows.forEach { row ->
        val bucket = row.bucket.ifBlank { "unknown" }
        val nextTotalBytes = row.requestBytes + row.responseBytes
        totalRequests += row.requestCount
        totalBytes += nextTotalBytes
        val current = bucketMap[bucket]
        bucketMap[bucket] = ProtectedTrafficBucketSummary(
            bucket = bucket,
            requestCount = (current?.requestCount ?: 0L) + row.requestCount,
            totalBytes = (current?.totalBytes ?: 0L) + nextTotalBytes,
        )
    }
    return ProtectedTrafficSummary(
        totalRequests = totalRequests,
        totalBytes = totalBytes,
        bucketRows = bucketMap.values.sortedByDescending { it.totalBytes },
    )
}

private fun protectedBucketLabel(bucket: String): String = when (bucket.lowercase(Locale.ROOT)) {
    "public" -> "Public"
    "tv" -> "TV"
    "admin" -> "Admin"
    "referee" -> "Referee"
    "sync" -> "Sync"
    else -> "Unknown"
}

private fun formatProtectedBytes(value: Long): String = when {
    value <= 0L -> "0 B"
    value >= 1024L * 1024L * 1024L -> String.format(Locale.US, "%.2f GB", value / (1024.0 * 1024.0 * 1024.0))
    value >= 1024L * 1024L -> String.format(Locale.US, "%.2f MB", value / (1024.0 * 1024.0))
    value >= 1024L -> String.format(Locale.US, "%.1f KB", value / 1024.0)
    else -> "$value B"
}

private fun formatProtectedDateLabel(raw: String): String {
    return runCatching {
        val parser = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        parser.isLenient = false
        val formatter = SimpleDateFormat("dd MMM yyyy", Locale.US)
        formatter.format(parser.parse(raw) ?: Date())
    }.getOrDefault(raw)
}

private fun buildProtectedSiteViewsSummary(rows: List<NativeProtectedSiteViewsRow>): ProtectedSiteViewsSummary {
    val totalViews = rows.sumOf { it.views }
    val averagePerDay = if (rows.isNotEmpty()) totalViews.toDouble() / rows.size.toDouble() else 0.0
    val peakRow = rows.maxByOrNull { it.views }
    val peakDayLabel = if (peakRow == null) {
        "ND"
    } else {
        "${formatProtectedDateLabel(peakRow.viewDate)} • ${peakRow.views}"
    }
    return ProtectedSiteViewsSummary(
        totalViews = totalViews,
        averagePerDay = averagePerDay,
        peakDayLabel = peakDayLabel,
    )
}

@Composable
fun RefereesToolsScreen(
    padding: PaddingValues,
    liveTournament: NativeTournamentSummary?,
    authedTournamentId: String?,
    busy: Boolean,
    error: String?,
    liveBundle: NativeTournamentBundle?,
    liveBundleLoading: Boolean,
    liveBundleError: String?,
    onVerifyPassword: (String) -> Unit,
    onLogout: () -> Unit,
    onRefreshLiveBundle: () -> Unit,
) {
    val context = LocalContext.current.applicationContext
    val protectedCache = remember(context) { NativeProtectedCache(context) }
    var password by rememberSaveable(liveTournament?.id) { mutableStateOf("") }
    var selectedReferee by rememberSaveable(liveTournament?.id) {
        mutableStateOf(
            liveTournament?.id
                ?.let(protectedCache::readSelectedRefereeName)
                .orEmpty()
        )
    }
    var manualRefereeName by rememberSaveable(liveTournament?.id) {
        mutableStateOf(
            liveTournament?.id
                ?.let(protectedCache::readSelectedRefereeName)
                .orEmpty()
        )
    }
    var refereeIdentityError by rememberSaveable(liveTournament?.id) { mutableStateOf<String?>(null) }
    var reportCode by rememberSaveable(liveTournament?.id) { mutableStateOf("") }
    var reportCodeError by rememberSaveable(liveTournament?.id) { mutableStateOf<String?>(null) }
    var codeChoices by remember(liveTournament?.id) { mutableStateOf(emptyList<NativeProtectedMatchBrief>()) }
    var selectedMatchId by rememberSaveable(liveTournament?.id) { mutableStateOf("") }
    var reportForm by remember(liveTournament?.id) { mutableStateOf<Map<String, NativeProtectedReportFormInput>>(emptyMap()) }
    val isAuthed = liveTournament != null && authedTournamentId == liveTournament.id
    val protectedSnapshot = liveBundle?.let(::buildProtectedTournamentSnapshot)
    val availableReferees = liveBundle?.let(::buildProtectedAvailableReferees).orEmpty()
    val selectedMatch = liveBundle?.matches?.firstOrNull { it.id == selectedMatchId }
    val selectedReportDraft = if (liveBundle != null && selectedMatch != null) {
        buildProtectedReportDraft(liveBundle, selectedMatch, reportForm)
    } else {
        null
    }
    val selectedSaveDraft = selectedReportDraft?.let(::buildProtectedReportSaveDraft)
    LaunchedEffect(selectedMatchId, liveBundle?.tournament?.id) {
        reportForm = if (liveBundle != null && selectedMatch != null) {
            buildProtectedReportForm(buildProtectedReportDraft(liveBundle, selectedMatch))
        } else {
            emptyMap()
        }
    }
    fun openMatch(match: NativeMatchInfo) {
        if (isAuthed && selectedReferee.isBlank()) {
            refereeIdentityError = "Select referee identity first."
            return
        }
        selectedMatchId = match.id
        reportCode = match.code?.trim()?.uppercase().orEmpty()
        reportCodeError = null
        codeChoices = emptyList()
        refereeIdentityError = null
    }
    fun applyLookupResult(result: NativeProtectedCodeLookupResult) {
        reportCode = result.normalizedCode
        reportCodeError = result.error
        codeChoices = result.duplicateChoices
        selectedMatchId = result.selectedMatch?.id.orEmpty()
    }
    fun useRefereeIdentity(rawName: String) {
        val normalized = rawName.trim().replace(Regex("\\s+"), " ")
        if (normalized.isBlank()) {
            refereeIdentityError = "Enter a valid referee name."
            return
        }
        selectedReferee = normalized
        manualRefereeName = normalized
        refereeIdentityError = null
        liveTournament?.id?.let { protectedCache.writeSelectedRefereeName(it, normalized) }
    }
    fun updateReportForm(
        playerKey: String,
        canestriText: String? = null,
        soffiText: String? = null,
    ) {
        val current = reportForm[playerKey] ?: NativeProtectedReportFormInput(
            canestriText = "",
            soffiText = "",
        )
        reportForm = reportForm.toMutableMap().apply {
            this[playerKey] = NativeProtectedReportFormInput(
                canestriText = canestriText ?: current.canestriText,
                soffiText = soffiText ?: current.soffiText,
            )
        }
    }
    fun resetReportForm() {
        reportForm = if (liveBundle != null && selectedMatch != null) {
            buildProtectedReportForm(buildProtectedReportDraft(liveBundle, selectedMatch))
        } else {
            emptyMap()
        }
    }
    fun clearReportForm() {
        reportForm = selectedReportDraft
            ?.teams
            ?.flatMap { team ->
                team.players.map { player ->
                    player.key to NativeProtectedReportFormInput(
                        canestriText = "0",
                        soffiText = "0",
                    )
                }
            }
            ?.toMap()
            .orEmpty()
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(16.dp),
    ) {
        item {
            HeroCard(
                title = "Referees area",
                body = "This native checkpoint now verifies the real referee password through the live tournament RPC and, when the additive rollout is available, also tries to pull the live state before refreshing the local read-only bundle. Full OCR/report entry stays web-first until we migrate that workflow deliberately.",
            )
        }

        if (liveTournament == null) {
            item {
                EmptyStateCard("No live tournament is currently published, so the native referees route stays empty-safe.")
            }
            return@LazyColumn
        }

        item {
            PrimaryActionCard(
                title = liveTournament.name,
                subtitle = "${formatDateLabel(liveTournament.startDate)} • ${formatTournamentType(liveTournament.type)} • LIVE",
                body = if (isAuthed) {
                    "Referee access for this live tournament is active on this device."
                } else {
                    "Use the live tournament password to unlock the protected referee route on this device."
                },
                primaryLabel = if (isAuthed) "Forget access" else "Refresh live detail",
                onPrimaryClick = if (isAuthed) onLogout else onRefreshLiveBundle,
                secondaryLabel = if (isAuthed) "Refresh live detail" else null,
                onSecondaryClick = if (isAuthed) onRefreshLiveBundle else null,
            )
        }

        if (!isAuthed) {
            item {
                SectionCard(title = "Referee password") {
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Tournament password") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (!error.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = error,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(onClick = { onVerifyPassword(password) }, enabled = !busy) {
                        Text(if (busy) "Checking…" else "Unlock referees route")
                    }
                }
            }
        }

        item {
            when {
                liveBundleLoading -> LoadingCard("Loading live tournament detail…")
                liveBundleError != null && liveBundle == null -> ErrorCard(liveBundleError, onRefreshLiveBundle)
                liveBundle == null -> EmptyStateCard("Live bundle not available yet.")
                else -> SectionCard(title = "Turn monitor") {
                    val bundle = liveBundle
                    val snapshot = protectedSnapshot!!
                    MetadataRow("Tables / turn", snapshot.turnsSnapshot.tablesPerTurn.toString())
                    MetadataRow("Visible matches", snapshot.visibleMatchCount.toString())
                    MetadataRow("Playing now", snapshot.liveCount.toString())
                    MetadataRow("Played", snapshot.playedCount.toString())
                    MetadataRow("TBD blocked", snapshot.tbdCount.toString())
                    if (snapshot.featuredTurnBlocks.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        snapshot.featuredTurnBlocks.forEach { block ->
                            Text(
                                text = "Turn ${block.turnNumber} • ${block.statusLabel}",
                                style = MaterialTheme.typography.labelLarge,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            block.matches.take(4).forEach { match ->
                                MatchCard(bundle = bundle, match = match, onClick = { openMatch(match) })
                                Spacer(modifier = Modifier.height(8.dp))
                            }
                        }
                    }
                }
            }
        }

        if (isAuthed) {
            item {
                SectionCard(title = "Referee identity") {
                    Text(
                        text = "Choose the referee identity used on this device before opening a live report draft.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    if (selectedReferee.isNotBlank()) {
                        MetadataRow("Selected", selectedReferee)
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                    if (availableReferees.isEmpty()) {
                        Text(
                            text = "No referee roster is currently exposed in the public tournament teams. You can still use a manual referee name on this device.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    } else {
                        availableReferees.forEach { refereeName ->
                            Button(
                                onClick = { useRefereeIdentity(refereeName) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(refereeName)
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                    }
                    OutlinedTextField(
                        value = manualRefereeName,
                        onValueChange = {
                            manualRefereeName = it
                            if (!refereeIdentityError.isNullOrBlank()) refereeIdentityError = null
                        },
                        label = { Text("Manual referee name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = { useRefereeIdentity(manualRefereeName) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                            Text("Use this name")
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = {
                            selectedReferee = ""
                            manualRefereeName = ""
                            selectedMatchId = ""
                            reportForm = emptyMap()
                            reportCodeError = null
                            refereeIdentityError = null
                            liveTournament?.id?.let { protectedCache.writeSelectedRefereeName(it, null) }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Clear")
                    }
                    if (!refereeIdentityError.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = refereeIdentityError!!,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }

            item {
                when {
                    liveBundleLoading -> LoadingCard("Loading live tournament detail…")
                    liveBundleError != null && liveBundle == null -> ErrorCard(liveBundleError, onRefreshLiveBundle)
                    liveBundle == null -> EmptyStateCard("Live bundle not available yet.")
                    else -> SectionCard(title = "Open report by code") {
                        Text(
                            text = "Use the paper report code when you have it. If the code is duplicated, choose the correct match from the list below.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = reportCode,
                            onValueChange = {
                                reportCode = it.uppercase()
                                if (!reportCodeError.isNullOrBlank()) reportCodeError = null
                                if (codeChoices.isNotEmpty()) codeChoices = emptyList()
                            },
                            label = { Text("Report code") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = { applyLookupResult(lookupProtectedMatchByCode(liveBundle, reportCode)) },
                            enabled = selectedReferee.isNotBlank(),
                        ) {
                            Text("Open match")
                        }
                        if (!reportCodeError.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = reportCodeError!!,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                        if (codeChoices.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                text = "Duplicate report code",
                                style = MaterialTheme.typography.labelLarge,
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            codeChoices.take(6).forEach { brief ->
                                ProtectedMatchBriefCard(
                                    bundle = liveBundle,
                                    brief = brief,
                                    onOpen = { openMatch(brief.match) },
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                            }
                        }
                    }
                }
            }
        }

        item {
            when {
                liveBundleLoading -> LoadingCard("Loading live tournament detail…")
                liveBundleError != null && liveBundle == null -> ErrorCard(liveBundleError, onRefreshLiveBundle)
                liveBundle == null -> EmptyStateCard("Live bundle not available yet.")
                else -> SectionCard(title = "Upcoming playable matches") {
                    val snapshot = protectedSnapshot!!
                    if (snapshot.upcomingPlayableMatches.isEmpty()) {
                        Text(
                            text = "No upcoming playable matches are currently visible in the public bundle.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    } else {
                        snapshot.upcomingPlayableMatches.forEach { brief ->
                            ProtectedMatchBriefCard(
                                bundle = liveBundle,
                                brief = brief,
                                onOpen = { openMatch(brief.match) },
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                    }
                }
            }
        }

        if (protectedSnapshot?.blockedMatches?.isNotEmpty() == true) {
            item {
                SectionCard(title = "Blocked by placeholders") {
                    Text(
                        text = "These matches stay blocked because at least one participant is still BYE/TBD/slot libero.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    protectedSnapshot.blockedMatches.take(6).forEach { brief ->
                        ProtectedMatchBriefCard(
                            bundle = liveBundle!!,
                            brief = brief,
                            onOpen = { openMatch(brief.match) },
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                }
            }
        }

        if (isAuthed) {
            item {
                when {
                    liveBundleLoading -> LoadingCard("Preparing report draft…")
                    liveBundleError != null && liveBundle == null -> ErrorCard(liveBundleError, onRefreshLiveBundle)
                    liveBundle == null -> EmptyStateCard("Live bundle not available yet.")
                    selectedReferee.isBlank() -> EmptyStateCard("Select referee identity first to inspect the report draft.")
                    selectedReportDraft == null -> EmptyStateCard("Select a live match to inspect the native report draft.")
                    else -> SectionCard(title = "Report draft") {
                        MetadataRow("Referee", selectedReferee)
                        Spacer(modifier = Modifier.height(8.dp))
                        ProtectedReportDraftCard(
                            draft = selectedReportDraft,
                            saveDraft = selectedSaveDraft!!,
                            form = reportForm,
                            onCanestriChange = { playerKey, nextValue ->
                                updateReportForm(
                                    playerKey = playerKey,
                                    canestriText = nextValue.filter(Char::isDigit),
                                )
                            },
                            onSoffiChange = { playerKey, nextValue ->
                                updateReportForm(
                                    playerKey = playerKey,
                                    soffiText = nextValue.filter(Char::isDigit),
                                )
                            },
                            onResetForm = ::resetReportForm,
                            onClearForm = ::clearReportForm,
                        )
                    }
                }
            }
        }

        if (isAuthed && liveBundle != null) {
            items(liveBundle.teams.filter { team ->
                val label = team.name.trim().uppercase()
                label != "BYE" && label != "TBD" && label != "SLOT LIBERO"
            }) { team ->
                SectionCard(title = team.name) {
                    Text(
                        text = listOfNotNull(team.player1.takeIf { it.isNotBlank() }, team.player2?.takeIf { it.isNotBlank() })
                            .joinToString(separator = " • "),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
}

private fun formatProtectedTimestamp(raw: String?): String {
    val safe = raw?.trim().orEmpty()
    if (safe.isEmpty()) return "ND"
    val normalized = safe.replace('T', ' ')
    return normalized.substringBefore('.')
}

private fun formatProtectedTimestamp(raw: Long?): String {
    if (raw == null || raw <= 0L) return "ND"
    val formatter = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
    return formatter.format(Date(raw))
}

@Composable
private fun ProtectedMatchBriefCard(
    bundle: NativeTournamentBundle,
    brief: NativeProtectedMatchBrief,
    onOpen: () -> Unit,
) {
    SectionCard(title = brief.title) {
        MatchCard(bundle = bundle, match = brief.match, onClick = onOpen)
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = "${brief.teamALabel}: ${brief.teamAPlayers.ifBlank { "Roster pending" }}",
            style = MaterialTheme.typography.bodySmall,
        )
        Text(
            text = "${brief.teamBLabel}: ${brief.teamBPlayers.ifBlank { "Roster pending" }}",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun ProtectedReportDraftCard(
    draft: NativeProtectedReportDraft,
    saveDraft: NativeProtectedReportSaveDraft,
    form: Map<String, NativeProtectedReportFormInput>,
    onCanestriChange: (String, String) -> Unit,
    onSoffiChange: (String, String) -> Unit,
    onResetForm: () -> Unit,
    onClearForm: () -> Unit,
) {
    Text(
        text = "This mirrors the web manual referee form: you can edit baskets/soffi locally on the device, while native save/OCR stays out of scope until the protected write path is migrated.",
        style = MaterialTheme.typography.bodySmall,
    )
    Spacer(modifier = Modifier.height(8.dp))
    MetadataRow("Match", draft.title)
    MetadataRow("Stored stats", if (draft.hasStoredStats) "Yes" else "No")
    MetadataRow("Derived total baskets", draft.totalPoints.toString())
    MetadataRow("Derived total soffi", draft.totalSoffi.toString())
    if (draft.winnerTeamId != null) {
        MetadataRow("Derived winner", draft.teams.firstOrNull { it.teamId == draft.winnerTeamId }?.teamName ?: draft.winnerTeamId)
    }
    if (!draft.playable) {
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "This match is still blocked by BYE/TBD/slot libero, so the report draft stays locked.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    } else if (draft.tieNotAllowed) {
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Tie still detected in the derived score. The web flow would require a unique winner before saving the report.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
    Spacer(modifier = Modifier.height(8.dp))
    Button(
        onClick = onResetForm,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text("Reset from stored stats")
    }
    Spacer(modifier = Modifier.height(8.dp))
    Button(
        onClick = onClearForm,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text("Clear all stats")
    }
    Spacer(modifier = Modifier.height(8.dp))
    Text(
        text = if (saveDraft.readyToSave) {
            "Save draft looks internally valid."
        } else {
            "Save draft still blocked."
        },
        style = MaterialTheme.typography.labelLarge,
    )
    MetadataRow("Planned score", saveDraft.scoreLabel)
    MetadataRow("Winner", saveDraft.winnerTeamName ?: "ND")
    MetadataRow("Overwrite confirm", if (saveDraft.requiresOverwriteConfirm) "Required" else "Not needed")
    MetadataRow("Remote backend", if (saveDraft.backendReady) "Ready" else "Not ready")
    if (!saveDraft.blockReason.isNullOrBlank()) {
        Text(
            text = saveDraft.blockReason,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
    Spacer(modifier = Modifier.height(6.dp))
    Text(
        text = saveDraft.backendNote,
        style = MaterialTheme.typography.bodySmall,
    )

    draft.teams.forEach { team ->
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = "${team.teamName} • ${team.derivedScore}",
            style = MaterialTheme.typography.titleSmall,
        )
        if (team.players.isEmpty()) {
            Text(
                text = "Roster pending",
                style = MaterialTheme.typography.bodySmall,
            )
        } else {
            team.players.forEach { player ->
                val input = form[player.key] ?: NativeProtectedReportFormInput(
                    canestriText = player.canestri.toString(),
                    soffiText = player.soffi.toString(),
                )
                Spacer(modifier = Modifier.height(4.dp))
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = player.playerName,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    OutlinedTextField(
                        value = input.canestriText,
                        onValueChange = { onCanestriChange(player.key, it) },
                        label = { Text("CAN") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    OutlinedTextField(
                        value = input.soffiText,
                        onValueChange = { onSoffiChange(player.key, it) },
                        label = { Text("SF") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Derived: CAN ${player.canestri} • SF ${player.soffi}",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}
