import type { SuggestionPhase } from "../keyboard/AdaptiveSuggestions";

export type ExerciseTopic =
  "sets" | "calculus" | "trigonometry" | "geometry" | "algebra" | "general";

export interface ExerciseProfile {
  text: string;
  topic: ExerciseTopic;
  symbols: string[];
  enabled: boolean;
}

export const topicLabels: Record<ExerciseTopic, string> = {
  sets: "קבוצות ולוגיקה",
  calculus: "חדו״א",
  trigonometry: "טריגונומטריה",
  geometry: "גאומטריה",
  algebra: "אלגברה",
  general: "כללי",
};

const topics: {
  topic: Exclude<ExerciseTopic, "general">;
  match: RegExp;
  symbols: string[];
}[] = [
  {
    topic: "sets",
    match:
      /קבוצ|לכל|(?:^|[\s,:;]|ש)קיי(?:ם|מת)|שייכ|איחוד|חיתוך|תת.?קבוצ|לוגי|(?:^|\W)(?:sets?|logic|prove|forall|exists)(?:\W|$)|[∀∃∈∉∪∩⊆]/iu,
    symbols: [
      "\\forall",
      "\\in",
      "\\mathbb{R}",
      "\\Rightarrow",
      "\\cup",
      "\\cap",
    ],
  },
  {
    topic: "calculus",
    match:
      /אינטגרל|נגזר|גבול|טור|סכום|(?:^|\W)(?:integral|derivative|limit|series)(?:\W|$)|[∫∂∑]/iu,
    symbols: ["\\int", "\\lim", "\\infty", "\\partial", "\\sum"],
  },
  {
    topic: "trigonometry",
    match:
      /טריגונומטר|סינוס|קוסינוס|טנגנס|(?:^|\W)(?:sin|cos|tan|trigonometry)(?:\W|$)/iu,
    symbols: ["\\sin", "\\cos", "\\tan", "\\pi", "\\theta"],
  },
  {
    topic: "geometry",
    match:
      /משולש|זווית|מעגל|מקביל|מאונך|(?:^|\W)(?:triangle|angle|perpendicular|geometry)(?:\W|$)|[△∠⊥∥]/iu,
    symbols: ["\\angle", "\\triangle", "\\perp", "\\parallel"],
  },
  {
    topic: "algebra",
    match:
      /משווא|פולינום|פרבול|שורש|ריבועי|(?:^|\W)(?:equation|polynomial|quadratic|root)(?:\W|$)|[√±Δ]/iu,
    symbols: ["\\pm", "\\Delta", "root", "\\ne"],
  },
];

// Only these explicit signs and words can influence suggestions. The exercise
// never becomes a command or a formula in the document.
const explicit: { match: RegExp; value: string }[] = [
  { match: /∀|לכל|\\forall/iu, value: "\\forall" },
  { match: /∃|(?:^|[\s,:;]|ש)קיי(?:ם|מת)|\\exists/iu, value: "\\exists" },
  { match: /∈|שייכ|\\in(?:\b|$)/iu, value: "\\in" },
  { match: /∉|לא שייכ|\\notin/iu, value: "\\notin" },
  { match: /ℝ|ממשיים|\bR\b|\\mathbb\{R\}/u, value: "\\mathbb{R}" },
  { match: /ℕ|טבעיים|\bN\b|\\mathbb\{N\}/u, value: "\\mathbb{N}" },
  { match: /∪|איחוד|\\cup/iu, value: "\\cup" },
  { match: /∩|חיתוך|\\cap/iu, value: "\\cap" },
  { match: /⊆|תת.?קבוצ|\\subseteq/iu, value: "\\subseteq" },
  { match: /⇒|גורר|\\Rightarrow/iu, value: "\\Rightarrow" },
  { match: /≤|קטן או שווה|\\le(?:q)?\b/iu, value: "\\le" },
  { match: /≥|גדול או שווה|\\ge(?:q)?\b/iu, value: "\\ge" },
  { match: /≠|לא שווה|\\ne(?:q)?\b/iu, value: "\\ne" },
  { match: /∫|אינטגרל|\\int\b/iu, value: "\\int" },
  { match: /∑|סכום|\\sum\b/iu, value: "\\sum" },
  { match: /∂|נגזרת חלקית|\\partial/iu, value: "\\partial" },
  { match: /lim|גבול|\\lim\b/iu, value: "\\lim" },
  { match: /∞|אינסוף|\\infty/iu, value: "\\infty" },
  { match: /(?:^|[^a-z])sin(?=[^a-z]|$)|סינוס|\\sin\b/iu, value: "\\sin" },
  { match: /(?:^|[^a-z])cos(?=[^a-z]|$)|קוסינוס|\\cos\b/iu, value: "\\cos" },
  { match: /(?:^|[^a-z])tan(?=[^a-z]|$)|טנגנס|\\tan\b/iu, value: "\\tan" },
  { match: /π|פאי|\\pi\b/iu, value: "\\pi" },
  { match: /θ|תטא|\\theta/iu, value: "\\theta" },
  { match: /∠|זווית|\\angle/iu, value: "\\angle" },
  { match: /△|משולש|\\triangle/iu, value: "\\triangle" },
  { match: /⊥|מאונך|\\perp/iu, value: "\\perp" },
  { match: /√|שורש|\\sqrt/iu, value: "root" },
  { match: /±|פלוס מינוס|\\pm\b/iu, value: "\\pm" },
  { match: /Δ|דלתא|\\Delta/iu, value: "\\Delta" },
];

// Mathematical notation alone often identifies an algebra exercise in a
// photographed question. Require a variable/function, so arithmetic such as
// "2+2=4" does not change the keyboard. A more specific topic still wins.
const algebraNotation =
  /(?:\b[a-z]\s*(?:\^\s*\d+|[²³⁴])|\b[fgh]\s*\(\s*[a-z]\s*\)|\b[a-z]\s*(?:=|≠|≤|≥|<|>)\s*(?:[a-z\d]|[+−-]\s*\d))/iu;

export function analyzeExercise(text: string): ExerciseProfile | null {
  const clean = text.trim().slice(0, 2000);
  if (!clean) return null;
  // A domain such as R can occur in any topic. Prefer the most specific
  // operation mentioned rather than assuming a set-theory exercise.
  const priority: ExerciseTopic[] = [
    "calculus",
    "trigonometry",
    "geometry",
    "algebra",
    "sets",
    "general",
  ];
  const topic =
    [...topics]
      .sort((a, b) => priority.indexOf(a.topic) - priority.indexOf(b.topic))
      .find((item) => item.match.test(clean)) ||
    (algebraNotation.test(clean)
      ? topics.find((item) => item.topic === "algebra")
      : undefined);
  const symbols = [
    ...new Set([
      ...explicit
        .filter((item) => item.match.test(clean))
        .map((item) => item.value),
      ...(topic?.symbols || []),
    ]),
  ];
  return {
    text: clean,
    topic: topic?.topic || "general",
    symbols,
    enabled: true,
  };
}

const operands = new Set([
  "\\mathbb{R}",
  "\\mathbb{N}",
  "\\pi",
  "\\theta",
  "\\Delta",
  "\\infty",
  "\\sin",
  "\\cos",
  "\\tan",
  "\\int",
  "\\lim",
  "\\sum",
  "root",
  "\\forall",
  "\\exists",
  "\\triangle",
  "\\angle",
]);
const relations = new Set([
  "\\ne",
  "\\in",
  "\\notin",
  "\\subseteq",
  "\\Rightarrow",
  "\\cup",
  "\\cap",
  "\\le",
  "\\ge",
  "\\perp",
  "\\parallel",
]);

export function exerciseFitsPhase(
  value: string,
  phase: SuggestionPhase,
): boolean {
  if (["fraction", "root", "script"].includes(phase))
    return [
      "\\mathbb{R}",
      "\\mathbb{N}",
      "\\pi",
      "\\theta",
      "\\infty",
      "\\Delta",
    ].includes(value);
  if (["operand", "subject", "set", "group"].includes(phase))
    return relations.has(value);
  if (phase === "membership")
    return value === "\\mathbb{R}" || value === "\\mathbb{N}";
  if (phase === "quantifier") return value === "\\in" || value === "\\notin";
  if (phase === "connective") return operands.has(value);
  return operands.has(value) || value === "\\pm";
}
