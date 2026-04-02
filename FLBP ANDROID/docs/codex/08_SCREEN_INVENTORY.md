# Screen Inventory

chat non affidabile, seguo il repository.

## Top-level screens verificate da `App.tsx`
- `home`
- `leaderboard`
- `hof`
- `tournament`
- `tournament_detail`
- `admin`
- `referees_area`

## Stato Android reale
- `home`: data-driven
- `tournament`: data-driven
- `tournament_detail`: data-driven child route con `Overview`, `Turns`, `Groups`, `Bracket`, `Scorers`
- `tv_mode`: read-only, aperto dal dettaglio torneo
- `leaderboard`: data-driven
- `hof`: data-driven
- `admin`: route protetta con auth reale + overview consultativa snapshot/live + traffico + visualizzazioni
- `referees_area`: route protetta con auth reale + monitor consultativo live/turni

## Aree web ancora non migrate
- `components/AdminDashboard.tsx`
- `components/RefereesArea.tsx`
- relative tabs/admin flows
