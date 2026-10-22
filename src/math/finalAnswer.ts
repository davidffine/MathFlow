import {
  locate,
  sequence,
  uid,
  type MathState,
  type MathNode,
  type Location,
} from "./model";

export function boxAtCursor(state: MathState): {
  location: Location;
  index: number;
  box: Extract<MathNode, { kind: "box" }>;
} | null {
  let location = locate(state.root, state.cursor.seqId);
  if (!location) return null;
  const index = Math.min(state.cursor.index, location.seq.items.length);
  for (const i of [index - 1, index]) {
    const node = location.seq.items[i];
    if (node?.kind === "box") return { location, index: i, box: node };
  }
  // The caret may still be inside the boxed fraction/root/word.
  while (location.parent && location.owner) {
    if (location.owner.kind === "box") {
      const parent = locate(state.root, location.parent.id)!;
      return {
        location: parent,
        index: location.ownerIndex,
        box: location.owner,
      };
    }
    location = locate(state.root, location.parent.id)!;
  }
  return null;
}
export const mathAnswerOn = (state: MathState) => !!boxAtCursor(state);

export function removeMathAnswer(original: MathState): MathState {
  const state = structuredClone(original);
  const target = boxAtCursor(state);
  if (!target) return state;
  const { location, index, box } = target;
  location.seq.items.splice(index, 1, ...box.body.items);
  if (state.cursor.seqId === box.body.id)
    state.cursor = {
      seqId: location.seq.id,
      index: index + state.cursor.index,
    };
  else if (state.cursor.seqId === location.seq.id && state.cursor.index > index)
    state.cursor.index += box.body.items.length - 1;
  if (state.selection?.seqId === box.body.id)
    state.selection = {
      seqId: location.seq.id,
      from: index + state.selection.from,
      to: index + state.selection.to,
    };
  else state.selection = null;
  return state;
}

export function boxMathElement(original: MathState): MathState {
  const state = removeMathAnswer(original);
  let location = locate(state.root, state.cursor.seqId);
  if (!location) return state;
  let from = Math.max(0, state.cursor.index - 1),
    to = Math.min(from + 1, location.seq.items.length);
  if (state.selection?.seqId === location.seq.id) {
    from = state.selection.from;
    to = state.selection.to;
  } else if (!location.seq.items.length && location.parent) {
    // Inside an empty numerator/script, the surrounding structure is the only
    // actual element. Do not create an empty final-answer square.
    from = location.ownerIndex;
    to = from + 1;
    location = locate(state.root, location.parent.id)!;
  } else {
    const node = location.seq.items[from];
    const digit = (n?: MathNode) =>
      n?.kind === "token" && /^[0-9.]$/.test(n.latex);
    if (digit(node)) {
      while (from > 0 && digit(location.seq.items[from - 1])) from--;
      while (to < location.seq.items.length && digit(location.seq.items[to]))
        to++;
    }
  }
  if (to <= from) return state;
  return boxMathRange(state, location.seq.id, from, to);
}

export function boxMathRange(
  original: MathState,
  seqId: string,
  from: number,
  to: number,
  ids?: { box: string; body: string },
): MathState {
  const state = structuredClone(original);
  const location = locate(state.root, seqId);
  if (!location || from < 0 || to > location.seq.items.length || to <= from)
    return state;
  const body = sequence(location.seq.items.slice(from, to));
  if (ids) body.id = ids.body;
  location.seq.items.splice(from, to - from, {
    id: ids?.box ?? uid(),
    kind: "box",
    body,
  });
  if (state.cursor.seqId === location.seq.id) {
    const index = state.cursor.index;
    if (index > from && index < to)
      state.cursor = { seqId: body.id, index: index - from };
    else if (index >= to) state.cursor.index -= to - from - 1;
  }
  state.selection = null;
  return state;
}
