import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  normalizeShortcuts,
  readShortcuts,
  saveShortcuts,
  SHORTCUT_LIMIT,
  toggleShortcut,
} from "../src/keyboard/shortcuts";

afterEach(() => vi.unstubAllGlobals());

describe("stable, explicit symbol shortcuts", () => {
  it("starts with six useful commands and preserves an intentionally empty strip", () => {
    expect(DEFAULT_SHORTCUTS).toHaveLength(SHORTCUT_LIMIT);
    expect(normalizeShortcuts(undefined)).toEqual(DEFAULT_SHORTCUTS);
    expect(normalizeShortcuts([])).toEqual([]);
    expect(normalizeShortcuts(["\\pi", "\\pi", "missing", "\\int"])).toEqual([
      "\\pi",
      "\\int",
    ]);
  });

  it("never silently shifts a full shortcut strip", () => {
    const full = [...DEFAULT_SHORTCUTS];
    expect(toggleShortcut(full, "\\theta")).toEqual({
      values: full,
      full: true,
    });
    const removed = toggleShortcut(full, "\\sum").values;
    expect(removed).toEqual(full.filter((value) => value !== "\\sum"));
    expect(toggleShortcut(removed, "\\theta")).toEqual({
      values: [...removed, "\\theta"],
      full: false,
    });
  });

  it("keeps the chosen positions across a reload, including zero shortcuts", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    expect(readShortcuts()).toEqual(DEFAULT_SHORTCUTS);
    saveShortcuts(["\\lambda", "\\int"]);
    expect(readShortcuts()).toEqual(["\\lambda", "\\int"]);
    saveShortcuts([]);
    expect(readShortcuts()).toEqual([]);
  });
});
