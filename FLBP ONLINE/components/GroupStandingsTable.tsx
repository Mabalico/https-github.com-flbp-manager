import React, { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from '../App';
import type { Team } from '../types';
import type { StandingRow } from '../services/groupStandings';
import { isEmbeddedNativeShell } from '../services/nativeShell';

type HeaderStyle = 'abbr' | 'legend';

interface GroupStandingsTableProps {
  rankedTeams: Team[];
  rows: Record<string, StandingRow>;
  advancingCount?: number;
  /** Accessibility label for the standings table (screen readers). */
  ariaLabel?: string;
  /**
   * - 'legend': shows an explanatory line with full names (best for Public)
   * - 'abbr': table headers only (best for TV)
   */
  headerStyle?: HeaderStyle;
  /** Compact layout for 16:9 safe UIs (TV). */
  compact?: boolean;
  /** Scale to fit container width (Public): avoids horizontal scroll. */
  fitToWidth?: boolean;
  /** Larger, bolder team labels for TV-oriented readable tables. */
  tvReadable?: boolean;
}

const thClass = 'px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap';
const thNumClass = `${thClass} text-right`;

const tdClass = 'px-2 py-1 text-[11px] font-bold text-slate-800 whitespace-nowrap';
const tdNumClass = `${tdClass} text-right font-mono tabular-nums`;

export const GroupStandingsTable: React.FC<GroupStandingsTableProps> = ({
  rankedTeams,
  rows,
  advancingCount,
  ariaLabel,
  headerStyle = 'abbr',
  compact = false,
  fitToWidth = false,
  tvReadable = false,
}) => {
  const { t } = useTranslation();
  const nativeShell = isEmbeddedNativeShell();
  const effectiveFitToWidth = fitToWidth && !nativeShell;
  const resolvedAriaLabel = ariaLabel || t('standings_label');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);

  useLayoutEffect(() => {
    if (!effectiveFitToWidth || compact) {
      setFitScale(1);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      // The table may render wider than the container due to many columns.
      const inner = container.querySelector('table');
      if (!inner) return;
      const cw = container.clientWidth;
      const iw = (inner as HTMLElement).scrollWidth;
      if (!cw || !iw) return;
      const next = Math.min(1, cw / iw);
      setFitScale(next);
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(container);
    return () => ro.disconnect();
  }, [effectiveFitToWidth, compact, rankedTeams.length]);

  if (!rankedTeams.length) {
    return <div className="text-xs text-slate-400 italic">{t('no_teams_available')}</div>;
  }

  if (compact) {
    return (
      <div className="space-y-1">
        {rankedTeams.map((t, idx) => {
          const r = rows[t.id];
          const qualifies = typeof advancingCount === 'number' ? idx < advancingCount : false;
          const cupsDiff = r?.cupsDiff ?? 0;
          const blowDiff = r?.blowDiff ?? 0;
          return (
            <div key={t.id} className={`rounded border ${qualifies ? 'border-green-200 bg-green-50/40' : 'border-slate-100 bg-slate-50'} px-2 py-1`}> 
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${qualifies ? 'bg-beer-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {idx + 1}
                  </div>
                  <div className="font-bold text-[11px] leading-tight text-slate-800 whitespace-normal break-words">{t.name}</div>
                </div>
                <div className="text-[10px] font-mono font-bold text-slate-700 whitespace-nowrap">
                  P:{r?.played ?? 0} V:{r?.wins ?? 0} S:{r?.losses ?? 0}
                </div>
              </div>
              <div className="mt-0.5 text-[10px] font-mono font-bold text-slate-600 flex items-center justify-between gap-2">
                <span className="whitespace-nowrap">CF:{r?.cupsFor ?? 0} CS:{r?.cupsAgainst ?? 0} ΔC:{cupsDiff}</span>
                <span className="whitespace-nowrap">SF:{r?.blowFor ?? 0} SS:{r?.blowAgainst ?? 0} ΔS:{blowDiff}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const bodyTdClass = tvReadable
    ? 'px-2 py-2 text-[12px] font-bold text-slate-800 whitespace-nowrap'
    : tdClass;
  const bodyTdNumClass = tvReadable
    ? 'px-2 py-2 text-[12px] text-right font-mono tabular-nums font-bold text-slate-800 whitespace-nowrap'
    : tdNumClass;
  const teamCellBaseClass = tvReadable
    ? 'px-2 py-2 text-left text-[16px] leading-tight font-black text-slate-900 whitespace-nowrap'
    : tdClass;
  const headerTdClass = tvReadable
    ? 'px-2 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600 whitespace-nowrap'
    : thClass;
  const headerTdNumClass = `${headerTdClass} text-right`;

  return (
    <div className="space-y-2">
      {headerStyle === 'legend' && !compact && (
        <div className="text-[11px] text-slate-500 font-bold">
          <span className="font-black">P</span>={t('standings_played')} · <span className="font-black">V</span>={t('standings_wins')} · <span className="font-black">S</span>={t('standings_losses')} ·{' '}
          <span className="font-black">CF</span>={t('cups_for_label')} · <span className="font-black">CS</span>={t('cups_against_label')} ·{' '}
          <span className="font-black">ΔC</span>={t('cups_diff_label')} · <span className="font-black">SF</span>={t('blows_for_label')} · <span className="font-black">SS</span>={t('blows_against_label')} ·{' '}
          <span className="font-black">ΔS</span>={t('blows_diff_label')}
        </div>
      )}

      <div ref={containerRef} className={effectiveFitToWidth ? "overflow-hidden" : "overflow-x-auto"}>
        <table
          aria-label={resolvedAriaLabel}
          className={`w-full ${compact ? 'text-[10px]' : 'text-xs'}`}
          style={effectiveFitToWidth ? { transform: `scale(${fitScale})`, transformOrigin: 'top left' } : undefined}
        >
          <caption className="sr-only">{resolvedAriaLabel}</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th scope="col" className={`${headerTdClass} text-left`}>#</th>
              <th scope="col" className={`${headerTdClass} text-left`}>{t('team_view')}</th>
              <th scope="col" className={headerTdNumClass}>P</th>
              <th scope="col" className={headerTdNumClass}>V</th>
              <th scope="col" className={headerTdNumClass}>S</th>
              {compact ? (
                <th scope="col" className={headerTdNumClass}>CF-CS</th>
              ) : (
                <>
                  <th scope="col" className={headerTdNumClass}>CF</th>
                  <th scope="col" className={headerTdNumClass}>CS</th>
                </>
              )}
              <th scope="col" className={headerTdNumClass}>ΔC</th>
              {compact ? (
                <th scope="col" className={headerTdNumClass}>SF-SS</th>
              ) : (
                <>
                  <th scope="col" className={headerTdNumClass}>SF</th>
                  <th scope="col" className={headerTdNumClass}>SS</th>
                </>
              )}
              <th scope="col" className={headerTdNumClass}>ΔS</th>
            </tr>
          </thead>
          <tbody>
            {rankedTeams.map((t, idx) => {
              const r = rows[t.id];
              const qualifies = typeof advancingCount === 'number' ? idx < advancingCount : false;
              const rowClass = tvReadable
                ? (
                  qualifies
                    ? (idx % 2 === 0 ? 'bg-amber-100/95' : 'bg-amber-200/85')
                    : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-200/80')
                )
                : (qualifies ? 'bg-green-50/40' : 'odd:bg-slate-50/30 hover:bg-slate-50/70');
              return (
                <tr
                  key={t.id}
                  className={`border-b ${tvReadable ? 'border-slate-300' : 'border-slate-100'} ${rowClass}`}
                >
                  <td className={`${bodyTdClass} text-left font-mono tabular-nums`}>{idx + 1}</td>
                  <td className={`${teamCellBaseClass} text-left max-w-[240px] whitespace-normal break-words leading-tight ${compact ? 'text-[10px]' : ''}`}>{t.name}</td>
                  <td className={bodyTdNumClass}>{r?.played ?? 0}</td>
                  <td className={bodyTdNumClass}>{r?.wins ?? 0}</td>
                  <td className={bodyTdNumClass}>{r?.losses ?? 0}</td>
                  {compact ? (
                    <td className={bodyTdNumClass}>
                      {r?.cupsFor ?? 0}-{r?.cupsAgainst ?? 0}
                    </td>
                  ) : (
                    <>
                      <td className={bodyTdNumClass}>{r?.cupsFor ?? 0}</td>
                      <td className={bodyTdNumClass}>{r?.cupsAgainst ?? 0}</td>
                    </>
                  )}
                  <td className={`${bodyTdNumClass} ${r?.cupsDiff ? (r.cupsDiff > 0 ? 'text-green-700' : r.cupsDiff < 0 ? 'text-red-700' : '') : ''}`}>{r?.cupsDiff ?? 0}</td>
                  {compact ? (
                    <td className={bodyTdNumClass}>
                      {r?.blowFor ?? 0}-{r?.blowAgainst ?? 0}
                    </td>
                  ) : (
                    <>
                      <td className={bodyTdNumClass}>{r?.blowFor ?? 0}</td>
                      <td className={bodyTdNumClass}>{r?.blowAgainst ?? 0}</td>
                    </>
                  )}
                  <td className={`${bodyTdNumClass} ${r?.blowDiff ? (r.blowDiff > 0 ? 'text-green-700' : r.blowDiff < 0 ? 'text-red-700' : '') : ''}`}>{r?.blowDiff ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
