import React from 'react';
import { Trophy, LayoutDashboard, Star, ChevronRight, Settings } from 'lucide-react';
import { Team, Match } from '../types';
import { useTranslation } from '../App';

interface HomeProps {
  onNavigate: (view: any) => void;
  tournamentActive: boolean;
}

export const Home: React.FC<HomeProps> = ({ onNavigate, tournamentActive }) => {
  const { t } = useTranslation();

  const btnBase = "inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-black uppercase tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900";
  const btnWhite = `${btnBase} bg-white text-blue-950 shadow-lg hover:bg-blue-50`;
  const btnPrimary = `${btnBase} bg-beer-500 text-white shadow-lg hover:bg-beer-600`;

  const badgeBase = "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wide";
  const badgeLiveLight = `${badgeBase} bg-beer-50 text-beer-700 border border-beer-100`;

  const cardBase = "text-left bg-white/95 backdrop-blur p-6 rounded-[24px] shadow-sm border border-slate-200 hover:shadow-xl hover:-translate-y-0.5 transition group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beer-500 focus-visible:ring-offset-2";
  const cardIconBase = "w-12 h-12 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition";
  const cardChevron = "w-5 h-5 text-slate-300 mt-1 group-hover:text-slate-500 group-hover:translate-x-0.5 transition";

  return (
    <div className="space-y-10 animate-fade-in">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-slate-900 rounded-3xl p-8 md:p-12 text-white shadow-2xl relative overflow-hidden border border-white/10">
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight leading-[0.95] mb-4">
            <span className="block"><span className="text-beer-500">F</span>EDERAZIONE</span>
            <span className="block"><span className="text-beer-500">L</span>UCENSE</span>
            <span className="block"><span className="text-beer-500">B</span>EER</span>
            <span className="block">
              <span className="text-beer-500">P</span>ONG
              {tournamentActive ? (
                <span className="ml-3 inline-flex translate-y-[-0.18em] items-center gap-2 rounded-full border border-beer-400/30 bg-white/10 px-3 py-1.5 align-middle text-[10px] font-black tracking-[0.16em] text-beer-100 shadow-[0_14px_30px_-20px_rgba(245,158,11,0.45)] md:ml-4 md:px-4 md:py-2 md:text-xs">
                  <span className="h-2 w-2 rounded-full bg-beer-400 animate-pulse" />
                  {t('active_now')}
                </span>
              ) : null}
            </span>
          </h1>
          <p className="max-w-xl text-sm md:text-base font-bold leading-relaxed text-white/70">
            {t('hero_public_subtitle')}
          </p>
          <div className="flex flex-wrap gap-4 mt-8 items-center">
            {tournamentActive ? (
              <>
                <button
                  onClick={() => onNavigate('tournament')}
                  className={`${btnPrimary} animate-pulse`}
                >
                  <Trophy className="w-5 h-5"/> {t('tournaments')}
                </button>
                <button
                  onClick={() => onNavigate('leaderboard')}
                  className={btnWhite}
                >
                  {t('historical')} <ChevronRight className="w-5 h-5"/>
                </button>
              </>
            ) : (
              <button
                onClick={() => onNavigate('leaderboard')}
                className={btnWhite}
              >
                {t('historical')} <ChevronRight className="w-5 h-5"/>
              </button>
            )}
          </div>
        </div>
        
        {/* Background Decoration */}
        <div className="absolute right-0 top-0 h-full w-1/2 opacity-10 pointer-events-none select-none">
          <img
            src="/flbp_logo_hero.png"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="w-full h-full object-contain transform translate-x-1/4 -translate-y-12 rotate-12"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </div>
      </div>

      {/* Quick Links Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <button
          type="button"
          onClick={() => onNavigate('tournament')}
          aria-label={t('tournaments')}
          className={cardBase}
        >
          <div className="flex items-start justify-between gap-3">
            <div className={`${cardIconBase} bg-blue-100`}>
              <Trophy className="w-6 h-6 text-blue-600" />
            </div>
            <ChevronRight className={cardChevron} />
          </div>
          <h3 className="font-black text-xl text-slate-900 tracking-tight mb-2">{t('tournaments')}</h3>
          <p className="text-slate-500 text-sm leading-snug">{t('home_tournaments_desc')}</p>
          {tournamentActive && (
            <div className={`mt-4 ${badgeLiveLight}`}>
              <span className="w-2 h-2 rounded-full bg-beer-500 animate-pulse" />
              {t('active_now')}
            </div>
          )}
          <div className="mt-5 pt-4 border-t border-slate-100 text-xs font-black uppercase tracking-wide text-slate-400 group-hover:text-beer-500 transition-colors">
            {t('open_tournament_live')}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('leaderboard')}
          aria-label={t('historical')}
          className={cardBase}
        >
          <div className="flex items-start justify-between gap-3">
            <div className={`${cardIconBase} bg-orange-100`}>
              <LayoutDashboard className="w-6 h-6 text-orange-600" />
            </div>
            <ChevronRight className={cardChevron} />
          </div>
          <h3 className="font-black text-xl text-slate-900 tracking-tight mb-2">{t('historical')}</h3>
          <p className="text-slate-500 text-sm leading-snug">{t('home_leaderboard_desc')}</p>
          <div className="mt-5 pt-4 border-t border-slate-100 text-xs font-black uppercase tracking-wide text-slate-400 group-hover:text-beer-500 transition-colors">
            {t('open_history')}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('hof')}
          aria-label={t('hof')}
          className={cardBase}
        >
          <div className="flex items-start justify-between gap-3">
            <div className={`${cardIconBase} bg-yellow-100`}>
              <Star className="w-6 h-6 text-yellow-600" />
            </div>
            <ChevronRight className={cardChevron} />
          </div>
          <h3 className="font-black text-xl text-slate-900 tracking-tight mb-2">{t('hof')}</h3>
          <p className="text-slate-500 text-sm leading-snug">{t('home_hof_desc')}</p>
          <div className="mt-5 pt-4 border-t border-slate-100 text-xs font-black uppercase tracking-wide text-slate-400 group-hover:text-beer-500 transition-colors">
            {t('open_awards')}
          </div>
        </button>
      </div>

      {/* Admin Shortcut (separato per non "rubare" attenzione alla parte pubblica) */}
      <div className="rounded-[24px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="bg-slate-200/60 w-12 h-12 rounded-full flex items-center justify-center shadow-inner">
            <Settings className="w-6 h-6 text-slate-700" />
          </div>
          <div>
            <div className="font-black text-lg text-slate-900 tracking-tight">{t('admin')}</div>
            <div className="text-sm text-slate-600 leading-snug">{t('home_admin_desc')}</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">{t('admin_auth_desc')}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('admin')}
          aria-label={t('admin')}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 font-black uppercase tracking-wide transition bg-white text-slate-900 border border-slate-200 shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
        >
          {t('admin')} <ChevronRight className="w-5 h-5"/>
        </button>
      </div>
    </div>
  );
};
