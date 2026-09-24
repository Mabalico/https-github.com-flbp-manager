# Public mirror consistency — A11

Migration `20260924000400_authoritative_public_mirrors.sql` closes a stale-publication path: a browser could POST an old complete public snapshot after a referee had committed a newer result. ONLINE then sent a second independent POST to the compact mirror. These requests could regress public scores while the canonical report remained saved. The audit reproduced this both before and after migration 003; its artifacts are in `outputs/stabilization-2026-09-24/direct-rest-lock-review.md` at repository root.

## Writes and compatibility

- Direct INSERT/UPDATE/DELETE on `public_workspace_state` and, when installed, `public_workspace_live` are revoked from PUBLIC, anon and authenticated. Public SELECT remains available. Canonical Admin, referee, service backup and restore entrypoints remain SECURITY DEFINER and keep publishing within their own transaction.
- `flbp_admin_republish_public_workspace(p_workspace_id text, p_lease_holder text default null)` accepts no browser snapshot. It validates Admin access, acquires the common advisory first, respects an installed Admin lease and refuses local/recovery mode. Missing canonical state is an error, not a synthetic success.
- The repair RPC projects current live data from the private canonical snapshot using the recursive 003 projection. It preserves existing public non-live fields such as logo, history and Hall of Fame, and publishes full/compact mirrors atomically. A compact failure rolls back the full-mirror change. This operation does not acknowledge or change the private workspace version.
- `pushPublicWorkspaceState(state)` retains its TypeScript call signature in both clients for compatibility, but ignores the supplied state and calls only the authoritative RPC. There is no direct REST fallback, including when the RPC is missing. ONLINE local-primary returns the existing local public projection; recovery/passive Admin is rejected.
- The two ONLINE Fanta callers no longer invoke mirror-only writes. The toggle and live-start handlers await `commitAdminStateDurably`, then display success or start phase/promotion work. Repeat clicks while the commit is pending do not start another operation. A failed live-start commit retains the draft and invokes neither the Fanta archive RPC nor phase/promotion/structured-export work or active-call closure. After a successful commit and tournament-ID verification, live-start snapshots the previous Fanta edition before `setState` and before the structured export. The cloud v2 and legacy canonical RPCs preserve the previous normalized scoring rows until that export. `skipStructuredSync` prevents the commit listener from exporting ahead of the capture.

### Older browsers and LOCALE

An already-open old browser which sends a direct mirror POST receives a non-success response. Its independent canonical Admin/referee RPC still works. Reload the client after rollout; a direct public-only write is no longer a supported persistence API. The two old UI callers already catch that best-effort mirror failure, but their old optimistic messages are not a durable-commit guarantee.

LOCALE retains its older autosave/UI contract. This change does not import ONLINE's durable-commit framework into that client: its helper can only republish what has already reached the canonical server, while its normal snapshot save publishes the later committed change. There is no claim that LOCALE's existing optimistic Fanta feedback waits for persistence. On a database lacking 004, the repair call fails closed and the existing canonical save remains the supported path.

The supported legacy SQL test profile is **LOCALE migrations through June plus September 001, 002, 003 and 004**, currently 39 migrations. It explicitly excludes the conflicting/incomplete historical July/August LOCALE sequence; it is not an attestation that every legacy installation is modern-schema equivalent. The new repair works without the compact table or lease/data-plane tables; modern guards are used when installed. The old restore precondition remains unchanged and refuses unsafe restore on those legacy schemas.

Migrations 001, 002 and 003 are immutable. Apply 004 additively using the migration pipeline; do not reapply historical bootstrap grants as a substitute for migrations.

### Fanta archive ordering and local-primary limits

`snapshotFantaBeforeArchive` publishes the Fanta archive tables; it is not a private capture. Calling it before a rejected cloud commit could list the still-live edition in public history. Moving this one call after canonical confirmation closes that path while retaining its source scoring rows. The other existing MVP/manual archive callers have not been changed in this release and require the same durable-transition review separately.

The local server schedules cloud outbox/live publication before waiting for its mandatory secondary-disk copy (`src/server.mjs`, workspace commit). If the outbox reaches Supabase first, the `tournamentHistory` operation invokes the full normalizer and already rebuilds the previous tournament's Fanta archive. A subsequent client snapshot preserves those values; this is covered with the actual SQL normalizer. The SQL check does not simulate physical-disk failure or server scheduling. A secondary-copy failure after SQLite committed may still follow an already-running cloud publication even though the HTTP caller sees a retryable error. This pre-existing server ordering is a separate durability follow-up; the client change does not claim that every failed response means no remote effects.

## Backup contention

An INSERT/upsert executes BEFORE INSERT before locking a conflicting row, so the old POST helpers did not reproduce the row/advisory inversion fixed by 003. However, SQL DML already owns a relation-level RowExclusiveLock when its trigger starts. Export/restore acquired the advisory before waiting for conflicting SHARE / SHARE ROW EXCLUSIVE table locks. This separate lock order can form a cycle with a direct writer.

004 replaces the currently installed export/restore function definitions additively, preserving their signatures, privileges, validation, checkpoint and data behavior. Their explicit table locks now use NOWAIT. A `lock_not_available` error is rethrown as SQLSTATE `P0001` with `FLBP_DATABASE_BUSY`, before export collection or restore checkpoint/delete/insert. The existing Edge classifier therefore returns `restoreNotCommitted: true` and an error, never a success receipt.

There is no retry loop in SQL or automatic destructive fallback. The caller may retry the complete RPC after rollback, with the same restore operation ID. A later successful duplicate still returns the existing receipt and creates no new version/checkpoint. If an earlier attempt already had an uncertain transport outcome, the UI's existing sticky uncertainty remains applicable; a later busy response does not prove the earlier attempt rolled back.

## Verification

The following commands run from `FLBP ONLINE`:

```text
node scripts/test-public-mirrors.mjs --pglite <absolute external PGlite module>
node scripts/test-public-mirrors.mjs --legacy --pglite <absolute external PGlite module>
node scripts/test-public-mirrors.mjs --database-url <disposable loopback PostgreSQL URL>
node scripts/test-public-mirrors-native.mjs --database-url <disposable loopback PostgreSQL URL>
node scripts/test-public-mirrors-client.mjs
node scripts/test-database-backup-edge.mjs
node scripts/test-fanta-archive-order.mjs --pglite <absolute external PGlite module>
node scripts/test-fanta-archive-order.mjs --database-url <disposable loopback PostgreSQL URL>
```

The SQL suite checks actual role restrictions and RPCs, old delayed upserts, recursive privacy, preservation of existing public non-live content, canonical Admin/referee publication after DML revocation, atomic rollback on a late compact failure, missing/malformed snapshots, local/recovery fencing and lease ownership. Current local results: 24 assertions on all 71 ONLINE migrations; 16 assertions on the stated 39-migration legacy profile. The ONLINE PGlite runner also executes the deployed read-only metadata probe.

The native-only runner uses independent psql sessions and a committed synthetic fixture. One session holds the actual public table's RowExclusiveLock; export and restore must return explicit busy with no checkpoint/data/version mutation. After releasing it, a whole-transaction retry with the original operation ID must succeed and remain idempotent. The [native PostgreSQL CI run](https://github.com/Mabalico/https-github.com-flbp-manager/actions/runs/36068993737) passed all 24 mirror SQL assertions and 12 native busy/retry assertions, along with the earlier Admin/referee/restore/HTTP suites. The [deployment dry-run](https://github.com/Mabalico/https-github.com-flbp-manager/actions/runs/36069008849) identified only migration 004. This local host uses PGlite; the native result comes from CI, not from the in-process runtime.

The client runner executes the real service and two Admin handler bodies with only IO/repository callbacks replaced. Its 32 cases verify absent browser payloads, no REST fallback, valid receipts, local routing, durable success/failure ordering and duplicate-click suppression. The failed or mismatched start receipt invokes no archive snapshot. A successful replacement verifies the precise order: confirmed commit, Fanta snapshot, state publication, structured export, promotion. The Edge/frontend runner passes 32 cases, including explicit busy propagation and preservation of retry identity.

The separate Fanta archive-order SQL runner has 22 passing local assertions on the complete 71-migration ONLINE schema. It executes actual Admin v2 and reachable legacy snapshot RPCs, the public archive RPC and the local full normalizer. Synthetic captain/defender rosters have nonzero goals/blows/wins; edition, standings, player and roster values match exactly before versus after the canonical commit, including after an early local normalization. Its new native gate is separate from the already-passed CI run above. These checks do not substitute for rendered browser tests or full app checks. Root coordinates `test:data`, Admin SSR, builds/type checks and native CI to avoid shared temporary-directory collisions.
