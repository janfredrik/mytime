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
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'x-requested-with': 'mytime' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  if (!res.ok) {
    let message = `Feil ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data.message) message = data.message;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export const api = {
  me: () => request<Me>('GET', '/api/me'),
  week: (weekStart: string) => request<Week>('GET', `/api/weeks/${weekStart}`),
  saveWeek: (weekStart: string, lines: Line[]) =>
    request<Week>('PUT', `/api/weeks/${weekStart}`, { lines }),
  submitWeek: (weekStart: string) => request<Week>('POST', `/api/weeks/${weekStart}/submit`),
  copyPrevious: (weekStart: string) =>
    request<Week>('POST', `/api/weeks/${weekStart}/copy-previous`),
  exportUrl: (weekStart: string) => `/api/weeks/${weekStart}/export`,
  calendar: (from: string, to: string) =>
    request<CalendarWeek[]>('GET', `/api/calendar?from=${from}&to=${to}`),
  flex: () => request<FlexSummary>('GET', '/api/flex'),
  suggestions: () => request<LineDescriptor[]>('GET', '/api/suggestions'),
  saveSettings: (settings: Settings) => request<Settings>('PUT', '/api/settings', settings),
  importPreview: (weekStart: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<ImportPreview>('POST', `/api/import/preview?week=${weekStart}`, form);
  },
  importCommit: (body: ImportCommit) =>
    request<{ weeks: { weekStart: string; lines: number }[] }>('POST', '/api/import/commit', body),
};
