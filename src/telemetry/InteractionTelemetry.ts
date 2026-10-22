import { uid } from "../math/model";
export type EventType =
  | "AUTO_MODE_CHANGE"
  | "MANUAL_MODE_CHANGE"
  | "KEYBOARD_BACK"
  | "SMART_NEXT"
  | "SWIPE"
  | "SEMANTIC_ESCAPE"
  | "INPUT"
  | "MANUAL_CURSOR_TOUCH"
  | "NAVIGATION_MISS"
  | "EXERCISE_PROFILE_CHANGE"
  | "EXERCISE_TOGGLE"
  | "CALC_ACCEPT";
export interface InteractionEvent {
  id: number;
  sessionId: string;
  timestamp: number;
  type: EventType;
  contextKey: string;
  mode: string;
  source: string;
  data?: Record<string, string | number | boolean>;
}
export class InteractionTelemetry {
  readonly sessionId = uid();
  events: InteractionEvent[] = [];
  private id = 0;
  counters = {
    manualCursorTouches: 0,
    smartNextUses: 0,
    swipes: 0,
    flicks: 0,
    keyboardBacks: 0,
    modeChanges: 0,
    semanticEscapes: 0,
    navigationMisses: 0,
    mathInputs: 0,
    contextualSuggestionUses: 0,
    exerciseSuggestionUses: 0,
    exerciseToggles: 0,
    calculationAccepts: 0,
  };
  emit(
    type: EventType,
    contextKey: string,
    mode: string,
    source: string,
    data?: InteractionEvent["data"],
  ) {
    this.events.push({
      id: ++this.id,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      type,
      contextKey,
      mode,
      source,
      data,
    });
    if (this.events.length > 2000) this.events.shift();
    const keys: Partial<Record<EventType, keyof typeof this.counters>> = {
      MANUAL_CURSOR_TOUCH: "manualCursorTouches",
      SMART_NEXT: "smartNextUses",
      SWIPE: "swipes",
      KEYBOARD_BACK: "keyboardBacks",
      AUTO_MODE_CHANGE: "modeChanges",
      MANUAL_MODE_CHANGE: "modeChanges",
      SEMANTIC_ESCAPE: "semanticEscapes",
      NAVIGATION_MISS: "navigationMisses",
    };
    const k = keys[type];
    if (k) this.counters[k]++;
    if (type === "INPUT" && source.startsWith("flick")) this.counters.flicks++;
    if (type === "INPUT") {
      this.counters.mathInputs++;
      if (source === "prediction" || source === "exercise-prediction")
        this.counters.contextualSuggestionUses++;
      if (source === "exercise-prediction")
        this.counters.exerciseSuggestionUses++;
    }
    if (type === "EXERCISE_TOGGLE") this.counters.exerciseToggles++;
    if (type === "CALC_ACCEPT") this.counters.calculationAccepts++;
  }
  // Input commits a choice. Navigation by itself is explicitly not a rejection label.
  attribution() {
    return this.events
      .filter((e) => e.type === "INPUT")
      .map((e) => ({
        inputEventId: e.id,
        committedMode: e.mode,
        contextKey: e.contextKey,
        navigationEventIds: this.events
          .filter(
            (n) =>
              n.id < e.id &&
              n.contextKey === e.contextKey &&
              n.type !== "INPUT",
          )
          .slice(-8)
          .map((n) => n.id),
      }));
  }
}
