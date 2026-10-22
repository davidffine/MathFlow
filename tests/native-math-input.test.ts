import { expect, it } from "vitest";
import { nativeMathTokens } from "../src/editor/nativeMathInput";
import { emptyMath, latex } from "../src/math/model";
import { renderMath, editingLatex } from "../src/math/render";
import { reduceMath } from "../src/navigation/SmartNextEngine";

it("inserts native letters into the active fraction slot, supports deletion and NEXT", () => {
  let state = reduceMath(emptyMath(), {
    type: "structure",
    kind: "fraction",
  }).state;
  for (const token of nativeMathTokens("ab+2"))
    state = reduceMath(state, { type: "input", latex: token }).state;
  state = reduceMath(state, { type: "backspace" }).state;
  state = reduceMath(state, { type: "next" }).state;
  for (const token of nativeMathTokens("x"))
    state = reduceMath(state, { type: "input", latex: token }).state;
  expect(latex(state.root)).toBe("\\frac{\\text{a} \\text{b} +}{\\text{x}}");
  expect(renderMath(state, true)).toContain("x");
});

it("keeps script slots empty and never prints ellipses as a placeholder", () => {
  let state = emptyMath();
  for (const action of [
    { type: "input", latex: "x" } as const,
    { type: "next" } as const,
    { type: "next" } as const,
    { type: "input", latex: "1" } as const,
    { type: "next" } as const,
  ])
    state = reduceMath(state, action).state;
  expect(latex(state.root)).toBe("{x}_{1}");
  expect(editingLatex(state, true)).not.toMatch(/square|cdots/);
  expect(editingLatex(emptyMath(), false)).not.toContain("cdots");
});

it("turns Hebrew, spaces, and special characters into explicit LaTeX", () => {
  const tokens = nativeMathTokens("אב 3%_");
  expect(tokens).toEqual([
    "\\text{א}",
    "\\text{ב}",
    "\\text{\\ }",
    "3",
    "\\text{\\%}",
    "\\text{\\_}",
  ]);
  let state = emptyMath();
  for (const token of tokens)
    state = reduceMath(state, { type: "input", latex: token }).state;
  expect(() => renderMath(state)).not.toThrow();
});
