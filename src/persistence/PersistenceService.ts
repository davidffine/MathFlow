import { openDB, type IDBPDatabase } from "idb";
import type { JSONContent } from "@tiptap/react";
import type { ExerciseProfile } from "../exercise/ExerciseProfile";
export interface FlowDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  updatedAt: number;
  content: JSONContent;
  exerciseProfile?: ExerciseProfile | null;
}
export const signature = (d: FlowDocument) =>
  JSON.stringify(
    { title: d.title, content: d.content, exerciseProfile: d.exerciseProfile },
    (key, value) => (key === "tree" ? undefined : value),
  );
export class PersistenceService {
  private db: Promise<IDBPDatabase> = openDB("mathflow", 1, {
    upgrade(db) {
      db.createObjectStore("documents");
      db.createObjectStore("assets");
    },
  });
  private queue: Promise<void> = Promise.resolve();
  async load(): Promise<FlowDocument | undefined> {
    return (await this.db).get("documents", "current");
  }
  save(doc: FlowDocument): Promise<void> {
    const snapshot = structuredClone(doc);
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        const db = await this.db;
        await db.put("documents", snapshot, "current");
      });
    return this.queue;
  }
  async asset(id: string, blob: Blob) {
    return (await this.db).put("assets", blob, id);
  }
  async getAsset(id: string): Promise<Blob | undefined> {
    return (await this.db).get("assets", id);
  }
}
