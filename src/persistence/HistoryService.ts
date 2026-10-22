export class HistoryService<T> {
  private past: T[] = [];
  private future: T[] = [];
  private current: T;
  private group = "";
  private time = 0;
  private gesture = "";
  constructor(
    value: T,
    private signature: (v: T) => string = JSON.stringify,
  ) {
    this.current = structuredClone(value);
  }
  record(value: T, reason = "edit", now = Date.now()) {
    if (this.signature(value) === this.signature(this.current)) {
      this.current = structuredClone(value);
      return;
    }
    const merge =
      reason === this.group &&
      (reason === this.gesture ||
        (reason.startsWith("typing") && now - this.time < 650));
    if (!merge) this.past.push(this.current);
    this.current = structuredClone(value);
    this.future = [];
    this.group = reason;
    this.time = now;
    if (this.past.length > 120) this.past.shift();
  }
  undo(): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    this.current = prev;
    this.breakGroup();
    return structuredClone(prev);
  }
  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    this.breakGroup();
    return structuredClone(next);
  }
  breakGroup() {
    this.group = "";
    this.gesture = "";
  }
  beginGesture(reason: string) {
    this.breakGroup();
    this.gesture = reason;
  }
  endGesture() {
    this.breakGroup();
  }
  get canUndo() {
    return !!this.past.length;
  }
  get canRedo() {
    return !!this.future.length;
  }
}
