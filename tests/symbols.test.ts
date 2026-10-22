import { describe, expect, it } from "vitest";
import katex from "katex";
import { emptyMath, latex } from "../src/math/model";
import { renderMath } from "../src/math/render";
import { reduceMath } from "../src/navigation/SmartNextEngine";
import {
  filterSymbols,
  symbols,
  symbolCategories,
} from "../src/keyboard/symbols";
import {
  predict,
  recomputeKeyboardContext,
} from "../src/context/KeyboardContextEngine";

describe("math symbol palette", () => {
  it("has navigable categories, Latin and Greek alphabets, and searchable aliases", () => {
    expect(symbolCategories).toHaveLength(9);
    expect(symbols.length).toBeGreaterThan(200);
    expect(
      filterSymbols("אינטגרל", "common").some((s) => s.value === "\\int"),
    ).toBe(true);
    expect(
      filterSymbols("subset", "common").some((s) => s.value === "\\subseteq"),
    ).toBe(true);
    expect(
      filterSymbols("Ω", "common").some((s) => s.value === "\\Omega"),
    ).toBe(true);
    expect(
      filterSymbols("שארית", "common").some((s) => s.value === "\\bmod"),
    ).toBe(true);
    expect(filterSymbols("", "latin")).toHaveLength(52);
    expect(filterSymbols("", "greek").length).toBeGreaterThan(30);
  });

  it("every listed symbol has a readable value in MathLive and PDF KaTeX", () => {
    for (const symbol of symbols) {
      if (symbol.kind) continue;
      expect(symbol.value, symbol.label).not.toBe("");
      expect(
        () => katex.renderToString(symbol.value, { throwOnError: true }),
        symbol.label,
      ).not.toThrow();
      const s = reduceMath(emptyMath(), {
        type: "input",
        latex: symbol.value,
      }).state;
      expect(latex(s.root), symbol.label).toContain(symbol.value);
      expect(renderMath(s), symbol.label).not.toContain("ML__error");
    }
  });

  it("new logical keys change mode and manual cursor movement recomputes context", () => {
    const s = reduceMath(emptyMath(), {
      type: "input",
      latex: "\\subseteq",
    }).state;
    expect(predict(s).mode).toBe("LOGIC_SET");
    expect(recomputeKeyboardContext(s)).toBe("LOGIC_SET");
    const before = reduceMath(s, {
      type: "cursor",
      seqId: s.root.id,
      index: 0,
    }).state;
    expect(recomputeKeyboardContext(before)).toBe("GENERAL");
  });

  it("integral, infinity and infimum are not mistaken for the set-membership command", () => {
    for (const value of ["\\int", "\\iint", "\\infty", "\\inf"]) {
      const s = reduceMath(emptyMath(), { type: "input", latex: value }).state;
      expect(predict(s).mode, value).toBe("MATH");
      expect(recomputeKeyboardContext(s), value).toBe("GENERAL");
    }
  });

  it("approximately and equivalence escape a filled superscript", () => {
    for (const relation of ["\\approx", "\\equiv"]) {
      let s = emptyMath();
      for (const action of [
        { type: "input" as const, latex: "x" },
        { type: "next" as const },
        { type: "input" as const, latex: "2" },
      ])
        s = reduceMath(s, action).state;
      const r = reduceMath(s, { type: "input", latex: relation });
      expect(r.escaped).toBe(true);
      expect(latex(r.state.root).replace(/\s/g, "")).toBe(`{x}^{2}${relation}`);
    }
  });
});
