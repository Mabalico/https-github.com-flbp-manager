-- FLBP Manager Suite - birthDate-first normalized remote layer
--
-- Goals:
-- - add authoritative birthDate fields to normalized admin tables
-- - keep legacy YoB columns for compatibility, but non-authoritative
-- - allow the client to stop using YoB fallback for identity/U25 logic

alter table if exists public.integrations_scorers
  add column if not exists birth_date date null;

alter table if exists public.hall_of_fame_entries
  add column if not exists player_birth_date date null;

alter table if exists public.tournament_teams
  add column if not exists player1_birth_date date null,
  add column if not exists player2_birth_date date null;

comment on column public.integrations_scorers.birth_date is
  'Authoritative player birth date for birthDate-first identity resolution. Legacy yob remains compatibility-only.';

comment on column public.hall_of_fame_entries.player_birth_date is
  'Authoritative player birth date for birthDate-first player identity in awards and provenance.';

comment on column public.tournament_teams.player1_birth_date is
  'Authoritative player 1 birth date for birthDate-first identity resolution.';

comment on column public.tournament_teams.player2_birth_date is
  'Authoritative player 2 birth date for birthDate-first identity resolution.';

-- Optional one-time alignment for legacy YoB columns when a birth date is already present.
update public.integrations_scorers
set yob = extract(year from birth_date)::int
where birth_date is not null
  and (yob is null or yob <> extract(year from birth_date)::int);

update public.tournament_teams
set player1_yob = extract(year from player1_birth_date)::int
where player1_birth_date is not null
  and (player1_yob is null or player1_yob <> extract(year from player1_birth_date)::int);

update public.tournament_teams
set player2_yob = extract(year from player2_birth_date)::int
where player2_birth_date is not null
  and (player2_yob is null or player2_yob <> extract(year from player2_birth_date)::int);

-- Manual rollback if needed:
-- alter table if exists public.tournament_teams
--   drop column if exists player2_birth_date,
--   drop column if exists player1_birth_date;
-- alter table if exists public.hall_of_fame_entries
--   drop column if exists player_birth_date;
-- alter table if exists public.integrations_scorers
--   drop column if exists birth_date;
