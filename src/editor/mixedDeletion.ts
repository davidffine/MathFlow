import { editableState, type MathNode, type Sequence } from "../math/model";
import { reduceMath } from "../navigation/SmartNextEngine";

function deepestEnd(root: Sequence): { seqId: string; index: number } {
  let seq = root;
  while (seq.items.length) {
    const node = seq.items[seq.items.length - 1];
    const child =
      node.kind === "script"
        ? node.sub.items.length
          ? node.sub
          : node.sup.items.length
            ? node.sup
            : null
        : node.kind === "fraction"
          ? node.denominator.items.length
            ? node.denominator
            : node.numerator.items.length
              ? node.numerator
              : null
          : node.kind === "root" || node.kind === "group" || node.kind === "box"
            ? node.body.items.length
              ? node.body
              : null
            : null;
    if (!child) break;
    seq = child;
  }
  return { seqId: seq.id, index: seq.items.length };
}

function prune(root: Sequence): Sequence {
  function normalize(node: MathNode): MathNode {
    if (node.kind === "script") {
      node.base = normalize(node.base);
      prune(node.sup);
      prune(node.sub);
      return node.sup.items.length || node.sub.items.length ? node : node.base;
    }
    if (node.kind === "fraction") {
      prune(node.numerator);
      prune(node.denominator);
    } else if (
      node.kind === "root" ||
      node.kind === "group" ||
      node.kind === "box"
    )
      prune(node.body);
    return node;
  }
  root.items = root.items.map(normalize);
  return root;
}

// Text-mode and Math-mode Backspace use this on a structured expression to
// remove one rightmost mathematical unit, then remove the empty structure on
// the following press. It never leaves phantom empty scripts in storage/PDF.
export function popMathUnit(root: Sequence): Sequence {
  const state = editableState(root);
  state.cursor = deepestEnd(state.root);
  return prune(reduceMath(state, { type: "backspace" }).state.root);
}
