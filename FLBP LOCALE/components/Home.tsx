import React from 'react';
import { ChevronRight, Shield, Trophy } from 'lucide-react';
import { useTranslation } from '../App';

interface HomeProps {
  onNavigate: (view: 'tournament' | 'leaderboard' | 'hof' | 'fantabeerpong') => void;
  onOpenTournament: (id: string) => void;
  liveTournament?: { id: string; name: string; date: string; teamsCount: number; formatLabel: string };
  /** Set while FantaBeerpong is active for the live tournament. */
  fanta?: { locked: boolean };
  lastChampion?: { teamName?: string; players: string[]; tournamentName: string; date: string };
  recentTournaments: { id: string; name: string; date: string; winnerTeamName?: string }[];
}

const dateLabel = (date: string) => {
  if (/^\d{4}$/.test(date)) return date;
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString() : date;
};

export const Home: React.FC<HomeProps> = ({ onNavigate, onOpenTournament, liveTournament, fanta, lastChampion, recentTournaments }) => {
  const { t } = useTranslation();
  const button = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beer-400';

  return (
    <div className="space-y-5 sm:space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-950 to-slate-950 p-5 text-white shadow-xl sm:p-8 lg:p-10">
        <img src="/flbp_logo_hero.png" alt="" className="pointer-events-none absolute -right-12 -top-20 h-full min-h-[250px] w-auto rotate-12 opacity-10 brightness-0 invert" />
        <div className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            {liveTournament ? (
              <>
                <div className="inline-flex items-center gap-2 rounded-full bg-red-500/20 px-3 py-1 text-xs font-black uppercase tracking-wide text-red-100">
                  <span className="h-2 w-2 rounded-full bg-red-400" aria-hidden="true" />{t('home_live_now')}
                </div>
                <h1 className="mt-3 break-words text-3xl font-black tracking-tight sm:text-5xl">{liveTournament.name}</h1>
                <p className="mt-3 text-sm font-bold text-slate-200">
                  {[dateLabel(liveTournament.date), `${liveTournament.teamsCount} ${t(liveTournament.teamsCount === 1 ? 'team_label' : 'teams').toLocaleLowerCase()}`, liveTournament.formatLabel].filter(Boolean).join(' · ')}
                </p>
              </>
            ) : (
              <>
                <h1 className="max-w-[13em] text-3xl font-black uppercase leading-[0.98] tracking-tight sm:text-5xl lg:text-6xl">
                  <span className="text-beer-500">F</span>ederazione <span className="text-beer-500">L</span>ucense <span className="text-beer-500">B</span>eer <span className="text-beer-500">P</span>ong
                </h1>
                <p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-slate-200 sm:text-base">{t('hero_public_subtitle')}</p>
              </>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {liveTournament && <button type="button" className={button + ' bg-amber-400 text-slate-950 hover:bg-amber-300'} onClick={() => onOpenTournament(liveTournament.id)}>{t('follow_live')}</button>}
              <button type="button" className={button + ' bg-white text-slate-950 hover:bg-slate-100'} onClick={() => onNavigate('leaderboard')}>{t('historical')} <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" /></button>
            </div>
          </div>
          {liveTournament && fanta && (
            <section className="rounded-2xl border border-white/15 bg-white/10 p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-lg font-black"><Shield className="h-5 w-5 shrink-0 text-beer-200" aria-hidden="true" />{t('home_fanta_active')}</h2>
              <p className="mt-2 text-sm text-slate-200">{t(fanta.locked ? 'home_fanta_locked' : 'home_fanta_open')}</p>
              <button type="button" className={button + ' mt-3 bg-white text-slate-950 hover:bg-slate-100'} onClick={() => onNavigate('fantabeerpong')}>{t('home_fanta_action')} <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" /></button>
            </section>
          )}
          {!liveTournament && lastChampion && (
            <section className="rounded-2xl border border-white/15 bg-white/10 p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-sm font-black text-beer-200"><Trophy className="h-4 w-4" aria-hidden="true" />{t('home_last_champion')}</h2>
              {lastChampion.teamName && <p className="mt-2 break-words text-xl font-black">{lastChampion.teamName}</p>}
              {lastChampion.players.length > 0 && <p className="mt-1 break-words text-sm font-semibold text-slate-100">{lastChampion.players.join(' · ')}</p>}
              <p className="mt-2 text-sm text-slate-200">{[lastChampion.tournamentName, dateLabel(lastChampion.date)].filter(Boolean).join(' · ')}</p>
              <button type="button" className={button + ' mt-3 bg-white/10 hover:bg-white/20'} onClick={() => onNavigate('hof')}>{t('hof')} <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" /></button>
            </section>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-black text-slate-950 sm:text-2xl">{t('home_recent_tournaments')}</h2>
          <button type="button" className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-black text-blue-900 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2" onClick={() => onNavigate('tournament')}>
            {t('home_all_tournaments')} <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          </button>
        </div>
        {recentTournaments.length ? (
          <ul className="grid gap-2 md:grid-cols-3 md:gap-4">
            {recentTournaments.map(edition => (
              <li key={edition.id} className="min-w-0">
                <button type="button" className="flex min-h-[72px] w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-start shadow-sm hover:border-beer-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-beer-600 md:h-full md:p-4" onClick={() => onOpenTournament(edition.id)}>
                  <span className="min-w-0">
                    <span className="block break-words font-black text-slate-900">{edition.name}</span>
                    <span className="block text-sm text-slate-600">{dateLabel(edition.date)}</span>
                    {edition.winnerTeamName && <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><Trophy className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />{edition.winnerTeamName}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-500 rtl:-scale-x-100" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-600">{t('no_archived_tournaments')}</p>}
      </section>
    </div>
  );
};
