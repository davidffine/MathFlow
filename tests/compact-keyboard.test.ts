import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MathKeyboard } from "../src/keyboard/MathKeyboard";
import { SuggestionRailGesture } from "../src/keyboard/SuggestionRailGesture";
import { AnswerRangeSlider } from "../src/editor/AnswerRangeSlider";
import {
  rangeHandleAtPoint,
  type AnswerRangeModel,
} from "../src/editor/answerRange";
import { emptyMath } from "../src/math/model";
import type { Editor } from "@tiptap/react";

const noop = () => {};
describe("compact writing controls", () => {
  it("retains every digit, structural key, NEXT, ABC and history, with no second shortcut row or duplicate root", () => {
    const html = renderToStaticMarkup(
      createElement(MathKeyboard, {
        state: emptyMath(),
        mode: "MATH",
        backAvailable: true,
        display: false,
        answerMode: "off",
        act: noop,
        gesture: noop,
        onText: noop,
        onBack: noop,
        onDisplay: noop,
        onBox: noop,
        onClose: noop,
        exercise: null,
        onExerciseEdit: noop,
        onExerciseToggle: noop,
        calculation: null,
        onCalculation: noop,
        onUndo: noop,
        undoAvailable: true,
        onRedo: noop,
        redoAvailable: true,
      }),
    );
    for (let n = 0; n <= 9; n++)
      expect(
        html.match(new RegExp(`data-testid="digit-${n}"`, "g")),
      ).toHaveLength(1);
    for (const key of [
      "fraction",
      "root",
      "power",
      "open-paren",
      "close-paren",
      "key-x",
      "backspace",
      "equals",
      "next",
      "abc",
      "math-undo",
      "math-redo",
    ])
      expect(html).toContain(`data-testid="${key}"`);
    expect(html.indexOf('data-testid="open-paren"')).toBeLessThan(
      html.indexOf('data-testid="close-paren"'),
    );
    expect(html).not.toContain('class="favorite-strip"');
    expect(html).not.toContain('data-testid="suggest-√"');
    expect(html).toContain("data-flick-down");
    expect(html).toContain("data-flick-left");
    expect(html).toContain("data-flick-right");
  });
  it("horizontal motion scrolls the symbol shelf and remains a scroll after reversal", () => {
    const rail = new SuggestionRailGesture(100, 100);
    expect(rail.move(90, 102)).toBe(false);
    expect(rail.move(70, 103)).toBe(true);
    expect(rail.move(140, 130)).toBe(true);
    expect(rail.scrolling).toBe(true);
  });
  it("a downward start keeps the key gesture when returning up or bending sideways", () => {
    const rail = new SuggestionRailGesture(100, 100);
    expect(rail.move(102, 125)).toBe(false);
    expect(rail.move(170, 125)).toBe(false);
    expect(rail.move(100, 101)).toBe(false);
    expect(rail.move(30, 100)).toBe(false);
    expect(rail.scrolling).toBe(false);
  });
  it("routes overlapping endpoints by their visual positions rather than button stacking", () => {
    expect(rangeHandleAtPoint(0, 100, 5, 22, 0)).toBe("start");
    expect(rangeHandleAtPoint(0, 100, 95, 22, 0)).toBe("end");
    expect(rangeHandleAtPoint(100, 105, 105, 9, 0)).toBe("start");
    expect(rangeHandleAtPoint(100, 105, 100, 35, 0)).toBe("end");
    expect(rangeHandleAtPoint(100, 105, 103, 9, 0)).toBe("start");
  });
  it("keeps every whole-element graduation on rows longer than 32 elements", () => {
    const model = {
      elements: Array.from({ length: 40 }, () => ({})),
      id: "r",
    } as AnswerRangeModel;
    const html = renderToStaticMarkup(
      createElement(AnswerRangeSlider, {
        editor: {} as Editor,
        model,
        value: { start: 0, end: 1 },
        revision: 0,
        onChange: noop,
        onBegin: noop,
        onEnd: noop,
        onClose: noop,
      }),
    );
    expect(html.match(/class="answer-range-tick(?: selected)?"/g)).toHaveLength(
      41,
    );
    expect(html).toContain("left:2.5%");
    expect(html).toContain("left:100%");
  });
  it("renders only the rail and two accessible endpoints, without a panel header or instructions", () => {
    const model = { elements: [{}, {}], id: "r" } as AnswerRangeModel;
    const html = renderToStaticMarkup(
      createElement(AnswerRangeSlider, {
        editor: {} as Editor,
        model,
        value: { start: 0, end: 1 },
        revision: 0,
        onChange: noop,
        onBegin: noop,
        onEnd: noop,
        onClose: noop,
      }),
    );
    expect(html.match(/role="slider"/g)).toHaveLength(2);
    expect(html).toContain('class="answer-range-track"');
    expect(html.match(/class="answer-range-tick(?: selected)?"/g)).toHaveLength(
      3,
    );
    expect(html).not.toContain("answer-range-header");
    expect(html).not.toContain("answer-range-hint");
    expect(html).not.toContain("answer-range-close");
  });
});
