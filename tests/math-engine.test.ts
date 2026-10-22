import { describe, it, expect } from "vitest";
import { emptyMath, latex, locate, type MathState } from "../src/math/model";
import {
  reduceMath,
  roleOf,
  type MathAction,
} from "../src/navigation/SmartNextEngine";
import {
  recomputeKeyboardContext,
  ModeController,
  predict,
} from "../src/context/KeyboardContextEngine";
import { editingLatex, renderMath } from "../src/math/render";
const N: MathAction = { type: "next" },
  U: MathAction = { type: "up" },
  D: MathAction = { type: "down" },
  P: MathAction = { type: "previous" };
const I = (latex: string): MathAction => ({ type: "input", latex });
const S = (kind: "fraction" | "root" | "power" | "group"): MathAction => ({
  type: "structure",
  kind,
});
function run(...actions: MathAction[]): MathState {
  return actions.reduce((s, a) => reduceMath(s, a).state, emptyMath());
}
const normalized = (s: MathState) => latex(s.root).replace(/\s/g, "");
describe("anchored script cycle", () => {
  it("A x → sup 2 → sub 1 → exit", () => {
    const s = run(I("x"), N, I("2"), N, I("1"), N);
    expect(normalized(s)).toBe("{x}_{1}^{2}");
    expect(s.cursor.seqId).toBe(s.root.id);
    expect(s.cycles).toEqual([]);
  });
  it("B skips empty superscript", () => {
    const s = run(I("x"), N, N, I("1"), N);
    expect(normalized(s)).toBe("{x}_{1}");
    expect(editingLatex(s, true)).not.toContain("square");
    expect(latex(s.root)).not.toContain("^{");
  });
  it("C skips empty subscript", () => {
    const s = run(I("x"), N, I("2"), N, N);
    expect(normalized(s)).toBe("{x}^{2}");
    expect(latex(s.root)).not.toContain("_{");
  });
  it("does not attach scripts to coefficient or last entered script character", () => {
    const s = run(I("2"), I("x"), N, I("2"), N, I("1"), N);
    expect(normalized(s)).toBe("2{x}_{1}^{2}");
  });
  it("removes both empty scripts", () =>
    expect(normalized(run(I("x"), N, N, N))).toBe("x"));
  it("keeps stable anchor id throughout the cycle", () => {
    const a = run(I("x"), N),
      anchor = a.cycles[0].anchorId;
    const b = reduceMath(reduceMath(a, I("2")).state, N).state;
    expect(b.cycles[0].anchorId).toBe(anchor);
    expect(b.cycles[0].stage).toBe("SUBSCRIPT");
  });
  it("NEXT after exit does not reopen scripts", () => {
    const s = run(I("x"), N, I("2"), N, N);
    expect(reduceMath(s, N).miss).toBe(true);
  });
});
describe("structural priorities, nested state and semantic escape", () => {
  it("treats the default multiplication dot as an operator", () => {
    expect(roleOf("\\cdot")).toBe("operator");
  });
  it("creates an editable reciprocal from the preceding base", () => {
    const s = run(I("x"), { type: "reciprocal" });
    expect(normalized(s)).toBe("\\frac{1}{x}");
    expect(recomputeKeyboardContext(s)).toBe("FRACTION_DENOMINATOR");
    const exited = reduceMath(s, N).state;
    expect(exited.cursor.seqId).toBe(exited.root.id);
    expect(normalized(exited)).toBe("\\frac{1}{x}");
  });
  it("starts a reciprocal with an empty denominator if there is no base", () => {
    const s = run({ type: "reciprocal" });
    expect(normalized(s)).toBe("\\frac{1}{}");
    expect(s.root.items[0].kind).toBe("fraction");
  });
  it("opens and closes square brackets structurally", () => {
    const s = run({ type: "structure", kind: "square" }, I("x"), {
      type: "closeSquare",
    });
    expect(normalized(s)).toBe("\\left[x\\right]");
    expect(s.cursor.seqId).toBe(s.root.id);
    expect(normalized(run(I("x"), { type: "closeSquare" }))).toBe("x]");
    expect(renderMath(s)).toContain("x");
  });
  it("D numerator → denominator → outside, no script on last digit", () => {
    const s = run(S("fraction"), I("x"), I("+"), I("1"), N);
    expect(recomputeKeyboardContext(s)).toBe("FRACTION_DENOMINATOR");
    expect(s.cycles).toHaveLength(0);
  });
  it("D fraction with squared group, denominator then =4", () => {
    const s = run(
      S("fraction"),
      S("group"),
      I("x"),
      I("+"),
      I("1"),
      N,
      S("power"),
      I("2"),
      N,
      N,
      N,
      I("x"),
      I("-"),
      I("3"),
      I("="),
      I("4"),
    );
    expect(normalized(s)).toBe("\\frac{{\\left(x+1\\right)}^{2}}{x-3}=4");
  });
  it("E nested root inside fraction visits inner obligation first", () => {
    const s = run(S("fraction"), S("root"), I("x"), N);
    expect(recomputeKeyboardContext(s)).toBe("FRACTION_NUMERATOR");
    expect(recomputeKeyboardContext(reduceMath(s, N).state)).toBe(
      "FRACTION_DENOMINATOR",
    );
  });
  it("E fraction in superscript completes fraction before subscript", () => {
    const s = run(I("x"), N, S("fraction"), I("1"), N, I("2"), N);
    expect(recomputeKeyboardContext(s)).toBe("SUPERSCRIPT");
    expect(recomputeKeyboardContext(reduceMath(s, N).state)).toBe("SUBSCRIPT");
  });
  it("escapes a complete superscript on relation", () => {
    const r = reduceMath(run(I("x"), N, I("2")), I("="));
    expect(r.escaped).toBe(true);
    expect(normalized(r.state)).toBe("{x}^{2}=");
  });
  it.each(["\\le", "\\ge", "\\ne"])("escapes on %s", (v) => {
    expect(reduceMath(run(I("x"), N, I("2")), I(v)).escaped).toBe(true);
  });
  it("keeps + inside n+1 exponent", () => {
    const s = run(I("x"), N, I("n"), I("+"), I("1"));
    expect(recomputeKeyboardContext(s)).toBe("SUPERSCRIPT");
    expect(normalized(s)).toBe("{x}^{n+1}");
  });
  it("does not escape an empty exponent on =", () =>
    expect(reduceMath(run(I("x"), N), I("=")).escaped).toBe(false));
  it("does not escape numerator on a relation", () =>
    expect(reduceMath(run(S("fraction"), I("x")), I("=")).escaped).toBe(false));
  it("does not infer escape out of grouping: (x=1) is valid", () =>
    expect(normalized(run(S("group"), I("x"), I("="), I("1")))).toBe(
      "\\left(x=1\\right)",
    ));
  it("I moves down/up/previous to the expected fraction slots", () => {
    const a = run(S("fraction"), I("1"), D, I("2"), P);
    expect(recomputeKeyboardContext(a)).toBe("FRACTION_NUMERATOR");
    expect(recomputeKeyboardContext(reduceMath(a, U).state)).toBe(
      "AFTER_STRUCTURE",
    );
  });
  it("J cursor touch derives context from tree instead of stale cycle", () => {
    const s = run(S("fraction"), I("x"), N, I("2"), N);
    const frac = s.root.items[0];
    if (frac.kind !== "fraction") throw Error();
    const r = reduceMath(s, {
      type: "cursor",
      seqId: frac.numerator.id,
      index: 1,
    }).state;
    expect(recomputeKeyboardContext(r)).toBe("FRACTION_NUMERATOR");
    expect(recomputeKeyboardContext(reduceMath(r, N).state)).toBe(
      "FRACTION_DENOMINATOR",
    );
  });
  it("J cursor touch into completed superscript resumes its same base", () => {
    const s = run(I("x"), N, I("2"), N, I("1"), N);
    const x = s.root.items[0];
    if (x.kind !== "script") throw Error();
    const r = reduceMath(s, {
      type: "cursor",
      seqId: x.sup.id,
      index: 1,
    }).state;
    expect(recomputeKeyboardContext(r)).toBe("SUPERSCRIPT");
    expect(reduceMath(r, N).state.cursor.seqId).toBe(x.sub.id);
  });
  it("K boxes and unboxes selected formula semantically", () => {
    const s = run(
      I("x"),
      I("="),
      I("2"),
      { type: "selectAll" },
      { type: "box" },
    );
    expect(normalized(s)).toBe("\\boxed{x=2}");
    expect(normalized(reduceMath(s, { type: "unbox" }).state)).toBe("x=2");
  });
  it("K wraps a subset without boxing surrounding symbols", () => {
    const s = run(I("a"), I("+"), I("b"));
    s.selection = { seqId: s.root.id, from: 2, to: 3 };
    expect(normalized(reduceMath(s, { type: "box" }).state)).toBe(
      "a+\\boxed{b}",
    );
  });
  it("K toggles a selected math answer on and off", () => {
    const s = run(I("a"), I("+"), I("b"));
    s.selection = { seqId: s.root.id, from: 2, to: 3 };
    const boxed = reduceMath(s, { type: "toggleBox" }).state;
    expect(normalized(boxed)).toBe("a+\\boxed{b}");
    boxed.selection = { seqId: boxed.root.id, from: 2, to: 3 };
    expect(normalized(reduceMath(boxed, { type: "toggleBox" }).state)).toBe(
      "a+b",
    );
  });
  it("backspace from empty structure is reversible and valid", () => {
    const s = run(I("x"), S("fraction"), { type: "backspace" });
    expect(normalized(s)).toBe("x");
    expect(locate(s.root, s.cursor.seqId)).not.toBeNull();
  });
  it("MathLive produces real fractions and data hit targets", () => {
    const html = renderMath(run(S("fraction"), I("x"), N, I("2")), true);
    expect(html).toContain("ML__frac");
    expect(html).toContain("data-flowseq");
  });
});
describe("mode override semantics", () => {
  it("G predicts LOGIC_SET after explicit logical symbol", () => {
    const s = run(I("\\forall"));
    expect(predict(s).mode).toBe("LOGIC_SET");
    expect(predict(s).confidence).toBe("high");
  });
  it("H rejects mode for the semantic context, not a fragile cursor signature", () => {
    let s = run(I("\\forall"));
    const modes = new ModeController();
    expect(modes.predict(predict(s))).toBe(true);
    modes.back(predict(s).semanticKey);
    s = reduceMath(s, I("x")).state;
    expect(modes.predict(predict(s))).toBe(false);
    expect(modes.mode).toBe("MATH");
  });
  it("permits a fresh explicit logical context after rejection", () => {
    let s = run(I("\\forall"));
    const m = new ModeController();
    m.predict(predict(s));
    m.back(predict(s).semanticKey);
    s = reduceMath(s, I("\\in")).state;
    expect(m.predict(predict(s))).toBe(true);
  });
});
describe("rendering regression checks", () => {
  it("selection preserves structural math instead of rendering LaTeX as text", () => {
    const s = run(S("fraction"), I("1"), N, I("2"), N, { type: "selectAll" });
    const html = renderMath(s, true);
    expect(html).toContain("ML__frac");
    expect(html).toContain("flow-selected");
    expect(html).not.toContain("ML__error");
  });
  it("manual touch inside scripted group derives GROUP context", () => {
    const s = run(S("group"), I("x"), N, S("power"), I("2"), N, N);
    const n = s.root.items[0];
    if (n.kind !== "script" || n.base.kind !== "group") throw Error();
    const manual = reduceMath(s, {
      type: "cursor",
      seqId: n.base.body.id,
      index: 1,
    }).state;
    expect(recomputeKeyboardContext(manual)).toBe("GROUP");
    expect(
      latex(reduceMath(manual, { type: "input", latex: "+" }).state.root),
    ).toContain("x +");
  });
  it("a long two-character coefficient is not selected as a base", () =>
    expect(
      normalized(run(I("2"), I("3"), I("x"), N, I("2"), N, I("1"), N)),
    ).toBe("23{x}_{1}^{2}"));
});
