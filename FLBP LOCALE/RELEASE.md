# Release

## Comandi
- Build: `npm run build`
- Invarianti + sanitizzazione public (con un backup):
  - `npm run check:all -- <percorso_backup.json>`
- Check "release" (build + check:all se passi un backup):
  - `npm run release:check -- <percorso_backup.json>`

## In sala (quick)
1. Admin → DB Sync → Test connessione + Health check
2. (se serve) Wizard Locale → DB
3. TV Mode su monitor
4. Prima di un restore/merge: usa il **preflight backup** e verifica se il file e' **moderno** o **legacy compatibile**
5. Durante il torneo: da Admin → Squadre puoi correggere direttamente i nomi giocatore dalla lista iscritti
6. A fine torneo: Export backup JSON (ora modernizzato quando possibile) + opzionale `check:all`


## App mobile (wrapper)

Questa sezione e' opzionale: prepara il progetto per essere wrappato con Capacitor.

- Build web per wrapper: `npm run build:mobile`
- Guida completa: `docs/MOBILE_WRAPPER.md`

Nota: e' presente un **service worker conservativo** (R8) per caching leggero degli asset e fallback minimo.
- Disabilitazione rapida: `localStorage flbp_sw_disabled=1` (poi reload).
- Hardening TV (R8.1): in TV Mode (`flbp_tv_mode` attivo) il SW non viene registrato e l'app prova a svuotare cache/unregister (best-effort).


## Novita' operative recenti
- Hall of Fame: badge con **data completa del torneo**.
- Correzione profilo giocatore disponibile sia dal live (Lista iscritti) sia a posteriori (Integrazioni / Players).
- I campi numerici operativi con `0` iniziale sono sovrascrivibili subito al click/focus nei principali flussi admin/arbitri.
- I backup JSON mostrano un preflight piu' leggibile e i nuovi export riducono i campi YoB ridondanti quando e' gia' presente la `birthDate`.
