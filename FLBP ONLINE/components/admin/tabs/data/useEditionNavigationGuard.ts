import React from 'react';
import { registerDraftNavigationGuard } from '../../../../services/draftNavigationGuard';

/** Retain the mounted editor until its owner explicitly permits navigation. */
export const useEditionNavigationGuard = (dirty: boolean, busy: boolean) => {
  const status = React.useRef({ dirty, busy });
  status.current = { dirty, busy };
  const pending = React.useRef<((allow: boolean) => void) | null>(null);
  const [open, setOpen] = React.useState(false);
  const respond = React.useCallback((allow: boolean) => {
    if (allow && status.current.busy) return;
    const resolve = pending.current;
    pending.current = null;
    setOpen(false);
    resolve?.(allow);
  }, []);

  React.useEffect(() => {
    const unregister = registerDraftNavigationGuard(() => {
      if (status.current.busy) return false;
      if (!status.current.dirty) return true;
      return new Promise<boolean>(resolve => {
        pending.current = resolve;
        setOpen(true);
      });
    }, () => status.current.dirty);
    return () => {
      unregister();
      pending.current?.(false);
      pending.current = null;
    };
  }, []);

  return { open, cancel: () => respond(false), discard: () => respond(true) };
};
