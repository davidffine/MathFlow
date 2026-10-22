export type Direction = "right" | "left" | "up" | "down";
export const keyboardSwipeAction = (
  direction: Direction,
): "LOGIC_SET" | "MATH" | "SYMBOLS" | null =>
  ({ right: "LOGIC_SET", left: "MATH", up: "SYMBOLS", down: null })[
    direction
  ] as "LOGIC_SET" | "MATH" | "SYMBOLS" | null;
export type GestureResult = {
  direction: Direction | null;
  cancelled: boolean;
  swiping: boolean;
  flick?: "down" | "left" | "right";
};
export class GestureController {
  private start: { x: number; y: number } | null = null;
  private crossed = false;
  private alternates: { down: boolean; left: boolean; right: boolean } = {
    down: false,
    left: false,
    right: false,
  };
  private keyGesture = false;
  private side: "left" | "right" | null = null;
  private cancelledKey = false;
  private cancelledSide = false;
  begin(
    x: number,
    y: number,
    alternates = { down: false, left: false, right: false },
  ) {
    this.start = { x, y };
    this.crossed = false;
    this.alternates = alternates;
    this.keyGesture = false;
    this.side = null;
    this.cancelledKey = false;
    this.cancelledSide = false;
  }
  move(x: number, y: number): GestureResult {
    if (!this.start)
      return { direction: null, cancelled: false, swiping: false };
    const dx = x - this.start.x,
      dy = y - this.start.y,
      r = Math.hypot(dx, dy);
    if (r > 18) this.crossed = true;
    const cancelled = this.crossed && r < 16;
    // Only an intentional downward phase can take ownership from a keyboard
    // swipe. A diagonal cannot directly commit a side alternate.
    if (
      !this.keyGesture &&
      this.alternates.down &&
      dy >= 18 &&
      dy >= Math.abs(dx) * 1.2
    )
      this.keyGesture = true;
    if (this.keyGesture) {
      if (this.cancelledKey || dy < 12) {
        this.cancelledKey = true;
        return { direction: null, cancelled: true, swiping: true };
      }
      if (!this.side) {
        if (dx <= -28 && this.alternates.left) this.side = "left";
        else if (dx >= 28 && this.alternates.right) this.side = "right";
      }
      if (this.side) {
        const opposite = this.side === "left" ? "right" : "left";
        const reachedOpposite = opposite === "left" ? dx <= -28 : dx >= 28;
        if (reachedOpposite && this.alternates[opposite]) {
          this.side = opposite;
          this.cancelledSide = false;
        } else if (this.side === "left" ? dx > -28 : dx < 28) {
          this.cancelledSide = true;
        }
        if (
          !this.cancelledSide &&
          (this.side === "left" ? dx <= -28 : dx >= 28)
        )
          return {
            direction: null,
            cancelled: false,
            swiping: true,
            flick: this.side,
          };
        return { direction: null, cancelled: true, swiping: true };
      }
      if (Math.abs(dx) >= 28 && !this.alternates[dx < 0 ? "left" : "right"])
        this.cancelledKey = true;
      if (this.cancelledKey)
        return { direction: null, cancelled: true, swiping: true };
      return dy >= 22 && dy >= Math.abs(dx) * 1.2
        ? { direction: null, cancelled: false, swiping: true, flick: "down" }
        : { direction: null, cancelled: false, swiping: true };
    }
    const direction =
      r < 38 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 7
        ? null
        : Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "right"
            : "left"
          : dy > 0
            ? "down"
            : "up";
    return { direction, cancelled, swiping: this.crossed };
  }
  end(x: number, y: number) {
    const r = this.move(x, y);
    this.start = null;
    this.alternates = { down: false, left: false, right: false };
    this.keyGesture = false;
    this.side = null;
    this.cancelledKey = false;
    this.cancelledSide = false;
    return r;
  }
  cancel() {
    this.start = null;
    this.crossed = false;
    this.alternates = { down: false, left: false, right: false };
    this.keyGesture = false;
    this.side = null;
    this.cancelledKey = false;
    this.cancelledSide = false;
  }
}
