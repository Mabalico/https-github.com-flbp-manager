import React from 'react';
import { ArrowRight, History, Loader2, Trophy } from 'lucide-react';
import { useTranslation } from '../../App';
import { fetchFantaArchivedEditions } from '../../services/fantabeerpong/fantaSupabaseService';
import { panelClass } from './_shared';

interface Props {
  onOpenRules: () => void;
  onOpenStandings: () => void;
  onOpenEditionDetail?: (editionId: string) => void;
}

export const FantaHistorySection: React.FC<Props> = ({ onOpenRules, onOpenStandings, onOpenEditionDetail }) => {
  const { t } = useTranslation();
  const [editions, setEditions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const rows = await fetchFantaArchivedEditions();
        if (alive) setEditions(rows);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  const bestScore = editions.reduce((best, edition) => Math.max(best, edition.winnerPoints), 0);
  const latestChampion = editions[0]?.winnerTeamName || 'N/D';

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-[26px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700">
              <History className="h-3.5 w-3.5" />
              {t('fanta_history_tab_label')}
            </div>
            <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{t('fanta_history_title')}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {t('fanta_history_subtitle')}
            </div>
          </div>
          <button type="button" onClick={onOpenStandings} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-beer-500 px-5 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-beer-600">
            <Trophy className="h-4 w-4" />
            {t('fanta_shell_standings_short')}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-white/60 bg-white/80 px-5 py-4 shadow-sm ring-1 ring-inset ring-slate-100">
          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{t('fanta_history_editions_count')}</div>
          <div className="mt-1 text-2xl font-black tracking-tight text-slate-950">{editions.length}</div>
        </div>
        <div className="rounded-[24px] border border-white/60 bg-white/80 px-5 py-4 shadow-sm ring-1 ring-inset ring-slate-100">
          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{t('fanta_history_record_points')}</div>
          <div className="mt-1 text-2xl font-black tracking-tight text-slate-950">{bestScore}</div>
        </div>
        <div className="rounded-[24px] border border-white/60 bg-white/80 px-5 py-4 shadow-sm ring-1 ring-inset ring-slate-100">
          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{t('fanta_history_last_champ')}</div>
          <div className="mt-1 truncate text-2xl font-black tracking-tight text-slate-950">{latestChampion}</div>
        </div>
      </div>

      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_history_archived_list_title')}</div>
        <p className="mb-6 mt-1 text-sm font-semibold text-slate-500">
          {t('fanta_history_archived_list_desc')}
        </p>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-beer-500" />
            <p className="mt-4 text-sm font-bold text-slate-500">{t('fanta_history_loading')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {editions.length > 0 ? editions.map((edition) => (
              <button
                key={edition.tournamentId}
                type="button"
                onClick={() => onOpenEditionDetail?.(edition.tournamentId)}
                className="w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:bg-white hover:shadow-md"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-black tracking-tight text-slate-950">{edition.tournamentName}</div>
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-700">{t('fanta_history_status_archived')}</span>
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-500">{edition.dateLabel}</div>
                  </div>
                  <div className="grid shrink-0 gap-2 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('fanta_history_winner_label')}</div>
                      <div className="mt-1 text-sm font-black text-slate-950">{edition.winnerTeamName}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('fanta_standings_points')}</div>
                      <div className="mt-1 text-sm font-black text-slate-950">{edition.winnerPoints}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t('fanta_history_teams_label')}</div>
                      <div className="mt-1 text-sm font-black text-slate-950">{edition.teamsCount}</div>
                    </div>
                  </div>
                </div>
              </button>
            )) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-16 text-center">
                <div className="text-sm font-black uppercase tracking-widest text-slate-400">{t('fanta_history_empty_title')}</div>
                <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-500">
                  {t('fanta_history_empty_desc')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={panelClass}>
        <div className="text-xl font-black tracking-tight text-slate-950">{t('fanta_rules_destinations_title')}</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button type="button" onClick={onOpenRules} className="group flex w-full items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left font-semibold transition-all hover:bg-white hover:shadow-md">
            <div>
              <div className="text-sm font-black text-slate-950">{t('fanta_history_dest_rules')}</div>
              <div className="mt-1 text-sm font-semibold text-slate-600">{t('fanta_history_dest_rules_desc')}</div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
          <button type="button" onClick={onOpenStandings} className="group flex w-full items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left font-semibold transition-all hover:bg-white hover:shadow-md">
            <div>
              <div className="text-sm font-black text-slate-950">{t('fanta_history_dest_standings')}</div>
              <div className="mt-1 text-sm font-semibold text-slate-600">{t('fanta_history_dest_standings_desc')}</div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
