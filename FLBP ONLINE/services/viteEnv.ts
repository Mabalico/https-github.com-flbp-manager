const read = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  return String(value);
};

export const readViteSupabaseUrl = (): string | undefined => {
  try {
    return read(import.meta.env.VITE_SUPABASE_URL);
  } catch {
    return undefined;
  }
};

export const readViteSupabaseAnonKey = (): string | undefined => {
  try {
    return read(import.meta.env.VITE_SUPABASE_ANON_KEY);
  } catch {
    return undefined;
  }
};

export const readViteWorkspaceId = (): string | undefined => {
  try {
    return read(import.meta.env.VITE_WORKSPACE_ID);
  } catch {
    return undefined;
  }
};



export const readViteSupabaseAdminEmail = (): string | undefined => {
  try {
    return read(import.meta.env.VITE_SUPABASE_ADMIN_EMAIL);
  } catch {
    return undefined;
  }
};

export const readViteRemoteRepo = (): string | undefined => {
  try {
    return read(import.meta.env.VITE_REMOTE_REPO);
  } catch {
    return undefined;
  }
};

export const readVitePublicDbRead = (): string | undefined => {
  try {
    return read(import.meta.env.VITE_PUBLIC_DB_READ);
  } catch {
    return undefined;
  }
};

export const readViteAutoStructuredSync = (): string | undefined => {
  try {
    return read(import.meta.env.VITE_AUTO_STRUCTURED_SYNC);
  } catch {
    return undefined;
  }
};

export const readViteAllowLocalOnly = (): string | undefined => {
  try {
    return read(import.meta.env.VITE_ALLOW_LOCAL_ONLY);
  } catch {
    return undefined;
  }
};
