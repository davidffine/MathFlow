import { branches, locate, type MathNode, type MathState } from "../math/model";
import type { Mode } from "../context/KeyboardContextEngine";
import { symbolByValue, type SymbolKey } from "./symbols";
import { numberSets, symbolFamily } from "./symbolFamilies";
import {
  exerciseFitsPhase,
  type ExerciseProfile,
} from "../exercise/ExerciseProfile";

export type SuggestionPhase =
  | "start"
  | "operand"
  | "relation"
  | "operator"
  | "function"
  | "fraction"
  | "root"
  | "group"
  | "script"
  | "logic-start"
  | "quantifier"
  | "subject"
  | "membership"
  | "set"
  | "connective";

export interface SuggestionFrame {
  phase: SuggestionPhase;
  label: string;
  predicted: SymbolKey[];
  anchors: SymbolKey[];
  exerciseValues: string[];
  numberSets: string[];
}

// Every slot reacts to context. The later slots change less often: structural
// and familiar keys recur across related phases, rather than shuffling per tap.
const contextualKeys: Record<SuggestionPhase, string[]> = {
  start: ["root", "abs", "\\sin", "\\pi"],
  operand: ["root", "abs", "\\sin", "\\pi"],
  relation: ["root", "abs", "\\pi", "\\infty"],
  operator: ["root", "abs", "\\sin", "\\sum"],
  function: ["root", "abs", "\\pi", "\\infty"],
  fraction: ["root", "abs", "\\partial", "\\pi"],
  root: ["abs", "\\pi", "\\sin", "\\infty"],
  group: ["root", "abs", "\\sin", "\\pi"],
  script: ["-1", "\\infty", "\\pi", "\\mathbb{N}"],
  "logic-start": ["\\forall", "\\Leftrightarrow", "\\mathbb{R}", "\\mid"],
  quantifier: ["\\mathbb{R}", "\\Leftrightarrow", "\\forall", "\\mid"],
  subject: ["\\mathbb{R}", "\\Leftrightarrow", "\\forall", "\\mid"],
  membership: ["\\Leftrightarrow", "\\forall", "\\mid", "\\varnothing"],
  set: ["\\Leftrightarrow", "\\forall", "\\mathbb{R}", "\\mid"],
  connective: ["\\forall", "\\mathbb{R}", "\\mid", "\\varnothing"],
};
const candidates: Record<SuggestionPhase, string[]> = {
  start: ["y", "n", "\\theta", "\\alpha", "\\Delta", "\\sum", "\\int"],
  operand: ["\\le", "\\ge", "\\ne", "\\approx", "\\equiv", "\\propto", "\\in"],
  relation: ["y", "\\pm", "\\infty", "\\theta", "\\Delta", "n", "\\sum"],
  operator: ["y", "n", "\\theta", "\\Delta", "\\infty", "\\sum", "\\int"],
  function: ["\\theta", "y", "n", "\\infty", "\\Delta"],
  fraction: ["n", "y", "\\partial", "\\Delta", "\\theta", "\\infty"],
  root: ["y", "n", "\\theta", "\\infty", "\\Delta"],
  group: ["y", "n", "\\le", "\\ge", "\\theta"],
  script: ["n", "k", "i", "j", "\\theta", "\\mathbb{N}", "\\mathbb{Z}"],
  "logic-start": [
    "\\in",
    "\\mathbb{R}",
    "\\notin",
    "\\subseteq",
    "\\cup",
    "\\cap",
  ],
  quantifier: ["\\in", "\\notin", "\\subseteq", "\\mathbb{R}", "\\mathbb{N}"],
  subject: ["\\in", "\\notin", "\\subseteq", "\\supseteq", "\\cup", "\\cap"],
  membership: [
    "\\mathbb{R}",
    "\\mathbb{N}",
    "\\mathbb{Z}",
    "\\mathbb{Q}",
    "\\mathbb{C}",
    "\\varnothing",
  ],
  set: ["\\subseteq", "\\cup", "\\cap", "\\land", "\\lor", "\\notin"],
  connective: ["\\neg", "\\in", "\\mathbb{R}", "\\subseteq", "\\cup"],
};

const labels: Record<SuggestionPhase, string> = {
  start: "כתיבה חופשית",
  operand: "אחרי ביטוי",
  relation: "אחרי סימן יחס",
  operator: "אחרי פעולה",
  function: "אחרי פונקציה",
  fraction: "בתוך שבר",
  root: "בתוך שורש",
  group: "בתוך סוגריים",
  script: "מעריך או אינדקס",
  "logic-start": "קבוצות ולוגיקה",
  quantifier: "אחרי כמת",
  subject: "אחרי משתנה",
  membership: "אחרי שייכות",
  set: "אחרי קבוצה",
  connective: "אחרי קשר לוגי",
};

const functions = new Set([
  "\\sin",
  "\\cos",
  "\\tan",
  "\\ln",
  "\\log",
  "\\exp",
  "\\lim",
]);
const quantifiers = new Set(["\\forall", "\\exists", "\\nexists"]);
const membership = new Set([
  "\\in",
  "\\notin",
  "\\ni",
  "\\not\\ni",
  "\\subset",
  "\\subseteq",
  "\\supset",
  "\\supseteq",
  "\\nsubseteq",
  "\\nsupseteq",
]);
const sets = new Set([
  "\\mathbb{N}",
  "\\mathbb{Z}",
  "\\mathbb{Q}",
  "\\mathbb{R}",
  "\\mathbb{C}",
  "\\varnothing",
]);
const connectives = new Set([
  "\\Rightarrow",
  "\\Leftarrow",
  "\\Leftrightarrow",
  "\\nRightarrow",
  "\\land",
  "\\lor",
  "\\neg",
]);

export function suggestionPhase(state: MathState, mode: Mode): SuggestionPhase {
  const location = locate(state.root, state.cursor.seqId);
  if (!location) return mode === "LOGIC_SET" ? "logic-start" : "start";
  const last: MathNode | undefined = location.seq.items[state.cursor.index - 1];
  if (location.owner?.kind === "script") return "script";
  if (location.owner?.kind === "fraction") return "fraction";
  if (location.owner?.kind === "root") return "root";
  if (location.owner?.kind === "group" || location.owner?.kind === "box")
    return "group";
  if (mode === "LOGIC_SET") {
    if (last?.kind === "token") {
      if (quantifiers.has(last.latex)) return "quantifier";
      if (membership.has(last.latex)) return "membership";
      if (sets.has(last.latex)) return "set";
      if (connectives.has(last.latex)) return "connective";
      if (last.role === "operand") return "subject";
    }
    return "logic-start";
  }
  if (state.afterStructure) return "operand";
  if (!last) return "start";
  if (last.kind !== "token") return "operand";
  if (functions.has(last.latex)) return "function";
  if (last.role === "relation") return "relation";
  if (last.role === "operator") return "operator";
  return "operand";
}

export type SuggestionMemory = Partial<
  Record<SuggestionPhase, Record<string, number>>
>;
const storageKey = "mathflow.suggestion-preferences.v1";
const phases = new Set(Object.keys(candidates));

export function normalizeSuggestionMemory(data: unknown): SuggestionMemory {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const result: SuggestionMemory = {};
  for (const [phase, values] of Object.entries(data)) {
    if (
      !phases.has(phase) ||
      !values ||
      typeof values !== "object" ||
      Array.isArray(values)
    )
      continue;
    const allowed = candidates[phase as SuggestionPhase];
    const counts = Object.fromEntries(
      Object.entries(values)
        .filter(
          ([value, count]) =>
            allowed.includes(value) &&
            Number.isInteger(count) &&
            (count as number) > 0,
        )
        .map(([value, count]) => [value, Math.min(12, count as number)]),
    );
    if (Object.keys(counts).length) result[phase as SuggestionPhase] = counts;
  }
  return result;
}

export function readSuggestionMemory(): SuggestionMemory {
  try {
    return normalizeSuggestionMemory(
      JSON.parse(localStorage.getItem(storageKey) || "{}"),
    );
  } catch {
    return {};
  }
}

export function learnSuggestion(
  memory: SuggestionMemory,
  phase: SuggestionPhase,
  value: string,
): SuggestionMemory {
  if (!candidates[phase].includes(value)) return memory;
  return {
    ...memory,
    [phase]: {
      ...memory[phase],
      [value]: Math.min(12, (memory[phase]?.[value] || 0) + 1),
    },
  };
}

export function saveSuggestionMemory(memory: SuggestionMemory) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(memory));
  } catch {
    // Recommendations remain available without persistent storage.
  }
}

export function suggestionFrame(
  state: MathState,
  mode: Mode,
  pinned: readonly string[],
  memory: SuggestionMemory,
  profile?: ExerciseProfile | null,
): SuggestionFrame {
  const phase = suggestionPhase(state, mode);
  const preferredSets =
    phase === "script"
      ? [
          "\\mathbb{N}",
          "\\mathbb{Z}",
          "\\mathbb{Q}",
          "\\mathbb{R}",
          "\\mathbb{C}",
        ]
      : numberSets;
  const usedSets: string[] = [];
  function collect(nodes: MathNode[]) {
    for (const node of nodes) {
      if (node.kind === "token" && numberSets.includes(node.latex))
        usedSets.push(node.latex);
      if (node.kind === "script") collect([node.base]);
      for (const [, seq] of branches(node)) collect(seq.items);
    }
  }
  collect(state.root.items);
  const rankedSets = [
    ...new Set([
      ...(profile?.enabled
        ? profile.symbols.filter((v) => numberSets.includes(v))
        : []),
      ...usedSets.reverse(),
      ...preferredSets,
    ]),
  ];
  const anchorValues = contextualKeys[phase].map((v) =>
    numberSets.includes(v) ? rankedSets[0] : v,
  );
  const eligible = candidates[phase]
    .filter(
      (value) =>
        !pinned.some((v) => symbolFamily(v) === symbolFamily(value)) &&
        !anchorValues.includes(value),
    )
    .map((value, index) => ({ value, index, symbol: symbolByValue.get(value) }))
    .filter(
      (item): item is { value: string; index: number; symbol: SymbolKey } =>
        !!item.symbol,
    );
  eligible.sort(
    (a, b) =>
      b.index * -0.12 +
        Math.min(12, memory[phase]?.[b.value] || 0) * 0.055 -
        (a.index * -0.12 +
          Math.min(12, memory[phase]?.[a.value] || 0) * 0.055) ||
      a.index - b.index,
  );
  const tailored = profile?.enabled
    ? profile.symbols
        .filter(
          (value) =>
            !pinned.includes(value) &&
            !anchorValues.includes(value) &&
            exerciseFitsPhase(value, phase) &&
            symbolByValue.has(value),
        )
        .slice(0, 2)
    : [];
  const seen = new Set(pinned.map(symbolFamily));
  const predicted: SymbolKey[] = [];
  for (const value of [...tailored, ...eligible.map((item) => item.value)]) {
    const family = symbolFamily(value);
    const symbol = symbolByValue.get(
      numberSets.includes(value) ? rankedSets[0] : value,
    );
    if (seen.has(family) || !symbol) continue;
    seen.add(family);
    predicted.push(symbol);
    if (predicted.length === 2) break;
  }
  const anchors: SymbolKey[] = [];
  for (const value of [
    ...anchorValues,
    ...candidates[phase],
    ...contextualKeys.start,
    "\\land",
    "\\lor",
    "\\mid",
  ]) {
    const family = symbolFamily(value);
    if (seen.has(family)) continue;
    const symbol =
      value === "-1"
        ? {
            label: "−1",
            value: "-1",
            name: "מינוס אחד",
            search: "minus one",
            category: "common" as const,
          }
        : symbolByValue.get(numberSets.includes(value) ? rankedSets[0] : value);
    if (!symbol) continue;
    seen.add(family);
    anchors.push(symbol);
    if (anchors.length === 6 - predicted.length) break;
  }
  return {
    phase,
    label: labels[phase] + (tailored.length ? " · לפי התרגיל" : ""),
    predicted,
    anchors,
    exerciseValues: tailored,
    numberSets: rankedSets.slice(0, 4),
  };
}
