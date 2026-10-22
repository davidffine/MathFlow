import { ticks, tickLabel, type Plot } from "./plot";
export const GRAPH_WIDTH = 1600;
export const GRAPH_HEIGHT = 1100;
/** Independent raster snapshot: crisp PNG, no editor controls, no external assets. */
export function drawGraph(
  canvas: HTMLCanvasElement,
  plot: Plot,
  expression: string,
) {
  canvas.width = GRAPH_WIDTH;
  canvas.height = GRAPH_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("לא ניתן לצייר גרף בדפדפן הזה.");
  ctx.scale(2, 2);
  const w = GRAPH_WIDTH / 2,
    h = GRAPH_HEIGHT / 2;
  const left = 75,
    top = 70,
    pw = w - left - 30,
    ph = h - top - 65;
  const px = (x: number) =>
    left + ((x - plot.x.min) / (plot.x.max - plot.x.min)) * pw;
  const py = (y: number) =>
    top + ph - ((y - plot.y.min) / (plot.y.max - plot.y.min)) * ph;
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.direction = "ltr";
  ctx.fillStyle = "#173f47";
  ctx.textAlign = "left";
  ctx.font = "500 25px Arial, sans-serif";
  ctx.fillText(`y = ${expression}`, left, 37, pw);
  const xt = ticks(plot.x),
    yt = ticks(plot.y);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#e3ebee";
  for (const x of xt) line(px(x), top, px(x), top + ph);
  for (const y of yt) line(left, py(y), left + pw, py(y));
  ctx.strokeStyle = "#ccd7dc";
  ctx.strokeRect(left, top, pw, ph);
  ctx.strokeStyle = "#61777f";
  ctx.lineWidth = 1.5;
  const xAxis = clamp(py(0), top, top + ph),
    yAxis = clamp(px(0), left, left + pw);
  if (plot.y.min <= 0 && plot.y.max >= 0) line(left, xAxis, left + pw, xAxis);
  if (plot.x.min <= 0 && plot.x.max >= 0) line(yAxis, top, yAxis, top + ph);
  ctx.fillStyle = "#435c65";
  ctx.font = "21px Arial, sans-serif";
  ctx.textAlign = "center";
  for (const x of xt) ctx.fillText(tickLabel(x), px(x), top + ph + 24);
  ctx.textAlign = "right";
  for (const y of yt) ctx.fillText(tickLabel(y), left - 10, py(y) + 5);
  ctx.font = "italic 18px Arial, sans-serif";
  ctx.fillText("x", left + pw, top + ph + 48);
  ctx.fillText("y", left - 13, top - 12);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, pw, ph);
  ctx.clip();
  ctx.strokeStyle = "#126c80";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const segment of plot.segments) {
    ctx.beginPath();
    segment.forEach((p, i) => {
      // Extremely large finite values can overflow GPU path coordinates.
      const sy = clamp(py(p.y), -1e6, 1e6);
      if (i === 0) ctx.moveTo(px(p.x), sy);
      else ctx.lineTo(px(p.x), sy);
    });
    ctx.stroke();
  }
  ctx.restore();
}
export function graphPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("שמירת תמונת הגרף נכשלה. נסו שוב.")),
      "image/png",
    ),
  );
}
