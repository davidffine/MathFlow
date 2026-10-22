import { describe, expect, it } from "vitest";
import { analyzeExercise } from "../src/exercise/ExerciseProfile";
import { replaceExerciseSelection } from "../src/exercise/ExerciseCorrection";
import { suggestionFrame } from "../src/keyboard/AdaptiveSuggestions";
import { emptyMath } from "../src/math/model";
import { reduceMath } from "../src/navigation/SmartNextEngine";
import { InteractionTelemetry } from "../src/telemetry/InteractionTelemetry";

const input = (value: string) => ({ type: "input" as const, latex: value });
const after = (...values: string[]) =>
  values.reduce(
    (state, value) => reduceMath(state, input(value)).state,
    emptyMath(),
  );

describe("exercise-aware keyboard experiment", () => {
  it("recognizes Hebrew and mathematical symbols without treating the text as a command", () => {
    const profile = analyzeExercise("הוכיחו שלכל x ∈ R מתקיים x ≥ 0")!;
    expect(profile.topic).toBe("sets");
    expect(profile.symbols.slice(0, 4)).toEqual([
      "\\forall",
      "\\in",
      "\\mathbb{R}",
      "\\ge",
    ]);
    expect(analyzeExercise("  ")).toBeNull();
  });

  it("changes just two moving slots and follows cursor context", () => {
    const profile = analyzeExercise("לכל x∈ℝ יש איחוד קבוצות")!;
    const beginning = suggestionFrame(emptyMath(), "MATH", [], {}, profile);
    const subject = suggestionFrame(after("x"), "MATH", [], {}, profile);
    expect(beginning.predicted.map((k) => k.value)).toEqual([
      "\\forall",
      "\\mathbb{R}",
    ]);
    expect(subject.predicted.map((k) => k.value)).toEqual(["\\in", "\\cup"]);
    expect(subject.anchors.map((k) => k.value)).toEqual(
      suggestionFrame(after("x"), "MATH", [], {}).anchors.map((k) => k.value),
    );
    expect(subject.exerciseValues).toEqual(["\\in", "\\cup"]);
  });

  it("does not override fraction navigation or force an unsupported symbol", () => {
    const profile = analyzeExercise("אינטגרל של x עם נגזרת")!;
    const frac = reduceMath(emptyMath(), {
      type: "structure",
      kind: "fraction",
    }).state;
    const frame = suggestionFrame(frac, "MATH", [], {}, profile);
    expect(frame.exerciseValues).toEqual(["\\infty"]);
    expect(frame.predicted.map((k) => k.value)).toEqual(["\\infty", "n"]);
    expect(reduceMath(frac, { type: "next" }).state.cursor.seqId).toBe(
      frac.root.items[0].kind === "fraction"
        ? frac.root.items[0].denominator.id
        : "",
    );
  });

  it("turns off immediately and respects pinned suggestions", () => {
    const profile = analyzeExercise("לכל x∈ℝ")!;
    const baseline = suggestionFrame(after("x"), "MATH", [], {});
    expect(
      suggestionFrame(
        after("x"),
        "MATH",
        [],
        {},
        { ...profile, enabled: false },
      ).predicted.map((k) => k.value),
    ).toEqual(baseline.predicted.map((k) => k.value));
    const pinned = suggestionFrame(after("x"), "MATH", ["\\in"], {}, profile);
    expect(pinned.predicted[0].value).not.toBe("\\in");
  });
  it("keeps algebra and calculus as the topic when a domain is mentioned", () => {
    expect(analyzeExercise("פתרו את המשוואה x²-1=0 מעל ℝ")?.topic).toBe(
      "algebra",
    );
    expect(analyzeExercise("חשבו ∫ sin(x) dx לכל x∈ℝ")?.topic).toBe("calculus");
    expect(analyzeExercise("x מתקיים y=1")?.symbols).not.toContain("\\exists");
    expect(analyzeExercise("coset of A")?.symbols).not.toContain("\\cos");
  });
  it("recognizes unambiguous algebra notation in a photographed exercise", () => {
    const quadratic = analyzeExercise("מצאו את x²+3x=0")!;
    expect(quadratic.topic).toBe("algebra");
    expect(quadratic.symbols).toContain("\\Delta");
    expect(
      suggestionFrame(after("x"), "MATH", [], {}, quadratic).exerciseValues,
    ).toContain("\\ne");
    expect(analyzeExercise("f(x)=x^2")?.topic).toBe("algebra");
    expect(analyzeExercise("x≠0")?.symbols).toContain("\\ne");
    expect(analyzeExercise("2+2=4")?.symbols).toEqual([]);
    expect(analyzeExercise("∀ x∈ℝ, x²≥0")?.topic).toBe("sets");
  });
  it("replaces selected OCR mistakes without moving neighboring characters", () => {
    const first = replaceExerciseSelection("∀ x E R", 4, 5, "∈");
    const second = replaceExerciseSelection(first.text, 6, 7, "ℝ");
    expect(first.caret).toBe(5);
    expect(second).toEqual({ text: "∀ x ∈ ℝ", caret: 7 });
    expect(analyzeExercise(second.text)?.symbols).toContain("\\mathbb{R}");
    expect(replaceExerciseSelection("x2", 1, 2, "²")).toEqual({
      text: "x²",
      caret: 2,
    });
    expect(
      replaceExerciseSelection("x".repeat(2000), 2000, 2000, "∈").text,
    ).toHaveLength(2000);
  });
  it("records suggestion acceptance without retaining exercise text", () => {
    const telemetry = new InteractionTelemetry();
    telemetry.emit(
      "EXERCISE_PROFILE_CHANGE",
      "document",
      "MATH",
      "exercise-dialog",
      {
        topic: "sets",
        symbolCount: 4,
      },
    );
    telemetry.emit("INPUT", "context", "MATH", "exercise-prediction", {
      category: "symbol",
    });
    telemetry.emit("EXERCISE_TOGGLE", "document", "MATH", "keyboard", {
      enabled: false,
    });
    expect(telemetry.counters.exerciseSuggestionUses).toBe(1);
    expect(telemetry.counters.exerciseToggles).toBe(1);
    expect(telemetry.events[0].data).toEqual({ topic: "sets", symbolCount: 4 });
  });
});
