// Applies the saved colour theme before first paint so the page never flashes the wrong one.
// Kept in sync with src/lib/theme.ts; a separate file because the CSP disallows inline scripts.
(function () {
  var pref = 'auto';
  try {
    pref = localStorage.getItem('mytime-theme') || 'auto';
  } catch {
    // Storage blocked (private mode, site data off): fall back to the system theme.
  }
  var dark = pref === 'dark' || (pref !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
