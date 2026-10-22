import { convertLatexToMarkup } from "mathlive/ssr";
import { type MathNode, type MathState, type Sequence } from "./model";
const wrap = (s: string, seq: string, index: number, extra = "") =>
  `\\htmlData{flowseq=${seq},flowindex=${index}${extra}}{${s}}`;
// Decorations exist only in this renderer. They never enter authoritative LaTeX or PDF.
export function editingLatex(state: MathState, active: boolean): string {
  function renderSeq(seq: Sequence): string {
    let result = "";
    for (let i = 0; i <= seq.items.length; i++) {
      if (active && state.cursor.seqId === seq.id && state.cursor.index === i)
        result += wrap(
          "\\htmlClass{flow-caret}{\\rlap{\\vphantom{X}\\vert}}",
          seq.id,
          i,
          ",flowcaret=true",
        );
      if (i === seq.items.length) break;
      let val = renderNode(seq.items[i], seq.id, i);
      if (
        state.selection?.seqId === seq.id &&
        i >= state.selection.from &&
        i < state.selection.to
      )
        val = `\\htmlClass{flow-selected}{${val}}`;
      result += wrap(val, seq.id, i) + " ";
    }
    // Empty fields retain a real, invisible target without persisting a square
    // placeholder. Slot metadata belongs only to the editing renderer.
    const content =
      result +
      (!seq.items.length
        ? "\\htmlClass{flow-empty-slot}{\\vphantom{X}\\kern{0.55em}}"
        : "");
    return `\\htmlData{flowslot=${seq.id}}{${content}}`;
  }
  function renderNode(n: MathNode, seqId: string, index: number): string {
    switch (n.kind) {
      case "token":
        return n.latex;
      case "fraction":
        return `\\frac{${renderSeq(n.numerator)}}{${renderSeq(n.denominator)}}`;
      case "root":
        return `\\sqrt{${renderSeq(n.body)}}`;
      case "group":
        return n.delimiter === "paren"
          ? `\\left(${renderSeq(n.body)}\\right)`
          : n.delimiter === "square"
            ? `\\left[${renderSeq(n.body)}\\right]`
            : `\\left|${renderSeq(n.body)}\\right|`;
      case "box":
        return `\\boxed{${renderSeq(n.body)}}`;
      case "script": {
        const showSup =
            n.sup.items.length || (active && state.cursor.seqId === n.sup.id),
          showSub =
            n.sub.items.length || (active && state.cursor.seqId === n.sub.id);
        const base = wrap(
          renderNode(n.base, seqId, index),
          seqId,
          index,
          ",flowbase=true",
        );
        return `{${base}}${showSub ? `_{${renderSeq(n.sub)}}` : ""}${showSup ? `^{${renderSeq(n.sup)}}` : ""}`;
      }
    }
  }
  return renderSeq(state.root) || "\\vphantom{X}\\,";
}
export function renderMath(state: MathState, active = false): string {
  return convertLatexToMarkup(editingLatex(state, active), {
    defaultMode: "math",
  });
}
