// The canvas line art's painter, off the main thread (lineCanvasClient.ts): each motif's canvas is transferred here
// as an OffscreenCanvas, and a scroll frame only posts its progress. The browser composites the worker's frames
// directly, so painting a stroke never costs the page a frame (no main-thread paint, no canvas snapshot copies).
import type { DrawOptions, LineArtData } from '../../lib/linedraw';
import { LineCanvas } from './lineCanvas';

export type LineWorkerMessage =
  | { type: 'add'; id: number; data: LineArtData; opts: DrawOptions; ink: string; canvas: OffscreenCanvas }
  | { type: 'draw'; id: number; p: number; width: number; dpr: number; ink: string }
  | { type: 'drop'; id: number };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<LineWorkerMessage>) => void) | null;
  postMessage(m: unknown): void;
};
const arts = new Map<number, LineCanvas>();

scope.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'add') arts.set(m.id, new LineCanvas(m.data, m.opts, m.ink, m.canvas));
    else if (m.type === 'drop') arts.delete(m.id);
    else {
      const lc = arts.get(m.id);
      if (!lc) return;
      lc.setInk(m.ink);
      lc.setSize(m.width, m.dpr);
      lc.draw(m.p);
    }
  } catch (err) {
    arts.delete(m.id);
    scope.postMessage({ type: 'failed', id: m.id, error: String(err) });
  }
};
