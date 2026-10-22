import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, FolderOpen, Image as ImageIcon, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Keyboard as NativeKeyboard } from "@capacitor/keyboard";
import {
  Camera as NativeCamera,
  CameraResultType,
  CameraSource,
} from "@capacitor/camera";
import { symbolByValue } from "../keyboard/symbols";
import {
  exerciseCorrections,
  replaceExerciseSelection,
} from "./ExerciseCorrection";
import { ExerciseCrop } from "./ExerciseCrop";
import {
  cropExerciseImage,
  prepareExerciseImage,
  recognizeExercise,
  type CropRect,
} from "./ExerciseOcr";
import {
  analyzeExercise,
  topicLabels,
  type ExerciseProfile,
} from "./ExerciseProfile";

export function ExerciseDialog({
  profile,
  onSave,
  onClose,
}: {
  profile: ExerciseProfile | null;
  onSave: (profile: ExerciseProfile | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(profile?.text || "");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const [cropped, setCropped] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [recognized, setRecognized] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: draft.length, end: draft.length });
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const originalImage = useRef<Blob | null>(null);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const preview = analyzeExercise(draft);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );
  useEffect(
    () => () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
    },
    [originalUrl],
  );
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  async function scanImage(
    file: Blob,
    kind: "new" | "crop" | "original" = "new",
    area?: CropRect,
  ) {
    if (!alive.current) return;
    controller.current?.abort();
    const run = new AbortController();
    controller.current = run;
    setWorking(true);
    setRecognized(false);
    setProgress(0);
    setError("");
    if (kind === "new") setCropping(false);
    try {
      const ready =
        kind === "new"
          ? await prepareExerciseImage(file)
          : kind === "crop" && area
            ? await cropExerciseImage(file, area)
            : file;
      if (run.signal.aborted) return;
      if (kind === "new") {
        originalImage.current = ready;
        setOriginalUrl(URL.createObjectURL(ready));
      }
      setImageUrl(URL.createObjectURL(ready));
      setCropped(kind === "crop");
      setCropping(false);
      const result = await recognizeExercise(
        ready,
        (value) => {
          if (alive.current && !run.signal.aborted) setProgress(value);
        },
        run.signal,
      );
      if (run.signal.aborted) return;
      if (!result) {
        setError("לא זוהה טקסט בתמונה. אפשר להקליד את נוסח התרגיל ידנית.");
      } else {
        setDraft(result);
        selection.current = { start: result.length, end: result.length };
        setRecognized(true);
      }
    } catch (reason) {
      if (!run.signal.aborted)
        setError(
          `הזיהוי נכשל: ${reason instanceof Error ? reason.message : "נסו תמונה ברורה יותר"}. אפשר להקליד ידנית.`,
        );
    } finally {
      if (controller.current === run) {
        controller.current = null;
        setWorking(false);
      }
    }
  }

  function chooseArea() {
    controller.current?.abort();
    setWorking(false);
    textareaRef.current?.blur();
    if (Capacitor.isNativePlatform())
      void NativeKeyboard.hide().catch(() => {});
    setCropping(true);
  }

  async function pickImage(source: "camera" | "gallery" | "files") {
    if (!Capacitor.isNativePlatform() || source === "files") {
      (source === "camera" ? cameraRef : inputRef).current?.click();
      return;
    }
    try {
      const photo = await NativeCamera.getPhoto({
        resultType: CameraResultType.Uri,
        source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
        quality: 90,
      });
      if (!photo.webPath) throw new Error("לא ניתן לקרוא את התמונה");
      const response = await fetch(photo.webPath);
      if (!response.ok) throw new Error("לא ניתן לקרוא את התמונה");
      const image = await response.blob();
      if (alive.current) await scanImage(image);
    } catch (reason) {
      if (!/cancel/i.test(String(reason)))
        setError(
          reason instanceof Error ? reason.message : "לא ניתן לפתוח את התמונה",
        );
    }
  }

  function fromFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void scanImage(file);
  }

  function rememberSelection() {
    const field = textareaRef.current;
    if (field && document.activeElement === field)
      selection.current = {
        start: field.selectionStart,
        end: field.selectionEnd,
      };
  }

  function insertCorrection(value: string) {
    const range = pendingSelection.current || selection.current;
    pendingSelection.current = null;
    const { text, caret } = replaceExerciseSelection(
      draft,
      range.start,
      range.end,
      value,
    );
    setDraft(text);
    selection.current = { start: caret, end: caret };
    requestAnimationFrame(() => {
      if (!alive.current) return;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  }

  function holdSelection() {
    rememberSelection();
    pendingSelection.current = { ...selection.current };
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="small-modal exercise-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-title"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close icon-button"
          aria-label="סגירה"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <span className="help-kicker">הצעות מותאמות</span>
        <h2 id="exercise-title">על איזה תרגיל עובדים?</h2>
        <p>
          צלמו תרגיל או הדביקו את הנוסח שלו. בדקו את הטקסט לפני השמירה; שתי
          הצעות במקלדת יתאימו את עצמן אליו.
        </p>
        <div className="exercise-photo-actions" aria-label="בחירת תמונת תרגיל">
          <button
            type="button"
            disabled={working}
            onClick={() => void pickImage("camera")}
          >
            <Camera size={18} /> מצלמה
          </button>
          <button
            type="button"
            disabled={working}
            onClick={() => void pickImage("gallery")}
          >
            <ImageIcon size={18} /> גלריה
          </button>
          <button
            type="button"
            disabled={working}
            onClick={() => void pickImage("files")}
          >
            <FolderOpen size={18} /> קבצים
          </button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={fromFile}
          aria-label="צילום תרגיל"
        />
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={fromFile}
          aria-label="בחירת תמונת תרגיל"
        />
        {cropping && originalUrl ? (
          <ExerciseCrop
            imageUrl={originalUrl}
            onCancel={() => setCropping(false)}
            onConfirm={(area) => {
              if (originalImage.current)
                void scanImage(originalImage.current, "crop", area);
            }}
          />
        ) : (
          imageUrl && (
            <img
              className="exercise-photo-preview"
              src={imageUrl}
              alt="התמונה שנבחרה לזיהוי התרגיל"
            />
          )
        )}
        {imageUrl && !cropping && (
          <div className="exercise-image-tools">
            <button type="button" onClick={chooseArea}>
              בחירת אזור
            </button>
            {originalImage.current && (
              <button
                type="button"
                disabled={working}
                onClick={() => {
                  if (originalImage.current)
                    void scanImage(originalImage.current, "original");
                }}
              >
                {cropped ? "תמונה מלאה" : "זיהוי מחדש"}
              </button>
            )}
          </div>
        )}
        {working && (
          <div className="exercise-scan-status" role="status">
            מזהה טקסט במכשיר… {progress > 0 ? `${progress}%` : ""}
          </div>
        )}
        {error && (
          <div className="exercise-scan-error" role="alert">
            {error}
          </div>
        )}
        {recognized && (
          <small className="exercise-scan-hint">
            הזיהוי עשוי לטעות בסימנים ובשברים. תקנו את הנוסח לפני השמירה.
          </small>
        )}
        <label className="exercise-input-label" htmlFor="exercise-input">
          {recognized ? "טקסט מזוהה · אפשר לערוך" : "נוסח התרגיל"}
        </label>
        <textarea
          ref={textareaRef}
          id="exercise-input"
          dir="auto"
          maxLength={2000}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            selection.current = {
              start: e.target.selectionStart,
              end: e.target.selectionEnd,
            };
          }}
          onSelect={rememberSelection}
          placeholder="למשל: הוכיחו שלכל x∈ℝ מתקיים…"
          rows={5}
        />
        <div className="exercise-corrections-label">
          תיקון מהיר · סמנו תו להחלפה, החליקו לעוד
        </div>
        <div
          className="exercise-corrections"
          dir="rtl"
          aria-label="סימנים לתיקון התרגיל"
        >
          {exerciseCorrections.map(({ value, name }) => (
            <button
              key={value}
              type="button"
              title={name}
              aria-label={`הכנסת ${name}`}
              onPointerDown={holdSelection}
              onClick={() => insertCorrection(value)}
            >
              {value}
            </button>
          ))}
        </div>
        {preview && (
          <div className="exercise-preview" aria-live="polite">
            <strong>{topicLabels[preview.topic]}</strong>
            {preview.symbols.length ? (
              <div className="exercise-symbols" aria-label="סימנים שזוהו">
                {preview.symbols.slice(0, 8).map((value) => (
                  <span key={value} title={symbolByValue.get(value)?.name}>
                    {symbolByValue.get(value)?.label || value}
                  </span>
                ))}
              </div>
            ) : (
              <small>עדיין לא זוהו סימנים מיוחדים; המקלדת תישאר רגילה.</small>
            )}
          </div>
        )}
        <div className="exercise-actions">
          {profile && (
            <button className="exercise-remove" onClick={() => onSave(null)}>
              הסרת תרגיל
            </button>
          )}
          <button
            className="primary-button"
            disabled={working || !preview?.symbols.length}
            onClick={() =>
              onSave(preview ? { ...preview, enabled: true } : null)
            }
          >
            שמירת תרגיל
          </button>
        </div>
        <small className="exercise-private">
          הזיהוי מקומי. התמונה לא נשמרת; הנוסח שאישרתם נשמר במסמך במכשיר בלבד.
        </small>
      </section>
    </div>
  );
}
