import { describe, expect, it } from "vitest";
import { compileFunction } from "../src/graph/expression";
import { autoRange, makePlot, ticks } from "../src/graph/plot";
const xRange = { min: -5, max: 5 };
describe("function input", () => {
  it.each([
    ["x^2 - 4", 3, 5],
    ["2x + 3(x-1)", 2, 7],
    ["(x+1)(x-1)", 3, 8],
    ["-x^2", 3, -9],
    ["(-x)^2", 3, 9],
    ["2^-2", 0, 0.25],
    ["2^3^2", 0, 512],
    ["1/(x-2)", 4, 0.5],
    ["sin(pi/2) + cos(0)", 0, 2],
    ["sqrt(x) + abs(-x)", 4, 6],
    ["ln(e) + log(100)", 0, 3],
    ["f(x) = 2×x²−1", 3, 17],
    ["y = exp(0) + 1e-3*x", 1000, 2],
    ["cbrt(x)", -8, -2],
  ])("evaluates %s", (source, x, expected) => {
    expect(compileFunction(source).evaluate(x)).toBeCloseTo(expected, 9);
  });
  it.each([
    "",
    "x+",
    "sin x",
    "sqrt(",
    "x)",
    "2 3",
    "x;alert(1)",
    "window.location",
    "__proto__(x)",
    "constructor(x)",
    "y+1",
    "1e999",
  ])("rejects invalid or non-math input %s", (source) => {
    expect(() => compileFunction(source)).toThrow();
  });
  it("returns gaps for values outside the real domain", () => {
    expect(compileFunction("sqrt(x)").evaluate(-1)).toBeNaN();
    expect(compileFunction("1/x").evaluate(0)).toBeNaN();
  });
  it("bounds input complexity", () => {
    expect(() =>
      compileFunction("(".repeat(40) + "x" + ")".repeat(40)),
    ).toThrow();
    expect(() => compileFunction("x+".repeat(200) + "x")).toThrow();
  });
});
describe("sampled graph", () => {
  it("preserves a continuous polynomial and includes its minimum", () => {
    const plot = makePlot(compileFunction("x^2 - 4"), xRange);
    expect(plot.visible).toBe(true);
    expect(plot.segments).toHaveLength(1);
    expect(Math.min(...plot.segments[0].map((p) => p.y))).toBeCloseTo(-4);
    expect(plot.y.min).toBeLessThan(-4);
  });
  it.each(["1/x", "1/(x-0.371)"])(
    "does not draw a false segment across the pole of %s",
    (source) => {
      const plot = makePlot(compileFunction(source), xRange, {
        min: -10,
        max: 10,
      });
      const pole = source === "1/x" ? 0 : 0.371;
      expect(plot.visible).toBe(true);
      expect(plot.segments.length).toBeGreaterThan(1);
      for (const segment of plot.segments) {
        expect(
          segment.some((p) => p.x < pole) && segment.some((p) => p.x > pole),
        ).toBe(false);
      }
    },
  );
  it("splits tangent at both asymptotes without connecting its branches", () => {
    const plot = makePlot(compileFunction("tan(x)"), xRange, {
      min: -5,
      max: 5,
    });
    for (const segment of plot.segments)
      for (const pole of [-Math.PI / 2, Math.PI / 2])
        expect(
          segment.some((p) => p.x < pole) && segment.some((p) => p.x > pole),
        ).toBe(false);
  });
  it("clips domain of sqrt to nonnegative x", () => {
    const plot = makePlot(compileFunction("sqrt(x)"), xRange);
    expect(plot.visible).toBe(true);
    expect(
      plot.segments.flat().every((p) => p.x >= 0 && Number.isFinite(p.y)),
    ).toBe(true);
  });
  it("does not confuse a steep straight line with a discontinuity", () => {
    const plot = makePlot(compileFunction("100000x"), xRange, {
      min: -1,
      max: 1,
    });
    expect(plot.visible).toBe(true);
    expect(
      plot.segments.some(
        (s) => s.some((p) => p.y < 0) && s.some((p) => p.y > 0),
      ),
    ).toBe(true);
  });
  it("expands constant functions without a zero-height viewport", () => {
    const range = autoRange(compileFunction("4"), xRange);
    expect(range.min).toBeLessThan(4);
    expect(range.max).toBeGreaterThan(4);
  });
  it("rejects undefined domains and reversed or empty ranges", () => {
    expect(() => makePlot(compileFunction("sqrt(-1)"), xRange)).toThrow();
    expect(() => makePlot(compileFunction("x"), { min: 5, max: -5 })).toThrow();
    expect(() =>
      makePlot(compileFunction("x"), { min: NaN, max: 5 }),
    ).toThrow();
    expect(() =>
      makePlot(compileFunction("x"), xRange, { min: 1, max: 1 }),
    ).toThrow();
  });
  it("reports a function outside manual y bounds", () => {
    expect(
      makePlot(compileFunction("100"), xRange, { min: -5, max: 5 }).visible,
    ).toBe(false);
  });
  it("keeps ticks finite and inside the chosen range", () => {
    for (const range of [
      xRange,
      { min: 0.0001, max: 0.0009 },
      { min: 100000, max: 110000 },
    ]) {
      const values = ticks(range);
      expect(values.length).toBeGreaterThan(1);
      expect(values.length).toBeLessThanOrEqual(30);
      expect(
        values.every(
          (v) => Number.isFinite(v) && v >= range.min && v <= range.max,
        ),
      ).toBe(true);
    }
  });
});
