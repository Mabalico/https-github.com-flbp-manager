import React from 'react';
import { ArrowRight, Lightbulb } from 'lucide-react';
import type { FantaQuickHelpItem, FantaQuickHelpTopic } from '../../services/fantabeerpong/types';

interface Props {
  topics: FantaQuickHelpTopic[];
  onOpenRules: () => void;
  compact?: boolean;
  title?: string;
}

const copyMap: Record<FantaQuickHelpTopic, FantaQuickHelpItem> = {
  roles:      { id: 'roles',      title: 'Capitano e Difensori',  body: 'Hai sempre 1 Capitano e fino a 2 Difensori. Lo stesso giocatore non può occupare entrambi i ruoli.' },
  scoring:    { id: 'scoring',    title: 'Come si fanno i punti', body: 'Canestro 1, soffio 2, vittoria 7, bonus finali 10. Il dettaglio completo resta nel regolamento.' },
  bonus_scia: { id: 'bonus_scia', title: 'Cos\u2019è il Bonus Scia',  body: 'È il bonus distintivo della modalità: vale 5 punti e va mostrato sempre con ritorno facile al regolamento.' },
};

export const FantaQuickHelp: React.FC<Props> = ({ topics, onOpenRules, compact = false, title = 'Help rapido' }) => {
  const items = topics.map((topic) => copyMap[topic]);
  return (
    <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-beer-100 bg-beer-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-beer-700">
          <Lightbulb className="h-3.5 w-3.5" />
          {title}
        </div>
        <button type="button" onClick={onOpenRules} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-beer-500/60 focus-visible:ring-offset-2">
          Apri regolamento
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className={`mt-4 ${compact ? 'space-y-3' : 'grid gap-3 md:grid-cols-3'}`}>
        {items.map((item) => (
          <div key={item.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-sm font-black text-slate-950">{item.title}</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
