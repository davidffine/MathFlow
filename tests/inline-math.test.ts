import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import {
  glyphForLatex,
  typesetGlyph,
  inlineMathState,
  migrateInlineMath,
} from "../src/editor/inlineMath";
import { popMathUnit } from "../src/editor/mixedDeletion";
import { emptyMath, latex } from "../src/math/model";
import { predict } from "../src/context/KeyboardContextEngine";
import { reduceMath, roleOf } from "../src/navigation/SmartNextEngine";
import { renderPdfDocument } from "../src/pdf/PdfRenderer";
import type {
  FlowDocument,
  PersistenceService,
} from "../src/persistence/PersistenceService";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*" },
    text: { group: "inline" },
    mathGlyph: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: { latex: {}, glyph: {} },
    },
  },
});
const glyph = (value: string) =>
  schema.nodes.mathGlyph.create({ latex: value, glyph: glyphForLatex(value) });

describe("continuous mixed writing", () => {
  it("inserts math between two ordinary letters, then deletes across keyboard origins", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("a"),
        glyph("x"),
        schema.text("b"),
      ]),
    ]);
    let state = EditorState.create({
      doc,
      schema,
      selection: TextSelection.create(doc, 3),
    });
    state = state.apply(state.tr.replaceSelectionWith(glyph("y")));
    expect(
      state.doc
        .toJSON()
        .content[0].content.map(
          (n: { text?: string; attrs?: { latex: string } }) =>
            n.text ?? n.attrs?.latex,
        ),
    ).toEqual(["a", "x", "y", "b"]);
    state = state.apply(state.tr.delete(3, 4)); // y
    state = state.apply(state.tr.delete(2, 3)); // x
    state = state.apply(state.tr.delete(1, 2)); // a
    expect(state.doc.textContent).toBe("b");
  });

  it("keeps explicit LaTeX and migrates old flat expressions but preserves structures", () => {
    let state = reduceMath(emptyMath(), { type: "input", latex: "x" }).state;
    state = reduceMath(state, { type: "input", latex: "\\pi" }).state;
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "א" },
            {
              type: "mathExpression",
              attrs: {
                tree: state.root,
                latex: latex(state.root),
                display: false,
              },
            },
            { type: "text", text: "ב" },
          ],
        },
      ],
    };
    const migrated = migrateInlineMath(content);
    expect(migrated.content?.[0].content?.map((node) => node.type)).toEqual([
      "text",
      "mathGlyph",
      "mathGlyph",
      "text",
    ]);
    expect(migrated.content?.[0].content?.[2].attrs).toMatchObject({
      latex: "\\pi",
      glyph: "π",
    });
    const structure = reduceMath(state, {
      type: "structure",
      kind: "fraction",
    }).state;
    expect(
      migrateInlineMath({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "mathExpression",
                attrs: { tree: structure.root, display: false },
              },
            ],
          },
        ],
      }).content?.[0].content?.[0].type,
    ).toBe("mathExpression");
  });

  it("predicts logic through interleaved math and text", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        glyph("\\forall"),
        schema.text(" x "),
        glyph("\\in"),
      ]),
    ]);
    const state = inlineMathState(doc, doc.content.size - 1);
    expect(
      state.root.items.map((node) => (node.kind === "token" ? node.latex : "")),
    ).toEqual(["\\forall", "x", "\\in"]);
    expect(predict(state).mode).toBe("LOGIC_SET");
  });

  it("keeps mod as one mathematical operator in the editor and PDF", async () => {
    expect(roleOf("\\bmod")).toBe("operator");
    expect(roleOf("\\oplus")).toBe("operator");
    expect(roleOf("\\otimes")).toBe("operator");
    expect(glyphForLatex("\\bmod")).toBe("mod");
    const doc: FlowDocument = {
      schemaVersion: 1,
      id: "mod-test",
      title: "שארית",
      updatedAt: 0,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "mathGlyph", attrs: { latex: "a" } },
              { type: "mathGlyph", attrs: { latex: "\\bmod" } },
              { type: "mathGlyph", attrs: { latex: "b" } },
            ],
          },
        ],
      },
    };
    const html = await renderPdfDocument(doc, {} as PersistenceService);
    expect(html).toContain(
      '<span class="math-glyph math-word-operator">mod</span>',
    );
    expect(html).toContain(".math-word-operator{margin-inline:.22em");
  });

  it("spaces relations with one atomic glyph and uses narrower math operator spacing", () => {
    expect(typesetGlyph("=", "=")).toBe("\u00a0=\u00a0");
    expect(typesetGlyph("\\le", "≤")).toBe("\u00a0≤\u00a0");
    expect(typesetGlyph("\\in", "∈")).toBe("\u00a0∈\u00a0");
    expect(typesetGlyph("\\cdot", "·")).toBe("\u2009·\u2009");
    expect(typesetGlyph("\\forall", "∀")).toBe("∀\u2009");
    expect(typesetGlyph("-", "−")).toBe("−"); // unary minus stays tight
    expect(typesetGlyph("x", "x")).toBe("x");
  });

  it("removes one rightmost unit inside scripts without leaving an empty script", () => {
    let state = reduceMath(emptyMath(), { type: "input", latex: "x" }).state;
    state = reduceMath(state, { type: "next" }).state;
    state = reduceMath(state, { type: "input", latex: "2" }).state;
    const root = popMathUnit(state.root);
    expect(latex(root)).toBe("x");
    expect(popMathUnit(root).items).toHaveLength(0);
  });

  it("prints one final-answer frame around a mixed selected run", async () => {
    const doc: FlowDocument = {
      schemaVersion: 1,
      id: "mixed",
      title: "פתרון",
      updatedAt: 0,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "x", marks: [{ type: "finalAnswer" }] },
              {
                type: "mathGlyph",
                attrs: { latex: "\\pi", glyph: "π" },
                marks: [{ type: "finalAnswer" }],
              },
            ],
          },
        ],
      },
    };
    const html = await renderPdfDocument(doc, {} as PersistenceService);
    expect(html.match(/class="final-answer"/g)).toHaveLength(1);
    expect(html).toContain("π");
  });

  it("prints a Hebrew line with inline symbols in a single text flow", async () => {
    const doc: FlowDocument = {
      schemaVersion: 1,
      id: "rtl-mixed",
      title: "עברית",
      updatedAt: 0,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "מאחר ש־" },
              { type: "mathGlyph", attrs: { latex: "x", glyph: "x" } },
              { type: "text", text: " " },
              { type: "mathGlyph", attrs: { latex: ">", glyph: ">" } },
              { type: "text", text: " " },
              { type: "mathGlyph", attrs: { latex: "0", glyph: "0" } },
              { type: "text", text: ", ניתן לחלק." },
            ],
          },
        ],
      },
    };
    const html = await renderPdfDocument(doc, {} as PersistenceService);
    expect(html).toMatch(
      /מאחר ש־<span class="math-glyph">x<\/span> <span class="math-glyph">\u00a0&gt;\u00a0<\/span> <span class="math-glyph">0<\/span>, ניתן לחלק/,
    );
    expect(html).toContain("unicode-bidi:normal");
  });

  it("keeps a selected structured expression in the same PDF answer frame", async () => {
    const state = reduceMath(
      reduceMath(emptyMath(), { type: "input", latex: "x" }).state,
      { type: "next" },
    ).state;
    const doc: FlowDocument = {
      schemaVersion: 1,
      id: "selected-structure",
      title: "תשובה",
      updatedAt: 0,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "=", marks: [{ type: "finalAnswer" }] },
              {
                type: "mathExpression",
                attrs: {
                  id: "x",
                  tree: state.root,
                  latex: latex(state.root),
                  display: false,
                },
                marks: [{ type: "finalAnswer" }],
              },
            ],
          },
        ],
      },
    };
    const html = await renderPdfDocument(doc, {} as PersistenceService);
    expect(html.match(/class="final-answer"/g)).toHaveLength(1);
  });
});
