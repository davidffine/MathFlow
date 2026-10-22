export type TokenRole = "operand" | "operator" | "relation" | "logic";
export interface Sequence {
  id: string;
  items: MathNode[];
}
export type MathNode =
  | { id: string; kind: "token"; latex: string; role: TokenRole }
  | { id: string; kind: "fraction"; numerator: Sequence; denominator: Sequence }
  | { id: string; kind: "root"; body: Sequence }
  | {
      id: string;
      kind: "group";
      body: Sequence;
      delimiter: "paren" | "abs" | "square";
    }
  | { id: string; kind: "script"; base: MathNode; sup: Sequence; sub: Sequence }
  | { id: string; kind: "box"; body: Sequence };
export interface Cursor {
  seqId: string;
  index: number;
}
export interface MathSelection {
  seqId: string;
  from: number;
  to: number;
}
export interface ScriptCycle {
  anchorId: string;
  stage: "SUPERSCRIPT" | "SUBSCRIPT";
}
export interface MathState {
  root: Sequence;
  cursor: Cursor;
  cycles: ScriptCycle[];
  selection: MathSelection | null;
  afterStructure: boolean;
}
export const uid = () =>
  "m" +
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
export const sequence = (items: MathNode[] = []): Sequence => ({
  id: uid(),
  items,
});
export const emptyMath = (): MathState => {
  const root = sequence();
  return {
    root,
    cursor: { seqId: root.id, index: 0 },
    cycles: [],
    selection: null,
    afterStructure: false,
  };
};
export function branches(n: MathNode): [string, Sequence][] {
  switch (n.kind) {
    case "fraction":
      return [
        ["numerator", n.numerator],
        ["denominator", n.denominator],
      ];
    case "script":
      return [["sup", n.sup], ["sub", n.sub], ...branches(n.base)];
    case "root":
    case "group":
    case "box":
      return [["body", n.body]];
    default:
      return [];
  }
}
export interface Location {
  seq: Sequence;
  owner: MathNode | null;
  branch: string;
  parent: Sequence | null;
  ownerIndex: number;
}
export function locate(root: Sequence, id: string): Location | null {
  if (root.id === id)
    return {
      seq: root,
      owner: null,
      branch: "root",
      parent: null,
      ownerIndex: -1,
    };
  function inside(
    n: MathNode,
    parent: Sequence,
    index: number,
  ): Location | null {
    const direct: [string, Sequence][] =
      n.kind === "script"
        ? [
            ["sup", n.sup],
            ["sub", n.sub],
          ]
        : branches(n);
    for (const [branch, child] of direct) {
      if (child.id === id)
        return { seq: child, owner: n, branch, parent, ownerIndex: index };
      const found = locate(child, id);
      if (found) return found;
    }
    return n.kind === "script" ? inside(n.base, parent, index) : null;
  }
  for (let i = 0; i < root.items.length; i++) {
    const found = inside(root.items[i], root, i);
    if (found) return found;
  }
  return null;
}
export function findNode(root: Sequence, id: string): MathNode | null {
  for (const n of root.items) {
    if (n.id === id) return n;
    if (n.kind === "script" && n.base.id === id) return n.base;
    for (const [, s] of branches(n)) {
      const f = findNode(s, id);
      if (f) return f;
    }
  }
  return null;
}
export function serializeNode(n: MathNode): string {
  switch (n.kind) {
    case "token":
      return n.latex;
    case "fraction":
      return `\\frac{${latex(n.numerator)}}{${latex(n.denominator)}}`;
    case "root":
      return `\\sqrt{${latex(n.body)}}`;
    case "group":
      return n.delimiter === "abs"
        ? `\\left|${latex(n.body)}\\right|`
        : n.delimiter === "square"
          ? `\\left[${latex(n.body)}\\right]`
          : `\\left(${latex(n.body)}\\right)`;
    case "box":
      return `\\boxed{${latex(n.body)}}`;
    case "script":
      return `{${serializeNode(n.base)}}${n.sub.items.length ? `_{${latex(n.sub)}}` : ""}${n.sup.items.length ? `^{${latex(n.sup)}}` : ""}`;
  }
}
export const latex = (s: Sequence): string =>
  s.items.map(serializeNode).join(" ");
export function hasContent(s: Sequence): boolean {
  return (
    s.items.length > 0 &&
    s.items.every(
      (n) =>
        n.kind === "token" ||
        (n.kind === "script"
          ? completeNode(n.base)
          : branches(n).every(([, b]) => hasContent(b))),
    )
  );
}
export function completeNode(n: MathNode): boolean {
  return (
    n.kind === "token" ||
    (n.kind === "script"
      ? completeNode(n.base) &&
        (!n.sup.items.length || hasContent(n.sup)) &&
        (!n.sub.items.length || hasContent(n.sub))
      : branches(n).every(([, s]) => hasContent(s)))
  );
}
export function editableState(root: Sequence): MathState {
  return {
    root: structuredClone(root),
    cursor: { seqId: root.id, index: root.items.length },
    cycles: [],
    selection: null,
    afterStructure: true,
  };
}
