import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyMath, type MathState } from "../src/math/model";
import { reduceMath, type MathAction } from "../src/navigation/SmartNextEngine";
import {
  learnSuggestion,
  normalizeSuggestionMemory,
  readSuggestionMemory,
  saveSuggestionMemory,
  suggestionFrame,
  suggestionPhase,
  type SuggestionMemory,
} from "../src/keyboard/AdaptiveSuggestions";

const input = (latex: string): MathAction => ({ type: "input", latex });
function run(...actions: MathAction[]): MathState {
  return actions.reduce(
    (state, action) => reduceMath(state, action).state,
    emptyMath(),
  );
}
const values = (
  state: MathState,
  mode: "MATH" | "LOGIC_SET" = "MATH",
  pinned: string[] = [],
  memory: SuggestionMemory = {},
) =>
  suggestionFrame(state, mode, pinned, memory).predicted.map(
    (key) => key.value,
  );

afterEach(() => vi.unstubAllGlobals());

describe("contextual suggestion slots", () => {
  it("reacts to relations, operators, and functions across the whole suggestion row", () => {
    const start = suggestionFrame(emptyMath(), "MATH", [], {});
    const afterRelation = suggestionFrame(
      run(input("x"), input("=")),
      "MATH",
      [],
      {},
    );
    expect(start.predicted.map((key) => key.value)).toEqual(["y", "n"]);
    expect(afterRelation.predicted.map((key) => key.value)).toEqual([
      "y",
      "\\pm",
    ]);
    expect(suggestionPhase(run(input("x"), input("+")), "MATH")).toBe(
      "operator",
    );
    expect(suggestionPhase(run(input("\\sin")), "MATH")).toBe("function");
    expect(afterRelation.anchors.map((key) => key.value)).not.toEqual(
      start.anchors.map((key) => key.value),
    );
  });

  it("keeps structural priority above the last atom, even inside a nested script", () => {
    const fraction = run(
      { type: "structure", kind: "fraction" },
      input("x"),
      input("="),
    );
    expect(suggestionPhase(fraction, "MATH")).toBe("fraction");
    expect(values(fraction)).toEqual(["n", "y"]);
    expect(
      suggestionPhase(run(input("x"), { type: "next" }, input("2")), "MATH"),
    ).toBe("script");
    expect(
      suggestionFrame(fraction, "MATH", [], {}).anchors.map((key) => key.value),
    ).toEqual(["root", "abs", "\\partial", "\\pi"]);
  });

  it("follows quantifier → subject → membership → set, and a manual cursor touch recomputes", () => {
    const quantified = run(input("\\forall"));
    const subject = reduceMath(quantified, input("x")).state;
    const member = reduceMath(subject, input("\\in")).state;
    const set = reduceMath(member, input("\\mathbb{R}")).state;
    expect(
      [quantified, subject, member, set].map((s) =>
        suggestionPhase(s, "LOGIC_SET"),
      ),
    ).toEqual(["quantifier", "subject", "membership", "set"]);
    expect(values(member, "LOGIC_SET")).toEqual(["\\mathbb{R}"]);
    const touched = reduceMath(set, {
      type: "cursor",
      seqId: set.root.id,
      index: 3,
    }).state;
    expect(suggestionPhase(touched, "LOGIC_SET")).toBe("membership");
  });

  it("omits a pinned symbol family instead of duplicating its swipe variants", () => {
    const frame = suggestionFrame(
      run(input("\\forall"), input("x"), input("\\in")),
      "LOGIC_SET",
      ["\\mathbb{R}"],
      {},
    );
    expect(frame.predicted).toEqual([]);
    expect(frame.anchors).toHaveLength(6);
    expect(frame.anchors.some((key) => key.value.startsWith("\\mathbb"))).toBe(
      false,
    );
  });

  it("changes a prediction only after repeated committed choices in that phase", () => {
    let memory: SuggestionMemory = {};
    const state = run(input("x"));
    expect(values(state)).toEqual(["\\le", "\\ge"]);
    memory = learnSuggestion(memory, "operand", "\\ne");
    expect(values(state, "MATH", [], memory)).toEqual(["\\le", "\\ge"]);
    for (let i = 0; i < 4; i++)
      memory = learnSuggestion(memory, "operand", "\\ne");
    expect(values(state, "MATH", [], memory)[0]).toBe("\\ne");
    expect(learnSuggestion(memory, "operand", "not-a-symbol")).toBe(memory);
    expect(values(emptyMath(), "MATH", [], memory)).toEqual(["y", "n"]);
  });

  it("persists only known phase counts and tolerates bad device storage", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    saveSuggestionMemory(learnSuggestion({}, "membership", "\\mathbb{Z}"));
    expect(readSuggestionMemory()).toEqual({
      membership: { "\\mathbb{Z}": 1 },
    });
    expect(
      normalizeSuggestionMemory({
        membership: { "\\mathbb{N}": 1000, x: 1 },
        bogus: { a: 4 },
      }),
    ).toEqual({ membership: { "\\mathbb{N}": 12 } });
    data.set("mathflow.suggestion-preferences.v1", "broken");
    expect(readSuggestionMemory()).toEqual({});
  });
});
