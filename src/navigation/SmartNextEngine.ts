import {
  branches,
  completeNode,
  emptyMath,
  findNode,
  hasContent,
  latex,
  locate,
  sequence,
  uid,
  type MathNode,
  type MathState,
  type Sequence,
  type TokenRole,
} from "../math/model";
export type MathAction =
  | { type: "input"; latex: string; role?: TokenRole }
  | { type: "insertResult"; nodes: MathNode[] }
  | {
      type: "structure";
      kind: "fraction" | "root" | "group" | "square" | "abs" | "power";
    }
  | {
      type:
        | "next"
        | "previous"
        | "up"
        | "down"
        | "backspace"
        | "reciprocal"
        | "closeSquare"
        | "box"
        | "toggleBox"
        | "toggleBoxAll"
        | "unbox"
        | "selectAll";
    }
  | { type: "cursor"; seqId: string; index: number; extend?: boolean };
export interface EngineResult {
  state: MathState;
  changed: boolean;
  escaped: boolean;
  miss: boolean;
}
// Only unambiguous relations can escape a completed exponent/subscript.
const relations = new Set([
  "=",
  "\\le",
  "\\ge",
  "\\ne",
  "<",
  ">",
  "\\approx",
  "\\equiv",
]);
const logicalAtom =
  /^\\(forall|exists|nexists|in|notin|ni|not\\ni|not\\subset|not\\supset|subset|subseteq|nsubseteq|supset|supseteq|nsupseteq|cup|cap|bigcup|bigcap|setminus|varnothing|mathbb|land|lor|neg|Rightarrow|nRightarrow|Leftarrow|Leftrightarrow|vdash|models|top|bot|therefore|because)(?![A-Za-z])/;
export function roleOf(s: string): TokenRole {
  return relations.has(s)
    ? "relation"
    : logicalAtom.test(s)
      ? "logic"
      : /^(\+|-|\\times|\\cdot|\\div|\\bmod|\\oplus|\\otimes|,|;)$/.test(s)
        ? "operator"
        : "operand";
}
export function currentLocation(s: MathState) {
  return locate(s.root, s.cursor.seqId)!;
}
function move(s: MathState, seq: Sequence, index: number) {
  s.cursor = {
    seqId: seq.id,
    index: Math.max(0, Math.min(index, seq.items.length)),
  };
  s.selection = null;
  s.afterStructure = false;
}
function removeSelection(s: MathState) {
  if (!s.selection) return;
  const sel = s.selection;
  const l = locate(s.root, sel.seqId);
  if (l) {
    l.seq.items.splice(sel.from, sel.to - sel.from);
    move(s, l.seq, sel.from);
  }
  s.selection = null;
  s.cycles = [];
}
function pruneEmptyScript(
  s: MathState,
  n: MathNode,
  parent: Sequence,
  i: number,
) {
  if (n.kind === "script" && !n.sup.items.length && !n.sub.items.length)
    parent.items[i] = n.base;
  s.cycles = s.cycles.filter((c) => c.anchorId !== n.id);
}
function exit(s: MathState): boolean {
  const l = currentLocation(s);
  if (!l?.parent || !l.owner) return false;
  pruneEmptyScript(s, l.owner, l.parent, l.ownerIndex);
  move(s, l.parent, l.ownerIndex + 1);
  s.afterStructure = true;
  return true;
}
function script(s: MathState): boolean {
  const l = currentLocation(s);
  let n = l.seq.items[s.cursor.index - 1];
  if (!n || (n.kind === "token" && n.role !== "operand")) return false;
  if (n.kind !== "script") {
    n = {
      id: uid(),
      kind: "script",
      base: n,
      sup: sequence(),
      sub: sequence(),
    };
    l.seq.items[s.cursor.index - 1] = n;
  }
  s.cycles = s.cycles.filter((c) => c.anchorId !== n.id);
  s.cycles.push({ anchorId: n.id, stage: "SUPERSCRIPT" });
  move(s, n.sup, n.sup.items.length);
  return true;
}
function next(s: MathState): boolean {
  const l = currentLocation(s);
  if (!l) return false;
  // The innermost structural obligation wins. Never rediscover a base from its last character.
  if (l.owner?.kind === "fraction") {
    if (l.branch === "numerator") {
      move(s, l.owner.denominator, l.owner.denominator.items.length);
      return true;
    }
    return exit(s);
  }
  if (
    l.owner?.kind === "root" ||
    l.owner?.kind === "group" ||
    l.owner?.kind === "box"
  )
    return exit(s);
  if (l.owner?.kind === "script") {
    const anchor = l.owner;
    const cycle = s.cycles.find((c) => c.anchorId === anchor.id);
    if (l.branch === "sup") {
      if (cycle) cycle.stage = "SUBSCRIPT";
      else s.cycles.push({ anchorId: anchor.id, stage: "SUBSCRIPT" });
      move(s, anchor.sub, anchor.sub.items.length);
      return true;
    }
    return exit(s);
  }
  if (!s.afterStructure && script(s)) return true;
  if (s.cursor.index < l.seq.items.length) {
    move(s, l.seq, s.cursor.index + 1);
    return true;
  }
  return false;
}
// A pure preview of NEXT's structural decision. The document editor handles
// the final dead end by splitting the paragraph; the math reducer stays pure.
export function nextWillInsertLine(s: MathState): boolean {
  const l = locate(s.root, s.cursor.seqId);
  if (!l) return true;
  if (l.owner) return false;
  const before = l.seq.items[s.cursor.index - 1];
  const canStartScript =
    !s.afterStructure &&
    !!before &&
    (before.kind !== "token" || before.role === "operand");
  return !canStartScript && s.cursor.index >= l.seq.items.length;
}
function previous(s: MathState): boolean {
  const l = currentLocation(s);
  if (l.owner?.kind === "script" && l.branch === "sub") {
    move(s, l.owner.sup, l.owner.sup.items.length);
    s.cycles = [
      ...s.cycles.filter((c) => c.anchorId !== l.owner!.id),
      { anchorId: l.owner.id, stage: "SUPERSCRIPT" },
    ];
    return true;
  }
  if (l.owner?.kind === "fraction" && l.branch === "denominator") {
    move(s, l.owner.numerator, l.owner.numerator.items.length);
    return true;
  }
  if (s.cursor.index > 0) {
    const n = l.seq.items[s.cursor.index - 1];
    const bs =
      n.kind === "script"
        ? (
            [
              ["sup", n.sup],
              ["sub", n.sub],
            ] as [string, Sequence][]
          ).filter(([, seq]) => seq.items.length)
        : branches(n);
    if (bs.length) {
      const dest = bs[bs.length - 1][1];
      move(s, dest, dest.items.length);
    } else move(s, l.seq, s.cursor.index - 1);
    return true;
  }
  if (l.parent) {
    move(s, l.parent, l.ownerIndex);
    return true;
  }
  return false;
}
function down(s: MathState): boolean {
  const l = currentLocation(s);
  if (l.owner?.kind === "fraction") {
    const dest =
      l.branch === "numerator" ? l.owner.denominator : l.owner.numerator;
    move(s, dest, dest.items.length);
    return true;
  }
  if (l.owner?.kind === "script") {
    const dest = l.branch === "sup" ? l.owner.sub : l.owner.sup;
    move(s, dest, dest.items.length);
    s.cycles = [
      {
        anchorId: l.owner.id,
        stage: l.branch === "sup" ? "SUBSCRIPT" : "SUPERSCRIPT",
      },
    ];
    return true;
  }
  return false;
}
function semanticEscape(s: MathState, value: string): boolean {
  if (!relations.has(value)) return false;
  let escaped = false;
  // Only complete, terminal scripts/denominators/roots escape. Groups deliberately stay: (x=2) is valid.
  for (let depth = 0; depth < 16; depth++) {
    const l = currentLocation(s);
    if (s.cursor.index !== l.seq.items.length || !hasContent(l.seq) || !l.owner)
      break;
    const eligible =
      l.owner.kind === "script" ||
      l.owner.kind === "root" ||
      (l.owner.kind === "fraction" &&
        l.branch === "denominator" &&
        completeNode(l.owner));
    if (!eligible) break;
    escaped = exit(s) || escaped;
  }
  return escaped;
}
export function reduceMath(input: MathState, action: MathAction): EngineResult {
  const s = structuredClone(input);
  let escaped = false,
    miss = false;
  if (!locate(s.root, s.cursor.seqId)) {
    s.cursor = { seqId: s.root.id, index: s.root.items.length };
    s.cycles = [];
    s.selection = null;
  }
  const before = latex(s.root);
  switch (action.type) {
    case "cursor": {
      const l = locate(s.root, action.seqId);
      if (!l) {
        miss = true;
        break;
      }
      const old = s.cursor;
      move(s, l.seq, action.index);
      s.cycles = [];
      if (action.extend && old.seqId === s.cursor.seqId)
        s.selection = {
          seqId: old.seqId,
          from: Math.min(old.index, s.cursor.index),
          to: Math.max(old.index, s.cursor.index),
        };
      break;
    }
    case "input":
      removeSelection(s);
      escaped = semanticEscape(s, action.latex);
      {
        const l = currentLocation(s);
        l.seq.items.splice(s.cursor.index++, 0, {
          id: uid(),
          kind: "token",
          latex: action.latex,
          role: action.role ?? roleOf(action.latex),
        });
        s.afterStructure = false;
      }
      break;
    case "insertResult": {
      removeSelection(s);
      const l = currentLocation(s);
      l.seq.items.splice(s.cursor.index, 0, ...action.nodes);
      s.cursor.index += action.nodes.length;
      s.afterStructure = true;
      break;
    }
    case "structure": {
      if (action.kind === "power") {
        miss = !script(s);
        break;
      }
      let selected: MathNode[] = [];
      if (s.selection) {
        const sel = s.selection,
          l = locate(s.root, sel.seqId)!;
        selected = l.seq.items.slice(sel.from, sel.to);
        removeSelection(s);
      }
      const l = currentLocation(s);
      let n: MathNode;
      if (action.kind === "fraction")
        n = {
          id: uid(),
          kind: "fraction",
          numerator: sequence(selected),
          denominator: sequence(),
        };
      else if (action.kind === "root")
        n = { id: uid(), kind: "root", body: sequence(selected) };
      else
        n = {
          id: uid(),
          kind: "group",
          body: sequence(selected),
          delimiter:
            action.kind === "abs"
              ? "abs"
              : action.kind === "square"
                ? "square"
                : "paren",
        };
      l.seq.items.splice(s.cursor.index, 0, n);
      const child = branches(n)[0][1];
      move(s, child, child.items.length);
      break;
    }
    case "reciprocal": {
      let denominator: MathNode[] = [];
      if (s.selection) {
        const sel = s.selection;
        denominator = locate(s.root, sel.seqId)!.seq.items.slice(
          sel.from,
          sel.to,
        );
        removeSelection(s);
      } else {
        const l = currentLocation(s),
          before = l.seq.items[s.cursor.index - 1];
        if (before && (before.kind !== "token" || before.role === "operand")) {
          denominator = l.seq.items.splice(--s.cursor.index, 1);
          s.cycles = s.cycles.filter((c) => !!findNode(s.root, c.anchorId));
        }
      }
      const l = currentLocation(s);
      const n: MathNode = {
        id: uid(),
        kind: "fraction",
        numerator: sequence([
          { id: uid(), kind: "token", latex: "1", role: "operand" },
        ]),
        denominator: sequence(denominator),
      };
      l.seq.items.splice(s.cursor.index, 0, n);
      move(s, n.denominator, n.denominator.items.length);
      break;
    }
    case "closeSquare": {
      const l = currentLocation(s);
      if (l.owner?.kind === "group" && l.owner.delimiter === "square") exit(s);
      else {
        removeSelection(s);
        const dest = currentLocation(s);
        dest.seq.items.splice(s.cursor.index++, 0, {
          id: uid(),
          kind: "token",
          latex: "]",
          role: "operand",
        });
        s.afterStructure = false;
      }
      break;
    }
    case "next":
      miss = !next(s);
      break;
    case "previous":
      miss = !previous(s);
      break;
    case "up":
      miss = !exit(s);
      break;
    case "down":
      miss = !down(s);
      break;
    case "backspace": {
      if (s.selection) {
        removeSelection(s);
        break;
      }
      const l = currentLocation(s);
      if (s.cursor.index > 0) {
        l.seq.items.splice(--s.cursor.index, 1);
        s.afterStructure = false;
        s.cycles = s.cycles.filter((c) => !!findNode(s.root, c.anchorId));
      } else if (l.parent && l.owner) {
        if (
          !l.seq.items.length &&
          branches(l.owner).every(([, b]) => !b.items.length)
        ) {
          if (l.owner.kind === "script") {
            l.parent.items[l.ownerIndex] = l.owner.base;
            move(s, l.parent, l.ownerIndex + 1);
          } else {
            l.parent.items.splice(l.ownerIndex, 1);
            move(s, l.parent, l.ownerIndex);
          }
        } else exit(s);
      } else miss = true;
      break;
    }
    case "selectAll":
      s.selection = { seqId: s.root.id, from: 0, to: s.root.items.length };
      break;
    case "box": {
      if (!s.selection || s.selection.from === s.selection.to) {
        miss = true;
        break;
      }
      const sel = s.selection,
        l = locate(s.root, sel.seqId)!;
      const chosen = l.seq.items.slice(sel.from, sel.to);
      const n: MathNode = { id: uid(), kind: "box", body: sequence(chosen) };
      l.seq.items.splice(sel.from, sel.to - sel.from, n);
      move(s, l.seq, sel.from + 1);
      break;
    }
    case "toggleBox": {
      if (!s.selection || s.selection.from === s.selection.to) {
        miss = true;
        break;
      }
      const sel = s.selection,
        l = locate(s.root, sel.seqId)!;
      const chosen = l.seq.items.slice(sel.from, sel.to);
      if (chosen.length === 1 && chosen[0].kind === "box")
        l.seq.items.splice(sel.from, 1, ...chosen[0].body.items);
      else
        l.seq.items.splice(sel.from, sel.to - sel.from, {
          id: uid(),
          kind: "box",
          body: sequence(chosen),
        });
      move(
        s,
        l.seq,
        sel.from +
          (chosen.length === 1 && chosen[0].kind === "box"
            ? chosen[0].body.items.length
            : 1),
      );
      break;
    }
    case "toggleBoxAll": {
      const previous = s.root.items;
      if (previous.length === 1 && previous[0].kind === "box")
        s.root.items = previous[0].body.items;
      else if (previous.length)
        s.root.items = [{ id: uid(), kind: "box", body: sequence(previous) }];
      else {
        miss = true;
        break;
      }
      move(s, s.root, s.root.items.length);
      s.cycles = [];
      break;
    }
    case "unbox": {
      const l = currentLocation(s);
      const range =
        s.selection && s.selection.seqId === l.seq.id
          ? s.selection
          : { from: Math.max(0, s.cursor.index - 1), to: s.cursor.index };
      const nodes = l.seq.items.slice(range.from, range.to);
      l.seq.items.splice(
        range.from,
        range.to - range.from,
        ...nodes.flatMap((n) => (n.kind === "box" ? n.body.items : [n])),
      );
      move(s, l.seq, l.seq.items.length);
      break;
    }
  }
  return { state: s, changed: before !== latex(s.root), escaped, miss };
}
export { emptyMath };
