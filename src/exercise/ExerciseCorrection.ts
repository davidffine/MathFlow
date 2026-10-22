export const exerciseCorrections = [
  { value: "∈", name: "שייך" },
  { value: "ℝ", name: "ממשיים" },
  { value: "²", name: "חזקה שנייה" },
  { value: "≤", name: "קטן או שווה" },
  { value: "≥", name: "גדול או שווה" },
  { value: "≠", name: "לא שווה" },
  { value: "³", name: "חזקה שלישית" },
  { value: "∉", name: "לא שייך" },
  { value: "ℕ", name: "טבעיים" },
  { value: "∀", name: "לכל" },
  { value: "∃", name: "קיים" },
  { value: "√", name: "שורש" },
  { value: "∫", name: "אינטגרל" },
  { value: "∑", name: "סכום" },
  { value: "π", name: "פאי" },
] as const;

export function replaceExerciseSelection(
  text: string,
  start: number,
  end: number,
  replacement: string,
): { text: string; caret: number } {
  const from = Math.max(0, Math.min(text.length, start));
  const to = Math.max(from, Math.min(text.length, end));
  const available = Math.max(0, 2000 - (text.length - (to - from)));
  const inserted = replacement.slice(0, available);
  return {
    text: text.slice(0, from) + inserted + text.slice(to),
    caret: from + inserted.length,
  };
}
