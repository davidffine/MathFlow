import { describe, expect, it } from "vitest";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { calculationAtCursor } from "../src/calculation/ExpressionContext";
import {
  calculateExact,
  calculationFromPrefix,
} from "../src/calculation/ExactArithmetic";
import { resultNodes } from "../src/calculation/ResultNodes";
import { emptyMath, latex, sequence, type MathState } from "../src/math/model";
import { reduceMath } from "../src/navigation/SmartNextEngine";
import { HistoryService } from "../src/persistence/HistoryService";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
    mathGlyph: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: { latex: { default: "" } },
    },
    mathExpression: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: { tree: { default: null } },
    },
  },
});
const glyph = (latex: string) => schema.nodes.mathGlyph.create({ latex });
const docWith = (...children: ProseMirrorNode[]) =>
  schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, children));

describe("exact local calculation", () => {
  it("respects arithmetic precedence, parentheses and implicit multiplication", () => {
    expect(calculateExact("2×(3+4)")?.label).toBe("14");
    expect(calculateExact("2(3+4)")?.label).toBe("14");
    expect(calculateExact("-2^2")?.label).toBe("−4");
    expect(calculateExact("(2+3)^2")?.label).toBe("25");
    expect(calculateExact("2^3^2")?.label).toBe("512");
  });
  it("keeps decimals and fractions exact", () => {
    expect(calculateExact("0.1+0.2")?.label).toBe("3⁄10");
    expect(calculateExact("1/3+1/6")?.label).toBe("1⁄2");
    expect(calculateExact("1/2÷3")?.label).toBe("1⁄6");
    expect(calculateExact("2^-1")?.label).toBe("1⁄2");
  });
  it("stays silent on unsafe and incomplete input", () => {
    for (const expression of [
      "1/0",
      "0^-1",
      "2+",
      "2+(3",
      "x+2",
      "sin(2)",
      "2**3",
      "99999999999999",
      "2^99",
    ])
      expect(calculateExact(expression)).toBeNull();
    expect(calculationFromPrefix("x2+3=")).toBeNull();
    expect(calculationFromPrefix("2+3")).toBeNull();
    expect(calculationFromPrefix("x=2+3=")).toBeNull();
    expect(calculationFromPrefix("תרגיל: 2+3=")?.label).toBe("5");
  });
  it("reads mixed native text and math keys at the actual caret", () => {
    const doc = docWith(schema.text("עברית 2+"), glyph("3"), glyph("="));
    expect(calculationAtCursor(doc, doc.content.size - 1)?.label).toBe("5");
    expect(calculationAtCursor(doc, doc.content.size - 2)).toBeNull();
    expect(
      calculationAtCursor(doc, doc.content.size - 1, null, false),
    ).toBeNull();
    const word = docWith(schema.text("f(2)="));
    expect(calculationAtCursor(word, word.content.size - 1)).toBeNull();
  });
  it("reads a completed structural fraction and ignores a cursor inside it", () => {
    let math = emptyMath();
    math = reduceMath(math, { type: "structure", kind: "fraction" }).state;
    math = reduceMath(math, { type: "input", latex: "1" }).state;
    math = reduceMath(math, { type: "next" }).state;
    math = reduceMath(math, { type: "input", latex: "2" }).state;
    const inside = structuredClone(math);
    math = reduceMath(math, { type: "next" }).state;
    math = reduceMath(math, { type: "input", latex: "=" }).state;
    const lead = schema.text("ערך ");
    const doc = docWith(
      lead,
      schema.nodes.mathExpression.create({ tree: math.root }),
    );
    expect(
      calculationAtCursor(doc, 1, { position: 1 + lead.nodeSize, state: math })
        ?.label,
    ).toBe("1⁄2");
    expect(
      calculationAtCursor(doc, 1, {
        position: 1 + lead.nodeSize,
        state: inside,
      }),
    ).toBeNull();
  });
  it("inserts a semantic result in one engine action without changing the expression", () => {
    let state: MathState = emptyMath();
    for (const value of ["2", "+", "3", "="])
      state = reduceMath(state, { type: "input", latex: value }).state;
    state = reduceMath(state, {
      type: "insertResult",
      nodes: resultNodes(calculateExact("2+3")!),
    }).state;
    expect(latex(state.root)).toBe("2 + 3 = 5");
    const fractional = resultNodes(calculateExact("1/2")!);
    expect(latex(sequence(fractional))).toBe("\\frac{1}{2}");
  });
  it("undoes the accepted result in one step, even immediately after typing", () => {
    const history = new HistoryService(emptyMath());
    let math = emptyMath();
    for (const value of ["2", "+", "3", "="]) {
      math = reduceMath(math, { type: "input", latex: value }).state;
      history.record(math, "typing:math", 100);
    }
    math = reduceMath(math, {
      type: "insertResult",
      nodes: resultNodes(calculateExact("2+3")!),
    }).state;
    history.breakGroup();
    history.record(math, "calculation", 101);
    expect(latex(history.undo()!.root)).toBe("2 + 3 =");
    expect(latex(history.redo()!.root)).toBe("2 + 3 = 5");
  });
});
