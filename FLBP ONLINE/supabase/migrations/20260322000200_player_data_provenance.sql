alter table if exists public.integrations_scorers
  add column if not exists source_type text null,
  add column if not exists source_tournament_id text null,
  add column if not exists source_label text null,
  add column if not exists team_name text null;

alter table if exists public.hall_of_fame_entries
  add column if not exists source_type text null,
  add column if not exists source_tournament_id text null,
  add column if not exists source_tournament_name text null,
  add column if not exists source_match_id text null,
  add column if not exists source_auto_generated boolean null,
  add column if not exists reassigned_from_player_id text null,
  add column if not exists manually_edited boolean null;

alter table if exists public.public_hall_of_fame_entries
  add column if not exists source_type text null,
  add column if not exists source_tournament_id text null,
  add column if not exists source_tournament_name text null,
  add column if not exists source_auto_generated boolean null,
  add column if not exists manually_edited boolean null;
