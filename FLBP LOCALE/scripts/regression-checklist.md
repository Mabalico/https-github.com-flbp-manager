# Regression checklist (manual)

Questa checklist serve per evitare regressioni su funzionalità core.

## 1) Core
- [ ] Live workflow match: scheduled → playing → finished (e ritorno) coerente tra Lista Codici e Monitor
- [ ] UI sicurezza operativa: in Admin (Codes/Monitor) il cambio stato avviene tramite pulsante **Avvia/Chiudi**; click riga apre il referto solo per match **giocati**
- [ ] OCR referti: upload immagine, parsing, popolamento campi (non toccare)
- [ ] Simulazioni: turno + tutto (non toccare)
- [ ] TV Mode: read-only, 16:9 safe, zero click, rotazioni ok

## 2) BYE (invisibili)
- [ ] BYE esistono nei dati ma non in UI
- [ ] isBye=true ⇒ hidden=true
- [ ] auto-advance e nessun referto richiesto

## 2.5) TBD (placeholder)
- [ ] `TBD` e `TBD-*` sono placeholder (mai trattati come “team reali”)
- [ ] Nessuna azione operativa su match con placeholder (no Avvia/Chiudi, no Referto, no click riga) in Admin/Area Arbitri
- [ ] In tabellone: nessun auto-advance/propagazione oltre Round 1 con placeholder

## 3) Import / Export
- [ ] Export backup JSON
- [ ] Import backup JSON (ripristino)
- [ ] Preflight backup: classificazione corretta **moderno** / **legacy compatibile**
- [ ] Export backup: se esiste `birthDate`, YoB ridondante non viene esportato

## 3.5) Profili giocatore / Hall of Fame
- [ ] Admin → Squadre → Lista iscritti: correzione profilo giocatore disponibile e propagata
- [ ] Admin → Dati → Integrazioni / Players: stessa chiarezza pre-save su merge / separate
- [ ] Hall of Fame: badge con data torneo completa (fallback safe ai dati legacy)

## 4) DB tools
- [ ] Test connessione
- [ ] Health check
- [ ] Push snapshot
- [ ] Push strutturato
- [ ] Pull snapshot + apply
- [ ] Pull strutturato (recovery) + apply

## 5) Automated checks (local)
Eseguire su un backup JSON reale:

```bash
npm run check:all -- path/to/backup.json
```
