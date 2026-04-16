import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

interface Props {
  eyebrow: string;
  title: string;
  description: string;
  bullets?: string[];
  ctaLabel?: string;
  onCta?: () => void;
}

export const FantaSectionPlaceholder: React.FC<Props> = ({ eyebrow, title, description, bullets = [], ctaLabel, onCta }) => (
  <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
    <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700">
      <Sparkles className="h-3.5 w-3.5" />
      {eyebrow}
    </div>
    <div className="mt-4 max-w-3xl">
      <h3 className="text-2xl font-black tracking-tight text-slate-950">{title}</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{description}</p>
    </div>
    {bullets.length > 0 && (
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {bullets.map((item) => (
          <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
            {item}
          </div>
        ))}
      </div>
    )}
    {ctaLabel && onCta && (
      <div className="mt-5">
        <button type="button" onClick={onCta} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-beer-500 px-5 py-3 text-sm font-black uppercase tracking-wide text-slate-950 shadow-sm transition hover:bg-beer-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2">
          {ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    )}
  </div>
);
