import React from 'react';
import { TournamentData } from '../types';
import { MonitorPlay } from 'lucide-react';
import { useTranslation } from '../App';

interface PublicTvShellProps {
  data: TournamentData | null;
  logo: string;
  onExit: () => void;
  children?: React.ReactNode;
  variant?: 'default' | 'minimal';
}

const TV_CLAMP_2_STYLE: React.CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
};

export const PublicTvShell: React.FC<PublicTvShellProps> = ({ data, logo, children, variant = 'default' }) => {
  const { t } = useTranslation();
  const fallbackLogo = '/flbp_logo_2025.svg';
  const safeLogo = (logo || '').trim() ? logo : fallbackLogo;

  if (variant === 'minimal') {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden z-50 cursor-none select-none">
        <div className="w-full h-full max-w-[177.78vh] max-h-[56.25vw] aspect-video bg-slate-950 text-white relative overflow-hidden">
          {children ? children : (
            <div className="h-full w-full flex items-center justify-center text-slate-500 font-black uppercase tracking-[0.22em]">
              {t('tv_no_signal')}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden z-50 cursor-none select-none">
      {/* 16:9 Aspect Ratio Container using max-width/height technique */}
      <div className="w-full h-full max-w-[177.78vh] max-h-[56.25vw] aspect-video bg-slate-950 text-white relative shadow-2xl flex flex-col p-[1.35%]">
        {/* Safe-area wrapper (overscan-friendly) */}
        <div className="h-full w-full bg-slate-900 rounded-xl overflow-hidden flex flex-col border border-slate-950/70 shadow-2xl relative">

          {/* Header (TV is read-only: no click) */}
          <div
            className="h-[10.5%] bg-blue-900 flex items-center justify-between px-[2.4%] z-20 shadow-lg"
            aria-label={t('tv_header_read_only')}
          >
            <div className="flex items-center gap-6 min-w-0">
              {/*
                TV requirement: the logo must be fully visible (no circular crop).
                Keep it inside a soft white capsule, but never clip the image.
              */}
              <div className="h-[70%] bg-white/95 rounded-xl px-3 py-1 flex items-center shadow-sm ring-1 ring-black/10">
                <img
                  src={safeLogo}
                  onError={(e) => {
                    // Safe fallback if a persisted/remote logo URL is missing.
                    if (e.currentTarget.src.endsWith(fallbackLogo)) return;
                    e.currentTarget.src = fallbackLogo;
                  }}
                  className="h-full w-auto max-w-[18vw] object-contain"
                  alt="Logo"
                />
              </div>
              <div className="min-w-0">
                <h1
                  className="text-xl font-black uppercase tracking-tight leading-tight break-words"
                  style={TV_CLAMP_2_STYLE}
                >
                  {data?.name || t('tv_broadcast_title')}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3 text-blue-200 font-black uppercase text-[11px] tracking-wider">
              <span className="hidden md:inline-flex items-center gap-2">
                <MonitorPlay className="w-4 h-4" /> {t('tv_badge_16_9')}
              </span>
            </div>
          </div>

          {/* Content */}
          {children ? children : (
              <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950"></div>

                  <div className="relative z-10 text-center space-y-6 opacity-60">
                      <MonitorPlay className="w-32 h-32 mx-auto text-slate-700" />
                      <div>
                          <h2 className="text-5xl font-black uppercase text-slate-700 tracking-widest mb-2">
                              {t('tv_signal_title')}
                          </h2>
                          <p className="text-2xl text-slate-600 font-mono">
                              {t('waiting_configuration')}
                          </p>
                      </div>
                  </div>

                  {/* Simulated Scanlines */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-[5] bg-[length:100%_2px,3px_100%] pointer-events-none"></div>
              </div>
          )}

        </div>
      </div>
    </div>
  );
};
