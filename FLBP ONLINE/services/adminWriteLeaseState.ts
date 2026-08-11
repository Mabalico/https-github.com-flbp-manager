// Stato condiviso del "write lease" admin (un solo admin scrive alla volta).
//
// Modulo senza import: supabaseRest legge da qui per decidere se una scrittura
// admin e' permessa, mentre la logica attiva (heartbeat, RPC) vive in
// adminWriteLease.ts. Cosi' non si creano cicli di import.
//
// Stati:
// - off:       feature non inizializzata (aree non-admin, simulatore senza
//              lease, oppure DB senza la migration): nessun gating client.
// - acquiring: primo tentativo in corso; le scritture sono bloccate finché il
//              server non conferma esplicitamente il testimone.
// - active:    questa finestra detiene il testimone e puo' scrivere.
// - passive:   un'altra sessione e' attiva: questa finestra e' in sola lettura.
// - error:     ultimo heartbeat fallito: scritture bloccate in modo fail-closed.

export type AdminLeaseStatus = 'off' | 'acquiring' | 'active' | 'passive' | 'error';

export type AdminLeaseInfo = {
  status: AdminLeaseStatus;
  holderId: string | null;
  otherLabel?: string | null;
  otherSince?: string | null;
  lastError?: string | null;
};

let info: AdminLeaseInfo = { status: 'off', holderId: null };
const listeners = new Set<(next: AdminLeaseInfo) => void>();

export const readAdminLeaseInfo = (): AdminLeaseInfo => info;

export const setAdminLeaseInfo = (next: Partial<AdminLeaseInfo>): void => {
  info = { ...info, ...next };
  for (const listener of [...listeners]) {
    try {
      listener(info);
    } catch {
      // listener UI: mai bloccare gli altri
    }
  }
};

export const subscribeAdminLease = (listener: (next: AdminLeaseInfo) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Holder da allegare alle RPC di scrittura admin (null = feature off, il
// server applica la modalita' retrocompatibile).
export const getAdminLeaseHolderForWrites = (): string | null =>
  info.status === 'active' ? info.holderId : null;

// Gating client (UX): blocca solo quando SAPPIAMO di essere passivi. La
// garanzia di integrita' e' comunque il rifiuto lato server.
export const isAdminWriteBlockedByLease = (): boolean =>
  info.status === 'acquiring' || info.status === 'passive' || info.status === 'error';
