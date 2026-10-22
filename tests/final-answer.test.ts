import { describe, expect, it } from "vitest";
import { Schema, type Node as DocumentNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import {
  answerElement,
  answerLine,
  currentAnswerMode,
  finalAnswerTransaction,
  nextAnswerMode,
  type MathAnswerContext,
} from "../src/editor/finalAnswer";
import { boxMathElement, removeMathAnswer } from "../src/math/finalAnswer";
import { emptyMath, latex, locate, type MathState } from "../src/math/model";
import { reduceMath } from "../src/navigation/SmartNextEngine";
import { HistoryService } from "../src/persistence/HistoryService";
import { renderPdfDocument } from "../src/pdf/PdfRenderer";
import type {
  FlowDocument,
  PersistenceService,
} from "../src/persistence/PersistenceService";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinalAnswerToggle } from "../src/editor/FinalAnswerToggle";

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
const paragraph = (...nodes: DocumentNode[]) =>
  schema.node("paragraph", null, nodes);
const text = (value: string) => schema.text(value);
function documentState(value: string, position: number) {
  const doc = schema.node("doc", null, [paragraph(text(value))]);
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, position),
  });
}
function cycle(state: EditorState, context?: MathAnswerContext) {
  const next = nextAnswerMode(currentAnswerMode(state, context));
  const result = finalAnswerTransaction(state, next, context)!;
  return {
    state: state.apply(result.transaction),
    context:
      context && result.mathState
        ? { ...context, state: result.mathState }
        : context,
  };
}
const input = (s: MathState, value: string) =>
  reduceMath(s, { type: "input", latex: value }).state;
const next = (s: MathState) => reduceMath(s, { type: "next" }).state;
function mathDocument(math: MathState) {
  const expr = schema.nodes.mathExpression.create({
    id: "formula",
    tree: math.root,
    latex: latex(math.root),
  });
  const doc = schema.node("doc", null, [
    paragraph(text("נתון "), expr, text(" ולכן")),
    paragraph(text("שורה אחרת")),
  ]);
  // Deliberately keep the document caret elsewhere: a tap inside math owns its
  // own context, so it must never format the stale document caret's row.
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, doc.content.size - 2),
  });
  return { state, context: { position: 6, state: math } };
}
function marks(state: EditorState) {
  const result: { from: number; to: number; scope: string }[] = [];
  state.doc.descendants((node, pos) => {
    const mark = node.marks.find((m) => m.type.name === "finalAnswer");
    if (mark)
      result.push({
        from: pos,
        to: pos + node.nodeSize,
        scope: mark.attrs.scope,
      });
  });
  return result;
}
async function pdf(state: EditorState) {
  const doc: FlowDocument = {
    schemaVersion: 1,
    id: "answer-test",
    title: "תשובה",
    updatedAt: 1,
    content: state.doc.toJSON(),
  };
  return renderPdfDocument(doc, {} as PersistenceService);
}

describe("three final-answer scopes", () => {
  it("cycles off → line → current Hebrew word → off without moving the caret", () => {
    const original = documentState("פתרון נכון בהחלט", 9);
    let { state } = cycle(original);
    expect(currentAnswerMode(state)).toBe("line");
    expect(marks(state)).toEqual([{ from: 1, to: 17, scope: "line" }]);
    state = cycle(state).state;
    expect(currentAnswerMode(state)).toBe("element");
    expect(marks(state)).toEqual([{ from: 7, to: 11, scope: "element" }]);
    state = cycle(state).state;
    expect(currentAnswerMode(state)).toBe("off");
    expect(state.doc.toJSON()).toEqual(original.doc.toJSON());
    expect(state.selection.from).toBe(9);
  });
  it("uses a whole existing text selection for element scope", () => {
    let state = documentState("one two three", 5);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 5, 14)),
    );
    state = cycle(state).state;
    state = cycle(state).state;
    expect(marks(state).map((m) => [m.from, m.to, m.scope])).toEqual([
      [5, 14, "element"],
    ]);
  });
  it("separates Shift+Enter writing lines instead of boxing the whole paragraph", () => {
    const doc = schema.node("doc", null, [
      paragraph(text("first"), schema.nodes.hardBreak.create(), text("second")),
    ]);
    const original = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 9),
    });
    expect(answerLine(doc, 9)).toEqual({ from: 7, to: 13 });
    expect(marks(cycle(original).state)).toEqual([
      { from: 7, to: 13, scope: "line" },
    ]);
  });
  it("finds one word across bold formatting boundaries", () => {
    const doc = schema.node("doc", null, [
      paragraph(
        text("ab"),
        schema.text("cd", [schema.marks.bold.create()]),
        text(" ef"),
      ),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 4),
    });
    expect(answerElement(state)).toEqual({ from: 1, to: 5 });
  });
  it("targets a mathematical glyph as an element in mixed text", () => {
    const glyph = schema.nodes.mathGlyph.create({ latex: "x", glyph: "x" });
    const doc = schema.node("doc", null, [
      paragraph(text("a"), glyph, text("b")),
    ]);
    const original = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });
    let state = cycle(original).state;
    state = cycle(state).state;
    expect(marks(state)).toEqual([{ from: 2, to: 3, scope: "element" }]);
  });
  it("switches the entire mixed row to only the current fraction, then removes its box", () => {
    let math = reduceMath(emptyMath(), {
      type: "structure",
      kind: "fraction",
    }).state;
    math = next(input(next(input(math, "1")), "2"));
    const original = mathDocument(math);
    let session = cycle(original.state, original.context);
    expect(currentAnswerMode(session.state, session.context)).toBe("line");
    expect(
      marks(session.state).every(
        (m) => m.to <= session.state.doc.child(0).nodeSize,
      ),
    ).toBe(true);
    session = cycle(session.state, session.context);
    expect(currentAnswerMode(session.state, session.context)).toBe("element");
    expect(marks(session.state)).toEqual([]);
    expect(latex(session.context!.state.root).replace(/\s/g, "")).toBe(
      "\\boxed{\\frac{1}{2}}",
    );
    session = cycle(session.state, session.context);
    expect(currentAnswerMode(session.state, session.context)).toBe("off");
    expect(session.state.doc.toJSON()).toEqual(original.state.doc.toJSON());
  });
  it("boxes a whole number inside a denominator and restores its cursor when unboxed", () => {
    let state = reduceMath(emptyMath(), {
      type: "structure",
      kind: "fraction",
    }).state;
    state = input(input(next(input(state, "1")), "2"), "5");
    const boxed = boxMathElement(state);
    expect(latex(boxed.root).replace(/\s/g, "")).toBe("\\frac{1}{\\boxed{25}}");
    const restored = removeMathAnswer(boxed);
    expect(restored.cursor).toEqual(state.cursor);
    expect(latex(restored.root)).toBe(latex(state.root));
    expect(locate(restored.root, restored.cursor.seqId)).not.toBeNull();
  });
  it("boxes the surrounding structure in an empty slot without leaving empty boxes", () => {
    const state = reduceMath(input(emptyMath(), "x"), { type: "next" }).state;
    const boxed = boxMathElement(state);
    expect(latex(boxed.root)).toBe("\\boxed{{x}}");
    expect(boxed.cursor).toEqual(state.cursor);
    expect(removeMathAnswer(boxed).root).toEqual(state.root);
  });
  it("preserves each scope through saved JSON and one-step undo/redo", () => {
    let state = documentState("answer 42", 9);
    const history = new HistoryService(state.doc.toJSON());
    for (const scope of ["line", "element", "off"] as const) {
      state = cycle(state).state;
      history.record(state.doc.toJSON(), "final-answer");
      const restored = schema.nodeFromJSON(
        JSON.parse(JSON.stringify(state.doc.toJSON())),
      );
      expect(
        currentAnswerMode(
          EditorState.create({
            doc: restored,
            selection: TextSelection.create(restored, 9),
          }),
        ),
      ).toBe(scope);
    }
    const undo = history.undo()!;
    expect(
      undo.content[0].content.some((n: any) =>
        n.marks?.some((m: any) => m.attrs?.scope === "element"),
      ),
    ).toBe(true);
    expect(history.redo()).toEqual(state.doc.toJSON());
  });
  it("exports the selected scope and removes frames after Off", async () => {
    const original = documentState("פתרון נכון בהחלט", 9);
    let state = cycle(original).state;
    const wholeRow = await pdf(state);
    expect(wholeRow).toContain('data-answer-scope="line"');
    expect(wholeRow).toContain("פתרון נכון בהחלט");
    state = cycle(state).state;
    const element = await pdf(state);
    expect(element).toContain('data-answer-scope="element">נכון</span>');
    expect(element).not.toContain('data-answer-scope="line"');
    state = cycle(state).state;
    expect(await pdf(state)).not.toContain('class="final-answer"');
  });
  it("exposes all three states clearly on the same toggle", () => {
    for (const mode of ["off", "line", "element"] as const) {
      const html = renderToStaticMarkup(
        createElement(FinalAnswerToggle, { mode, onClick: () => {} }),
      );
      expect(html).toContain(`data-answer-mode="${mode}"`);
      expect(html).toContain(`aria-pressed="${mode !== "off"}"`);
      expect(html).toContain("תשובה סופית:");
    }
  });
});
