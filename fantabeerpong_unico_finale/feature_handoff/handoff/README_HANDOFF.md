# FantaBeerpong — Handoff finale per Codex

Questo package raccoglie la proposta finale della feature FantaBeerpong, costruita seguendo:
- il repository reale dell'app
- il prompt pack / regolamento
- i vincoli richiesti: no redesign generale, no router nuovo, no mega-refactor, no librerie nuove

## Stato del package
Il package è pensato come **handoff operativo per Codex**:
- contiene i nuovi file feature-specific in `.tsx` e `.ts`
- contiene le patch testuali ai file esistenti del repo (`App.tsx`, `PlayerArea.tsx`)
- contiene mappa file, note integrazione e TODO tecnici

## Punto importante
I file qui inclusi sono coerenti con il flusso implementato per step in chat e sono pronti per essere:
1. rivisti da Codex
2. adattati alle props / utility del repo reale
3. collegati a persistenza e scoring reali

## Feature incluse
- shell FantaBeerpong
- panoramica
- la mia squadra
- classifica generale
- classifica giocatori
- regolamento
- storico
- dettaglio squadra fantasy
- dettaglio giocatore fantasy
- dettaglio edizione storica
- builder crea/modifica squadra
- micro-help contestuale
