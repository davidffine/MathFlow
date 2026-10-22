import { describe, expect, it } from "vitest";
import { Schema, type Node as DocumentNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import {
  createAnswerRangeModel,
  answerRangeTransaction,
  intervalAtX,
  normalizeInterval,
} from "../src/editor/answerRange";
import { finalAnswerTransaction } from "../src/editor/finalAnswer";
import { emptyMath, latex, locate, type MathState } from "../src/math/model";
import { boxMathElement } from "../src/math/finalAnswer";
import { reduceMath } from "../src/navigation/SmartNextEngine";
import { HistoryService } from "../src/persistence/HistoryService";
import { renderPdfDocument } from "../src/pdf/PdfRenderer";
import type {
  FlowDocument,
  PersistenceService,
} from "../src/persistence/PersistenceService";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*" },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline" },
    mathGlyph: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: { latex: {}, glyph: {} },
    },
    mathExpression: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: { id: {}, latex: {}, tree: {}, display: { default: false } },
    },
  },
  marks: {
    finalAnswer: { attrs: { scope: { default: "element" } } },
    bold: {},
  },
});
const text = (value: string) => schema.text(value);
function state(nodes: DocumentNode[], position = 1) {
  const doc = schema.node("doc", null, schema.node("paragraph", null, nodes));
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, position),
  });
}
const input = (s: MathState, value: string) =>
  reduceMath(s, { type: "input", latex: value }).state;
const mathNode = (s: MathState) =>
  schema.nodes.mathExpression.create({
    id: "f",
    tree: s.root,
    latex: latex(s.root),
  });
const apply = (
  s: EditorState,
  model: NonNullable<ReturnType<typeof createAnswerRangeModel>>,
  start: number,
  end: number,
) => s.apply(answerRangeTransaction(s, model, { start, end })!.transaction);
const markedText = (s: EditorState) => {
  let value = "";
  s.doc.descendants((node) => {
    if (
      node.isText &&
      node.marks.some((mark) => mark.type.name === "finalAnswer")
    )
      value += node.text;
  });
  return value;
};

describe("floating answer range", () => {
  it("maps exactly 0–100% to all N elements and clamps both handles without crossing", () => {
    const value = { start: 0, end: 10 };
    expect(intervalAtX(value, "end", 260, 20, 240, 10)).toEqual(value);
    expect(intervalAtX(value, "end", 140, 20, 240, 10)).toEqual({
      start: 0,
      end: 5,
    });
    expect(intervalAtX(value, "start", -10, 20, 240, 10)).toEqual(value);
    expect(intervalAtX(value, "start", 500, 20, 240, 10)).toEqual({
      start: 9,
      end: 10,
    });
    expect(intervalAtX({ start: 4, end: 8 }, "end", -30, 20, 240, 10)).toEqual({
      start: 4,
      end: 5,
    });
    expect(normalizeInterval({ start: 99, end: -8 }, 1)).toEqual({
      start: 0,
      end: 1,
    });
  });
  it("counts Hebrew words across bold boundaries, mathematical symbols, and surrogate characters without counting spaces", () => {
    const s = state(
      [
        text("מא"),
        schema.text("חר", [schema.marks.bold.create()]),
        text(" ש־"),
        schema.nodes.mathGlyph.create({ latex: "=", glyph: "=" }),
        text(" 25 🙂"),
      ],
      3,
    );
    const boxed = s.apply(finalAnswerTransaction(s, "element")!.transaction);
    const model = createAnswerRangeModel(boxed)!;
    expect(model.elements).toHaveLength(6); // מאחר, ש, ־, =, 25, 🙂 (punctuation counted explicitly)
    expect(model.initial).toEqual({ start: 0, end: 1 });
    const selected = apply(boxed, model, 0, model.elements.length);
    expect(markedText(selected)).toBe("מאחר ש־ 25 🙂");
    expect(selected.selection.head).toBe(3);
    expect(
      selected.doc.nodeAt(3)?.marks.some((m) => m.type.name === "bold"),
    ).toBe(true);
  });
  it("stops at Shift+Enter and keeps other writing rows untouched", () => {
    const s = state(
      [text("a b"), schema.nodes.hardBreak.create(), text("c d")],
      6,
    );
    const model = createAnswerRangeModel(s)!;
    expect(model.elements).toHaveLength(2);
    expect(model.line).toEqual({ from: 5, to: 8 });
    expect(markedText(apply(s, model, 0, 2))).toBe("c d");
  });
  it("combines adjacent document text and root math elements on a single axis", () => {
    let math = input(input(input(emptyMath(), "x"), "+"), "2");
    math = boxMathElement(math);
    const s = state([text("נתון "), mathNode(math), text(" ולכן")]);
    const model = createAnswerRangeModel(s, { position: 6, state: math })!;
    expect(model.elements).toHaveLength(5);
    expect(model.initial).toEqual({ start: 3, end: 4 });
    const result = answerRangeTransaction(s, model, { start: 0, end: 5 })!;
    const selected = s.apply(result.transaction);
    expect(markedText(selected)).toBe("נתוןולכן");
    expect(latex(result.mathStates.get("f")!.root)).toBe("\\boxed{x + 2}");
    expect(selected.doc.nodeAt(6)?.attrs.latex).toBe("\\boxed{x + 2}");
  });
  it("allows contraction, reversal and a full-axis selection without nesting boxes or changing the element count", () => {
    const math = boxMathElement(
      input(input(input(emptyMath(), "x"), "+"), "2"),
    );
    const s = state([mathNode(math)]);
    const model = createAnswerRangeModel(s, { position: 1, state: math })!;
    let selected = apply(s, model, 0, 3);
    expect(selected.doc.nodeAt(1)?.attrs.latex).toBe("\\boxed{x + 2}");
    selected = apply(selected, model, 0, 1);
    expect(selected.doc.nodeAt(1)?.attrs.latex).toBe("\\boxed{x} + 2");
    selected = apply(selected, model, 2, 3);
    expect(selected.doc.nodeAt(1)?.attrs.latex).toBe("x + \\boxed{2}");
    expect(model.elements).toHaveLength(3);
    const cleared = selected.apply(
      answerRangeTransaction(selected, model, null)!.transaction,
    );
    expect(cleared.doc.nodeAt(1)?.attrs.latex).toBe("x + 2");
  });
  it("treats a number and a fraction as semantic units rather than their glyph widths", () => {
    let math = input(input(emptyMath(), "2"), "5");
    math = reduceMath(math, { type: "structure", kind: "fraction" }).state;
    math = input(math, "x");
    math = reduceMath(math, { type: "next" }).state;
    math = input(math, "3");
    math = reduceMath(math, { type: "next" }).state;
    math = boxMathElement(math);
    const s = state([mathNode(math)]);
    const model = createAnswerRangeModel(s, { position: 1, state: math })!;
    // Fraction insertion may use the preceding operand as numerator; it is
    // still one structure on the containing row.
    expect(model.elements.filter((e) => e.seqId)).toHaveLength(2);
  });
  it("uses the denominator row locally and preserves the numerator and cursor when its range changes", () => {
    let math = reduceMath(emptyMath(), {
      type: "structure",
      kind: "fraction",
    }).state;
    math = input(math, "a");
    math = reduceMath(math, { type: "next" }).state;
    math = input(input(input(math, "2"), "5"), "+");
    math = input(math, "x");
    const denominator = math.cursor.seqId;
    math = boxMathElement(math);
    const s = state([text("נתון "), mathNode(math), text(" ולכן")]);
    const model = createAnswerRangeModel(s, { position: 6, state: math })!;
    expect(model.elements).toHaveLength(3);
    expect(model.anchorSeq).toBe(denominator);
    const result = answerRangeTransaction(s, model, { start: 0, end: 3 })!;
    const selected = result.mathStates.get("f")!;
    expect(latex(selected.root)).toBe("\\frac{a}{\\boxed{2 5 + x}}");
    expect(locate(selected.root, selected.cursor.seqId)).not.toBeNull();
    const cleared = answerRangeTransaction(
      s.apply(result.transaction),
      model,
      null,
    )!.mathStates.get("f")!;
    expect(latex(cleared.root)).toBe("\\frac{a}{2 5 + x}");
    expect(cleared.cursor.seqId).toBe(denominator);
    expect(cleared.cursor.index).toBe(4);
  });
  it("records a slow multi-preview drag as one semantic undo, while separate drags stay separate", () => {
    const s = state([text("a b c")]);
    const model = createAnswerRangeModel(s)!;
    const history = new HistoryService(s.doc.toJSON());
    history.beginGesture("format:answer-range");
    let selected = apply(s, model, 0, 1);
    history.record(selected.doc.toJSON(), "format:answer-range", 0);
    selected = apply(selected, model, 0, 2);
    history.record(selected.doc.toJSON(), "format:answer-range", 5000);
    selected = apply(selected, model, 0, 3);
    history.record(selected.doc.toJSON(), "format:answer-range", 9000);
    history.endGesture();
    expect(history.undo()).toEqual(s.doc.toJSON());
    expect(history.redo()).toEqual(selected.doc.toJSON());
    history.beginGesture("format:answer-range");
    const contracted = apply(selected, model, 1, 2);
    history.record(contracted.doc.toJSON(), "format:answer-range", 9001);
    history.endGesture();
    expect(history.undo()).toEqual(selected.doc.toJSON());
  });
  it("persists the chosen range and renders semantic math boxes in PDF without slider controls", async () => {
    const math = boxMathElement(
      input(input(input(emptyMath(), "x"), "+"), "2"),
    );
    const s = state([mathNode(math)]);
    const model = createAnswerRangeModel(s, { position: 1, state: math })!;
    const selected = apply(s, model, 0, 3);
    const saved = JSON.parse(JSON.stringify(selected.doc.toJSON()));
    expect(schema.nodeFromJSON(saved).nodeAt(1)?.attrs.latex).toBe(
      "\\boxed{x + 2}",
    );
    const doc = {
      schemaVersion: 1,
      id: "test",
      title: "טווח",
      updatedAt: 0,
      content: saved,
    } as FlowDocument;
    const html = await renderPdfDocument(doc, {
      image: async () => undefined,
    } as unknown as PersistenceService);
    expect(html).toContain("katex");
    expect(html).not.toContain("answer-range-panel");
    expect(html).not.toContain('role="slider"');
  });
});
