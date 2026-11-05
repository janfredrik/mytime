import { describe, expect, it } from 'vitest';
import { MYTIME_COMMENT_MAX, type Line, commentTooLong, longCommentEntries } from '../src/index.js';

const line = (comments: string[]): Line => ({
  id: crypto.randomUUID(),
  projectNumber: '1',
  projectName: 'P',
  taskNumber: '1',
  taskName: 'T',
  type: 'N',
  entries: comments.map((comment, i) => ({ date: `2026-09-2${8 + i}`, hours: 1, comment, timeFrom: '', timeTo: '' })),
});

describe('MyTime comment limit', () => {
  it('allows exactly the limit', () => {
    expect(MYTIME_COMMENT_MAX).toBe(240);
    expect(commentTooLong('x'.repeat(240))).toBe(false);
    expect(commentTooLong('x'.repeat(241))).toBe(true);
  });

  it('lists the entries that are too long', () => {
    const a = line(['kort', 'x'.repeat(241)]);
    const b = line(['y'.repeat(300)]);
    expect(longCommentEntries([a, b]).map(({ line, entry }) => [line.id, entry.date])).toEqual([
      [a.id, '2026-09-29'],
      [b.id, '2026-09-28'],
    ]);
  });
});
