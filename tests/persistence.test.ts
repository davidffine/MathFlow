import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  PersistenceService,
  signature,
  type FlowDocument,
} from "../src/persistence/PersistenceService";
import { HistoryService } from "../src/persistence/HistoryService";
import { emptyMath, latex, editableState } from "../src/math/model";
import { reduceMath } from "../src/navigation/SmartNextEngine";
const math = reduceMath(
  reduceMath(emptyMath(), { type: "input", latex: "x" }).state,
  { type: "next" },
).state;
const filled = reduceMath(math, { type: "input", latex: "2" }).state;
const doc: FlowDocument = {
  schemaVersion: 1,
  id: "qa",
  title: "עברית English 123",
  updatedAt: 1,
  content: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "מאחר ש־" },
          {
            type: "mathExpression",
            attrs: { id: "eq", tree: filled.root, latex: latex(filled.root) },
          },
          { type: "text", text: " ולכן" },
        ],
      },
    ],
  },
};
describe("M durable local document", () => {
  it("restores explicit LaTeX and stable AST ids after service reload", async () => {
    const one = new PersistenceService();
    await one.save(doc);
    const two = new PersistenceService();
    const read = await two.load();
    expect(read).toEqual(doc);
    expect(read?.content.content?.[0].content?.[1].attrs?.latex).toBe(
      "{x}^{2}",
    );
    const restored = editableState(
      read!.content.content![0].content![1].attrs!.tree,
    );
    expect(latex(restored.root)).toBe("{x}^{2}");
  });
  it("serializes concurrent saves so the newest document wins", async () => {
    const service = new PersistenceService();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        service.save({ ...doc, title: String(i), updatedAt: i }),
      ),
    );
    expect((await service.load())?.title).toBe("9");
  });
  it("saves exercise preferences with the document and includes them in semantic history", async () => {
    const service = new PersistenceService();
    const profile = {
      text: "לכל x∈ℝ",
      topic: "sets" as const,
      symbols: ["\\forall", "\\in", "\\mathbb{R}"],
      enabled: true,
    };
    const withExercise = { ...doc, exerciseProfile: profile };
    await service.save(withExercise);
    expect((await new PersistenceService().load())?.exerciseProfile).toEqual(
      profile,
    );
    const history = new HistoryService<FlowDocument>(doc, signature);
    history.record(withExercise, "exercise");
    expect(history.undo()?.exerciseProfile).toBeUndefined();
    expect(history.redo()?.exerciseProfile).toEqual(profile);
  });
  it("stores image blobs outside JSON and restores them", async () => {
    const one = new PersistenceService();
    const blob = new Blob(["image-fixture"], { type: "image/webp" });
    await one.asset("image-1", blob);
    const two = new PersistenceService();
    const result = await two.getAsset("image-1");
    expect(await result!.text()).toBe("image-fixture");
    expect(result?.type).toBe("image/webp");
  });
  it("N undo/redo preserves math tree and authoritative LaTeX", () => {
    const h = new HistoryService<FlowDocument>(
      { ...doc, content: { type: "doc", content: [{ type: "paragraph" }] } },
      signature,
    );
    h.record(doc, "structure");
    const next = structuredClone(doc);
    next.title = "נוסחה";
    h.record(next, "typing:title");
    expect(h.undo()).toEqual(doc);
    expect(h.redo()).toEqual(next);
  });
});
