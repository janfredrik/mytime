import { useEffect, useRef, useState } from 'react';

const CELEBRATE_MS = 1400;

/**
 * Keys whose condition just turned true while the user was working, kept for a moment so
 * the UI can play a one-off flourish. Keys seen for the first time (on load or when
 * switching week) are recorded silently, so only real progress is celebrated.
 */
export function useCelebrate(state: ReadonlyMap<string, boolean>): ReadonlySet<string> {
  const seen = useRef(new Map<string, boolean>());
  const [active, setActive] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const fresh: string[] = [];
    for (const [key, done] of state) {
      const before = seen.current.get(key);
      if (before === false && done) fresh.push(key);
      seen.current.set(key, done);
    }
    if (fresh.length === 0) return;
    setActive((prev) => new Set([...prev, ...fresh]));
    // Not cleared on re-render: further edits must not cut the flourish short.
    setTimeout(
      () => setActive((prev) => new Set([...prev].filter((k) => !fresh.includes(k)))),
      CELEBRATE_MS,
    );
  }, [state]);

  return active;
}
