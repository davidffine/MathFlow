import { useRef, useState, type PointerEvent } from "react";
import type { CropRect } from "./ExerciseOcr";

const fullImage: CropRect = { x: 0, y: 0, width: 1, height: 1 };

export function ExerciseCrop({
  imageUrl,
  onConfirm,
  onCancel,
}: {
  imageUrl: string;
  onConfirm: (area: CropRect) => void;
  onCancel: () => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    previous: CropRect;
  } | null>(null);
  const [area, setArea] = useState<CropRect>(fullImage);
  const [aspect, setAspect] = useState(1);

  function point(event: PointerEvent<HTMLDivElement>) {
    const bounds = image.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const position = point(event);
    drag.current = {
      pointerId: event.pointerId,
      ...position,
      previous: area,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setArea({ ...position, width: 0, height: 0 });
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const origin = drag.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    const position = point(event);
    setArea({
      x: Math.min(origin.x, position.x),
      y: Math.min(origin.y, position.y),
      width: Math.abs(origin.x - position.x),
      height: Math.abs(origin.y - position.y),
    });
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    const origin = drag.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    drag.current = null;
    const position = point(event);
    const width = Math.abs(origin.x - position.x);
    const height = Math.abs(origin.y - position.y);
    if (width < 0.08 || height < 0.08) setArea(origin.previous);
    else
      setArea({
        x: Math.min(origin.x, position.x),
        y: Math.min(origin.y, position.y),
        width,
        height,
      });
  }

  function cancel(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    setArea(drag.current.previous);
    drag.current = null;
  }

  return (
    <div className="exercise-crop">
      <p>גררו מסגרת סביב נוסח השאלה. גרירה חדשה מחליפה את הבחירה.</p>
      <div
        className="exercise-crop-surface"
        style={{ width: `min(100%, calc(min(38dvh, 320px) * ${aspect}))` }}
        role="img"
        aria-label="בחירת אזור בתמונת התרגיל"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={cancel}
      >
        <img
          ref={image}
          src={imageUrl}
          alt="התמונה לסריקה"
          draggable={false}
          onLoad={(event) =>
            setAspect(
              event.currentTarget.naturalWidth /
                event.currentTarget.naturalHeight,
            )
          }
        />
        <div
          className="exercise-crop-selection"
          style={{
            left: `${area.x * 100}%`,
            top: `${area.y * 100}%`,
            width: `${area.width * 100}%`,
            height: `${area.height * 100}%`,
          }}
        />
      </div>
      <div className="exercise-crop-actions">
        <button type="button" onClick={onCancel}>
          ביטול
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => onConfirm(area)}
        >
          זיהוי האזור
        </button>
      </div>
    </div>
  );
}
