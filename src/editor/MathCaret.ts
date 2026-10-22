import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const mathCaretKey = new PluginKey("mathflow-visible-caret");

// The document stays blurred to keep the system keyboard closed. This widget
// follows the editor's real selection without becoming document content.
export function mathCaretPlugin() {
  return new Plugin({
    key: mathCaretKey,
    props: {
      decorations(state) {
        if (
          !state.selection.empty ||
          !state.selection.$from.parent.inlineContent
        )
          return DecorationSet.empty;
        return DecorationSet.create(state.doc, [
          Decoration.widget(
            state.selection.from,
            () => {
              const caret = document.createElement("span");
              caret.className = "document-math-caret";
              caret.setAttribute("aria-hidden", "true");
              return caret;
            },
            { side: -1, key: "mathflow-caret" },
          ),
        ]);
      },
    },
  });
}
