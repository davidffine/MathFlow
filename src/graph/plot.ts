import type { CompiledFunction } from "./expression";
export interface Range {
  min: number;
  max: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Plot {
  x: Range;
  y: Range;
  segments: Point[][];
  visible: boolean;
}
export function validateRange(range: Range, axis: string) {
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max))
    throw new Error(`הזינו מספרים תקינים בטווח ${axis}.`);
  if (range.min >= range.max)
    throw new Error(`בטווח ${axis}, הערך ״עד״ צריך להיות גדול מהערך ״מ־״.`);
  if (
    Math.max(Math.abs(range.min), Math.abs(range.max)) > 1e9 ||
    range.max - range.min < 1e-6
  )
    throw new Error(
      `טווח ${axis} קטן או גדול מדי. בחרו טווח בין מיליונית למיליארד.`,
    );
}
export function autoRange(fn: CompiledFunction, x: Range): Range {
  const values: number[] = [];
  for (let i = 0; i <= 800; i++) {
    const y = fn.evaluate(x.min + ((x.max - x.min) * i) / 800);
    if (Number.isFinite(y) && Math.abs(y) <= 1e9) values.push(y);
  }
  if (!values.length)
    throw new Error(
      "אין לפונקציה ערכים ממשיים בטווח הזה. שנו את הפונקציה או את טווח x.",
    );
  values.sort((a, b) => a - b);
  // Trim outliers near poles. This chooses a view, never changes evaluated data.
  let min = values[Math.floor((values.length - 1) * 0.03)];
  let max = values[Math.ceil((values.length - 1) * 0.97)];
  const span = max - min;
  if (span < 1e-8) {
    min -= Math.max(1, Math.abs(min) * 0.15);
    max += Math.max(1, Math.abs(max) * 0.15);
  } else {
    min -= span * 0.12;
    max += span * 0.12;
  }
  // Include the horizontal axis only if it does not dominate the useful range.
  if (min > 0 && min < (max - min) * 0.35) min = 0;
  if (max < 0 && -max < (max - min) * 0.35) max = 0;
  const rawStep = (max - min) / 8;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const step = ([1, 2, 5, 10].find((n) => n >= rawStep / power) ?? 10) * power;
  return {
    min: Math.max(-1e9, Math.floor(min / step) * step),
    max: Math.min(1e9, Math.ceil(max / step) * step),
  };
}
export function makePlot(
  fn: CompiledFunction,
  x: Range,
  manualY?: Range,
): Plot {
  validateRange(x, "x");
  const y = manualY ?? autoRange(fn, x);
  validateRange(y, "y");
  const span = y.max - y.min;
  const segments: Point[][] = [];
  let current: Point[] = [];
  let visible = false;
  function gap() {
    if (current.length > 1) segments.push(current);
    current = [];
  }
  function join(a: Point, b: Point) {
    // Both ends far outside the view in the same direction need no drawing.
    if (
      (a.y > y.max + span && b.y > y.max + span) ||
      (a.y < y.min - span && b.y < y.min - span)
    ) {
      gap();
      return;
    }
    if (!current.length) current.push(a);
    current.push(b);
    if (Math.max(a.y, b.y) >= y.min && Math.min(a.y, b.y) <= y.max)
      visible = true;
  }
  function sample(a: Point, b: Point, depth: number) {
    const mx = (a.x + b.x) / 2;
    const m = { x: mx, y: fn.evaluate(mx) };
    const finite =
      Number.isFinite(a.y) && Number.isFinite(b.y) && Number.isFinite(m.y);
    // Recurse for domain boundaries and curvature; omit unresolved jumps at depth limit.
    const error = finite ? Math.abs(m.y - (a.y + b.y) / 2) / span : Infinity;
    if ((!finite || error > 0.0015) && depth < 7) {
      if (![a.y, b.y, m.y].some(Number.isFinite)) {
        gap();
        return;
      }
      sample(a, m, depth + 1);
      sample(m, b, depth + 1);
      return;
    }
    if (!finite || error > 0.035) {
      gap();
      return;
    }
    join(a, b);
  }
  let a = { x: x.min, y: fn.evaluate(x.min) };
  for (let i = 1; i <= 720; i++) {
    const px = x.min + ((x.max - x.min) * i) / 720;
    const b = { x: px, y: fn.evaluate(px) };
    sample(a, b, 0);
    a = b;
  }
  gap();
  return { x, y, segments, visible };
}
export function ticks(range: Range): number[] {
  const raw = (range.max - range.min) / 8;
  const power = 10 ** Math.floor(Math.log10(raw));
  const multiple = [1, 2, 5, 10].find((n) => n >= raw / power) ?? 10;
  const step = multiple * power;
  const out: number[] = [];
  for (
    let v = Math.ceil(range.min / step) * step, i = 0;
    v <= range.max && i < 30;
    v += step, i++
  )
    out.push(Math.abs(v) < step * 1e-8 ? 0 : Number(v.toPrecision(10)));
  return out;
}
export function tickLabel(value: number): string {
  return Math.abs(value) >= 1e5 || (Math.abs(value) < 0.001 && value !== 0)
    ? value.toExponential(1)
    : Number(value.toPrecision(5)).toString();
}
