import type { EditorState } from "@tiptap/pm/state";
import type { Node as DocumentNode } from "@tiptap/pm/model";
import {
  answerElement,
  answerLine,
  type AnswerRange,
  type MathAnswerContext,
} from "./finalAnswer";
import {
  boxAtCursor,
  boxMathRange,
  removeMathAnswer,
} from "../math/finalAnswer";
import {
  editableState,
  latex,
  locate,
  uid,
  type MathState,
  type Sequence,
} from "../math/model";

export interface ElementInterval {
  start: number;
  end: number;
}

export function rangeHandleAtPoint(
  startX: number,
  endX: number,
  x: number,
  y: number,
  top: number,
): "start" | "end" {
  const tight = endX - startX < 44;
  const startY = top + (tight ? 11 : 22);
  const endY = top + (tight ? 33 : 22);
  return Math.hypot(x - startX, y - startY) <= Math.hypot(x - endX, y - endY)
    ? "start"
    : "end";
}
interface RowElement {
  position: number;
  from: number;
  to: number;
  seqId?: string;
}
interface FormulaSource {
  position: number;
  id: string;
  state: MathState;
  boxIds: { box: string; body: string };
}
export interface AnswerRangeModel {
  id: string;
  line: AnswerRange;
  elements: RowElement[];
  formulas: FormulaSource[];
  initial: ElementInterval;
  anchor: number;
  anchorFormula?: string;
  anchorSeq?: string;
}

// The axis counts semantic elements, never pixels or UTF-16 offsets. Numbers
// remain one unit; structures remain atomic in their containing sequence.
function sequenceElements(seq: Sequence, position: number): RowElement[] {
  const elements: RowElement[] = [];
  for (let i = 0; i < seq.items.length; i++) {
    const from = i;
    const number = (index: number) => {
      const n = seq.items[index];
      return n?.kind === "token" && /^[0-9.]$/.test(n.latex);
    };
    if (number(i)) while (number(i + 1)) i++;
    elements.push({ position, seqId: seq.id, from, to: i + 1 });
  }
  return elements;
}

export function createAnswerRangeModel(
  state: EditorState,
  math?: MathAnswerContext | null,
): AnswerRangeModel | null {
  const anchor = math?.position ?? state.selection.head;
  const line = answerLine(state.doc, anchor);
  const elements: RowElement[] = [],
    formulas: FormulaSource[] = [];
  const box = math ? boxAtCursor(math.state) : null;
  const clean = math ? removeMathAnswer(math.state) : null;
  const seqId = box?.location.seq.id ?? clean?.cursor.seqId;
  const loc = clean && seqId ? locate(clean.root, seqId) : null;
  // A denominator/exponent is its own writing row. A root sequence shares
  // the document row with adjacent text, rather than becoming a UI block.
  const local = loc?.parent && loc.seq.items.length ? loc : null;
  const formulaSource = (
    node: DocumentNode,
    position: number,
  ): FormulaSource => ({
    position,
    id: node.attrs.id,
    state:
      math?.position === position && clean
        ? clean
        : editableState(node.attrs.tree),
    boxIds: { box: uid(), body: uid() },
  });
  if (local && math) {
    const node = state.doc.nodeAt(math.position)!;
    formulas.push(formulaSource(node, math.position));
    elements.push(...sequenceElements(local.seq, math.position));
  } else {
    const text = state.doc.textBetween(line.from, line.to, "", "\ufffc");
    for (const match of text.matchAll(/[\p{L}\p{N}\p{M}_]+|[^\s\ufffc]/gu)) {
      elements.push({
        position: line.from + match.index,
        from: line.from + match.index,
        to: line.from + match.index + match[0].length,
      });
    }
    state.doc.nodesBetween(line.from, line.to, (node, position) => {
      if (node.isText || !node.isInline) return;
      if (node.type.name === "mathExpression") {
        const source = formulaSource(node, position);
        formulas.push(source);
        elements.push(...sequenceElements(source.state.root, position));
      } else if (node.type.name !== "hardBreak") {
        elements.push({
          position,
          from: position,
          to: position + node.nodeSize,
        });
      }
      return false;
    });
    elements.sort((a, b) => a.position - b.position || a.from - b.from);
  }
  if (!elements.length) return null;
  const chosen: number[] = [];
  const target = answerElement(state);
  elements.forEach((element, index) => {
    if (math && element.position === math.position && box) {
      if (
        element.seqId === box.location.seq.id &&
        element.from < box.index + box.box.body.items.length &&
        element.to > box.index
      )
        chosen.push(index);
    } else if (!element.seqId) {
      if (
        state.doc.rangeHasMark(
          element.from,
          element.to,
          state.schema.marks.finalAnswer,
        )
      )
        chosen.push(index);
    } else if (
      state.doc
        .nodeAt(element.position)
        ?.marks.some((mark) => mark.type.name === "finalAnswer")
    )
      chosen.push(index);
  });
  if (!chosen.length) {
    let index = elements.findIndex((element) =>
      math
        ? element.position === math.position &&
          element.seqId === seqId &&
          element.from <= (clean?.cursor.index ?? 0) &&
          element.to >= (clean?.cursor.index ?? 0)
        : !!target && element.from < target.to && element.to > target.from,
    );
    if (index < 0) index = 0;
    chosen.push(index);
  }
  return {
    id: uid(),
    line,
    elements,
    formulas,
    initial: { start: chosen[0], end: chosen.at(-1)! + 1 },
    anchor,
    anchorFormula: local ? formulas[0].id : undefined,
    anchorSeq: local ? local.seq.id : undefined,
  };
}

export function normalizeInterval(
  value: ElementInterval,
  count: number,
): ElementInterval {
  const start = Math.max(0, Math.min(count - 1, Math.round(value.start)));
  return {
    start,
    end: Math.max(start + 1, Math.min(count, Math.round(value.end))),
  };
}
export function intervalAtX(
  value: ElementInterval,
  handle: "start" | "end",
  x: number,
  left: number,
  width: number,
  count: number,
): ElementInterval {
  const step = Math.round(
    Math.max(0, Math.min(1, (x - left) / Math.max(1, width))) * count,
  );
  return handle === "start"
    ? normalizeInterval(
        { start: Math.min(step, value.end - 1), end: value.end },
        count,
      )
    : normalizeInterval(
        { start: value.start, end: Math.max(step, value.start + 1) },
        count,
      );
}

// Rebuild each preview from the unboxed snapshot, so changing direction never
// nests frames or changes the axis length. Document positions stay unchanged.
export function answerRangeTransaction(
  state: EditorState,
  model: AnswerRangeModel,
  value: ElementInterval | null,
) {
  const interval = value && normalizeInterval(value, model.elements.length);
  const selected = interval
    ? model.elements.slice(interval.start, interval.end)
    : [];
  const tr = state.tr;
  const mark = state.schema.marks.finalAnswer;
  if (!model.anchorSeq) tr.removeMark(model.line.from, model.line.to, mark);
  const mathStates = new Map<string, MathState>();
  for (const source of model.formulas) {
    const range = selected.filter(
      (element) => element.position === source.position && element.seqId,
    );
    const updated = range.length
      ? boxMathRange(
          source.state,
          range[0].seqId!,
          range[0].from,
          range.at(-1)!.to,
          source.boxIds,
        )
      : structuredClone(source.state);
    const node = tr.doc.nodeAt(source.position);
    if (!node || node.attrs.id !== source.id) return null;
    tr.setNodeMarkup(source.position, undefined, {
      ...node.attrs,
      tree: updated.root,
      latex: latex(updated.root),
    });
    mathStates.set(source.id, updated);
  }
  let textRange: AnswerRange | null = null;
  const flush = () => {
    if (textRange)
      tr.addMark(
        textRange.from,
        textRange.to,
        mark.create({ scope: "element" }),
      );
    textRange = null;
  };
  for (const element of selected) {
    if (element.seqId) {
      flush();
      continue;
    }
    textRange = textRange
      ? { from: textRange.from, to: element.to }
      : { from: element.from, to: element.to };
  }
  flush();
  tr.setStoredMarks(null);
  return { transaction: tr, mathStates };
}
