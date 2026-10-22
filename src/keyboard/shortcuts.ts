import { symbolByValue } from "./symbols";

export const SHORTCUT_LIMIT = 6;
export const DEFAULT_SHORTCUTS = [
  "\\ne",
  "\\approx",
  "\\infty",
  "\\cdot",
  "\\sum",
  "\\int",
];
const storageKey = "mathflow.symbol-shortcuts.v1";

export function normalizeShortcuts(values: unknown): string[] {
  if (!Array.isArray(values)) return [...DEFAULT_SHORTCUTS];
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && symbolByValue.has(value),
      ),
    ),
  ].slice(0, SHORTCUT_LIMIT);
}

export function readShortcuts(): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw === null
      ? [...DEFAULT_SHORTCUTS]
      : normalizeShortcuts(JSON.parse(raw));
  } catch {
    return [...DEFAULT_SHORTCUTS];
  }
}

export function toggleShortcut(
  values: string[],
  value: string,
): {
  values: string[];
  full: boolean;
} {
  if (!symbolByValue.has(value)) return { values, full: false };
  if (values.includes(value))
    return { values: values.filter((item) => item !== value), full: false };
  if (values.length >= SHORTCUT_LIMIT) return { values, full: true };
  return { values: [...values, value], full: false };
}

export function saveShortcuts(values: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(values));
  } catch {
    // Still usable for this session when storage is disabled or full.
  }
}
