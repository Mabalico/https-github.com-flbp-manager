import { isFinalGroup } from './groupUtils';
import { isByeTeamId, isPlaceholderTeamId, isTbdTeamId } from './matchUtils';
import { buildTournamentStructureIntegritySummary } from './tournamentStructureIntegrity';
import {
  findTeamEliminated,
  findTeamStartedInPhase,
  getCatalogTeam,
  getBracketMatches,
  getBracketAssignedTeamIds,
  getGroupAssignedTeamIds,
  getDuplicateBracketTeamIds,
  getDuplicateGroupTeamIds,
  getGroupById,
  getGroupMatches,
  getSlotPlacement,
  getSlotValue,
  getTeamPlacement,
  hasRealBracketStarted,
  parseSlotKey,
  isGroupConcluded,
  getMatchById,
  isLockedBracketMatchForStructureEdit,
} from './tournamentStructureSelectors';
import type {
  DraftValidationResult,
  StructuralIssue,
  StructuralTargetCheck,
  TeamEligibilityResult,
  TournamentStructureSnapshot,
} from './tournamentStructureTypes';
import type { StructuralPhase } from './tournamentStructureTypes';

const allowed = (reasonCode: string, humanMessage: string, warnings?: StructuralIssue[]): StructuralTargetCheck => ({
  allowed: true,
  severity: warnings?.length ? 'warning' : 'allowed',
  reasonCode,
  humanMessage,
  warnings,
});

const blocked = (reasonCode: string, humanMessage: string): StructuralTargetCheck => ({
  allowed: false,
  severity: 'blocking',
  reasonCode,
  humanMessage,
});

const pushIssueUnique = (bucket: StructuralIssue[], issue: StructuralIssue) => {
  const key = [
    issue.severity,
    issue.code,
    issue.teamId || '',
    issue.slotKey || '',
    issue.groupId || '',
    issue.matchId || '',
    issue.message,
  ].join('|');
  if (!bucket.some((entry) => [
    entry.severity,
    entry.code,
    entry.teamId || '',
    entry.slotKey || '',
    entry.groupId || '',
    entry.matchId || '',
    entry.message,
  ].join('|') === key)) {
    bucket.push(issue);
  }
};

export const getTeamEligibility = (
  snapshot: TournamentStructureSnapshot,
  teamId: string,
  phase: StructuralPhase
): TeamEligibilityResult => {
  const id = String(teamId || '').trim();
  const team = getCatalogTeam(snapshot, id);
  if (!id || !team) {
    return {
      teamId: id,
      status: 'unknown',
      reasonCode: 'team_not_found',
      humanMessage: 'Squadra non trovata nel catalogo del torneo.',
    };
  }
  if (team.hidden) {
    return {
      teamId: id,
      status: 'deleted',
      reasonCode: 'deleted_from_catalog',
      humanMessage: 'Squadra nascosta/eliminata dal catalogo.',
    };
  }
  if (findTeamEliminated(snapshot, id)) {
    return {
      teamId: id,
      status: 'eliminated',
      reasonCode: 'eliminated_from_bracket',
      humanMessage: 'Squadra già eliminata dal tabellone.',
      currentPlacement: getTeamPlacement(snapshot, id, phase),
    };
  }

  if (phase === 'groups') {
    const dupes = new Set(getDuplicateGroupTeamIds(snapshot));
    const placement = getTeamPlacement(snapshot, id, 'groups');
    if (dupes.has(id)) {
      return {
        teamId: id,
        status: 'duplicate',
        reasonCode: 'duplicate_in_groups',
        humanMessage: 'Squadra duplicata nei gironi.',
        currentPlacement: placement,
      };
    }
    if (findTeamStartedInPhase(snapshot, id, 'groups')) {
      return {
        teamId: id,
        status: 'locked_by_match',
        reasonCode: 'locked_by_group_match',
        humanMessage: 'La squadra ha già iniziato la fase a gironi.',
        currentPlacement: placement,
      };
    }
    if (placement) {
      return {
        teamId: id,
        status: 'already_assigned',
        reasonCode: 'already_assigned_groups',
        humanMessage: `Già assegnata a ${placement.containerName || 'un girone'}.`,
        currentPlacement: placement,
      };
    }
  } else {
    const dupes = new Set(getDuplicateBracketTeamIds(snapshot));
    const placement = getTeamPlacement(snapshot, id, 'bracket');
    if (dupes.has(id)) {
      return {
        teamId: id,
        status: 'duplicate',
        reasonCode: 'duplicate_in_bracket',
        humanMessage: 'Squadra duplicata nel Round 1 del bracket.',
        currentPlacement: placement,
      };
    }
    if (placement) {
      return {
        teamId: id,
        status: 'already_assigned',
        reasonCode: 'already_assigned_bracket',
        humanMessage: `Già assegnata a ${placement.containerName || 'Round 1'}.`,
        currentPlacement: placement,
      };
    }
  }

  return {
    teamId: id,
    status: 'eligible',
    reasonCode: 'ok',
    humanMessage: 'Squadra eleggibile.',
  };
};

export const canInsertTeamIntoGroup = (
  snapshot: TournamentStructureSnapshot,
  teamId: string,
  groupId: string
): StructuralTargetCheck => {
  const teamState = getTeamEligibility(snapshot, teamId, 'groups');
  if (teamState.status !== 'eligible') return blocked(teamState.reasonCode, teamState.humanMessage);
  if (hasRealBracketStarted(snapshot)) {
    return blocked(
      'group_edit_blocked_by_bracket_phase',
      'Non posso modificare i gironi dopo l’avvio di match reali del bracket.'
    );
  }

  const group = getGroupById(snapshot, groupId);
  if (!group) return blocked('unknown', 'Girone non trovato.');
  if (isFinalGroup(group)) return blocked('group_is_final', 'Il Girone Finale non è modificabile.');
  if (isGroupConcluded(snapshot, groupId)) {
    return blocked('group_is_concluded', `Il girone ${group.name} è già concluso.`);
  }
  if ((group.teams || []).some((team) => team.id === teamId)) {
    return blocked('team_already_in_group', 'La squadra è già presente nel girone.');
  }

  const targetStarted = getGroupMatches(snapshot, group.name).some(
    (match) => match.status !== 'scheduled' || !!match.played || !!match.isTieBreak
  );
  if (targetStarted) {
    return allowed(
      'ok',
      `Inserimento consentito in ${group.name}. Verranno creati nuovi match non ancora giocati.`,
      [
        {
          severity: 'warning',
          code: 'group_target_started',
          message: `Il girone ${group.name} ha già match iniziati: verranno aggiunti solo i match mancanti della nuova squadra.`,
          groupId,
          groupName: group.name,
          teamId,
        },
      ]
    );
  }

  return allowed('ok', `Inserimento consentito in ${group.name}.`);
};

export const canMoveTeamBetweenGroups = (
  snapshot: TournamentStructureSnapshot,
  teamId: string,
  fromGroupId: string,
  toGroupId: string
): StructuralTargetCheck => {
  if (fromGroupId === toGroupId) return blocked('same_group', 'Origine e destinazione coincidono.');
  if (hasRealBracketStarted(snapshot)) {
    return blocked(
      'group_edit_blocked_by_bracket_phase',
      'Non posso spostare squadre tra gironi dopo l’avvio del bracket.'
    );
  }

  const fromGroup = getGroupById(snapshot, fromGroupId);
  const toGroup = getGroupById(snapshot, toGroupId);
  if (!fromGroup || !toGroup) return blocked('unknown', 'Girone origine o destinazione non trovato.');
  if (isFinalGroup(fromGroup) || isFinalGroup(toGroup)) {
    return blocked('group_is_final', 'Il Girone Finale non è modificabile.');
  }
  if (isGroupConcluded(snapshot, toGroupId)) {
    return blocked('group_is_concluded', `Il girone ${toGroup.name} è già concluso.`);
  }
  if (!(fromGroup.teams || []).some((team) => team.id === teamId)) {
    return blocked('team_not_in_group', 'La squadra non è nel girone di origine.');
  }
  if ((toGroup.teams || []).some((team) => team.id === teamId)) {
    return blocked('team_already_in_group', 'La squadra è già nel girone di destinazione.');
  }
  if (findTeamStartedInPhase(snapshot, teamId, 'groups')) {
    return blocked('locked_by_group_match', 'La squadra ha già iniziato la fase a gironi.');
  }

  const targetStarted = getGroupMatches(snapshot, toGroup.name).some(
    (match) => match.status !== 'scheduled' || !!match.played || !!match.isTieBreak
  );
  if (targetStarted) {
    return allowed(
      'ok',
      `Spostamento consentito ${fromGroup.name} → ${toGroup.name}.`,
      [
        {
          severity: 'warning',
          code: 'group_target_started',
          message: `Il girone ${toGroup.name} ha già match iniziati: verranno creati solo i match mancanti della squadra spostata.`,
          teamId,
          groupId: toGroup.id,
          groupName: toGroup.name,
        },
      ]
    );
  }

  return allowed('ok', `Spostamento consentito ${fromGroup.name} → ${toGroup.name}.`);
};

export const canSwapTeams = (
  snapshot: TournamentStructureSnapshot,
  teamAId: string,
  teamBId: string,
  phase: StructuralPhase,
  aContainerId: string,
  bContainerId: string
): StructuralTargetCheck => {
  if (phase === 'groups') {
    if (hasRealBracketStarted(snapshot)) {
      return blocked(
        'group_edit_blocked_by_bracket_phase',
        'Non posso scambiare squadre tra gironi dopo l’avvio del bracket.'
      );
    }
    const groupA = getGroupById(snapshot, aContainerId);
    const groupB = getGroupById(snapshot, bContainerId);
    if (!groupA || !groupB) return blocked('unknown', 'Girone non trovato.');
    if (groupA.id === groupB.id) return blocked('same_group', 'Per lo stesso girone usa il replace, non lo swap.');
    if (isFinalGroup(groupA) || isFinalGroup(groupB)) {
      return blocked('group_is_final', 'Il Girone Finale non è modificabile.');
    }
    if (isGroupConcluded(snapshot, groupA.id) || isGroupConcluded(snapshot, groupB.id)) {
      return blocked('group_is_concluded', 'Uno dei due gironi è già concluso.');
    }
    if (findTeamStartedInPhase(snapshot, teamAId, 'groups') || findTeamStartedInPhase(snapshot, teamBId, 'groups')) {
      return blocked('locked_by_group_match', 'Una delle due squadre ha già iniziato la fase a gironi.');
    }
    return allowed('ok', `Scambio consentito tra ${groupA.name} e ${groupB.name}.`);
  }

  return canSwapBracketSlots(snapshot, aContainerId, bContainerId);
};

export const canReplaceGroupTeam = (
  snapshot: TournamentStructureSnapshot,
  oldTeamId: string,
  newTeamId: string,
  groupId: string
): StructuralTargetCheck => {
  if (!oldTeamId || !newTeamId) return blocked('unknown', 'Squadra origine o destinazione non valida.');
  if (oldTeamId === newTeamId) return blocked('same_group', 'Origine e destinazione coincidono.');
  if (hasRealBracketStarted(snapshot)) {
    return blocked(
      'group_edit_blocked_by_bracket_phase',
      'Non posso sostituire squadre nei gironi dopo l’avvio del bracket.'
    );
  }

  const group = getGroupById(snapshot, groupId);
  if (!group) return blocked('unknown', 'Girone non trovato.');
  if (isFinalGroup(group)) return blocked('group_is_final', 'Il Girone Finale non è modificabile.');
  if (isGroupConcluded(snapshot, groupId)) {
    return blocked('group_is_concluded', `Il girone ${group.name} è già concluso.`);
  }
  if (!(group.teams || []).some((team) => team.id === oldTeamId)) {
    return blocked('team_not_in_group', 'La squadra da sostituire non è nel girone.');
  }
  if (findTeamStartedInPhase(snapshot, oldTeamId, 'groups')) {
    return blocked('replace_requires_unplayed_source', 'La squadra da sostituire ha già iniziato i gironi.');
  }
  if ((group.teams || []).some((team) => team.id === newTeamId)) {
    return blocked('team_already_in_group', 'La nuova squadra è già presente nel girone.');
  }

  const teamState = getTeamEligibility(snapshot, newTeamId, 'groups');
  if (teamState.status !== 'eligible') return blocked(teamState.reasonCode, teamState.humanMessage);

  return allowed('ok', `Sostituzione consentita in ${group.name}.`);
};

export const canInsertTeamIntoBracketSlot = (
  snapshot: TournamentStructureSnapshot,
  teamId: string,
  slotKey: string
): StructuralTargetCheck => {
  const teamState = getTeamEligibility(snapshot, teamId, 'bracket');
  if (teamState.status !== 'eligible') return blocked(teamState.reasonCode, teamState.humanMessage);

  const parsed = parseSlotKey(slotKey);
  if (!parsed) return blocked('invalid_slot', 'Slot bracket non valido.');
  const match = getMatchById(snapshot, parsed.matchId);
  if (!match) return blocked('invalid_slot', 'Match bracket non trovato.');
  if (isLockedBracketMatchForStructureEdit(match)) {
    return blocked('slot_locked', 'Il match di destinazione è già giocato o in corso.');
  }

  const currentValue = getSlotValue(snapshot, slotKey);
  if (currentValue && !isPlaceholderTeamId(currentValue)) {
    return blocked('slot_not_placeholder', 'Lo slot è già occupato da una squadra reale.');
  }
  return allowed('ok', 'Inserimento consentito nello slot selezionato.');
};

export const canReplaceBracketSlot = (
  snapshot: TournamentStructureSnapshot,
  slotKey: string,
  newTeamId: string
): StructuralTargetCheck => {
  const parsed = parseSlotKey(slotKey);
  if (!parsed) return blocked('invalid_slot', 'Slot bracket non valido.');
  const match = getMatchById(snapshot, parsed.matchId);
  if (!match) return blocked('invalid_slot', 'Match bracket non trovato.');
  const currentValue = getSlotValue(snapshot, slotKey);
  if (!currentValue || isPlaceholderTeamId(currentValue)) {
    return blocked('slot_not_placeholder', 'Per uno slot BYE/TBD usa l’operazione di insert.');
  }
  const oppositeSlotKey = `${parsed.matchId}|${parsed.field === 'teamAId' ? 'B' : 'A'}`;
  const oppositeValue = getSlotValue(snapshot, oppositeSlotKey);
  if (currentValue === newTeamId) {
    return blocked('same_slot', 'La squadra selezionata è già presente in questo slot.');
  }
  if ((match.isBye || match.hidden) && (!!oppositeValue && isPlaceholderTeamId(oppositeValue))) {
    return blocked('slot_locked', 'La squadra già protetta da uno slot BYE/TBD non può essere sostituita da qui.');
  }
  if (isLockedBracketMatchForStructureEdit(match)) {
    return blocked('slot_locked', 'Il match di destinazione è già giocato o in corso.');
  }
  const teamState = getTeamEligibility(snapshot, newTeamId, 'bracket');
  if (teamState.status !== 'eligible') return blocked(teamState.reasonCode, teamState.humanMessage);
  return allowed('ok', 'Sostituzione consentita sullo slot selezionato.');
};

export const canMoveBracketSlot = (
  snapshot: TournamentStructureSnapshot,
  fromSlotKey: string,
  toSlotKey: string
): StructuralTargetCheck => {
  const fromParsed = parseSlotKey(fromSlotKey);
  const toParsed = parseSlotKey(toSlotKey);
  if (!fromParsed || !toParsed) return blocked('invalid_slot', 'Slot bracket non valido.');
  if (fromSlotKey === toSlotKey) return blocked('same_slot', 'Origine e destinazione coincidono.');
  const fromMatch = getMatchById(snapshot, fromParsed.matchId);
  const toMatch = getMatchById(snapshot, toParsed.matchId);
  if (!fromMatch || !toMatch) return blocked('invalid_slot', 'Match bracket non trovato.');

  const fromValue = getSlotValue(snapshot, fromSlotKey);
  const toValue = getSlotValue(snapshot, toSlotKey);
  if (!fromValue || isPlaceholderTeamId(fromValue)) {
    return blocked('source_locked', 'Lo slot origine non contiene una squadra reale.');
  }
  if (toValue && !(isByeTeamId(toValue) || isTbdTeamId(toValue))) {
    return blocked('slot_not_placeholder', 'La destinazione deve essere vuota oppure uno slot BYE/TBD.');
  }
  if (isLockedBracketMatchForStructureEdit(fromMatch)) {
    return blocked('source_locked', 'Il match origine è già giocato o in corso.');
  }
  if (isLockedBracketMatchForStructureEdit(toMatch)) {
    return blocked('target_locked', 'Il match destinazione è già giocato o in corso.');
  }
  return allowed('ok', 'Spostamento consentito verso lo slot selezionato.');
};

export const canSwapBracketSlots = (
  snapshot: TournamentStructureSnapshot,
  slotAKey: string,
  slotBKey: string
): StructuralTargetCheck => {
  if (slotAKey === slotBKey) return blocked('same_slot', 'Seleziona due slot diversi.');
  const parsedA = parseSlotKey(slotAKey);
  const parsedB = parseSlotKey(slotBKey);
  if (!parsedA || !parsedB) return blocked('invalid_slot', 'Slot bracket non valido.');
  const matchA = getMatchById(snapshot, parsedA.matchId);
  const matchB = getMatchById(snapshot, parsedB.matchId);
  if (!matchA || !matchB) return blocked('invalid_slot', 'Match bracket non trovato.');
  const valueA = getSlotValue(snapshot, slotAKey);
  const valueB = getSlotValue(snapshot, slotBKey);
  if (!valueA || !valueB) return blocked('invalid_slot', 'Uno dei due slot è vuoto.');

  const aPlaceholder = isPlaceholderTeamId(valueA);
  const bPlaceholder = isPlaceholderTeamId(valueB);
  if (aPlaceholder && bPlaceholder) {
    return blocked('slot_not_placeholder', 'Due placeholder non hanno nulla da scambiare.');
  }
  if (isLockedBracketMatchForStructureEdit(matchA) || isLockedBracketMatchForStructureEdit(matchB)) {
    return blocked('slot_locked', 'Non posso intervenire su match bracket già giocati o in corso.');
  }
  return allowed('ok', 'Scambio consentito tra gli slot selezionati.');
};

export const validateDraftBeforeApply = (
  original: TournamentStructureSnapshot,
  draft: TournamentStructureSnapshot
): DraftValidationResult => {
  const blockingErrors: StructuralIssue[] = [];
  const warnings: StructuralIssue[] = [];
  const integrity = buildTournamentStructureIntegritySummary(draft);

  for (const group of draft.tournament.groups || []) {
    if ((group.teams || []).some((team) => isPlaceholderTeamId(team.id))) {
      blockingErrors.push({
        severity: 'blocking',
        code: 'group_placeholder',
        message: `Il girone ${group.name} contiene ancora placeholder BYE/TBD.`,
        groupId: group.id,
        groupName: group.name,
      });
    }
  }

  for (const teamId of getDuplicateGroupTeamIds(draft)) {
    pushIssueUnique(blockingErrors, {
      severity: 'blocking',
      code: 'duplicate_in_groups',
      message: `Squadra duplicata nei gironi: ${getCatalogTeam(draft, teamId)?.name || teamId}.`,
      teamId,
    });
  }

  for (const teamId of getDuplicateBracketTeamIds(draft)) {
    pushIssueUnique(blockingErrors, {
      severity: 'blocking',
      code: 'duplicate_in_bracket',
      message: `Squadra duplicata nel Round 1 del bracket: ${getCatalogTeam(draft, teamId)?.name || teamId}.`,
      teamId,
    });
  }

  for (const teamId of integrity.excluded) {
    pushIssueUnique(blockingErrors, {
      severity: 'blocking',
      code: 'team_excluded_from_structure',
      message: `La squadra ${getCatalogTeam(draft, teamId)?.name || teamId} è rimasta fuori dalla struttura del torneo.`,
      teamId,
    });
  }

  if (hasRealBracketStarted(original)) {
    const originalGroups = new Map<string, string>();
    const draftGroups = new Map<string, string>();
    for (const group of original.tournament.groups || []) {
      for (const team of group.teams || []) {
        if (!team.id || isPlaceholderTeamId(team.id)) continue;
        originalGroups.set(team.id, group.id);
      }
    }
    for (const group of draft.tournament.groups || []) {
      for (const team of group.teams || []) {
        if (!team.id || isPlaceholderTeamId(team.id)) continue;
        draftGroups.set(team.id, group.id);
      }
    }
    const changed = Array.from(new Set([...originalGroups.keys(), ...draftGroups.keys()])).some(
      (teamId) => originalGroups.get(teamId) !== draftGroups.get(teamId)
    );
    if (changed) {
      pushIssueUnique(blockingErrors, {
        severity: 'blocking',
        code: 'group_edit_blocked_by_bracket_phase',
        message: 'Non posso applicare modifiche ai gironi dopo l’avvio del bracket.',
      });
    }
  }

  for (const teamId of Array.from(new Set([...getGroupAssignedTeamIds(draft), ...getBracketAssignedTeamIds(draft)]))) {
    const catalogTeam = getCatalogTeam(draft, teamId);
    if (!catalogTeam) {
      pushIssueUnique(blockingErrors, {
        severity: 'blocking',
        code: 'team_not_found',
        message: `Squadra non trovata nel catalogo: ${teamId}.`,
        teamId,
      });
    }
    if (catalogTeam?.hidden) {
      pushIssueUnique(blockingErrors, {
        severity: 'blocking',
        code: 'deleted_from_catalog',
        message: `La squadra ${catalogTeam.name || teamId} è nascosta/eliminata dal catalogo e non può essere assegnata.`,
        teamId,
      });
    }
    if (findTeamEliminated(original, teamId) && !findTeamEliminated(draft, teamId)) {
      pushIssueUnique(blockingErrors, {
        severity: 'blocking',
        code: 'eliminated_from_bracket',
        message: `La squadra ${catalogTeam?.name || teamId} era già eliminata e non può essere reinserita.`,
        teamId,
      });
    }
  }

  for (const teamId of getGroupAssignedTeamIds(original)) {
    if (!findTeamStartedInPhase(original, teamId, 'groups')) continue;
    const originalPlacement = getTeamPlacement(original, teamId, 'groups');
    const draftPlacement = getTeamPlacement(draft, teamId, 'groups');
    if ((originalPlacement?.containerId || '') === (draftPlacement?.containerId || '')) continue;
    pushIssueUnique(blockingErrors, {
      severity: 'blocking',
      code: 'locked_by_group_match',
      message: `La squadra ${getCatalogTeam(original, teamId)?.name || teamId} ha già iniziato i gironi e non può essere spostata.`,
      teamId,
      groupId: originalPlacement?.containerId,
      groupName: originalPlacement?.containerName,
    });
  }

  const originalBracketSlots = new Map<string, string>();
  const draftBracketSlots = new Map<string, string>();
  for (const match of getBracketMatches(original)) {
    originalBracketSlots.set(`${match.id}|A`, String(match.teamAId || '').trim());
    originalBracketSlots.set(`${match.id}|B`, String(match.teamBId || '').trim());
  }
  for (const match of getBracketMatches(draft)) {
    draftBracketSlots.set(`${match.id}|A`, String(match.teamAId || '').trim());
    draftBracketSlots.set(`${match.id}|B`, String(match.teamBId || '').trim());
  }
  for (const match of getBracketMatches(original)) {
    if (!isLockedBracketMatchForStructureEdit(match)) continue;
    for (const side of ['A', 'B'] as const) {
      const slotKey = `${match.id}|${side}`;
      const beforeTeamId = originalBracketSlots.get(slotKey) || '';
      const afterTeamId = draftBracketSlots.get(slotKey) || '';
      if (beforeTeamId === afterTeamId) continue;
      pushIssueUnique(blockingErrors, {
        severity: 'blocking',
        code: 'slot_locked',
        message: `Lo slot ${slotKey} appartiene a un match già giocato o in corso e non può cambiare.`,
        slotKey,
        matchId: match.id,
        teamId: beforeTeamId || afterTeamId || undefined,
      });
    }
  }

  if (!blockingErrors.length) {
    const futureStartedMatches = getBracketMatches(draft).filter(
      (match) => (match.round || 1) > 1 && isLockedBracketMatchForStructureEdit(match)
    );
    if (futureStartedMatches.length) {
      pushIssueUnique(warnings, {
        severity: 'warning',
        code: 'future_bracket_started',
        message: 'Alcuni round successivi del bracket sono già iniziati o conclusi: le modifiche influenzeranno solo i match futuri non ancora avviati.',
      });
    }
  }

  return {
    ok: blockingErrors.length === 0,
    canApply: blockingErrors.length === 0,
    blockingErrors,
    warnings,
  };
};
