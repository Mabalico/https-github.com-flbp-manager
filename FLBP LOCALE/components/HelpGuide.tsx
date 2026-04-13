
import React, { useState } from 'react';
import { HelpCircle, X, Info, Lightbulb, CheckCircle2 } from 'lucide-react';

interface HelpGuideProps {
  view: string;
}

export const HelpGuide: React.FC<HelpGuideProps> = ({ view }) => {
  const [isOpen, setIsOpen] = useState(false);

  const getInstructions = () => {
    switch (view) {
      case 'home':
        return {
          title: "Benvenuto nella Home",
          steps: [
            "Usa i pulsanti rapidi per navigare tra le sezioni principali.",
            "Se un torneo è in corso, vedrai un pulsante 'LIVE ORA' pulsante.",
            "La sidebar a sinistra ti permette di cambiare sezione in ogni momento."
          ]
        };
      case 'leaderboard':
        return {
          title: "Guida alla Classifica",
          steps: [
            "Usa la barra di ricerca per trovare un giocatore o una squadra.",
            "Passa a 'Pro' per vedere solo chi ha giocato almeno 4 partite (medie più affidabili).",
            "Clicca sulle colonne (PT, SF, Medie) per ordinare i giocatori dal migliore al peggiore."
          ]
        };
      case 'tournament':
      case 'tournament_leaderboard':
        return {
          title: "Guida ai Tornei",
          steps: [
            "Se il torneo ha i gironi, usa il selettore in alto per cambiare tra 'Gironi' e 'Tabellone'.",
            "Nel tabellone, i vincitori sono evidenziati in giallo.",
            "Usa 'Esporta' per scaricare l'immagine del tabellone da condividere sui social."
          ]
        };
      case 'hof':
        return {
          title: "Guida all'Albo d'Oro",
          steps: [
            "Seleziona la categoria (Vincitori, Capocannonieri, ecc.) per vedere i record passati.",
            "La sezione 'Giocatori Titolati' mostra la classifica di chi ha vinto più trofei in assoluto.",
            "I record sono ordinati per anno, dal più recente al più vecchio."
          ]
        };
      case 'admin':
        return {
          title: "Guida Amministratore (Step-by-Step)",
          steps: [
            "1. SQUADRE: Inserisci i team manualmente o usa il generatore per testare l'app.",
            "2. STRUTTURA: Scegli la modalità (Eliminazione o Gironi) e clicca 'Genera'.",
            "3. REFERTI: Inserisci il codice match (es. 'A', 'G1') e registra i canestri fatti.",
            "4. MONITOR: Controlla quali partite sono in corso e cambia il loro stato con un click."
          ]
        };
      default:
        return {
          title: "Istruzioni",
          steps: ["Naviga tra le sezioni usando il menu laterale.", "Contatta l'amministratore per modifiche ai dati."]
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
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 font-bold whitespace-nowrap">Aiuto Rapido</span>
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
            Ho capito, grazie!
          </button>
        </div>
      </div>
    </div>
  );
};
