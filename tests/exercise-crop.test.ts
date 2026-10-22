import { describe, expect, it } from "vitest";
import { cropPixelBounds } from "../src/exercise/ExerciseOcr";

describe("exercise photo crop", () => {
  it("maps a normalized touch selection to image pixels", () => {
    expect(
      cropPixelBounds(1600, 1000, {
        x: 0.25,
        y: 0.25,
        width: 0.5,
        height: 0.5,
      }),
    ).toEqual({ left: 400, top: 250, width: 800, height: 500 });
  });

  it("clamps a swipe ending outside the photo and rejects unusable regions", () => {
    expect(
      cropPixelBounds(1600, 1000, {
        x: -0.25,
        y: 0.75,
        width: 0.75,
        height: 0.75,
      }),
    ).toEqual({ left: 0, top: 750, width: 800, height: 250 });
    expect(() =>
      cropPixelBounds(1600, 1000, {
        x: 0.25,
        y: 0.25,
        width: 0.005,
        height: 0.5,
      }),
    ).toThrow(/גדול יותר/);
    expect(() =>
      cropPixelBounds(1600, 1000, {
        x: Number.NaN,
        y: 0,
        width: 1,
        height: 1,
      }),
    ).toThrow(/אינו תקין/);
  });
});
