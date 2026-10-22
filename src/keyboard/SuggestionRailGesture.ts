// Horizontal drags browse the one-row shelf; a vertical start irrevocably
// belongs to a key flick, including when the user reverses to cancel it.
export class SuggestionRailGesture {
  private axis: "scroll" | "key" | null = null;
  constructor(
    private x: number,
    private y: number,
  ) {}
  move(x: number, y: number): boolean {
    const dx = Math.abs(x - this.x),
      dy = Math.abs(y - this.y);
    if (!this.axis && Math.max(dx, dy) > 12)
      this.axis = dx > dy * 1.25 ? "scroll" : "key";
    return this.axis === "scroll";
  }
  get scrolling() {
    return this.axis === "scroll";
  }
}
