# FLBP Manager - Regole Operative e Architettura

Questo documento definisce le **regole operative vincolanti** per lo sviluppo nel monorepo e lo stato attuale dell'architettura. Sostituisce i vecchi piani migratori.

## 1. Architettura del Monorepo

- **Root workspace**: `FLBP MANAGER`
- **Frontend canonico (Source of Truth)**: `FLBP ONLINE`
- **Lavoro locale/simmetrico**: `FLBP LOCALE` (da mantenere allineato a `FLBP ONLINE` solo ove logica condivisa debba restare speculare).
- **App Native**: `FLBP ANDROID` e `FLBP IOS` risiedono nello stesso repository e mantengono versionamento git condiviso, seppur con iter di distribuzione separati.

## 2. Flusso di Sviluppo Web e Deploy

Tutto lo sviluppo del progetto web ruota attorno alla directory `FLBP ONLINE`.

- **Sito Live**: `https://flbp-pages.pages.dev`
- **Piattaforma di Deploy**: Cloudflare Pages con Git integration 
- **Branch di Produzione**: `main`
- **Root Directory per Cloudflare**: `FLBP ONLINE`

### 2.1 Flusso Obbligatorio per le Modifiche (End-to-End)
In conformità alle regole globali, **non fermarsi mai alla modifica in locale/sola analisi**. Per applicare una modifica:

1. **Sviluppo**: Apporta le modifiche necessarie (`FLBP ONLINE`).
2. **Allineamento Locale**: Se il progetto/task lo richiede, riversa o applica la stessa logica anche su `FLBP LOCALE` per preservare la simmetria.
3. **Verifiche di Base**:
   - `npm run build` in `FLBP ONLINE`
   - `npm run build` in `FLBP LOCALE` (se è stato modificato)
   - `npm run check:ssr-admin` in `FLBP ONLINE` (fondamentale quando si tocca: area admin, routing, o moduli di autenticazione).
4. **Commit & Push**:
   - Compila un commit chiaro.
   - Assicurati di NON includere file estranei o temporanei nel commit.
   - Push sul branch canonico `main` (o secondo istruzioni temporanee).
5. **Verifica Live**:
   - Assicurati che Cloudflare Pages abbia processato l'azione legata al push Git e l'abbia messa live.
   - Visita/testa l'applicazione sull'URL live per attestare che la nuova versione sia ora servita.

## 3. Qualità e Norme di Sicurezza

- **Inclusione Git**: Mai includere backup in formato compresso (zip), binari di debug o file di diagnostica. 
- **Stabilità e Cache**: Se l'app in produzione non riflette i cambiamenti dopo un deploy confermato, si esegue debug sulle cache del service worker/bundle e si lavora sulla build correntemente deployata.
- **Design della Soluzione**: Nelle problematiche di loop, sync e data-handling preferire architetture idempotenti.
- Segnalare l'esistenza/rilevanza o alterazione di configurazioni firebase di deployment (`.json`/chiavi SDK) tenendo d'occhio la divisione delle credenziali.
