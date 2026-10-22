import { createContext, useContext } from "react";
import type { MathState, Sequence } from "../math/model";
import type { MathAction } from "../navigation/SmartNextEngine";
import type { PersistenceService } from "../persistence/PersistenceService";
export interface FlowAPI {
  activeId: string | null;
  keyboard: "text" | "math";
  session: (id: string, tree: Sequence) => MathState;
  activate: (id: string, tree: Sequence) => void;
  act: (action: MathAction, source?: string) => void;
  manualCursor: (
    id: string,
    tree: Sequence,
    seqId: string,
    index: number,
    extend?: boolean,
    recordTouch?: boolean,
  ) => void;
  storage: PersistenceService;
  revision: number;
}
export const FlowContext = createContext<FlowAPI | null>(null);
export function useFlow() {
  return useContext(FlowContext)!;
}
