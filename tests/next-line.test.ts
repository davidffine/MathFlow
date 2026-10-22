import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { emptyMath, latex, type MathState } from "../src/math/model";
import { nextHint } from "../src/context/KeyboardContextEngine";
import {
  nextWillInsertLine,
  reduceMath,
  type MathAction,
} from "../src/navigation/SmartNextEngine";
import { nextLineTransaction } from "../src/editor/nextLine";
import { HistoryService } from "../src/persistence/HistoryService";

const input = (latex: string): MathAction => ({ type: "input", latex });
const next: MathAction = { type: "next" };
function write(...actions: MathAction[]): MathState {
  return actions.reduce(
    (state, action) => reduceMath(state, action).state,
    emptyMath(),
  );
}
const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
    mathExpression: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: { latex: { default: "" } },
    },
    mathGlyph: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: { latex: { default: "" } },
    },
  },
});

describe("NEXT at the document boundary", () => {
  it("still prioritizes exponent, index and structural exit", () => {
    const base = write(input("x"));
    expect(nextWillInsertLine(base)).toBe(false);
    const exponent = reduceMath(base, next).state;
    expect(nextWillInsertLine(exponent)).toBe(false);
    const index = reduceMath(
      reduceMath(exponent, input("2")).state,
      next,
    ).state;
    expect(nextWillInsertLine(index)).toBe(false);
    const exited = reduceMath(index, next).state;
    expect(nextWillInsertLine(exited)).toBe(true);
    expect(nextHint(exited)).toContain("שורה חדשה");
    expect(latex(exited.root)).toContain("^{2}");
  });
  it("moves numerator → denominator → outside before starting a new line", () => {
    const numerator = write(
      { type: "structure", kind: "fraction" },
      input("1"),
    );
    expect(nextWillInsertLine(numerator)).toBe(false);
    const denominator = reduceMath(numerator, next).state;
    expect(nextWillInsertLine(denominator)).toBe(false);
    const outside = reduceMath(
      reduceMath(denominator, input("2")).state,
      next,
    ).state;
    expect(nextWillInsertLine(outside)).toBe(true);
    expect(latex(outside.root)).toBe("\\frac{1}{2}");
  });
  it("offers a line after a relation or on an empty math line", () => {
    expect(nextWillInsertLine(emptyMath())).toBe(true);
    const relation = write(input("x"), input("="));
    expect(nextWillInsertLine(relation)).toBe(true);
    expect(reduceMath(relation, next).miss).toBe(true);
  });
  it("splits immediately after an inline formula, preserving following text", () => {
    const first = schema.text("לפני ");
    const formula = schema.nodes.mathExpression.create({ latex: "x^2" });
    const document = schema.nodes.doc.create(
      null,
      schema.nodes.paragraph.create(null, [
        first,
        formula,
        schema.text("אחרי"),
      ]),
    );
    const state = EditorState.create({ doc: document });
    const tr = nextLineTransaction(
      state,
      1 + first.nodeSize + formula.nodeSize,
    )!;
    expect(tr.doc.childCount).toBe(2);
    expect(tr.doc.child(0).child(1).type.name).toBe("mathExpression");
    expect(tr.doc.child(1).textContent).toBe("אחרי");
    expect(tr.selection.$from.parentOffset).toBe(0);
    const history = new HistoryService(document.toJSON());
    history.record(tr.doc.toJSON(), "navigation:line");
    expect(history.undo()).toEqual(document.toJSON());
  });
  it("splits an empty math paragraph like Enter", () => {
    const document = schema.nodes.doc.create(
      null,
      schema.nodes.paragraph.create(),
    );
    const tr = nextLineTransaction(EditorState.create({ doc: document }), 1)!;
    expect(tr.doc.childCount).toBe(2);
    expect(tr.selection.$from.parentOffset).toBe(0);
  });
});
