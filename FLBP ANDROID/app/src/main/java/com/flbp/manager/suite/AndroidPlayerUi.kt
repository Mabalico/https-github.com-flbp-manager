package com.flbp.manager.suite

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun PlayerAreaScreen(
    padding: PaddingValues,
    snapshot: NativePlayerAreaSnapshot,
    infoMessage: String?,
    errorMessage: String?,
    onRegister: (String, String, String, String, String) -> Unit,
    onSignIn: (String, String) -> Unit,
    onSaveProfile: (String, String, String) -> Unit,
    onSignOut: () -> Unit,
    onAcknowledgeCall: (String) -> Unit,
    onClearCall: (String) -> Unit,
    onOpenReferees: () -> Unit,
) {
    var username by rememberSaveable(snapshot.session?.accountId) {
        mutableStateOf(snapshot.session?.username.orEmpty())
    }
    var password by rememberSaveable { mutableStateOf("") }
    var firstName by rememberSaveable(snapshot.profile?.accountId, snapshot.profile?.updatedAt) {
        mutableStateOf(snapshot.profile?.firstName.orEmpty())
    }
    var lastName by rememberSaveable(snapshot.profile?.accountId, snapshot.profile?.updatedAt) {
        mutableStateOf(snapshot.profile?.lastName.orEmpty())
    }
    var birthDate by rememberSaveable(snapshot.profile?.accountId, snapshot.profile?.updatedAt) {
        mutableStateOf(snapshot.profile?.birthDate.orEmpty())
    }
    val playerAliasPool = remember(snapshot.profile, snapshot.results) {
        buildList {
            snapshot.profile?.canonicalPlayerName?.let(::add)
            snapshot.results?.canonicalPlayerName?.let(::add)
            snapshot.results?.leaderboardRows?.mapTo(this) { it.name }
            snapshot.results?.awards?.flatMapTo(this) { it.playerNames }
        }.distinct()
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            HeroCard(
                title = "Player area",
                body = "Optional account surface. Tournament participation stays open to everyone, while the linked profile unlocks personal results, live team status and future call alerts.",
            )
        }

        if (!infoMessage.isNullOrBlank()) {
            item {
                SectionCard(title = "Status") {
                    Text(infoMessage, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        if (!errorMessage.isNullOrBlank()) {
            item {
                SectionCard(title = "Action blocked") {
                    Text(
                        text = errorMessage,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }

        item {
            if (snapshot.session == null) {
                SectionCard(title = "Sign in / Register") {
                    Text(
                        text = "Create or unlock a preview account on this device using a real email address. Real Supabase player auth stays prepared in the repo but inactive until the backend rollout.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it },
                        label = { Text("Email") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text("Password") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Password recovery will use this email address once live auth plus a real administrator sender email are enabled.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = firstName,
                        onValueChange = { firstName = it },
                        label = { Text("First name") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = lastName,
                        onValueChange = { lastName = it },
                        label = { Text("Last name") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = birthDate,
                        onValueChange = { birthDate = it },
                        label = { Text("Birth date (YYYY-MM-DD)") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Text(
                        text = "Name, surname and birth date are used when creating the player profile linked to the account.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { onSignIn(username, password) }) {
                            Text("Sign in")
                        }
                        OutlinedButton(onClick = { onRegister(username, password, firstName, lastName, birthDate) }) {
                            Text("Register")
                        }
                    }
                }
            } else {
                SectionCard(title = "Linked account") {
                    Text(snapshot.session.username, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                    Text(
                        text = "Provider: ${snapshot.session.provider} • Mode: ${snapshot.session.mode}",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Text(
                        text = "This preview keeps the email locally on device. Real password reset stays backend-pending until SMTP / administrator sender email are configured.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    snapshot.profile?.let { profile ->
                        Spacer(modifier = Modifier.height(8.dp))
                        val birthIdentityLabel = formatBirthIdentityLabel(profile.birthDate)
                        Text(
                            text = if (birthIdentityLabel.isNullOrBlank()) profile.canonicalPlayerName else "${profile.canonicalPlayerName} • $birthIdentityLabel",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        buildPossibleAliasNote(listOf(profile.canonicalPlayerName), playerAliasPool)?.let { note ->
                            Text(
                                text = note,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.tertiary,
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedButton(onClick = onSignOut) {
                        Text("Sign out")
                    }
                }
            }
        }

        item {
            SectionCard(title = if (snapshot.profile == null) "Complete your profile" else "Player profile") {
                Text(
                    text = "Name, surname and birth date are used for rankings, U25 eligibility and duplicate-name handling.",
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = firstName,
                    onValueChange = { firstName = it },
                    label = { Text("First name") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    enabled = snapshot.session != null,
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = lastName,
                    onValueChange = { lastName = it },
                    label = { Text("Last name") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    enabled = snapshot.session != null,
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = birthDate,
                    onValueChange = { birthDate = it },
                    label = { Text("Birth date (YYYY-MM-DD)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    enabled = snapshot.session != null,
                )
                Spacer(modifier = Modifier.height(12.dp))
                Button(
                    onClick = { onSaveProfile(firstName, lastName, birthDate) },
                    enabled = snapshot.session != null,
                ) {
                    Text(if (snapshot.profile == null) "Save profile" else "Update profile")
                }
            }
        }

        item {
            SectionCard(title = "Social sign-in rollout") {
                Text(
                    text = "Google, Facebook and Apple are planned for v1 once the live auth providers are enabled. Instagram stays intentionally out of the first rollout.",
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    snapshot.featureStatus.socialProvidersPrepared.forEach { provider ->
                        FilterChip(
                            selected = false,
                            onClick = {},
                            enabled = false,
                            label = { Text(provider) },
                        )
                    }
                }
            }
        }

        item {
            SectionCard(title = "Your results") {
                val results = snapshot.results
                if (results == null || (results.leaderboardRows.isEmpty() && results.awards.isEmpty())) {
                    Text("No personal results are available yet for this linked profile.", style = MaterialTheme.typography.bodyMedium)
                } else {
                    MetadataRow(label = "Canonical player", value = results.canonicalPlayerName)
                    buildPossibleAliasNote(listOf(results.canonicalPlayerName), playerAliasPool)?.let { note ->
                        Text(
                            text = note,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.tertiary,
                        )
                    }
                    MetadataRow(label = "Birth date", value = formatBirthIdentityLabel(results.birthDate) ?: "")
                    MetadataRow(label = "Games", value = "${results.totalGames}")
                    MetadataRow(label = "Baskets", value = "${results.totalPoints}")
                    MetadataRow(label = "Soffi", value = "${results.totalSoffi}")
                    if (results.linkedTeams.isNotEmpty()) {
                        MetadataRow(label = "Teams", value = results.linkedTeams.joinToString(" • "))
                    }
                    if (results.leaderboardRows.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Leaderboard rows", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        results.leaderboardRows.forEach { row ->
                            Spacer(modifier = Modifier.height(8.dp))
                            SectionSubCard(
                                title = row.teamName,
                                body = "GP ${row.gamesPlayed} • CAN ${row.points} • SF ${row.soffi} • AVG ${formatPlayerDecimal(row.avgPoints)}/${formatPlayerDecimal(row.avgSoffi)}",
                            )
                        }
                    }
                    if (results.awards.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Awards", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        results.awards.forEach { award ->
                            Spacer(modifier = Modifier.height(8.dp))
                            SectionSubCard(
                                title = "${award.year} • ${formatAwardType(award.type)}",
                                body = buildString {
                                    append(award.tournamentName)
                                    award.teamName?.takeIf { it.isNotBlank() }?.let {
                                        append(" • ")
                                        append(it)
                                    }
                                    award.value?.let {
                                        append(" • value ")
                                        append(it)
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }

        item {
            SectionCard(title = "Live status") {
                val liveStatus = snapshot.liveStatus
                if (liveStatus.liveTournamentId.isNullOrBlank()) {
                    Text("No live tournament is currently published.", style = MaterialTheme.typography.bodyMedium)
                } else {
                    MetadataRow(label = "Tournament", value = liveStatus.liveTournamentName ?: liveStatus.liveTournamentId)
                    MetadataRow(label = "Linked team", value = liveStatus.linkedTeam?.name ?: "Not linked")
                    MetadataRow(label = "Next match", value = liveStatus.nextMatchLabel ?: "No scheduled match found")
                    MetadataRow(label = "Opponent", value = liveStatus.nextOpponentLabel ?: "ND")
                    MetadataRow(label = "Next turn", value = liveStatus.nextMatchTurn?.toString() ?: "ND")
                    MetadataRow(label = "Turns until play", value = liveStatus.turnsUntilPlay?.toString() ?: "ND")
                    if (liveStatus.refereeBypassEligible) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "This linked player is flagged as a live referee and can open the referees area without the tournament password on this device.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = onOpenReferees) {
                            Text("Open referees area")
                        }
                    }
                }
            }
        }

        item {
            SectionCard(title = "Team call alerts") {
                val activeCall = snapshot.liveStatus.activeCall
                if (activeCall == null) {
                    Text(
                        text = "No active team call is available. Real push/live alerts remain backend-pending; this screen is already shaped for the final flow.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                } else {
                    MetadataRow(label = "Team", value = activeCall.teamName)
                    MetadataRow(label = "State", value = activeCall.status)
                    MetadataRow(label = "Requested", value = formatPlayerTimestamp(activeCall.requestedAt))
                    activeCall.acknowledgedAt?.let { MetadataRow(label = "Acknowledged", value = formatPlayerTimestamp(it)) }
                    activeCall.cancelledAt?.let { MetadataRow(label = "Cancelled", value = formatPlayerTimestamp(it)) }
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { onAcknowledgeCall(activeCall.id) },
                            enabled = activeCall.status == "ringing",
                        ) {
                            Text("Confirm receipt")
                        }
                        OutlinedButton(
                            onClick = { onClearCall(activeCall.id) },
                            enabled = activeCall.status == "ringing" || activeCall.status == "acknowledged",
                        ) {
                            Text("Clear")
                        }
                    }
                }
            }
        }

        item {
            SectionCard(title = "Activation status") {
                PlayerStatusRow(label = "Preview mode", value = snapshot.featureStatus.previewEnabled)
                PlayerStatusRow(label = "Remote auth", value = snapshot.featureStatus.remoteAuthPrepared)
                PlayerStatusRow(label = "Player profile", value = snapshot.featureStatus.playerProfilesPrepared)
                PlayerStatusRow(label = "Live call alerts", value = snapshot.featureStatus.playerCallsPrepared)
                PlayerStatusRow(label = "Referee bypass", value = snapshot.featureStatus.refereeBypassPrepared)
            }
        }
    }
}

@Composable
private fun PlayerStatusRow(label: String, value: Boolean) {
    MetadataRow(label = label, value = if (value) "Prepared" else "Pending backend")
}

@Composable
private fun SectionSubCard(title: String, body: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.bodyMedium,
        fontWeight = FontWeight.Bold,
    )
    Text(
        text = body,
        style = MaterialTheme.typography.bodySmall,
    )
}

private fun formatPlayerDecimal(value: Double): String = String.format("%.1f", value)

private fun formatPlayerTimestamp(value: Long): String =
    java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.getDefault()).format(java.util.Date(value))
