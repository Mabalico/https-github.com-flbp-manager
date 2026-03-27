# Supabase / Postgres schema (FLBP Manager Suite)

This folder contains a **compatibility-first** Postgres schema intended for an incremental migration from the current `localStorage` persistence to a backend database.

## Migration
- `supabase/migrations/20251226000100_init_flbp.sql`

## Key constraints from the current app

### 1) Match participants are not always FK-able
The client stores `Match.teamAId/teamBId` as either:
- a real `Team.id`
- `'BYE'`
- a placeholder token like `'TBD-A-1'`

For that reason the schema stores match participants as `text` and does not enforce foreign keys.

### 2) BYE must remain invisible in UI
Represent BYE matches with:
- `tournament_matches.is_bye = true`
- `tournament_matches.hidden = true`

### 3) RLS (Row Level Security)
RLS policies are intentionally **not** included yet.
A dedicated step will add:
- admin-only write policies
- public read views that exclude sensitive fields (YoB)
