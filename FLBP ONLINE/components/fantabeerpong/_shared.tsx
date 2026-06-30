import React from 'react';

export const panelClass = 'rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[26px] md:p-6';
export const sectionHeroClass = 'rounded-[24px] border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4 shadow-sm md:rounded-[30px] md:p-6';
export const statCardClass = 'group relative overflow-hidden rounded-[20px] border border-white/60 bg-white/85 px-4 py-3 shadow-sm ring-1 ring-inset ring-slate-100 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md md:rounded-[24px] md:px-5 md:py-4';

export const MetricCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({ label, value, hint }) => (
  <div className={statCardClass}>
    <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-beer-100/40 blur-3xl transition-transform duration-500 group-hover:scale-150" />
    <div className="relative z-10 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
    <div className="relative z-10 mt-1 text-xl font-black tracking-tight text-slate-950 md:text-2xl">{value}</div>
    {hint ? <div className="relative z-10 mt-1 text-xs font-bold text-slate-500">{hint}</div> : null}
  </div>
);
