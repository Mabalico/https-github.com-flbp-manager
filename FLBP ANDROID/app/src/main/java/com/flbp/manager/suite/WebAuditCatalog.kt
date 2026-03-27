package com.flbp.manager.suite

data class AuditedSurface(
    val id: String,
    val label: String,
    val sourcePath: String,
    val note: String
)

data class AuditedRule(
    val rule: String,
    val sourcePath: String,
    val note: String
)

private fun AppRoute.toAuditedSurface(): AuditedSurface = AuditedSurface(
    id = id,
    label = label,
    sourcePath = sourcePath,
    note = note
)

object WebAuditCatalog {
    val topLevelSurfaces = AppRoute.values().map { it.toAuditedSurface() }

    val tvProjections = listOf(
        AuditedSurface("groups", "TV groups", "types.ts", "Read-only TV projection."),
        AuditedSurface("groups_bracket", "TV groups + bracket", "types.ts", "Read-only TV projection."),
        AuditedSurface("bracket", "TV bracket", "types.ts", "Read-only TV projection."),
        AuditedSurface("scorers", "TV scorers", "types.ts", "Read-only TV projection.")
    )

    val hardRules = listOf(
        AuditedRule("BYE is implicit in matches, hidden in UI, auto-advanced, never a real team", "scripts/check-invariants.mjs + services/tournamentEngine.ts", "Must stay preserved."),
        AuditedRule("TBD is a placeholder, not a real team, and must not advance", "services/tournamentEngine.ts", "Must stay preserved."),
        AuditedRule("TV mode is read-only and must not expose destructive actions", "scripts/check-tv-readonly.mjs", "Must stay preserved."),
        AuditedRule("OCR/report workflows are out of scope for this bootstrap", "components/RefereesArea.tsx + services/imageProcessingService.ts", "Do not regress.")
    )
}
