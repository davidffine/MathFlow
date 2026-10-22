import {
  branches,
  type Cursor,
  type MathNode,
  type Sequence,
} from "../math/model";

export interface HitRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface MathHitItem {
  index: number;
  kind: MathNode["kind"];
  bounds: HitRect;
  baseBounds?: HitRect;
}
export interface MathHitSlot {
  seqId: string;
  bounds: HitRect;
  items: MathHitItem[];
  owner?: { seqId: string; index: number; branch: string };
}
type Point = { x: number; y: number };
const contains = (r: HitRect, p: Point) =>
  p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
const distance = (r: HitRect, p: Point) =>
  Math.hypot(
    Math.max(r.left - p.x, 0, p.x - r.right),
    Math.max(r.top - p.y, 0, p.y - r.bottom),
  );
function union(rects: HitRect[]): HitRect {
  return {
    left: Math.min(...rects.map((r) => r.left)),
    right: Math.max(...rects.map((r) => r.right)),
    top: Math.min(...rects.map((r) => r.top)),
    bottom: Math.max(...rects.map((r) => r.bottom)),
  };
}

// Resolve from coordinates, never event.target: pointer capture retargets every
// move to the surface. No expanded per-character hit areas overlap nearby text.
export function resolveMathHit(
  slots: MathHitSlot[],
  rootId: string,
  point: Point,
  selectionSeqId?: string,
): Cursor {
  let slot = slots.find((s) => s.seqId === (selectionSeqId || rootId));
  if (!slot) return { seqId: rootId, index: 0 };
  if (!selectionSeqId) {
    for (let depth = 0; depth < slots.length; depth++) {
      const children = slots.filter((s) => s.owner?.seqId === slot!.seqId);
      // An exponent must not steal a tap on its base. Conversely, numerator,
      // denominator and nested structures own their visibly occupied region.
      const candidates = children.filter((child) => {
        const item = slot!.items.find((i) => i.index === child.owner!.index);
        const scriptField =
          child.owner!.branch === "sup" || child.owner!.branch === "sub";
        return (
          item &&
          contains(item.bounds, point) &&
          !(scriptField && item.baseBounds && contains(item.baseBounds, point))
        );
      });
      if (!candidates.length) break;
      const next = candidates.reduce((best, candidate) => {
        const bestDistance = distance(best.bounds, point);
        const nextDistance = distance(candidate.bounds, point);
        // Inline line boxes may meet or overlap near a fraction bar. In that
        // case prefer the row closest to the finger, rather than the first row.
        const rowDistance = (s: MathHitSlot) =>
          Math.abs(point.y - (s.bounds.top + s.bounds.bottom) / 2);
        return nextDistance < bestDistance ||
          (nextDistance === bestDistance &&
            rowDistance(candidate) < rowDistance(best))
          ? candidate
          : best;
      });
      slot = next;
    }
  }
  const nearest = slot.items.find((item) => {
    const rect =
      item.baseBounds && contains(item.baseBounds, point)
        ? item.baseBounds
        : item.bounds;
    return point.x < (rect.left + rect.right) / 2;
  });
  return { seqId: slot.seqId, index: nearest?.index ?? slot.items.length };
}

function elementRect(element: HTMLElement): HitRect {
  // A sequence is one unwrapped math row; measure its inline fragments and
  // combine separately positioned numerator/script rows in measure() below.
  const rects = Array.from(element.getClientRects()).filter(
    (r) => r.height > 0,
  );
  return union(rects.length ? rects : [element.getBoundingClientRect()]);
}

export function measureMathSlots(
  surface: HTMLElement,
  root: Sequence,
): MathHitSlot[] {
  const slotElements = new Map(
    Array.from(surface.querySelectorAll<HTMLElement>("[data-flowslot]")).map(
      (element) => [element.dataset.flowslot!, element] as const,
    ),
  );
  const itemElements = Array.from(
    surface.querySelectorAll<HTMLElement>("[data-flowseq][data-flowindex]"),
  ).filter((element) => !element.hasAttribute("data-flowcaret"));
  const layouts: MathHitSlot[] = [];
  function measure(seq: Sequence, owner?: MathHitSlot["owner"]): MathHitSlot {
    const items = seq.items.map((node, index): MathHitItem => {
      const elements = itemElements.filter(
        (element) =>
          element.dataset.flowseq === seq.id &&
          Number(element.dataset.flowindex) === index,
      );
      const childSlots = branches(node)
        .filter(([, child]) => slotElements.has(child.id))
        .map(([branch, child]) =>
          measure(child, { seqId: seq.id, index, branch }),
        );
      const base = elements.find((element) =>
        element.hasAttribute("data-flowbase"),
      );
      const bounds = [
        ...elements.map(elementRect),
        ...childSlots.map((s) => s.bounds),
      ];
      return {
        index,
        kind: node.kind,
        bounds: union(bounds.length ? bounds : [elementRect(surface)]),
        ...(base ? { baseBounds: elementRect(base) } : {}),
      };
    });
    const element = slotElements.get(seq.id);
    const bounds = [...items.map((item) => item.bounds)];
    if (element) bounds.push(elementRect(element));
    const layout: MathHitSlot = {
      seqId: seq.id,
      items,
      bounds: union(bounds.length ? bounds : [elementRect(surface)]),
      ...(owner ? { owner } : {}),
    };
    layouts.push(layout);
    return layout;
  }
  measure(root);
  return layouts;
}
