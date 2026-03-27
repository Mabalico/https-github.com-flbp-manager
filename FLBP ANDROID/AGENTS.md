# AGENTS.md — Android native track

chat non affidabile, seguo gli ZIP.

- Questo ZIP è la fonte di verità solo per lo stato reale Android.
- La verità di prodotto, flussi, regole business e contenuti resta nello ZIP web verificato in questa chat.
- Non inventare file, schermate, endpoint, navigation flow o stato di avanzamento.
- Se il codice nativo usa bootstrap defaults di toolchain, dichiararlo esplicitamente nei docs.
- Aggiorna sempre `docs/codex/*` quando tocchi codice o baseline.
- Mantieni i vincoli hard FLBP: BYE invisibili in UI con auto-advance, TBD placeholder non reale, TV read-only, OCR/referti invariati salvo scope esplicito.
- Priorità UX: smartphone-first, safe area, touch targets adeguati, tastiera e densità mobile.
- Stato reale di questo checkpoint: bootstrap Compose reale + Home shell pubblica + Tournament list shell auditata + Tournament detail shell auditata + contratto snapshot nativo auditato per il torneo pubblico, ancora senza dataset o wiring reale dei tornei.
