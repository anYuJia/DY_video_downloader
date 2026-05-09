const STORAGE_KEY = "dy_recent_searches";
const MAX_ITEMS = 8;

export interface RecentSearch {
  text: string;
  timestamp: number;
}

export function loadRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentSearch[];
  } catch {
    return [];
  }
}

export function saveRecentSearch(text: string): RecentSearch[] {
  const trimmed = text.trim();
  if (!trimmed) return loadRecentSearches();

  const existing = loadRecentSearches().filter((s) => s.text !== trimmed);
  const updated: RecentSearch[] = [
    { text: trimmed, timestamp: Date.now() },
    ...existing,
  ].slice(0, MAX_ITEMS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage failures
  }

  return updated;
}

export function removeRecentSearch(text: string): RecentSearch[] {
  const updated = loadRecentSearches().filter((s) => s.text !== text);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage failures
  }
  return updated;
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures
  }
}
