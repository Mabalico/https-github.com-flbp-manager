import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { TvView } from './components/TvView';
import { parseBackupJsonState } from './services/backupJsonService';
import { coerceAppState, type AppState } from './services/storageService';
import { sanitizeAppStateForPublic } from './services/supabaseRest';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const ss = new MemStorage();
const ls = new MemStorage();
(globalThis as any).sessionStorage = ss;
(globalThis as any).localStorage = ls;
(globalThis as any).window = globalThis;
(globalThis as any).document = { fonts: { ready: Promise.resolve(), load: async () => [] } };

const base: AppState = {
  teams: [],
  matches: [],
  tournament: null,
  tournamentMatches: [],
  tournamentHistory: [],
  logo: '',
  hallOfFame: [],
  integrationsScorers: [],
  playerAliases: {},
};

const liveState: AppState = {
  ...base,
  teams: [
    { id: 'A', name: 'Lupi Rossi', player1: 'Alfa', player2: 'Beta' } as any,
    { id: 'B', name: 'Orsi Blu', player1: 'Gamma', player2: 'Delta' } as any,
    { id: 'C', name: 'Falchi', player1: 'Epsilon', player2: 'Zeta' } as any,
    { id: 'D', name: 'Leoni', player1: 'Eta', player2: 'Theta' } as any,
    { id: 'BYE', name: 'BYE', player1: '', player2: '' } as any,
  ],
  hallOfFame: [
    { id: 'hof1', tournamentId: 'tour-1', type: 'mvp', playerId: 'Alfa_ND', playerNames: ['Alfa'] } as any,
  ],
  tournament: {
    id: 'tour-1',
    name: 'Coppa TV Test',
    teams: [
      { id: 'A', name: 'Lupi Rossi', player1: 'Alfa', player2: 'Beta' },
      { id: 'B', name: 'Orsi Blu', player1: 'Gamma', player2: 'Delta' },
      { id: 'C', name: 'Falchi', player1: 'Epsilon', player2: 'Zeta' },
      { id: 'D', name: 'Leoni', player1: 'Eta', player2: 'Theta' },
    ] as any,
    groups: [
      { id: 'g1', name: 'Girone A', teams: [{ id: 'A', name: 'Lupi Rossi' }, { id: 'B', name: 'Orsi Blu' }] },
      { id: 'g2', name: 'Girone B', teams: [{ id: 'C', name: 'Falchi' }, { id: 'D', name: 'Leoni' }] },
      { id: 'gf', name: 'Girone Finale', stage: 'final', teams: [{ id: 'A', name: 'Lupi Rossi' }, { id: 'C', name: 'Falchi' }] },
    ],
    rounds: [
      [
        { id: 'f1', code: 'SF1', phase: 'bracket', round: 1, roundName: 'Semifinale', teamAId: 'A', teamBId: 'D', scoreA: 10, scoreB: 6, played: true, status: 'finished' },
        { id: 'f2', code: 'SF2', phase: 'bracket', round: 1, roundName: 'Semifinale', teamAId: 'C', teamBId: 'BYE', isBye: true, hidden: true, played: false, status: 'scheduled' },
      ],
      [
        { id: 'f3', code: 'FIN', phase: 'bracket', round: 2, roundName: 'Finale', teamAId: 'A', teamBId: 'TBD-final', played: false, status: 'scheduled' },
      ],
    ],
    config: { advancingPerGroup: 1 },
  } as any,
  tournamentMatches: [
    { id: 'm1', code: 'A1', phase: 'groups', groupName: 'Girone A', teamAId: 'A', teamBId: 'B', scoreA: 10, scoreB: 8, played: true, status: 'finished', stats: [{ teamId: 'A', playerName: 'Alfa', canestri: 6, soffi: 1 }, { teamId: 'B', playerName: 'Gamma', canestri: 4, soffi: 2 }] },
    { id: 'm2', code: 'B1', phase: 'groups', groupName: 'Girone B', teamAId: 'C', teamBId: 'D', scoreA: 0, scoreB: 0, played: false, status: 'scheduled' },
    { id: 'tb1', code: 'TB1', phase: 'groups', groupName: 'Girone A', teamAId: 'A', teamBId: 'B', isTieBreak: true, played: false, status: 'scheduled' },
    { id: 'f1', code: 'SF1', phase: 'bracket', round: 1, roundName: 'Semifinale', teamAId: 'A', teamBId: 'D', scoreA: 10, scoreB: 6, played: true, status: 'finished' },
    { id: 'f2', code: 'SF2', phase: 'bracket', round: 1, roundName: 'Semifinale', teamAId: 'C', teamBId: 'BYE', isBye: true, hidden: true, played: false, status: 'scheduled' },
    { id: 'f3', code: 'FIN', phase: 'bracket', round: 2, roundName: 'Finale', teamAId: 'A', teamBId: 'TBD-final', played: false, status: 'scheduled' },
  ] as any,
  playerAliases: {},
};


const loadBackupState = (relPath: string): AppState => {
  const fullPath = path.join(process.cwd(), relPath);
  const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  return parseBackupJsonState(raw);
};

const sampleBackupState = loadBackupState('docs/sample_backup.json');
const livePublicState = coerceAppState(sanitizeAppStateForPublic(liveState) as any);
const sampleBackupPublicState = coerceAppState(sanitizeAppStateForPublic(sampleBackupState) as any);

const scenarios = [
  { name: 'empty-shell', state: base, modes: ['groups', 'groups_bracket', 'bracket', 'scorers'] as const },
  { name: 'live-populated', state: liveState, modes: ['groups', 'groups_bracket', 'bracket', 'scorers'] as const },
  { name: 'live-public-sanitized', state: livePublicState, modes: ['groups', 'groups_bracket', 'bracket', 'scorers'] as const },
  { name: 'sample-backup-coerced', state: sampleBackupState, modes: ['groups', 'groups_bracket', 'bracket', 'scorers'] as const },
  { name: 'sample-backup-public-sanitized', state: sampleBackupPublicState, modes: ['groups', 'groups_bracket', 'bracket', 'scorers'] as const },
];

let hasError = false;
for (const scenario of scenarios) {
  for (const mode of scenario.modes) {
    try {
      const html = ReactDOMServer.renderToString(<TvView state={scenario.state} mode={mode} onExit={() => {}} />);
      if (!html || html.length < 50) {
        throw new Error(`unexpectedly short html for ${scenario.name}/${mode}`);
      }
      if ((scenario.name === 'live-populated' || scenario.name === 'live-public-sanitized') && mode === 'groups_bracket') {
        if (!html.includes('Girone A') || !html.includes('Coppa TV Test')) {
          throw new Error('groups_bracket missing expected tournament/group content');
        }
      }
      if ((scenario.name === 'live-populated' || scenario.name === 'live-public-sanitized') && mode === 'scorers') {
        if (!html.includes('Alfa') && !html.includes('Lupi Rossi')) {
          throw new Error('scorers view missing expected player/team content');
        }
      }
      if ((scenario.name === 'sample-backup-coerced' || scenario.name === 'sample-backup-public-sanitized') && mode === 'groups') {
        if (!html.includes('Sample Tournament')) {
          throw new Error('sample backup groups view missing tournament title');
        }
      }
      if (html.includes('>BYE<')) {
        throw new Error(`unexpected BYE token rendered in ${scenario.name}/${mode}`);
      }
      console.log('TV SSR OK', scenario.name, mode, html.length);
    } catch (e: any) {
      hasError = true;
      console.error('TV SSR ERROR', scenario.name, mode, e?.message);
      console.error(e?.stack || e);
    }
  }
}

if (hasError) process.exitCode = 1;
