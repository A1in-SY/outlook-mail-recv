import { useSyncExternalStore } from "react";
import {
  applyTheme, readStoredTheme, storeTheme, watchSystemTheme,
  type ResolvedTheme, type Theme,
} from "@/lib/theme";

/**
 * Theme lives in a module-level store because the toggle buttons and the toast
 * container sit in different subtrees and must never disagree.
 */
let theme: Theme = readStoredTheme();
let resolved: ResolvedTheme = applyTheme(theme);
let snapshot: { theme: Theme; resolved: ResolvedTheme } = { theme, resolved };

const listeners = new Set<() => void>();

function sync() {
  resolved = applyTheme(theme);
  snapshot = { theme, resolved };
  listeners.forEach((listener) => listener());
}

// Explicit choices resolve the same way regardless of OS state, so an
// unconditional watcher keeps "system" live without extra bookkeeping.
watchSystemTheme(sync);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

export function setTheme(next: Theme) {
  theme = next;
  storeTheme(next);
  sync();
}

export function useTheme() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { theme: state.theme, resolved: state.resolved, setTheme };
}
