type DraftNavigationGuard = () => boolean | Promise<boolean>;

const guards = new Map<DraftNavigationGuard, () => boolean>();
let navigationPending = false;
export const isDraftNavigationPending = (): boolean => navigationPending;
export const hasUnsavedDraft = (): boolean => [...guards.values()].some(hasDraft => hasDraft());

/** The owner unregisters on unmount; no account or form data is retained here. */
export const registerDraftNavigationGuard = (guard: DraftNavigationGuard, hasDraft: () => boolean = () => false): (() => void) => {
  guards.set(guard, hasDraft);
  return () => { guards.delete(guard); };
};

/** A pending confirmation owns its destination. Further clicks cannot replace it. */
export const requestDraftNavigation = async (action: () => void | Promise<void>): Promise<boolean> => {
  if (navigationPending) return false;
  navigationPending = true;
  let checking = true;
  try {
    for (const guard of [...guards.keys()]) {
      if (!await guard() || !guards.has(guard)) return false;
    }
    // Route preload/request ordering remains the caller's responsibility.
    navigationPending = false;
    checking = false;
    await action();
    return true;
  } finally {
    if (checking) navigationPending = false;
  }
};
