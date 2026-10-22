import { describe, expect, it } from "vitest";
import {
  measureMathSlots,
  resolveMathHit,
  type HitRect,
  type MathHitSlot,
} from "../src/editor/mathHitTesting";
import { emptyMath, latex, type Sequence } from "../src/math/model";
import { renderMath } from "../src/math/render";
import { reduceMath } from "../src/navigation/SmartNextEngine";

const rect = (
  left: number,
  top: number,
  right: number,
  bottom: number,
): HitRect => ({ left, top, right, bottom });
const fraction: MathHitSlot[] = [
  {
    seqId: "root",
    bounds: rect(10, 5, 100, 70),
    items: [
      { index: 0, kind: "fraction", bounds: rect(10, 5, 70, 70) },
      { index: 1, kind: "token", bounds: rect(80, 25, 100, 45) },
    ],
  },
  {
    seqId: "num",
    bounds: rect(20, 5, 60, 25),
    owner: { seqId: "root", index: 0, branch: "numerator" },
    items: [
      { index: 0, kind: "token", bounds: rect(20, 5, 30, 25) },
      { index: 1, kind: "token", bounds: rect(35, 5, 45, 25) },
      { index: 2, kind: "token", bounds: rect(50, 5, 60, 25) },
    ],
  },
  {
    seqId: "den",
    bounds: rect(30, 50, 50, 70),
    owner: { seqId: "root", index: 0, branch: "denominator" },
    items: [{ index: 0, kind: "token", bounds: rect(30, 50, 50, 70) }],
  },
];
const hit = (slots: MathHitSlot[], x: number, y: number, seqId?: string) =>
  resolveMathHit(slots, "root", { x, y }, seqId);

describe("math hit regions", () => {
  it("separates numerator and denominator by their actual coordinates", () => {
    expect(hit(fraction, 22, 15)).toEqual({ seqId: "num", index: 0 });
    expect(hit(fraction, 58, 15)).toEqual({ seqId: "num", index: 3 });
    expect(hit(fraction, 48, 60)).toEqual({ seqId: "den", index: 1 });
  });
  it("resolves whitespace inside a fraction to the nearest slot", () => {
    expect(hit(fraction, 65, 29).seqId).toBe("num");
    expect(hit(fraction, 65, 47).seqId).toBe("den");
  });
  it("does not expand the fraction into the adjacent token", () => {
    expect(hit(fraction, 85, 35)).toEqual({ seqId: "root", index: 1 });
    expect(hit(fraction, 95, 35)).toEqual({ seqId: "root", index: 2 });
  });
  it("keeps touch dragging in its original slot despite pointer capture or vertical drift", () => {
    expect(hit(fraction, 58, 60, "num")).toEqual({ seqId: "num", index: 3 });
    expect(hit(fraction, 5, 60, "num")).toEqual({ seqId: "num", index: 0 });
    expect(hit(fraction, 200, 60, "num")).toEqual({ seqId: "num", index: 3 });
  });
  it("keeps an empty denominator independently reachable", () => {
    const slots = fraction.map((s) =>
      s.seqId === "den" ? { ...s, items: [] } : s,
    );
    expect(hit(slots, 45, 60)).toEqual({ seqId: "den", index: 0 });
  });
  it("uses the closest row when inline boxes overlap near the fraction bar", () => {
    const slots = structuredClone(fraction);
    slots[1].bounds = rect(20, 5, 60, 40);
    slots[2].bounds = rect(30, 35, 50, 70);
    expect(hit(slots, 40, 39).seqId).toBe("den");
    expect(hit(slots, 40, 36).seqId).toBe("num");
  });
  it("distinguishes a script base, exponent and index", () => {
    const slots: MathHitSlot[] = [
      {
        seqId: "root",
        bounds: rect(10, 0, 60, 65),
        items: [
          {
            index: 0,
            kind: "script",
            bounds: rect(10, 0, 60, 65),
            baseBounds: rect(10, 22, 30, 42),
          },
        ],
      },
      {
        seqId: "sup",
        bounds: rect(35, 0, 60, 20),
        owner: { seqId: "root", index: 0, branch: "sup" },
        items: [{ index: 0, kind: "token", bounds: rect(35, 0, 60, 20) }],
      },
      {
        seqId: "sub",
        bounds: rect(35, 45, 60, 65),
        owner: { seqId: "root", index: 0, branch: "sub" },
        items: [{ index: 0, kind: "token", bounds: rect(35, 45, 60, 65) }],
      },
    ];
    expect(hit(slots, 25, 30)).toEqual({ seqId: "root", index: 1 });
    expect(hit(slots, 40, 10)).toEqual({ seqId: "sup", index: 0 });
    expect(hit(slots, 55, 55)).toEqual({ seqId: "sub", index: 1 });
  });
  it("selects the inner root body inside a numerator", () => {
    const slots = structuredClone(fraction);
    slots[1].items[1] = { index: 1, kind: "root", bounds: rect(32, 5, 48, 25) };
    slots.push({
      seqId: "radicand",
      bounds: rect(38, 7, 46, 23),
      owner: { seqId: "num", index: 1, branch: "body" },
      items: [{ index: 0, kind: "token", bounds: rect(38, 7, 46, 23) }],
    });
    expect(hit(slots, 44, 15)).toEqual({ seqId: "radicand", index: 1 });
  });
  it("does not create hit regions for removed empty scripts or for the caret", () => {
    const base = {
      id: "x",
      kind: "token" as const,
      latex: "x",
      role: "operand" as const,
    };
    const root: Sequence = {
      id: "root",
      items: [
        {
          id: "script",
          kind: "script",
          base,
          sup: { id: "sup", items: [base] },
          sub: { id: "sub", items: [] },
        },
      ],
    };
    function element(dataset: Record<string, string>, bounds: HitRect) {
      return {
        dataset,
        getClientRects: () => [
          { ...bounds, height: bounds.bottom - bounds.top },
        ],
        hasAttribute: (name: string) =>
          name === "data-flowbase" ? !!dataset.flowbase : !!dataset.flowcaret,
      } as unknown as HTMLElement;
    }
    const caret = element(
      { flowseq: "root", flowindex: "0", flowcaret: "true" },
      rect(-100, -100, 1000, 1000),
    );
    const surface = {
      querySelectorAll: (selector: string) =>
        selector === "[data-flowslot]"
          ? [
              element({ flowslot: "root" }, rect(10, 0, 60, 42)),
              element({ flowslot: "sup" }, rect(35, 0, 60, 20)),
            ]
          : [
              caret,
              element({ flowseq: "root", flowindex: "0" }, rect(10, 0, 60, 42)),
              element(
                { flowseq: "root", flowindex: "0", flowbase: "true" },
                rect(10, 22, 30, 42),
              ),
              element({ flowseq: "sup", flowindex: "0" }, rect(35, 0, 60, 20)),
            ],
    } as unknown as HTMLElement;
    const slots = measureMathSlots(surface, root);
    expect(slots.map((s) => s.seqId).sort()).toEqual(["root", "sup"]);
    expect(slots.find((s) => s.seqId === "root")!.bounds).toEqual(
      rect(10, 0, 60, 42),
    );
  });
});

describe("editing geometry markup", () => {
  it("renders measurable empty fraction slots without persisting placeholders", () => {
    const state = reduceMath(emptyMath(), {
      type: "structure",
      kind: "fraction",
    }).state;
    const fraction = state.root.items[0];
    if (fraction.kind !== "fraction") throw new Error();
    const html = renderMath(state, true);
    expect(html).toContain(`data-flowslot="${fraction.numerator.id}"`);
    expect(html).toContain(`data-flowslot="${fraction.denominator.id}"`);
    expect(html).toContain("flow-empty-slot");
    expect(html).not.toContain("ML__error");
    expect(latex(state.root)).toBe("\\frac{}{}");
  });
  it("renders a zero-advance caret and a separately measurable script base", () => {
    let state = reduceMath(emptyMath(), { type: "input", latex: "x" }).state;
    state = reduceMath(state, { type: "next" }).state;
    const html = renderMath(state, true);
    expect(html).toContain("ML__rlap");
    expect(html).toContain('data-flowcaret="true"');
    expect(html).toContain('data-flowbase="true"');
    expect(html).not.toContain("ML__error");
    expect(latex(state.root)).toBe("{x}");
  });
});
