# Refresh e consumi Supabase

Questo documento descrive **i refresh reali presenti nel codice** della build attuale e indica se comportano o meno traffico verso Supabase.

## Regola di lettura

- **Consuma Supabase: SÌ** = il refresh esegue una lettura o scrittura verso Supabase.
- **Consuma Supabase: CONDIZIONALE** = il refresh consuma Supabase solo se sono vere certe condizioni (per esempio `getSupabaseConfig()` presente, `publicDbReadEnabled()` attivo, repository remoto attivo, sync strutturato attivo).
- **Consuma Supabase: NO** = il refresh è solo locale/UI e non fa rete.

## Guardie globali che bloccano i consumi

Prima di guardare il dettaglio, ci sono alcune guardie globali importanti:

- Se `getSupabaseConfig()` restituisce `null`, i fetch Supabase non partono. Questo è verificabile in `services/supabaseRest.ts` e nei vari `useEffect` di `App.tsx`.
- Per molte viste pubbliche i refresh remoti partono solo se `publicDbReadEnabled()` è attivo in `App.tsx`.
- In Admin il refresh remoto continuo dipende dal repository remoto (`services/repository/RemoteRepository.ts`).
- Lo structured sync automatico parte solo se `isAutoStructuredSyncEnabled()` è attivo (`services/autoDbSync.ts`).

## Mappa completa dei refresh / polling

| Area | Trigger | Frequenza | Path reale | Consuma Supabase | Note |
|---|---|---:|---|---|---|
| Snapshot pubblico globale | apertura vista pubblica + polling selettivo | una volta su enter; 60s in `tournament`; 15s in `tournament_detail` live; 5s in TV; pause in tab nascosta con refresh immediato al ritorno visibile | `App.tsx` | **SÌ** | Chiama `pullPublicWorkspaceState()` con source `App.publicWorkspacePoll`. Home / Leaderboard / Hall of Fame fanno refresh on-enter senza polling continuo. |
| Lista tornei pubblici | ingresso in `tournament` / `tournament_detail` + polling selettivo | una volta su enter; 20s solo in `tournament`; pause in tab nascosta con refresh immediato al ritorno visibile | `App.tsx` | **SÌ** | Chiama `pullPublicTournamentsList()` con source `App.publicTournamentsPoll`. In `tournament_detail` il refresh è solo on-enter. |
| Bundle dettaglio torneo | ingresso in `tournament_detail` + polling selettivo | una volta su enter; 5s solo live; pause in tab nascosta con refresh immediato al ritorno visibile | `App.tsx` | **SÌ** | Chiama `pullPublicTournamentBundle()` con source `App.publicTournamentBundlePoll`. I tornei non live non fanno più polling continuo. |
| Leaderboard pubblica | ingresso nella vista | una volta per ingresso | `components/Leaderboard.tsx` | **CONDIZIONALE** | Se `publicDbReadEnabled()` e `getSupabaseConfig()` sono attivi, esegue `pullPublicCareerLeaderboard()` e `pullPublicHallOfFameEntries()` una volta su mount. Altrimenti ricade sul calcolo locale. |
| Hall of Fame pubblica | ingresso nella vista | una volta per ingresso | `components/HallOfFame.tsx` | **CONDIZIONALE** | Se non c'è `stateOverride` e il public DB read è attivo, esegue `pullPublicHallOfFameEntries()` una volta. Altrimenti usa snapshot locale. |
| Turni live dalla lista tornei | azione utente “apri turni” | on demand | `components/PublicTournaments.tsx` | **CONDIZIONALE** | Se esistono già `liveTeams/liveMatches`, non chiama Supabase. Se mancano e Supabase è configurato, esegue `pullPublicTournamentBundle(liveTournament.id)`. |
| Admin auth/session check | mount Admin + focus finestra + `visibilitychange=visible` + polling solo visibile | 60s + eventi browser | `components/AdminDashboard.tsx` | **SÌ** | Esegue `ensureFreshSupabaseSession()` e `ensureSupabaseAdminAccess()`. Serve per mantenere valida la sessione admin reale senza controlli continui in background. |
| Repository remoto Admin | refresh visibile + focus + online + visibilitychange | 20s + eventi browser | `services/repository/RemoteRepository.ts` | **CONDIZIONALE** | Il polling periodico visibile richiama `refresh()`, che porta a `pullWorkspaceState()`. Vale nel flusso remoto admin. |
| Flush repository remoto | `beforeunload`, `pagehide`, `visibilitychange=hidden` | evento | `services/repository/RemoteRepository.ts` | **CONDIZIONALE** | Può fare **write** verso Supabase via `pushWorkspaceState()` solo se c'è stato admin pending state da salvare. |
| Save stato app (debounced) | cambio stato admin/live | debounce 200ms | `App.tsx` | **CONDIZIONALE** | `repo.save(...)` viene sempre chiamato dopo il debounce, ma consuma Supabase solo se il repository attivo è remoto e ci sono dati da flushare. |
| Flush salvataggio su chiusura/nascosto | `beforeunload`, `pagehide`, `visibilitychange=hidden` | evento | `App.tsx` | **CONDIZIONALE** | Fa `repo.save(...)` e `flushAutoStructuredSync(...)`. Il consumo verso Supabase dipende dal repository remoto e dallo structured sync attivo. |
| Structured sync automatico | cambi stato + retry su online/visible | debounce 1500ms, throttle 20s | `services/autoDbSync.ts` | **CONDIZIONALE** | Se `isAutoStructuredSyncEnabled()` è attivo, Supabase è configurato e c'è JWT admin, può chiamare `pushNormalizedFromState(...)`. Non è un polling UI, è sync best-effort. |
| Dashboard visualizzazioni | apertura sottotab o cambio range date | on demand | `components/admin/tabs/data/ViewsSubTab.tsx` | **SÌ** | Esegue `pullPublicSiteViewsDailyRange(startDate, endDate)` una volta ogni cambio intervallo. Non è polling. |
| Timer “ultimo aggiornamento” dettaglio torneo | timer UI locale | 30s | `components/PublicTournamentDetail.tsx` | **NO** | Aggiorna solo `lastUpdated` in UI quando il torneo è live. Nessuna chiamata rete. |
| Rotazione TV bracket | timer UI locale | intervallo costante `ROTATION_MS` | `components/TvBracketView.tsx` | **NO** | Cambia pagina/rotazione nella TV, non esegue fetch. |
| Rotazione TV marcatori | timer UI locale | 1s | `components/TvScorersView.tsx` | **NO** | Aggiorna countdown, pagina e metrica visualizzata. Nessuna chiamata rete. |
| Resize listener Hall of Fame | resize finestra | evento | `components/HallOfFame.tsx` | **NO** | Serve solo ad aggiornare fade/scroll dei tab. |
| Scroll helper turni pubblici | apertura modal / cambio tab | timeout 0ms | `components/PublicTournaments.tsx`, `components/PublicTournamentDetail.tsx` | **NO** | Solo scroll/focus UI. |

## Lettura rapida per sezione

### Public / Home / Leaderboard / Hall of Fame
- Il refresh più pesante lato pubblico è in `App.tsx`: snapshot pubblico globale, lista tornei, bundle torneo.
- Home, `Leaderboard.tsx` e `HallOfFame.tsx` sono ora allineate a logica **refresh on enter** senza polling continuo. I polling pubblici attivi vengono sospesi quando la tab è nascosta e ripartono con refresh immediato quando torna visibile.
- `Leaderboard.tsx` e `HallOfFame.tsx` aggiungono fetch **on enter** quando il public DB read è attivo.
- Se Supabase non è configurato o il public read è spento, queste viste ricadono sullo stato locale e non consumano Supabase.

### Tournament / Tournament detail / TV
- `App.tsx` continua a essere il punto principale di traffico.
- In `tournament_detail`, il bundle torneo è il refresh più frequente solo quando il torneo è live: 5s. Anche qui il polling viene sospeso se la tab è nascosta e riprende al ritorno visibile.
- Per i tornei non live il bundle fa refresh on enter senza polling continuo.
- Le TV hanno anche timer propri (`TvBracketView.tsx`, `TvScorersView.tsx`), ma questi timer sono **solo UI**: il traffico Supabase dipende dal polling già gestito in `App.tsx`.

### Admin
- `components/AdminDashboard.tsx` mantiene la sessione admin con check su mount, focus, `visibilitychange=visible` e timer 60s solo quando la tab è visibile.
- `services/repository/RemoteRepository.ts` è il refresh remoto più continuo lato Admin: pull ogni 20s quando la pagina è visibile, più refresh su focus/online/visibilitychange.
- Le scritture admin non sono polling continuo: partono da `repo.save(...)` / `pushWorkspaceState(...)` e dagli eventuali flush lifecycle.

### Sync strutturato
- `services/autoDbSync.ts` **non** è un polling UI classico.
- È una sincronizzazione best-effort che parte su modifiche, `online` e `visibilitychange=visible`, con debounce 1500ms e throttle 20s.
- Consuma Supabase solo se attivata da flag e se c'è una sessione admin valida.

## Operazioni collegate che consumano Supabase ma non sono “refresh” periodici

Queste non sono refresh continui, ma è utile tenerle tracciate perché generano comunque traffico:

| Operazione | Path reale | Consuma Supabase | Note |
|---|---|---|---|
| Conteggio visita pubblica | `App.tsx`, `services/supabaseRest.ts` | **SÌ** | È una write una tantum per browser/giorno nelle viste pubbliche ammesse. Non è polling. |
| Login admin | `components/AdminDashboard.tsx`, `services/supabaseRest.ts` | **SÌ** | Chiamata auth esplicita al login. |
| Login arbitro | `components/RefereesArea.tsx`, `services/supabaseRest.ts` | **SÌ** | Chiamata esplicita a `verifyRefereePassword()`. |
| Salvataggio stato arbitro / risultato | `components/RefereesArea.tsx`, `services/supabaseRest.ts` | **SÌ** | Write esplicita a `pushRefereeLiveState()`. |

## Dove guardare quando si vuole ridurre il consumo

Ordine pratico dei punti da controllare:

1. `App.tsx` — polling snapshot pubblico / tornei / bundle torneo
2. `services/repository/RemoteRepository.ts` — polling remoto admin ogni 20s
3. `components/AdminDashboard.tsx` — session check ogni 60s solo tab visibile
4. `components/Leaderboard.tsx` e `components/HallOfFame.tsx` — fetch on enter
5. `services/autoDbSync.ts` — sync strutturato se attivo

## Nota finale

Questo documento fotografa **lo stato reale dello ZIP corrente**. Se cambiano intervalli, guardie o condizioni nei file sopra, va aggiornato insieme al codice.
