import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  locate,
  type MathNode,
  type MathState,
  type Sequence,
} from "../math/model";
import { calculationFromPrefix, type ExactResult } from "./ExactArithmetic";

function sequenceText(seq: Sequence): string {
  return seq.items.map(nodeText).join("");
}
function tokenText(latex: string): string {
  const known: Record<string, string> = {
    "\\cdot": "*",
    "\\times": "*",
    "\\div": "/",
  };
  return known[latex] || latex;
}
function nodeText(node: MathNode): string {
  if (node.kind === "token") return tokenText(node.latex);
  if (node.kind === "fraction")
    return `(${sequenceText(node.numerator)})/(${sequenceText(node.denominator)})`;
  if (node.kind === "group" && node.delimiter === "paren")
    return `(${sequenceText(node.body)})`;
  if (node.kind === "script" && !node.sub.items.length && node.sup.items.length)
    return `(${nodeText(node.base)})^(${sequenceText(node.sup)})`;
  return "?";
}
function before(doc: ProseMirrorNode, pos: number): string {
  const resolved = doc.resolve(pos);
  const parent = resolved.parent;
  let offset = resolved.parentOffset;
  let prefix = "";
  while (offset > 0 && prefix.length < 130) {
    const previous = parent.childBefore(offset);
    if (!previous.node) break;
    const node = previous.node;
    const part = node.isText
      ? (node.text || "").slice(0, offset - previous.offset)
      : node.type.name === "mathGlyph"
        ? tokenText(String(node.attrs.latex))
        : node.type.name === "mathExpression" && node.attrs.tree
          ? sequenceText(node.attrs.tree as Sequence)
          : "?";
    prefix = part + prefix;
    offset = previous.offset;
  }
  return prefix.slice(-130);
}
export function calculationAtCursor(
  doc: ProseMirrorNode,
  pos: number,
  active?: { position: number; state: MathState } | null,
  selectionEmpty = true,
): ExactResult | null {
  if (!selectionEmpty) return null;
  if (!active) return calculationFromPrefix(before(doc, pos));
  const { root, cursor } = active.state;
  const location = locate(root, cursor.seqId);
  if (!location || location.owner || active.state.selection) return null;
  const prefix = root.items.slice(0, cursor.index).map(nodeText).join("");
  return calculationFromPrefix(before(doc, active.position) + prefix);
}
