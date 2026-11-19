-- Referee pull: the live tournament only, never the private workspace state.
--
-- flbp_referee_pull_live_state returned the whole workspace_state to anyone
-- holding a tournament's referee password: archives, Hall of Fame identities,
-- aliases, scorer integrations, the referee password itself and every
-- player's birth date. The referee area needs only the live tournament:
-- teams and player names, groups, configuration, roster, auth version and
-- matches (whole matches, because a referee patch carries them back).
--
-- The state is now the recursive allow-list already used for the public
-- mirror (flbp_referee_public_projection, 20260924000300):
--   __schemaVersion, teams, tournamentMatches and
--   tournament {id, name, type, startDate, refereesAuthVersion, isManual,
--   includeU25Awards, teams, groups, config, matches, rounds, refereesRoster},
-- with team and match fields limited to the public/referee ones (match fields
-- are exactly those a referee patch may write; U25 flags are derived as in
-- the public mirror). Removed: refereesPassword, birth dates and years of
-- birth, tournamentHistory, hallOfFame, integrationsScorers, playerAliases,
-- playerAccountAliasIgnores, logo, fantaSettings, legacy top-level matches,
-- private match/team extensions and any other key.
--
-- Signature, grants and response shape ({ok, auth_version, updated_at,
-- state}) are unchanged; a rejection never carries a state. Deploy the web
-- client first: older clients replace their whole local state with this
-- response and drop the referee session when the state has no password; the
-- current client merges it into the local state (RefereesArea,
-- mergeRefereeLiveState) and keeps the private data of an Admin copy.
-- flbp_referee_check_credentials still hands the full state to the internal
-- push functions. Safe to reapply.

create or replace function public.flbp_referee_pull_live_state(p_workspace_id text,p_tournament_id text,p_referees_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  v_out := public.flbp_referee_check_credentials(p_workspace_id,p_tournament_id,p_referees_password,'pull_live_state');
  if not coalesce((v_out->>'ok')::boolean,false) then
    return v_out - 'state';
  end if;
  perform public.flbp_log_referee_auth_audit(p_workspace_id,p_tournament_id,'pull_live_state',true,'ok',v_out->>'auth_version');
  return v_out || jsonb_build_object('state',
    public.flbp_referee_public_projection(v_out->'state','state') - 'fantaSettings');
end;
$$;
revoke all on function public.flbp_referee_pull_live_state(text,text,text) from public;
grant execute on function public.flbp_referee_pull_live_state(text,text,text) to anon,authenticated,service_role;
