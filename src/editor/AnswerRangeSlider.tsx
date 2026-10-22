import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { Editor } from "@tiptap/react";
import {
  intervalAtX,
  rangeHandleAtPoint,
  type AnswerRangeModel,
  type ElementInterval,
} from "./answerRange";

type Handle = "start" | "end";
interface Props {
  editor: Editor;
  model: AnswerRangeModel;
  value: ElementInterval;
  revision: number;
  onChange: (value: ElementInterval) => void;
  onBegin: () => void;
  onEnd: () => void;
  onClose: () => void;
}
export function AnswerRangeSlider({
  editor,
  model,
  value,
  revision,
  onChange,
  onBegin,
  onEnd,
  onClose,
}: Props) {
  const track = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{
    pointer: number;
    handle: Handle;
    left: number;
    width: number;
    grabOffset: number;
  } | null>(null);
  const latest = useRef({ value, onChange, onEnd });
  latest.current = { value, onChange, onEnd };
  const [place, setPlace] = useState({ left: 12, top: 140, width: 200 });
  const [dragging, setDragging] = useState<Handle | null>(null);
  const count = model.elements.length;
  useLayoutEffect(() => {
    function position() {
      if (drag.current) return;
      let anchor: { left: number; right: number; top: number; bottom: number };
      try {
        const surface = model.anchorFormula
          ? document.querySelector<HTMLElement>(
              `[data-equation="${model.anchorFormula}"] [data-flowslot="${model.anchorSeq}"]`,
            )
          : null;
        anchor =
          surface?.getBoundingClientRect() ??
          editor.view.coordsAtPos(model.anchor);
      } catch {
        return;
      }
      const viewport = window.visualViewport;
      const width = Math.min(
        200,
        Math.max(96, count * 12),
        (viewport?.width ?? window.innerWidth) - 48,
      );
      const height = 44;
      const dockTop =
        document.querySelector(".input-dock")?.getBoundingClientRect().top ??
        window.innerHeight;
      const visibleBottom = Math.min(
        dockTop,
        (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0),
      );
      const toolbarBottom =
        document.querySelector(".format-bar")?.getBoundingClientRect().bottom ??
        0;
      const minTop = Math.max(viewport?.offsetTop ?? 0, toolbarBottom) + 8;
      const maxTop = Math.max(minTop, visibleBottom - height - 8);
      const above = anchor.top - height - 4;
      const desired = above >= minTop ? above : anchor.bottom + 4;
      const next = {
        left: Math.max(
          12,
          Math.min(
            window.innerWidth - width - 12,
            (anchor.left + anchor.right - width) / 2,
          ),
        ),
        top: Math.max(minTop, Math.min(maxTop, desired)),
        width,
      };
      setPlace((previous) =>
        previous.left === next.left &&
        previous.top === next.top &&
        previous.width === next.width
          ? previous
          : next,
      );
    }
    position();
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [editor, model, revision, dragging]);
  useLayoutEffect(
    () => () => {
      if (drag.current) latest.current.onEnd();
    },
    [],
  );
  function begin(event: PointerEvent<HTMLButtonElement>, handle: Handle) {
    if (event.button !== 0 || drag.current || !track.current) return;
    event.preventDefault();
    const rect = track.current.getBoundingClientRect();
    // The two 44px targets can overlap for a one-element interval. Route
    // pointer input by distance, rather than letting DOM stacking pick a side.
    const startX =
      rect.left + (latest.current.value.start / count) * rect.width;
    const endX = rect.left + (latest.current.value.end / count) * rect.width;
    handle = rangeHandleAtPoint(
      startX,
      endX,
      event.clientX,
      event.clientY,
      rect.top,
    );
    drag.current = {
      pointer: event.pointerId,
      handle,
      left: rect.left,
      width: rect.width,
      grabOffset:
        event.clientX -
        (rect.left + (latest.current.value[handle] / count) * rect.width),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(handle);
    onBegin();
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    event.preventDefault();
    const next = intervalAtX(
      latest.current.value,
      gesture.handle,
      event.clientX - gesture.grabOffset,
      gesture.left,
      gesture.width,
      count,
    );
    if (
      next.start !== latest.current.value.start ||
      next.end !== latest.current.value.end
    ) {
      latest.current.value = next;
      latest.current.onChange(next);
    }
  }
  function end(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointer !== event.pointerId) return;
    if (event.type === "pointerup") move(event);
    drag.current = null;
    setDragging(null);
    onEnd();
  }
  function key(event: KeyboardEvent<HTMLButtonElement>, handle: Handle) {
    let next = value[handle];
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next++;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next--;
    else if (event.key === "Home")
      next = handle === "start" ? 0 : value.start + 1;
    else if (event.key === "End")
      next = handle === "start" ? value.end - 1 : count;
    else return;
    event.preventDefault();
    next =
      handle === "start"
        ? Math.max(0, Math.min(value.end - 1, next))
        : Math.max(value.start + 1, Math.min(count, next));
    onBegin();
    onChange({ ...value, [handle]: next });
    onEnd();
  }
  return (
    <section
      ref={panel}
      className="answer-range-panel"
      style={place}
      role="group"
      aria-label="טווח התשובה הסופית"
      onPointerDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className={`answer-range-axis${((value.end - value.start) / count) * place.width < 44 ? " tight" : ""}`}
        ref={track}
        dir="ltr"
      >
        <div className="answer-range-track" />
        <div
          className="answer-range-fill"
          style={{
            left: `${(value.start / count) * 100}%`,
            width: `${((value.end - value.start) / count) * 100}%`,
          }}
        />
        {Array.from({ length: count + 1 }, (_, index) => (
          <i
            className={`answer-range-tick${index >= value.start && index <= value.end ? " selected" : ""}`}
            key={index}
            aria-hidden="true"
            style={{ left: `${(index / count) * 100}%` }}
          />
        ))}
        {(["start", "end"] as const).map((handle) => (
          <button
            key={handle}
            type="button"
            role="slider"
            className={`answer-range-handle ${handle}${dragging === handle ? " dragging" : ""}`}
            style={{ left: `${(value[handle] / count) * 100}%` }}
            aria-label={handle === "start" ? "תחילת הטווח" : "סוף הטווח"}
            aria-valuemin={handle === "start" ? 0 : value.start + 1}
            aria-valuemax={handle === "start" ? value.end - 1 : count}
            aria-valuenow={value[handle]}
            aria-valuetext={
              handle === "start"
                ? `מהאלמנט ${value.start + 1} מתוך ${count}`
                : `עד האלמנט ${value.end} מתוך ${count}`
            }
            onPointerDown={(event) => begin(event, handle)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={end}
            onKeyDown={(event) => key(event, handle)}
          >
            <span className="answer-range-thumb" aria-hidden="true" />
            {dragging === handle && (
              <span className="answer-range-value" aria-hidden="true">
                {handle === "start" ? value.start + 1 : value.end}/{count}
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
