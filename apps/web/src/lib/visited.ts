const KEY = 'mytime-signed-in';

/** Whether anyone has signed in from this browser before. Decides how loudly the landing page offers guest access. */
export function hasSignedInHere() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberSignedIn() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Storage blocked: the landing page just keeps treating this browser as new.
  }
}
