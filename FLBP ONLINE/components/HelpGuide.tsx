
import React, { useState } from 'react';
import { HelpCircle, X, Lightbulb, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '../App';

interface HelpGuideProps {
  view: string;
}

export const HelpGuide: React.FC<HelpGuideProps> = ({ view }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation();

  const getInstructions = () => {
    switch (view) {
      case 'home':
        return {
          title: t('help_home_title'),
          steps: [
            t('help_home_step_1'),
            t('help_home_step_2'),
            t('help_home_step_3'),
          ]
        };
      case 'leaderboard':
        return {
          title: t('help_leaderboard_title'),
          steps: [
            t('help_leaderboard_step_1'),
            t('help_leaderboard_step_2'),
            t('help_leaderboard_step_3'),
          ]
        };
      case 'tournament':
      case 'tournament_leaderboard':
        return {
          title: t('help_tournament_title'),
          steps: [
            t('help_tournament_step_1'),
            t('help_tournament_step_2'),
            t('help_tournament_step_3'),
          ]
        };
      case 'hof':
        return {
          title: t('help_hof_title'),
          steps: [
            t('help_hof_step_1'),
            t('help_hof_step_2'),
            t('help_hof_step_3'),
          ]
        };
      case 'admin':
        return {
          title: t('help_admin_title'),
          steps: [
            t('help_admin_step_1'),
            t('help_admin_step_2'),
            t('help_admin_step_3'),
            t('help_admin_step_4'),
          ]
        };
      default:
        return {
          title: t('help_default_title'),
          steps: [t('help_default_step_1'), t('help_default_step_2')]
        };
    }
  };

  const info = getInstructions();

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-50 bg-slate-900 text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center gap-2 group border-2 border-beer-500 sm:bottom-6 sm:right-6"
      >
        <HelpCircle className="w-6 h-6 text-beer-500" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 font-bold whitespace-nowrap">{t('help_quick_label')}</span>
      </button>
    );
  }

  return (
    <div className="flbp-mobile-sheet fixed inset-0 z-50 flex items-end justify-end p-4 bg-black/20 backdrop-blur-sm animate-fade-in sm:p-6" onClick={() => setIsOpen(false)}>
      <div 
        className="flbp-mobile-sheet-panel bg-white w-full max-w-sm rounded-3xl shadow-2xl border-4 border-slate-900 overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-beer-500 p-2 rounded-lg">
              <Lightbulb className="w-5 h-5 text-slate-900" />
            </div>
            <h3 className="font-black uppercase tracking-tight">{info.title}</h3>
          </div>
          <button onClick={() => setIsOpen(false)} className="hover:rotate-90 transition-transform">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {info.steps.map((step, i) => (
            <div key={i} className="flex gap-4">
              <div className="mt-1 shrink-0">
                <CheckCircle2 className="w-5 h-5 text-beer-500" />
              </div>
              <p className="text-slate-600 text-sm font-medium leading-relaxed">{step}</p>
            </div>
          ))}
        </div>
        <div className="p-4 bg-slate-50 border-t flex justify-center">
          <button 
            onClick={() => setIsOpen(false)}
            className="text-xs font-black uppercase text-slate-400 hover:text-slate-900 transition-colors"
          >
            {t('help_understood')}
          </button>
        </div>
      </div>
    </div>
  );
};
