import { useEffect, useState } from 'react';

export type ThemePref = 'auto' | 'light' | 'dark';

const KEY = 'mytime-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'auto' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

// Follow the OS while on "auto".
media.addEventListener('change', () => apply(readPref()));

/** The colour theme is a per-device preference, so it lives in localStorage rather than user settings. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readPref);

  useEffect(() => {
    try {
      if (pref === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, pref);
    } catch {
      // Storage blocked: the choice still applies for this page load.
    }
    apply(pref);
  }, [pref]);

  return [pref, setPref] as const;
}
