import { type FlexWeek, formatHours, isoWeekOf } from '@mytime/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { longDate, signedHours } from '../lib/format';
import { Dialog } from './ui';

const weekLabel = (weekStart: string) => `Uke ${isoWeekOf(weekStart).week}`;

/** Round step for about `count` gridlines over `span` hours. */
function niceStep(span: number, count: number): number {
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * pow;
}

function yDomain(values: number[]) {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const step = niceStep(Math.max(hi - lo, 1), 4);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { min, max: max === min ? min + step : max, ticks };
}

/** Small trend line for the balance card: the last weeks, current week marked. */
export function FlexSparkline({ weeks }: { weeks: FlexWeek[] }) {
  const recent = weeks.slice(-12);
  if (recent.length < 2) return null;
  const w = 120;
  const h = 28;
  const pad = 3;
  const values = recent.map((x) => x.balance);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i / (recent.length - 1)) * (w - pad * 2);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (h - pad * 2);
  const path = recent.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join('');
  const last = recent.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="block overflow-visible" aria-hidden="true">
      {lo < 0 && hi > 0 && (
        <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} className="stroke-line-strong" strokeWidth={1} />
      )}
      <path d={path} fill="none" className="stroke-accent" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(recent[last]!.balance)} r={2.5} className="fill-accent stroke-surface" strokeWidth={1.5} />
    </svg>
  );
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function BalanceChart({ weeks }: { weeks: FlexWeek[] }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const height = 240;
  const m = { top: 16, right: 56, bottom: 28, left: 40 };
  const innerW = Math.max(width - m.left - m.right, 1);
  const innerH = height - m.top - m.bottom;
  const { min, max, ticks } = useMemo(() => yDomain(weeks.map((w) => w.balance)), [weeks]);
  const n = weeks.length;
  const x = (i: number) => m.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => m.top + (1 - (v - min) / (max - min)) * innerH;
  const path = weeks.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join('');
  // Thin out week labels so they never collide (about 56px per label).
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 56))));
  const last = n - 1;
  const shown = active ?? last;
  const point = weeks[shown]!;

  const pick = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left - m.left;
    setActive(Math.min(last, Math.max(0, Math.round((px / innerW) * (n - 1)))));
  };

  return (
    <div ref={wrapRef} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block touch-none select-none focus-visible:outline-2 focus-visible:outline-accent"
          role="img"
          aria-label={`Fleksbalanse per uke. Nå ${formatHours(weeks[last]!.balance)} timer.`}
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setActive(Math.max(0, shown - 1));
            else if (e.key === 'ArrowRight') setActive(Math.min(last, shown + 1));
            else if (e.key === 'Home') setActive(0);
            else if (e.key === 'End') setActive(last);
            else return;
            e.preventDefault();
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={m.left}
                x2={m.left + innerW}
                y1={y(t)}
                y2={y(t)}
                className={t === 0 ? 'stroke-line-strong' : 'stroke-line'}
                strokeWidth={1}
              />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-subtle text-[11px] tabular">
                {formatHours(t)}
              </text>
            </g>
          ))}
          {weeks.map((w, i) =>
            i % labelEvery === (last % labelEvery) ? (
              <text
                key={w.weekStart}
                x={x(i)}
                y={height - 8}
                textAnchor="middle"
                className="fill-ink-subtle text-[11px] tabular"
              >
                {isoWeekOf(w.weekStart).week}
              </text>
            ) : null,
          )}
          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={m.top} y2={m.top + innerH} className="stroke-ink-subtle" strokeWidth={1} />
          )}
          <path d={path} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(shown)} cy={y(point.balance)} r={4.5} className="fill-accent stroke-surface" strokeWidth={2} />
          <text x={x(last) + 10} y={y(weeks[last]!.balance)} dy="0.32em" className="fill-ink text-xs font-semibold tabular">
            {formatHours(weeks[last]!.balance)} t
          </text>
        </svg>
      )}
      {active !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={
            // Beside the crosshair, on whichever side has room.
            x(active) + 12 + 160 <= width
              ? { left: x(active) + 12 }
              : { right: width - x(active) + 12 }
          }
        >
          <div className="text-ink-muted">
            {weekLabel(point.weekStart)} · {longDate(point.weekStart)}
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold tabular text-ink">{formatHours(point.balance)} t</span>
            <span className="text-ink-muted">saldo</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold tabular text-ink">{signedHours(point.flex)} t</span>
            <span className="text-ink-muted">denne uka</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function FlexHistoryDialog({
  open,
  onClose,
  weeks,
}: {
  open: boolean;
  onClose: () => void;
  weeks: FlexWeek[];
}) {
  const first = weeks[0];
  const lastWeek = weeks.at(-1);
  const change = first && lastWeek ? lastWeek.balance - (first.balance - first.flex) : 0;
  return (
    <Dialog open={open} onClose={onClose} title="Fleksutvikling" wide>
      {weeks.length === 0 || !first || !lastWeek ? (
        <p className="text-sm text-ink-muted">Ingen fleks ennå. Den starter når du fører timer.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Saldo ved slutten av hver uke, fra {weekLabel(first.weekStart).toLowerCase()}.{' '}
            {weeks.length > 1 && (
              <>
                Endring i perioden: <span className="font-semibold text-ink tabular">{signedHours(change)} t</span>.
              </>
            )}
          </p>
          <BalanceChart weeks={weeks} />
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-muted hover:text-ink">Vis som tabell</summary>
            <table className="mt-2 w-full">
              <thead>
                <tr className="border-b border-line text-xs text-ink-muted">
                  <th className="py-1.5 text-left font-medium">Uke</th>
                  <th className="py-1.5 text-right font-medium">Fleks</th>
                  <th className="py-1.5 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {[...weeks].reverse().map((w) => (
                  <tr key={w.weekStart} className="border-b border-line last:border-0">
                    <td className="py-1.5">{weekLabel(w.weekStart)}</td>
                    <td
                      className={`py-1.5 text-right tabular ${w.flex > 0 ? 'text-positive' : w.flex < 0 ? 'text-negative' : 'text-ink-muted'}`}
                    >
                      {signedHours(w.flex)}
                    </td>
                    <td className="py-1.5 text-right font-medium tabular">{formatHours(w.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </Dialog>
  );
}
