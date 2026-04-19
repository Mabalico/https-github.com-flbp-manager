# Referee flow hardening

## Current flow

- Referees enter through `components/RefereesArea.tsx`.
- The active model remains tournament password based.
- If the live tournament snapshot contains `refereesPassword`, the UI can validate locally.
- If the local snapshot does not expose the password and Supabase is configured, the UI calls `flbp_referee_auth_check`.
- After successful remote validation, the UI can call `flbp_referee_pull_live_state` to refresh the live snapshot.
- Report saving uses `flbp_referee_push_live_state`, still with the referee password, and keeps the existing `p_base_updated_at` conflict check.
- `refereesAuthVersion` is already used client-side to invalidate stored referee sessions after a password reset.

## Additive hardening added

- `referee_auth_audit` records best-effort referee `auth_check`, `pull_live_state` and `push_live_state` attempts.
- Audit rows store only workspace/tournament/action/outcome/reason/auth_version/timestamp.
- Passwords are never written to the audit table.
- Audit logging is intentionally non-blocking: a logging failure is swallowed inside `flbp_log_referee_auth_audit`.
- Remote login now preserves the `auth_version` returned by Supabase, so session invalidation remains coherent even when the local snapshot was stale before the pull.

## What this deliberately does not change

- No migration to temporary tokens yet.
- No removal of the tournament password flow.
- No new external service.
- No rate limiting logic.
- No change to referee UI permissions or saved report semantics.

## Residual risks

- The password is still sent to the RPC, as before.
- Audit logging improves visibility but does not prevent brute force attempts.
- A future token flow should remain additive until it can cover auth check, pull, push and call cancellation with the same compatibility guarantees.
