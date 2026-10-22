import { describe, it, expect } from "vitest";
import {
  GestureController,
  keyboardSwipeAction,
} from "../src/keyboard/GestureController";
import { flickVariant, flickVariants } from "../src/keyboard/flickVariants";
import { HistoryService } from "../src/persistence/HistoryService";
import { InteractionTelemetry } from "../src/telemetry/InteractionTelemetry";
import { renderPdfDocument, cleanLatex } from "../src/pdf/PdfRenderer";
import type {
  FlowDocument,
  PersistenceService,
} from "../src/persistence/PersistenceService";
describe("gesture recognition", () => {
  it.each([
    [70, 0, "right"],
    [-70, 0, "left"],
    [0, -70, "up"],
    [0, 70, "down"],
  ])("I identifies direction %s %s", (x, y, d) => {
    const c = new GestureController();
    c.begin(100, 100);
    expect(c.end(100 + Number(x), 100 + Number(y)).direction).toBe(d);
  });
  it("returning to center cancels while suppressing the underlying tap", () => {
    const c = new GestureController();
    c.begin(0, 0);
    c.move(80, 0);
    const r = c.end(5, 4);
    expect(r).toEqual({ direction: null, cancelled: true, swiping: true });
  });
  it("small movements remain taps", () => {
    const c = new GestureController();
    c.begin(0, 0);
    expect(c.end(4, 5).swiping).toBe(false);
  });
  it("diagonals suppress tap but never guess a direction", () => {
    const c = new GestureController();
    c.begin(0, 0);
    expect(c.end(60, 60)).toMatchObject({ direction: null, swiping: true });
  });
  it("a labeled key wins over keyboard navigation at every downward distance", () => {
    const c = new GestureController();
    c.begin(0, 0, { down: true, left: false, right: false });
    expect(c.move(3, 31)).toMatchObject({ flick: "down", swiping: true });
    expect(c.end(3, 31).flick).toBe("down");
    c.begin(0, 0, { down: true, left: false, right: false });
    expect(c.end(2, 120)).toMatchObject({ flick: "down", direction: null });
    c.begin(0, 0);
    expect(c.end(2, 120)).toMatchObject({ direction: "down", swiping: true });
    c.begin(0, 0, { down: true, left: false, right: false });
    c.move(2, 31);
    expect(c.end(2, 2)).toMatchObject({ cancelled: true, swiping: true });
    c.begin(0, 0, { down: true, left: false, right: false });
    expect(c.end(35, 35).flick).toBeUndefined();
    c.begin(0, 0, { down: true, left: false, right: false });
    expect(c.end(100, 2).direction).toBe("right");
  });
  it("keeps a key gesture cancelled after reversing past its start", () => {
    const c = new GestureController();
    c.begin(0, 0, { down: true, left: false, right: false });
    expect(c.move(0, 82).flick).toBe("down");
    expect(c.move(0, 4)).toMatchObject({
      cancelled: true,
      direction: null,
      swiping: true,
    });
    expect(c.end(0, -75)).toMatchObject({
      cancelled: true,
      direction: null,
      swiping: true,
    });
    c.begin(0, 0, { down: true, left: false, right: false });
    c.move(0, 45);
    expect(c.end(90, 1)).toMatchObject({ cancelled: true, direction: null });
    c.begin(0, 0, { down: true, left: false, right: false });
    expect(c.end(85, 0).direction).toBe("right");
  });
  it("makes only familiar secondary symbols visible on keys", () => {
    expect(flickVariant("=")).toEqual({
      label: "≠",
      value: "\\ne",
      name: "לא שווה",
    });
    expect(flickVariant("x")?.value).toBe("y");
    expect(flickVariant("7")).toBeNull();
  });
  it("routes a deliberate downward gesture to down, left or right", () => {
    const c = new GestureController();
    const alternates = { down: true, left: true, right: true };
    c.begin(0, 0, alternates);
    expect(c.end(0, 35).flick).toBe("down");
    c.begin(0, 0, alternates);
    expect(c.move(0, 35).flick).toBe("down");
    expect(c.end(-40, 30)).toMatchObject({ flick: "left", direction: null });
    c.begin(0, 0, alternates);
    c.move(0, 35);
    expect(c.end(40, 30)).toMatchObject({ flick: "right", direction: null });
    c.begin(0, 0, alternates);
    expect(c.end(0, -60)).toMatchObject({ direction: "up", swiping: true });
  });
  it("requires a downward phase; a full reversal switches sides without keyboard navigation", () => {
    const c = new GestureController();
    const alternates = { down: true, left: true, right: true };
    c.begin(0, 0, alternates);
    expect(c.end(-60, 40).flick).toBeUndefined(); // diagonal start
    c.begin(0, 0, alternates);
    c.move(0, 35);
    expect(c.move(-40, 30).flick).toBe("left");
    expect(c.end(0, 0)).toMatchObject({ cancelled: true, direction: null });
    c.begin(0, 0, alternates);
    c.move(0, 35);
    c.move(-40, 30);
    expect(c.move(-9, 30)).toMatchObject({ cancelled: true, direction: null });
    expect(c.end(40, 30)).toMatchObject({ flick: "right", direction: null });
    c.begin(0, 0, alternates);
    c.move(0, 35);
    c.move(40, 30);
    expect(c.move(12, 30)).toMatchObject({ cancelled: true, direction: null });
    expect(c.move(-38, 30).flick).toBe("left");
    expect(c.move(38, 30).flick).toBe("right");
    expect(c.end(0, 30)).toMatchObject({ cancelled: true, direction: null });
    c.begin(0, 0, alternates);
    c.move(0, 35);
    c.move(-40, 30);
    expect(c.move(-40, 2).cancelled).toBe(true);
    expect(c.end(40, 30)).toMatchObject({ cancelled: true, direction: null });
    c.begin(0, 0, { down: true, left: false, right: false });
    c.move(0, 35);
    expect(c.end(40, 30)).toMatchObject({ cancelled: true, direction: null });
    c.begin(0, 0);
    expect(c.end(70, 0).direction).toBe("right");
  });
  it("has no keyboard-wide action for a downward swipe", () => {
    expect(keyboardSwipeAction("down")).toBeNull();
    expect(keyboardSwipeAction("right")).toBe("LOGIC_SET");
    expect(keyboardSwipeAction("left")).toBe("MATH");
    expect(keyboardSwipeAction("up")).toBe("SYMBOLS");
  });
  it("keeps color categories aligned with operation keys", () => {
    expect(flickVariants("+")).toMatchObject({
      down: { value: "\\pm" },
      left: { value: "\\cup" },
      right: { value: "\\oplus" },
    });
    expect(flickVariants("-")?.left?.value).toBe("\\setminus");
    expect(flickVariants("-")?.right).toBeUndefined();
    expect(flickVariants("\\cdot")).toMatchObject({
      down: { value: "\\times" },
      left: { value: "\\cap" },
      right: { value: "\\otimes" },
    });
    expect(flickVariants("fractionKey")).toMatchObject({
      down: { value: "\\div" },
      left: { value: "\\in" },
      right: { value: "\\bmod" },
    });
    expect(flickVariants("=")).toMatchObject({
      down: { value: "\\ne" },
      left: { value: "\\Leftrightarrow" },
      right: { value: "\\approx" },
    });
    expect(flickVariants("power")?.down?.action).toEqual({
      type: "reciprocal",
    });
    expect(flickVariants("openParen")?.down?.action).toEqual({
      type: "structure",
      kind: "square",
    });
    expect(flickVariants("closeParen")?.down?.action).toEqual({
      type: "closeSquare",
    });
  });
});
describe("semantic history", () => {
  it("N immediate undo includes the latest input without waiting for debounce", () => {
    const h = new HistoryService("");
    h.record("x", "typing:math", 1);
    h.record("x2", "typing:math", 2);
    expect(h.undo()).toBe("");
    expect(h.redo()).toBe("x2");
  });
  it("N one fraction is one undo", () => {
    const h = new HistoryService("x");
    h.record("x frac", "structure", 10);
    expect(h.undo()).toBe("x");
    expect(h.redo()).toBe("x frac");
  });
  it("N independent typing runs are grouped separately", () => {
    const h = new HistoryService("");
    h.record("a", "typing:text", 1);
    h.record("ab", "typing:text", 1000);
    expect(h.undo()).toBe("a");
  });
  it("an edit after undo clears redo", () => {
    const h = new HistoryService("");
    h.record("a");
    h.undo();
    h.record("b");
    expect(h.redo()).toBe(null);
  });
});
describe("telemetry", () => {
  it("navigation alone is not rejection feedback", () => {
    const t = new InteractionTelemetry();
    t.emit("AUTO_MODE_CHANGE", "c", "LOGIC_SET", "auto");
    t.emit("KEYBOARD_BACK", "c", "MATH", "key");
    expect(t.attribution()).toEqual([]);
    t.emit("AUTO_MODE_CHANGE", "c", "LOGIC_SET", "auto");
    t.emit("INPUT", "c", "LOGIC_SET", "key");
    expect(t.attribution()[0].committedMode).toBe("LOGIC_SET");
  });
  it("counts a short key flick as input, not structural navigation", () => {
    const t = new InteractionTelemetry();
    t.emit("INPUT", "operand", "MATH", "flick", { category: "symbol" });
    expect(t.counters.flicks).toBe(1);
    expect(t.counters.swipes).toBe(0);
    expect(t.attribution()[0].inputEventId).toBe(1);
    t.emit("INPUT", "operand", "MATH", "flick:down-left", {
      category: "symbol",
    });
    expect(t.counters.flicks).toBe(2);
    expect(t.events[1].source).toBe("flick:down-left");
  });
});
describe("O PDF renderer", () => {
  it("uses document JSON, separate math renderer, escaped text and no editor controls", async () => {
    const doc: FlowDocument = {
      schemaVersion: 1,
      id: "test",
      title: "פתרון <script>",
      updatedAt: 0,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "מאחר ש־", marks: [{ type: "bold" }] },
              {
                type: "mathExpression",
                attrs: { latex: "\\boxed{x_1^2}", display: false },
              },
              {
                type: "text",
                text: " ניתן לחלק ב־x ולכן:",
                marks: [{ type: "finalAnswer" }],
              },
            ],
          },
        ],
      },
    };
    const html = await renderPdfDocument(doc, {} as PersistenceService);
    expect(html).toContain('dir="auto"');
    expect(html).toContain("unicode-bidi:isolate");
    expect(html).toContain("katex");
    expect(html).toContain("final-answer");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("math-field");
    expect(html).not.toContain("flow-caret");
    expect(html).not.toContain("contenteditable");
    expect(html).not.toContain("placeholder");
  });
  it("strips legacy placeholders and empty scripts", () =>
    expect(cleanLatex("x^{}_{1}\\placeholder{}")).toBe("x_{1}"));
});
