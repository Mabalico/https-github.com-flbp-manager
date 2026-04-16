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
  { key: 'overview',           labelKey: 'fanta_section_overview_label',   shortLabelKey: 'fanta_section_overview_short',   helperKey: 'fanta_section_overview_helper',   icon: LayoutDashboard },
  { key: 'my_team',            labelKey: 'fanta_section_my_team_label',    shortLabelKey: 'fanta_section_my_team_short',    helperKey: 'fanta_section_my_team_helper',    icon: Shield },
  { key: 'general_standings',  labelKey: 'fanta_section_standings_label',  shortLabelKey: 'fanta_section_standings_short',  helperKey: 'fanta_section_standings_helper',  icon: BarChart3 },
  { key: 'players_standings',  labelKey: 'fanta_section_players_label',    shortLabelKey: 'fanta_section_players_short',    helperKey: 'fanta_section_players_helper',    icon: Users },
  { key: 'rules',              labelKey: 'fanta_section_rules_label',      shortLabelKey: 'fanta_section_rules_short',      helperKey: 'fanta_section_rules_helper',      icon: ScrollText },
  { key: 'history',            labelKey: 'fanta_section_history_label',    shortLabelKey: 'fanta_section_history_short',    helperKey: 'fanta_section_history_helper',    icon: History },
];
