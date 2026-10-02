import type {
  CalendarWeek,
  FlexSummary,
  ImportCommit,
  ImportPreview,
  Line,
  LineDescriptor,
  Me,
  Settings,
  Week,
} from '@mytime/shared';

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the server could not be reached at all. */
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }

  /** The session has expired; only signing in again helps. */
  get isUnauthorized() {
    return this.status === 401;
  }

  /** Worth retrying unchanged: no connection, timeouts, rate limits and server errors. */
  get isTransient() {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message: string | undefined;
  try {
    const data = (await res.json()) as { message?: string };
    message = data.message;
  } catch {
    // Non-JSON bodies come from a proxy in front of the app, not from MyTime itself.
  }
  if (res.status === 401) message = 'Økten er utløpt. Logg inn på nytt';
  else if (!message) {
    message =
      res.status >= 500
        ? `Serveren svarer ikke akkurat nå (${res.status}). Prøver igjen`
        : `Uventet svar fra serveren (${res.status})`;
  }
  return new ApiError(res.status, message);
}

/** fetch, with a network failure turned into an ApiError the UI can explain. */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Ingen kontakt med serveren. Sjekk nettforbindelsen');
  }
}

/** Download the week's .xlsx; resolves with the file once the server has produced it. */
async function exportWeek(weekStart: string): Promise<{ blob: Blob; fileName: string }> {
  const res = await send(`/api/weeks/${weekStart}/export`, {
    headers: { 'x-requested-with': 'mytime' },
  });
  if (!res.ok) throw await errorFrom(res);
  const disposition = res.headers.get('content-disposition') ?? '';
  const fileName = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? `uke-${weekStart}.xlsx`;
  return { blob: await res.blob(), fileName };
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'x-requested-with': 'mytime' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await send(url, { method, headers, body: payload });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

export const api = {
  me: () => request<Me>('GET', '/api/me'),
  week: (weekStart: string) => request<Week>('GET', `/api/weeks/${weekStart}`),
  saveWeek: (weekStart: string, lines: Line[]) =>
    request<Week>('PUT', `/api/weeks/${weekStart}`, { lines }),
  copyPrevious: (weekStart: string) =>
    request<Week>('POST', `/api/weeks/${weekStart}/copy-previous`),
  exportWeek,
  calendar: (from: string, to: string) =>
    request<CalendarWeek[]>('GET', `/api/calendar?from=${from}&to=${to}`),
  flex: () => request<FlexSummary>('GET', '/api/flex'),
  suggestions: () => request<LineDescriptor[]>('GET', '/api/suggestions'),
  markOnboarded: () => request<{ ok: true }>('POST', '/api/onboarded'),
  saveSettings: (settings: Settings) => request<Settings>('PUT', '/api/settings', settings),
  importPreview: (weekStart: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<ImportPreview>('POST', `/api/import/preview?week=${weekStart}`, form);
  },
  importCommit: (body: ImportCommit) =>
    request<{ weeks: { weekStart: string; lines: number }[] }>('POST', '/api/import/commit', body),
};
