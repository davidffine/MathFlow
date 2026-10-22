import type { EditorState, Transaction } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import { canSplit } from "@tiptap/pm/transform";

// Keep the caret after the split, even when it began beside an inline math atom.
// The caller dispatches this as one document/history action.
export function nextLineTransaction(
  state: EditorState,
  position: number,
): Transaction | null {
  if (!canSplit(state.doc, position)) return null;
  const tr = state.tr.setSelection(TextSelection.create(state.doc, position));
  tr.split(position);
  tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(position, 1)));
  return tr;
}
