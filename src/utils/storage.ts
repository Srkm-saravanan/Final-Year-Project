// Browser-side UI preference persistence only (Phase C moved business state to PostgreSQL).

export const PREFERENCE_KEYS = {
  UI_PREFERENCES: 'cortex.uiPreferences.v1',
} as const;

export interface UIPreferences {
  currency: 'INR' | 'USD';
  displayScale: 'standard' | 'large' | 'xl';
}

const DEFAULT_UI_PREFERENCES: UIPreferences = {
  currency: 'INR',
  displayScale: 'standard',
};

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function loadUIPreferences(): UIPreferences {
  const storage = getStorage();
  if (!storage) return DEFAULT_UI_PREFERENCES;

  try {
    const raw = storage.getItem(PREFERENCE_KEYS.UI_PREFERENCES);
    if (!raw) return DEFAULT_UI_PREFERENCES;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_UI_PREFERENCES;
    const obj = parsed as Record<string, unknown>;
    const currency = obj.currency === 'USD' ? 'USD' : 'INR';
    const displayScale =
      obj.displayScale === 'large' || obj.displayScale === 'xl'
        ? obj.displayScale
        : 'standard';
    return { currency, displayScale };
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }
}

export function saveUIPreferences(prefs: UIPreferences): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(PREFERENCE_KEYS.UI_PREFERENCES, JSON.stringify(prefs));
  } catch {
    // Ignore storage write errors in restricted contexts
  }
}
