import type { Node as DocumentNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { latex, type MathState } from "../math/model";
import {
  boxMathElement,
  mathAnswerOn,
  removeMathAnswer,
} from "../math/finalAnswer";

export type FinalAnswerMode = "off" | "line" | "element";
export const nextAnswerMode = (mode: FinalAnswerMode): FinalAnswerMode =>
  ({ off: "line", line: "element", element: "off" })[mode] as FinalAnswerMode;
export const answerModeLabel: Record<FinalAnswerMode, string> = {
  off: "כבוי",
  line: "כל השורה",
  element: "האלמנט הנוכחי",
};
export interface AnswerRange {
  from: number;
  to: number;
}

// A writing line ends at Enter/Shift+Enter. Screen-width wrapping does not
// change the saved scope or the PDF result.
export function answerLine(doc: DocumentNode, position: number): AnswerRange {
  const pos = doc.resolve(position);
  if (!pos.parent.inlineContent) return { from: position, to: position };
  let from = pos.start(),
    to = pos.end();
  pos.parent.forEach((node, offset) => {
    if (node.type.name !== "hardBreak") return;
    const breakPos = pos.start() + offset;
    if (breakPos < position) from = breakPos + 1;
    else if (breakPos < to) to = breakPos;
  });
  return { from, to };
}

export function answerElement(state: EditorState): AnswerRange | null {
  const { selection, doc } = state;
  if (!selection.empty) return { from: selection.from, to: selection.to };
  const pos = selection.$head;
  if (!pos.parent.inlineContent) return null;
  const before = pos.nodeBefore,
    after = pos.nodeAfter;
  // An inline formula/symbol is one semantic element in the document.
  if (before && !before.isText && before.type.name !== "hardBreak")
    return { from: selection.head - before.nodeSize, to: selection.head };
  if (after && !after.isText && after.type.name !== "hardBreak")
    return { from: selection.head, to: selection.head + after.nodeSize };
  const line = answerLine(doc, selection.head);
  const text = doc.textBetween(line.from, line.to, "", "\ufffc");
  const offset = selection.head - line.from;
  for (const match of text.matchAll(/[\p{L}\p{N}\p{M}_]+/gu)) {
    if (match.index <= offset && match.index + match[0].length >= offset)
      return {
        from: line.from + match.index,
        to: line.from + match.index + match[0].length,
      };
  }
  if (before?.isText) {
    const char = Array.from(before.text || "").at(-1) || "";
    if (char.trim())
      return { from: selection.head - char.length, to: selection.head };
  }
  return null;
}

export function answerMarkMode(
  doc: DocumentNode,
  range: AnswerRange,
): FinalAnswerMode {
  let line = false,
    element = false;
  if (range.to > range.from)
    doc.nodesBetween(range.from, range.to, (node) => {
      for (const mark of node.marks) {
        if (mark.type.name !== "finalAnswer") continue;
        if (mark.attrs.scope === "line") line = true;
        else element = true;
      }
    });
  return line ? "line" : element ? "element" : "off";
}

export interface MathAnswerContext {
  position: number;
  state: MathState;
}
export function currentAnswerMode(
  state: EditorState,
  math?: MathAnswerContext | null,
): FinalAnswerMode {
  const line = answerLine(state.doc, math?.position ?? state.selection.head);
  if (answerMarkMode(state.doc, line) === "line") return "line";
  if (math && mathAnswerOn(math.state)) return "element";
  const element = math
    ? { from: math.position, to: math.position + 1 }
    : answerElement(state);
  return element && answerMarkMode(state.doc, element) === "element"
    ? "element"
    : "off";
}

// One document transaction per transition, including any structural boxing.
// This keeps undo atomic and avoids a frame disappearing in one undo step
// while its replacement needs a second step.
export function finalAnswerTransaction(
  state: EditorState,
  next: FinalAnswerMode,
  math?: MathAnswerContext | null,
): { transaction: Transaction; mathState: MathState | null } | null {
  const line = answerLine(state.doc, math?.position ?? state.selection.head);
  if (line.from === line.to) return null;
  const mark = state.schema.marks.finalAnswer;
  const tr = state.tr;
  const target = math
    ? { from: math.position, to: math.position + 1 }
    : answerElement(state);
  if (next !== "off" || currentAnswerMode(state, math) === "line")
    tr.removeMark(line.from, line.to, mark);
  else if (target) tr.removeMark(target.from, target.to, mark);
  let updated: MathState | null = null;
  if (math) {
    updated =
      next === "element"
        ? boxMathElement(math.state)
        : removeMathAnswer(math.state);
    const node = tr.doc.nodeAt(math.position)!;
    tr.setNodeMarkup(math.position, undefined, {
      ...node.attrs,
      tree: updated.root,
      latex: latex(updated.root),
    });
  }
  if (next === "line")
    tr.addMark(line.from, line.to, mark.create({ scope: "line" }));
  else if (next === "element" && !updated && target)
    tr.addMark(target.from, target.to, mark.create({ scope: "element" }));
  tr.setStoredMarks(null);
  return { transaction: tr, mathState: updated };
}
