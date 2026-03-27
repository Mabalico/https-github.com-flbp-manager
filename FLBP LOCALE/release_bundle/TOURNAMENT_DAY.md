# FLBP Manager Suite — Tournament Day (operativo)

Checklist rapida (pensata per essere **scansionabile** sul campo).  
Nota: la UI Admin è progettata per **chiarezza** e azioni “sicure” (es. cambio stato match via pulsante, non per click accidentale sulla riga).

---

## 0) Prima di tutto (build / permessi)
- Se `npm run build` fallisce con **Permission denied** (ZIP + binari):
  - `npm run fix:perms`
  - poi riprova `npm run build` / `npm run release:check -- docs/sample_backup.json`

---

## 1) Setup iniziale (5–10 min)
1) Apri l’app su un device **Admin**.
2) Vai in **Admin → Dati → Integrazioni → Backup & Sync (beta — solo tester)**.
3) Esegui:
   - **Test connessione**
   - **Health check** (OK su read public + RLS admin)
4) Se devi migrare dati locali:
   - usa **Wizard migrazione Locale → DB**.

---

## 2) Prima di andare live (2 min — smoke checks)
- **Public**: apri Tornei / Dettaglio torneo e verifica che i badge (LIVE/ARCHIVIO) e le CTA siano visibili.
- **TV Mode**: apri TV e verifica che sia **read-only / zero click** e in safe-area 16:9.
- **Admin**:
  - Codes/Monitor: ricerca match funziona, e il cambio stato è su pulsante **Avvia/Chiudi**.
  - BYE: deve restare **invisibile** in UI.
  - TBD: non deve “avanzare” né diventare team reale.
- **Referti/OCR**: invariato (non testare output diverso, solo che non crashi).

---

## 3) Durante il live
- Se usi più admin, evita azioni contemporanee sugli stessi match.
- Se compare un conflitto:
  - fai **Pull snapshot** e applica;
  - usa **Force** solo se sai cosa stai facendo.

---

## 4) Fine torneo
- Archivia il torneo dall’Admin (flusso attuale).
- Esegui **Export backup JSON** e salva il file in locale.

---

## 5) Verifica consigliata (2 minuti)
- `npm run check:all -- <backup.json>`
