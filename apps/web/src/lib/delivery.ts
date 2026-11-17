import { api } from './api';

/**
 * How a finished week leaves MyTime. Today the only way is a downloaded .xlsx that the user
 * uploads in the official MyTime by hand. Sending straight to the official system plugs in
 * here as a second method once its upload request is known (see docs/offisiell-mytime-opplasting.md);
 * the export dialog offers a choice only when there is more than one method.
 */
export interface DeliveryMethod {
  id: 'download';
  /** Primary button text for `count` selected weeks. */
  actionLabel: (count: number) => string;
  /** Progress text while `done` of `count` weeks are handled. */
  progressLabel: (done: number, count: number) => string;
  /** Delivers one week and returns what to show on its row (e.g. the file name). */
  deliver: (weekStart: string) => Promise<string>;
}

export function saveBlob({ blob, fileName }: { blob: Blob; fileName: string }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const downloadFiles: DeliveryMethod = {
  id: 'download',
  actionLabel: (count) => (count === 1 ? 'Last ned 1 fil' : `Last ned ${count} filer`),
  progressLabel: (done, count) => `Laster ned ${Math.min(done + 1, count)} av ${count}…`,
  async deliver(weekStart) {
    const file = await api.exportWeek(weekStart);
    saveBlob(file);
    // Browsers drop downloads that start back to back; give each one a moment.
    await pause(350);
    return file.fileName;
  },
};

export const DELIVERY_METHODS: readonly DeliveryMethod[] = [downloadFiles];
