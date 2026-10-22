import { locate, type MathState } from "../math/model";
import { nextWillInsertLine } from "../navigation/SmartNextEngine";
export type Context =
  | "GENERAL"
  | "FRACTION_NUMERATOR"
  | "FRACTION_DENOMINATOR"
  | "SUPERSCRIPT"
  | "SUBSCRIPT"
  | "ROOT"
  | "GROUP"
  | "AFTER_STRUCTURE"
  | "LOGIC_SET";
export type Mode = "MATH" | "LOGIC_SET";
export function recomputeKeyboardContext(s: MathState): Context {
  const l = locate(s.root, s.cursor.seqId);
  if (!l) return "GENERAL";
  if (l.owner?.kind === "fraction")
    return l.branch === "numerator"
      ? "FRACTION_NUMERATOR"
      : "FRACTION_DENOMINATOR";
  if (l.owner?.kind === "script")
    return l.branch === "sup" ? "SUPERSCRIPT" : "SUBSCRIPT";
  if (l.owner?.kind === "root") return "ROOT";
  if (l.owner?.kind === "group" || l.owner?.kind === "box") return "GROUP";
  if (s.afterStructure) return "AFTER_STRUCTURE";
  return l.seq.items
    .slice(0, s.cursor.index)
    .some((node) => node.kind === "token" && node.role === "logic")
    ? "LOGIC_SET"
    : "GENERAL";
}
export const contextLabel: Record<Context, string> = {
  GENERAL: "כתיבה חופשית",
  FRACTION_NUMERATOR: "מונה",
  FRACTION_DENOMINATOR: "מכנה",
  SUPERSCRIPT: "מעריך",
  SUBSCRIPT: "אינדקס",
  ROOT: "בתוך שורש",
  GROUP: "בתוך סוגריים",
  AFTER_STRUCTURE: "אחרי הביטוי",
  LOGIC_SET: "לוגיקה וקבוצות",
};
export function nextHint(s: MathState): string {
  if (nextWillInsertLine(s)) return "שורה חדשה ↵";
  const c = recomputeKeyboardContext(s);
  return c === "FRACTION_NUMERATOR"
    ? "למכנה ↓"
    : c === "SUPERSCRIPT"
      ? "לאינדקס ↓"
      : ["FRACTION_DENOMINATOR", "SUBSCRIPT", "ROOT", "GROUP"].includes(c)
        ? "החוצה →"
        : s.afterStructure
          ? "המשך →"
          : "למעריך ↑";
}
export interface ModePrediction {
  mode: Mode;
  confidence: "high" | "medium" | "low";
  semanticKey: string;
}
export function predict(s: MathState): ModePrediction {
  const l = locate(s.root, s.cursor.seqId)!;
  const before = l.seq.items.slice(0, s.cursor.index);
  const lastLogic = [...before]
    .reverse()
    .find((n) => n.kind === "token" && n.role === "logic");
  const semanticKey = lastLogic
    ? `${s.root.id}:${l.seq.id}:${lastLogic.id}`
    : `${s.root.id}:${l.seq.id}:math`;
  return {
    mode: lastLogic ? "LOGIC_SET" : "MATH",
    confidence: lastLogic ? "high" : "low",
    semanticKey,
  };
}
export class ModeController {
  mode: Mode = "MATH";
  previous: Mode | null = null;
  override: { semanticKey: string; rejected: Mode } | null = null;
  predict(p: ModePrediction): boolean {
    if (
      p.confidence !== "high" ||
      p.mode === this.mode ||
      (this.override?.semanticKey === p.semanticKey &&
        this.override.rejected === p.mode)
    )
      return false;
    this.previous = this.mode;
    this.mode = p.mode;
    return true;
  }
  manual(mode: Mode, key: string) {
    this.previous = this.mode;
    this.override = {
      semanticKey: key,
      rejected: mode === "MATH" ? "LOGIC_SET" : "MATH",
    };
    this.mode = mode;
  }
  back(key: string): boolean {
    if (!this.previous) return false;
    const rejected = this.mode;
    this.mode = this.previous;
    this.previous = null;
    this.override = { semanticKey: key, rejected };
    return true;
  }
}
