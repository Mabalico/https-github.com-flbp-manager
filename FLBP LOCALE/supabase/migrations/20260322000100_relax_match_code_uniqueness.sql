-- FLBP Manager Suite - relax match code uniqueness
--
-- The app allows duplicate match codes and disambiguates them in UI
-- (e.g. Referees Area offers a choice when the same code maps to multiple matches).
-- Therefore the DB must not enforce uniqueness on tournament_matches.code.

drop index if exists public.ux_match_code;
drop index if exists ux_match_code;

create index if not exists idx_match_code
  on public.tournament_matches(workspace_id, tournament_id, code)
  where code is not null;
