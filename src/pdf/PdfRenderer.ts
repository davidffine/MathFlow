import katex from "katex";
import katexCss from "katex/dist/katex.min.css?inline";
import type { JSONContent } from "@tiptap/react";
import type {
  FlowDocument,
  PersistenceService,
} from "../persistence/PersistenceService";
import { dataUrl } from "../editor/images";
import { typesetGlyph } from "../editor/inlineMath";
export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function cleanLatex(s: string): string {
  return s
    .replace(/\\placeholder(?:\[[^\]]*\])?\{[^}]*\}/g, "")
    .replace(/(?:\^|_)\{\s*\}/g, "");
}
const align = (s: unknown) =>
  ["right", "center", "left"].includes(String(s)) ? String(s) : "start";
export async function renderPdfDocument(
  doc: FlowDocument,
  storage: PersistenceService,
): Promise<string> {
  async function node(n: JSONContent): Promise<string> {
    if (n.type === "paragraph") {
      let rendered = "";
      let boxed: JSONContent[] = [];
      async function flush() {
        if (!boxed.length) return;
        const inner = (
          await Promise.all(
            boxed.map((part) =>
              node({
                ...part,
                marks: part.marks?.filter(
                  (mark) => mark.type !== "finalAnswer",
                ),
              }),
            ),
          )
        ).join("");
        rendered += `<span class="final-answer" data-answer-scope="${boxed[0].marks?.find((mark) => mark.type === "finalAnswer")?.attrs?.scope === "line" ? "line" : "element"}">${inner}</span>`;
        boxed = [];
      }
      for (const part of n.content || []) {
        if (part.marks?.some((mark) => mark.type === "finalAnswer")) {
          const scope = (entry: JSONContent) =>
            entry.marks?.find((mark) => mark.type === "finalAnswer")?.attrs
              ?.scope || "element";
          if (boxed.length && scope(boxed[0]) !== scope(part)) await flush();
          boxed.push(part);
        } else {
          await flush();
          rendered += await node(part);
        }
      }
      await flush();
      return `<p dir="auto" style="text-align:${align(n.attrs?.textAlign)}">${rendered || "<br>"}</p>`;
    }
    const content = await Promise.all((n.content || []).map(node));
    const inner = content.join("");
    switch (n.type) {
      case "doc":
        return inner;
      case "hardBreak":
        return "<br>";
      case "text": {
        let text = escapeHtml(n.text);
        for (const m of n.marks || []) {
          if (m.type === "bold") text = `<strong>${text}</strong>`;
          else if (m.type === "italic") text = `<em>${text}</em>`;
          else if (m.type === "underline") text = `<u>${text}</u>`;
          else if (m.type === "finalAnswer")
            text = `<span class="final-answer">${text}</span>`;
          else if (m.type === "fontSize")
            text = `<span style="font-size:${Math.min(40, Math.max(12, Number(m.attrs?.size) || 18))}px">${text}</span>`;
        }
        return text;
      }
      case "mathExpression": {
        const tex = cleanLatex(String(n.attrs?.latex || ""));
        if (!tex.trim()) return "";
        let math = katex.renderToString(tex, {
          displayMode: !!n.attrs?.display,
          throwOnError: false,
          strict: "ignore",
          trust: false,
          output: "htmlAndMathml",
        });
        if (n.marks?.some((mark) => mark.type === "finalAnswer"))
          math = `<span class="final-answer">${math}</span>`;
        return `<span dir="ltr" class="${n.attrs?.display ? "math-display" : "math-inline"}">${math}</span>`;
      }
      case "mathGlyph": {
        const tex = cleanLatex(String(n.attrs?.latex || ""));
        if (!tex.trim()) return "";
        let math = escapeHtml(typesetGlyph(tex));
        for (const mark of n.marks || []) {
          if (mark.type === "finalAnswer")
            math = `<span class="final-answer">${math}</span>`;
          else if (mark.type === "bold") math = `<strong>${math}</strong>`;
          else if (mark.type === "italic") math = `<em>${math}</em>`;
          else if (mark.type === "underline") math = `<u>${math}</u>`;
          else if (mark.type === "fontSize")
            math = `<span style="font-size:${Math.min(40, Math.max(12, Number(mark.attrs?.size) || 18))}px">${math}</span>`;
        }
        return `<span class="math-glyph${tex === "\\bmod" ? " math-word-operator" : ""}">${math}</span>`;
      }
      case "image": {
        const blob = await storage.getAsset(n.attrs?.assetId);
        if (!blob)
          throw new Error("תמונה חסרה במסמך. יש להוסיף אותה מחדש לפני הייצוא.");
        const src = await dataUrl(blob);
        return `<figure style="text-align:${align(n.attrs?.align)}"><img alt="${escapeHtml(n.attrs?.alt)}" src="${src}" style="width:${Math.min(100, Math.max(20, Number(n.attrs?.width) || 70))}%"/></figure>`;
      }
      default:
        return inner;
    }
  }
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title><style>${katexCss}\n@page{size:A4;margin:18mm 19mm 20mm}*{box-sizing:border-box}body{margin:0;background:#e8eceb;color:#192a30;font-family:Arial,'Noto Sans Hebrew',sans-serif;font-size:12pt;line-height:1.8}.print-page{width:210mm;min-height:297mm;padding:18mm 19mm 20mm;margin:16px auto;background:white}h1{margin:0 0 10mm;font-size:21pt;line-height:1.3;font-weight:600;overflow-wrap:anywhere}p{margin:0 0 4mm;white-space:pre-wrap;overflow-wrap:break-word;orphans:3;widows:3}strong{font-weight:700}.math-inline{direction:ltr;unicode-bidi:isolate;display:inline-block;max-width:100%;vertical-align:baseline}.math-glyph{direction:inherit;unicode-bidi:normal;font:inherit;white-space:pre}.math-word-operator{margin-inline:.22em;font-style:normal}.math-display{display:block;text-align:center;direction:ltr;unicode-bidi:isolate;max-width:100%;margin:5mm 0;break-inside:avoid}.katex{font-size:1.16em}.katex-display{margin:0}.final-answer{border:1.2pt solid #192a30;padding:1mm 2mm;box-decoration-break:clone;-webkit-box-decoration-break:clone}figure{margin:5mm 0;break-inside:avoid}img{max-width:100%;max-height:240mm;object-fit:contain;height:auto}@media screen{body{width:834px;margin:0 auto;zoom:var(--preview-scale,1)}}@media print{body{background:white;width:auto;zoom:1}.print-page{width:auto;min-height:0;margin:0;padding:0}}</style></head><body><article class="print-page"><h1 dir="auto">${escapeHtml(doc.title)}</h1>${await node(doc.content)}</article></body></html>`;
}
