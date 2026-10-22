import { sequence, uid, type MathNode, type Sequence } from "../math/model";
import type { ExactResult } from "./ExactArithmetic";

function digits(text: string): MathNode[] {
  return [...text].map((latex) => ({
    id: uid(),
    kind: "token" as const,
    latex,
    role: latex === "-" ? ("operator" as const) : ("operand" as const),
  }));
}
export function resultNodes(result: ExactResult): MathNode[] {
  if (result.denominator === "1") return digits(result.numerator);
  return [
    {
      id: uid(),
      kind: "fraction",
      numerator: sequence(digits(result.numerator)),
      denominator: sequence(digits(result.denominator)),
    },
  ];
}
export function resultSequence(result: ExactResult): Sequence {
  return sequence(resultNodes(result));
}
