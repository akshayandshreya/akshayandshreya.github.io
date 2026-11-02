// Who paints a scroll-drawn motif's canvas (lineCanvas.ts): a worker where the browser can hand a canvas to one
// (OffscreenCanvas, lineCanvas.worker.ts), so the page's main thread only computes the progress and posts it; the
// main thread itself elsewhere, or when the worker cannot start. Both paint exactly the same (one LineCanvas class).
import type { DrawOptions, LineArtData } from '../../lib/linedraw';
import { LineCanvas, drawnAt, lineSchedule } from './lineCanvas';
import type { LineWorkerMessage } from './lineCanvas.worker';

export interface LineRenderer {
  /** Draw to progress p for an art `width` CSS px wide; posts or paints only when something changed. */
  update(p: number, width: number, dpr: number, ink: string): void;
  /** The mean drawn share of the visible strokes at the last progress (tests, QA). */
  drawn(): number;
  destroy(): void;
}

let worker: Worker | null | undefined;
let nextId = 1;
/** arts painted by the worker, told when it fails so they can repaint on the main thread */
const lost = new Map<number, () => void>();

function lineWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  try {
    if (
      typeof Worker === 'function' &&
      typeof OffscreenCanvas === 'function' &&
      typeof HTMLCanvasElement !== 'undefined' &&
      'transferControlToOffscreen' in HTMLCanvasElement.prototype
    ) {
      const w = new Worker(new URL('./lineCanvas.worker.ts', import.meta.url), { type: 'module' });
      const fail = (id?: number) => {
        for (const [k, f] of [...lost]) {
          if (id !== undefined && k !== id) continue;
          lost.delete(k);
          f();
        }
      };
      // a worker that cannot load (or a browser without 2D OffscreenCanvas in workers) gives its arts back
      w.addEventListener('error', () => {
        worker = null;
        fail();
      });
      w.addEventListener('message', (e: MessageEvent<{ type: string; id: number }>) => {
        if (e.data?.type === 'failed') fail(e.data.id);
      });
      worker = w;
    }
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * A renderer for `canvas` (a fresh element, not yet drawn on). `onLost` is called if the worker gives up on it
 * after the canvas was transferred: the caller then puts a new canvas in its place and asks again (on the main
 * thread from then on).
 */
export function lineRenderer(
  canvas: HTMLCanvasElement,
  data: LineArtData,
  opts: DrawOptions,
  ink: string,
  onLost: () => void,
): LineRenderer {
  const schedule = lineSchedule(data, opts);
  let last = { p: -1, width: -1, dpr: -1, ink: '' };
  const w = lineWorker();
  if (w) {
    const id = nextId++;
    const off = canvas.transferControlToOffscreen();
    lost.set(id, onLost);
    w.postMessage({ type: 'add', id, data, opts, ink, canvas: off } satisfies LineWorkerMessage, [off]);
    return {
      update(p, width, dpr, ink) {
        if (p === last.p && width === last.width && dpr === last.dpr && ink === last.ink) return;
        last = { p, width, dpr, ink };
        w.postMessage({ type: 'draw', id, p, width, dpr, ink } satisfies LineWorkerMessage);
      },
      drawn: () => drawnAt(schedule, Math.max(0, last.p)),
      destroy() {
        lost.delete(id);
        w.postMessage({ type: 'drop', id } satisfies LineWorkerMessage);
      },
    };
  }
  const lc = new LineCanvas(data, opts, ink, canvas);
  return {
    update(p, width, dpr, ink) {
      if (p === last.p && width === last.width && dpr === last.dpr && ink === last.ink) return;
      last = { p, width, dpr, ink };
      lc.setInk(ink);
      lc.setSize(width, dpr);
      lc.draw(p);
    },
    drawn: () => lc.drawn(),
    destroy() {},
  };
}
