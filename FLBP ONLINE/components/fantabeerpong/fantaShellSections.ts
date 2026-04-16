import type { LucideIcon } from 'lucide-react';
import { BarChart3, History, LayoutDashboard, ScrollText, Shield, Users } from 'lucide-react';
import type { FantaShellSectionKey } from '../../services/fantabeerpong/types';

export interface FantaShellSection {
  key: FantaShellSectionKey;
  /** i18n key resolved via t() in the shell */
  labelKey: string;
  /** i18n key for the short tab label */
  shortLabelKey: string;
  /** i18n key for the section helper text */
  helperKey: string;
  icon: LucideIcon;
}

export const FANTA_SHELL_SECTIONS: FantaShellSection[] = [
  { key: 'overview',           labelKey: 'fanta_shell_overview',   shortLabelKey: 'fanta_shell_overview_short',   helperKey: 'fanta_shell_overview_helper',   icon: LayoutDashboard },
  { key: 'my_team',            labelKey: 'fanta_shell_my_team',    shortLabelKey: 'fanta_shell_my_team_short',    helperKey: 'fanta_shell_my_team_helper',    icon: Shield },
  { key: 'general_standings',  labelKey: 'fanta_shell_standings',  shortLabelKey: 'fanta_shell_standings_short',  helperKey: 'fanta_shell_standings_helper',  icon: BarChart3 },
  { key: 'players_standings',  labelKey: 'fanta_shell_players',    shortLabelKey: 'fanta_shell_players_short',    helperKey: 'fanta_shell_players_helper',    icon: Users },
  { key: 'rules',              labelKey: 'fanta_shell_rules',      shortLabelKey: 'fanta_shell_rules_short',      helperKey: 'fanta_shell_rules_helper',      icon: ScrollText },
  { key: 'history',            labelKey: 'fanta_shell_history',    shortLabelKey: 'fanta_shell_history_short',    helperKey: 'fanta_shell_history_helper',    icon: History },
];
