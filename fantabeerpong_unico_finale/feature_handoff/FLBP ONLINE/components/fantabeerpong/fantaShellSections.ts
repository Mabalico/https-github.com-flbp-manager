import type { LucideIcon } from 'lucide-react';
import { BarChart3, History, LayoutDashboard, ScrollText, Shield, Users } from 'lucide-react';
import type { FantaShellSectionKey } from '../../services/fantabeerpong/types';

export interface FantaShellSection {
  key: FantaShellSectionKey;
  label: string;
  shortLabel: string;
  description: string;
  helper: string;
  icon: LucideIcon;
}

export const FANTA_SHELL_SECTIONS: FantaShellSection[] = [
  { key: 'overview', label: 'Panoramica', shortLabel: 'Panoramica', description: 'Ingresso rapido alla feature con stato squadra, classifica e accessi principali.', helper: 'Hub centrale della feature FantaBeerpong.', icon: LayoutDashboard },
  { key: 'my_team', label: 'La mia squadra', shortLabel: 'La mia squadra', description: 'Rosa fantasy, capitano, difensori e stato modifica.', helper: 'Gestione rosa, lock prima partita e riepilogo live.', icon: Shield },
  { key: 'general_standings', label: 'Classifica generale', shortLabel: 'Classifica', description: 'Ranking delle squadre fantasy con accesso al dettaglio squadra.', helper: 'Linguaggio visivo allineato alle classifiche pubbliche.', icon: BarChart3 },
  { key: 'players_standings', label: 'Classifica giocatori', shortLabel: 'Giocatori', description: 'Classifica fantasy dei singoli giocatori live con accesso al detail.', helper: 'Ranking player-by-player con focus sul live.', icon: Users },
  { key: 'rules', label: 'Regolamento', shortLabel: 'Regolamento', description: 'Regole sintetiche della modalità, punteggi, ruoli e bonus.', helper: 'Consultazione rapida, non pagina testuale pesante.', icon: ScrollText },
  { key: 'history', label: 'Storico FantaBeerpong', shortLabel: 'Storico', description: 'Archivio delle edizioni concluse con vincitori e riepiloghi storici.', helper: 'Accesso ai detail delle edizioni archiviate.', icon: History },
];
