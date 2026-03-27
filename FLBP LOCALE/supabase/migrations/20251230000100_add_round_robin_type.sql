-- FLBP Manager Suite
-- Add support for the 'round_robin' tournament type.
--
-- Note: the original tables were created with an inline CHECK constraint on "type".
-- Postgres defaults to the name <table>_<column>_check, so we drop that and re-add
-- with the extended enum list.

alter table tournaments
  drop constraint if exists tournaments_type_check;

alter table tournaments
  add constraint tournaments_type_check
  check (type in ('elimination','groups_elimination','round_robin'));

alter table public_tournaments
  drop constraint if exists public_tournaments_type_check;

alter table public_tournaments
  add constraint public_tournaments_type_check
  check (type in ('elimination','groups_elimination','round_robin'));
