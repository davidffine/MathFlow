import { Node, type JSONContent } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { symbolByValue } from "../keyboard/symbols";
import { roleOf } from "../navigation/SmartNextEngine";
import { type MathNode, type MathState, type Sequence } from "../math/model";

const visible: Record<string, string> = {
  "\\times": "×",
  "\\div": "÷",
  "\\cdot": "·",
  "\\pm": "±",
  "\\mp": "∓",
  "\\bmod": "mod",
  "\\le": "≤",
  "\\ge": "≥",
  "\\ne": "≠",
  "-": "−",
};

export function glyphForLatex(value: string): string {
  return visible[value] || symbolByValue.get(value)?.label || value;
}

const spacedRelations = new Set([
  "=",
  "<",
  ">",
  "\\le",
  "\\ge",
  "\\ne",
  "\\approx",
  "\\equiv",
  "\\in",
  "\\notin",
  "\\ni",
  "\\not\\ni",
  "\\subset",
  "\\subseteq",
  "\\supset",
  "\\supseteq",
  "\\nsubseteq",
  "\\nsupseteq",
  "\\not\\subset",
  "\\not\\supset",
  "\\Rightarrow",
  "\\Leftarrow",
  "\\Leftrightarrow",
  "\\nRightarrow",
]);
const thinSpacedOperators = new Set([
  "\\cdot",
  "\\times",
  "\\div",
  "\\cup",
  "\\cap",
  "\\setminus",
  "\\oplus",
  "\\otimes",
  "\\land",
  "\\lor",
]);
const quantifiedPrefixes = new Set(["\\forall", "\\exists", "\\nexists"]);

// The spaces belong to the glyph atom, so Backspace and undo remove one
// mathematical action rather than leaving two stray space characters behind.
export function typesetGlyph(
  value: string,
  glyph = glyphForLatex(value),
): string {
  if (spacedRelations.has(value)) return `\u00a0${glyph}\u00a0`;
  if (thinSpacedOperators.has(value)) return `\u2009${glyph}\u2009`;
  if (quantifiedPrefixes.has(value)) return `${glyph}\u2009`;
  return glyph;
}

// A mathematical character is one editable unit in the same Tiptap paragraph
// as ordinary text. LaTeX stays authoritative even when the visible glyph is
// Unicode; native Backspace therefore crosses keyboard boundaries naturally.
export const MathGlyph = Node.create({
  name: "mathGlyph",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.dataset.mathGlyph || element.dataset.latex || "",
      },
      glyph: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          glyphForLatex(
            element.dataset.mathGlyph || element.dataset.latex || "",
          ) ||
          element.textContent ||
          "",
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-math-glyph]" }];
  },
  renderHTML({ node }) {
    return [
      "span",
      {
        class:
          node.attrs.latex === "\\bmod"
            ? "math-glyph math-word-operator"
            : "math-glyph",
        contenteditable: "false",
        "data-math-glyph": node.attrs.latex,
        "data-latex": node.attrs.latex,
      },
      typesetGlyph(
        node.attrs.latex,
        node.attrs.glyph || glyphForLatex(node.attrs.latex),
      ),
    ];
  },
});

// Preserve old notes while making token-only expressions individually editable.
// Structured expressions remain a single structural node for Smart NEXT.
export function migrateInlineMath(content: JSONContent): JSONContent {
  const converted = (content.content || []).flatMap((child) => {
    const tree = child.attrs?.tree as Sequence | undefined;
    if (
      child.type === "mathExpression" &&
      tree?.items?.length &&
      tree.items.every((item) => item.kind === "token") &&
      !child.attrs?.display
    )
      return tree.items.map((item) => ({
        type: "mathGlyph",
        attrs: { latex: item.latex, glyph: glyphForLatex(item.latex) },
        ...(child.marks ? { marks: child.marks } : {}),
      }));
    return [
      child.content
        ? { ...child, content: migrateInlineMath(child).content }
        : child,
    ];
  });
  return { ...content, content: converted };
}

// A snapshot for predictions and the keyboard hint while the Tiptap caret is
// between glyphs/text. IDs derive from document positions, so Back overrides
// remain stable until the actual semantic context changes.
export function inlineMathState(doc: ProseMirrorNode, pos: number): MathState {
  const resolved = doc.resolve(pos);
  const parent = resolved.parent;
  const items: MathNode[] = [];
  let end = resolved.parentOffset;
  let done = false;
  while (end > 0 && items.length < 24 && !done) {
    const { node, offset } = parent.childBefore(end);
    if (!node) break;
    if (node.type.name === "mathGlyph") {
      const value = String(node.attrs.latex);
      items.push({
        id: `glyph:${resolved.start() + offset}`,
        kind: "token",
        latex: value,
        role: roleOf(value),
      });
      end = offset;
    } else if (node.isText) {
      const text = (node.text || "").slice(0, end - offset);
      for (let i = text.length - 1; i >= 0 && items.length < 24; i--) {
        const char = text[i];
        if (/\s/.test(char)) continue;
        if (!/[A-Za-z0-9+\-=<>.,]/.test(char)) {
          done = true;
          break;
        }
        items.push({
          id: `text:${resolved.start() + offset + i}`,
          kind: "token",
          latex: char,
          role: roleOf(char),
        });
      }
      end = offset;
    } else done = true;
  }
  const root: Sequence = {
    id: `inline:${resolved.start()}`,
    items: items.reverse(),
  };
  return {
    root,
    cursor: { seqId: root.id, index: root.items.length },
    cycles: [],
    selection: null,
    afterStructure: false,
  };
}
