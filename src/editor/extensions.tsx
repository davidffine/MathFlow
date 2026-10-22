import {
  Node,
  Mark,
  mergeAttributes,
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TextSelection } from "@tiptap/pm/state";
import Image from "@tiptap/extension-image";
import { renderMath } from "../math/render";
import { editableState, locate, type Sequence } from "../math/model";
import { useFlow } from "./FlowContext";
import { nativeMathTokens } from "./nativeMathInput";
import {
  measureMathSlots,
  resolveMathHit,
  type MathHitSlot,
} from "./mathHitTesting";
export const FinalAnswer = Mark.create({
  name: "finalAnswer",
  addAttributes() {
    return {
      scope: {
        default: "element",
        parseHTML: (element: HTMLElement) =>
          element.dataset.answerScope === "line" ? "line" : "element",
        renderHTML: (attrs: { scope: string }) => ({
          "data-answer-scope": attrs.scope,
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-final-answer]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-final-answer": "true",
        class: "final-answer",
      }),
      0,
    ];
  },
});
export const FontSize = Mark.create({
  name: "fontSize",
  addAttributes() {
    return {
      size: {
        default: "18",
        parseHTML: (e) => e.style.fontSize?.replace("px", "") || "18",
        renderHTML: (a) => ({
          style: `font-size:${Math.min(40, Math.max(12, Number(a.size) || 18))}px`,
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[style*=font-size]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});
function MathView({ node }: NodeViewProps) {
  const flow = useFlow(),
    root = node.attrs.tree as Sequence,
    id = node.attrs.id;
  const active = flow.activeId === id;
  const state = active ? flow.session(id, root) : editableState(root);
  const html = useMemo(
    () => renderMath(state, active),
    [state, active, flow.revision],
  );
  const drag = useRef<{
    seqId: string;
    index: number;
    x: number;
    y: number;
    pointerId: number;
    layout: MathHitSlot[];
  } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeInput = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const lastBackspace = useRef(0);
  useEffect(() => {
    if (active && flow.keyboard === "text") {
      const raf = requestAnimationFrame(() => nativeInput.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [active, flow.keyboard]);
  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current);
    },
    [],
  );
  function flushNativeInput(input: HTMLTextAreaElement) {
    const value = input.value;
    input.value = "";
    for (const latex of nativeMathTokens(value))
      flow.act({ type: "input", latex }, "native-ime");
  }
  function nativeBackspace() {
    const now = performance.now();
    // Some Android IMEs emit keydown, beforeinput and input for one deletion.
    if (now - lastBackspace.current < 35) return;
    lastBackspace.current = now;
    flow.act({ type: "backspace" }, "native-ime");
  }
  return (
    <NodeViewWrapper
      as="span"
      className={`math-node ${node.attrs.display ? "display-math" : ""} ${active ? "active-math" : ""}`}
      contentEditable={false}
      dir="ltr"
      data-equation={id}
      data-latex={node.attrs.latex}
    >
      <span
        className="math-surface"
        role="math"
        aria-label={node.attrs.latex || "נוסחה ריקה"}
        tabIndex={0}
        onPointerDown={(e) => {
          if (!e.isPrimary || e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          const layout = measureMathSlots(e.currentTarget, root);
          const t = resolveMathHit(layout, root.id, {
            x: e.clientX,
            y: e.clientY,
          });
          drag.current = {
            ...t,
            x: e.clientX,
            y: e.clientY,
            pointerId: e.pointerId,
            layout,
          };
          if (!active) flow.activate(id, root);
          flow.manualCursor(id, root, t.seqId, t.index, e.shiftKey);
          if (e.pointerType === "touch") {
            if (hold.current) clearTimeout(hold.current);
            hold.current = setTimeout(() => {
              const length = locate(root, t.seqId)?.seq.items.length || 0;
              if (length) {
                const start = Math.min(t.index, length - 1);
                flow.manualCursor(id, root, t.seqId, start, false, false);
                flow.manualCursor(id, root, t.seqId, start + 1, true, false);
                if (drag.current?.pointerId === e.pointerId)
                  drag.current.index = start;
              } else flow.act({ type: "selectAll" });
              hold.current = null;
            }, 480);
          }
          if (active && flow.keyboard === "text")
            requestAnimationFrame(() => nativeInput.current?.focus());
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (
            d &&
            Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 8 &&
            hold.current
          ) {
            clearTimeout(hold.current);
            hold.current = null;
          }
          if (
            !d ||
            d.pointerId !== e.pointerId ||
            !e.buttons ||
            Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8
          )
            return;
          const t = resolveMathHit(
            d.layout,
            root.id,
            { x: e.clientX, y: e.clientY },
            d.seqId,
          );
          if (t.seqId === d.seqId) {
            flow.manualCursor(id, root, d.seqId, d.index, false, false);
            flow.manualCursor(id, root, t.seqId, t.index, true, false);
          }
        }}
        onPointerUp={() => {
          if (hold.current) clearTimeout(hold.current);
          hold.current = null;
          drag.current = null;
        }}
        onPointerCancel={() => {
          if (hold.current) clearTimeout(hold.current);
          hold.current = null;
          drag.current = null;
        }}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={(e) => {
          e.preventDefault();
          flow.activate(id, root);
          flow.act({ type: "selectAll" });
        }}
        onFocus={() => {
          if (!active) flow.activate(id, root);
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {active && flow.keyboard === "text" && (
        <textarea
          ref={nativeInput}
          className="native-math-input"
          aria-label="הקלדה בתוך הנוסחה"
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          rows={1}
          onBeforeInput={(e) => {
            if (
              (e.nativeEvent as InputEvent).inputType ===
              "deleteContentBackward"
            ) {
              e.preventDefault();
              nativeBackspace();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              nativeBackspace();
            } else if (e.key === "Enter") {
              e.preventDefault();
              flow.act({ type: "next" }, "native-ime");
            }
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            flushNativeInput(e.currentTarget);
          }}
          onInput={(e) => {
            if (
              (e.nativeEvent as InputEvent).inputType ===
              "deleteContentBackward"
            ) {
              nativeBackspace();
              e.currentTarget.value = "";
            } else if (
              !composing.current &&
              !(e.nativeEvent as InputEvent).isComposing
            )
              flushNativeInput(e.currentTarget);
          }}
        />
      )}
    </NodeViewWrapper>
  );
}
export const MathExpression = Node.create({
  name: "mathExpression",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      id: { default: null },
      latex: { default: "" },
      tree: { default: null },
      display: { default: false },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-mathflow]" }];
  },
  renderHTML({ node }) {
    return [
      "span",
      { "data-mathflow": "true", "data-latex": node.attrs.latex },
      node.attrs.latex,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathView, { stopEvent: () => true });
  },
});
function ImageView({
  node,
  updateAttributes,
  deleteNode,
  selected,
  editor,
  getPos,
}: NodeViewProps) {
  const { storage } = useFlow();
  const [src, setSrc] = useState("");
  useEffect(() => {
    let url = "",
      cancelled = false;
    storage.getAsset(node.attrs.assetId).then((blob) => {
      if (blob && !cancelled) {
        url = URL.createObjectURL(blob);
        setSrc(url);
      }
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [node.attrs.assetId, storage]);
  return (
    <NodeViewWrapper
      className="image-node"
      style={{ textAlign: node.attrs.align || "center" }}
      contentEditable={false}
    >
      <img
        src={src || undefined}
        alt={node.attrs.alt || "תמונה במסמך"}
        style={{ width: `${node.attrs.width || 70}%` }}
        onClick={() => {
          const p = getPos();
          if (typeof p === "number") editor.commands.setNodeSelection(p);
        }}
      />
      {selected && (
        <div
          className="image-tools"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) e.preventDefault();
          }}
        >
          <label>
            גודל{" "}
            <input
              aria-label="גודל תמונה"
              type="range"
              min="20"
              max="100"
              value={node.attrs.width || 70}
              onChange={(e) =>
                updateAttributes({ width: Number(e.target.value) })
              }
            />
          </label>
          <button onClick={() => updateAttributes({ align: "right" })}>
            ימין
          </button>
          <button onClick={() => updateAttributes({ align: "center" })}>
            מרכז
          </button>
          <button onClick={() => updateAttributes({ align: "left" })}>
            שמאל
          </button>
          <button
            onClick={() => {
              deleteNode();
              editor.view.dispatch(
                editor.state.tr.setSelection(
                  TextSelection.atEnd(editor.state.doc),
                ),
              );
            }}
          >
            מחיקה
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}
export const FlowImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: { default: null },
      width: { default: 70 },
      align: { default: "center" },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});
