import { useSyncExternalStore } from 'react';

/** Compact: one line per row with separate task and type columns. Comfortable: project above task, taller cells. */
export type Density = 'compact' | 'comfortable';

const KEY = 'mytime-density';
const listeners = new Set<() => void>();

function read(): Density {
  try {
    return localStorage.getItem(KEY) === 'comfortable' ? 'comfortable' : 'compact';
  } catch {
    return 'compact';
  }
}

let current = read();

function setDensity(next: Density) {
  current = next;
  try {
    if (next === 'compact') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Storage blocked: the choice still applies for this page load.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Row density is a per-device preference like the theme, shared between the grid and the settings dialog. */
export function useDensity() {
  const density = useSyncExternalStore(subscribe, () => current);
  return [density, setDensity] as const;
}
