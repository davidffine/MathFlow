import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SuggestionRailGesture } from "./SuggestionRailGesture";
import {
  Delete,
  ArrowRight,
  CornerDownLeft,
  Keyboard as KeyboardIcon,
  RotateCcw,
  Undo2,
  Redo2,
  Search,
  X,
  Pencil,
  AlignCenter,
  TextCursorInput,
  NotebookPen,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Keyboard as NativeKeyboard } from "@capacitor/keyboard";
import {
  GestureController,
  keyboardSwipeAction,
  type Direction,
} from "./GestureController";
import { flickVariants, type FlickVariants } from "./flickVariants";
import {
  filterSymbols,
  symbolByValue,
  symbolCategories,
  type SymbolCategory,
  type SymbolKey,
} from "./symbols";
import {
  readShortcuts,
  saveShortcuts,
  SHORTCUT_LIMIT,
  toggleShortcut,
} from "./shortcuts";
import {
  learnSuggestion,
  readSuggestionMemory,
  saveSuggestionMemory,
  suggestionFrame,
} from "./AdaptiveSuggestions";
import {
  contextLabel,
  nextHint,
  recomputeKeyboardContext,
  type Mode,
} from "../context/KeyboardContextEngine";
import type { MathState } from "../math/model";
import type { MathAction } from "../navigation/SmartNextEngine";
import { nextWillInsertLine } from "../navigation/SmartNextEngine";
import type { ExerciseProfile } from "../exercise/ExerciseProfile";
import type { ExactResult } from "../calculation/ExactArithmetic";
import { FinalAnswerToggle } from "../editor/FinalAnswerToggle";
import type { FinalAnswerMode } from "../editor/finalAnswer";
export interface Key {
  label: string;
  value: string;
  kind?: "structure";
}
const paletteCategories = [
  symbolCategories[0],
  { id: "recent" as const, label: "אחרונים" },
  ...symbolCategories.filter((category) => category.id === "latin"),
  ...symbolCategories.slice(1).filter((category) => category.id !== "latin"),
];
const recentsKey = "mathflow.symbol-recents.v1";
function readRecents(): string[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(recentsKey) || "[]");
    return Array.isArray(data)
      ? data
          .filter((value): value is string => typeof value === "string")
          .slice(0, 24)
      : [];
  } catch {
    return [];
  }
}
const directions: Record<Direction, string> = {
  right: "→ לוגיקה",
  left: "← מתמטיקה",
  up: "↑ כל הסימנים",
  down: "",
};
export function MathKeyboard({
  state,
  mode,
  backAvailable,
  display,
  answerMode,
  act,
  gesture,
  onText,
  onBack,
  onDisplay,
  onBox,
  onClose,
  exercise,
  onExerciseEdit,
  onExerciseToggle,
  calculation,
  onCalculation,
  onUndo,
  undoAvailable,
  onRedo,
  redoAvailable,
}: {
  state: MathState;
  mode: Mode;
  backAvailable: boolean;
  display: boolean;
  answerMode: FinalAnswerMode;
  act: (a: MathAction, source?: string) => void;
  gesture: (d: Direction) => void;
  onText: () => void;
  onBack: () => void;
  onDisplay: () => void;
  onBox: () => void;
  onClose: () => void;
  exercise: ExerciseProfile | null;
  onExerciseEdit: () => void;
  onExerciseToggle: () => void;
  calculation: ExactResult | null;
  onCalculation: () => void;
  onUndo: () => void;
  undoAvailable: boolean;
  onRedo: () => void;
  redoAvailable: boolean;
}) {
  const controller = useRef(new GestureController());
  const railDrag = useRef<{
    element: HTMLElement;
    x: number;
    left: number;
    gesture: SuggestionRailGesture;
  } | null>(null);
  const [railPreview, setRailPreview] = useState<{
    label: string;
    direction: string;
    x: number;
    y: number;
  } | null>(null);
  const flickTargets = useRef<FlickVariants | null>(null);
  const pressedKey = useRef<HTMLButtonElement | null>(null);
  const settledKey = useRef<HTMLButtonElement | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const gestureStartY = useRef(0);
  const suppress = useRef(false);
  const pid = useRef<number | null>(null);
  const long = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const paletteDrag = useRef<{
    x: number;
    y: number;
    id: number;
    moved: boolean;
    canClose: boolean;
    axis: "horizontal" | "down" | "scroll" | null;
  } | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState("");
  const [palette, setPalette] = useState(false);
  const [searching, setSearching] = useState(false);
  const [paletteTab, setPaletteTab] = useState<SymbolCategory | "recent">(
    "common",
  );
  const paletteTabRef = useRef(paletteTab);
  paletteTabRef.current = paletteTab;
  const explicitlyChosenTab = useRef(false);
  const [pinMode, setPinMode] = useState(false);
  const [keepOpen, setKeepOpen] = useState(false);
  const [pinMessage, setPinMessage] = useState("");
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState(readRecents);
  const [shortcuts, setShortcuts] = useState(readShortcuts);
  const [suggestionMemory, setSuggestionMemory] =
    useState(readSuggestionMemory);
  useEffect(() => () => clearTimeout(releaseTimer.current), []);
  useEffect(() => {
    if (palette)
      tabsRef.current
        ?.querySelector<HTMLElement>('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [palette, paletteTab]);
  function categoryAfterSwipe(dx: number) {
    const index = paletteCategories.findIndex(
      (c) => c.id === paletteTabRef.current,
    );
    return paletteCategories[
      (index + (dx < 0 ? 1 : -1) + paletteCategories.length) %
        paletteCategories.length
    ];
  }
  function selectPaletteCategory(id: SymbolCategory | "recent") {
    explicitlyChosenTab.current = true;
    setPaletteTab(id);
    paletteTabRef.current = id;
    setQuery("");
    setPinMessage("");
    searchRef.current?.blur();
    if (Capacitor.isNativePlatform())
      void NativeKeyboard.hide().catch(() => {});
    if (resultsRef.current) resultsRef.current.scrollTop = 0;
  }
  function movePalettePull(x: number, y: number) {
    const start = paletteDrag.current;
    if (!start) return false;
    const dy = y - start.y,
      dx = x - start.x;
    if (!start.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
      if (Math.abs(dx) > Math.abs(dy) * 1.3) start.axis = "horizontal";
      else if (Math.abs(dy) > Math.abs(dx) * 1.3)
        start.axis = dy > 0 && start.canClose ? "down" : "scroll";
    }
    if (!start.axis || start.axis === "scroll") return false;
    start.moved = true;
    suppress.current = true;
    if (start.axis === "horizontal")
      setPreview(
        Math.abs(dx) >= 56
          ? `${dx < 0 ? "←" : "→"} ${categoryAfterSwipe(dx).label}`
          : "",
      );
    else setPreview(dy >= 56 ? "↓ חזרה למקלדת" : "");
    return true;
  }
  function endPalettePull(x: number, y: number) {
    const start = paletteDrag.current;
    paletteDrag.current = null;
    setPreview("");
    if (!start?.moved) return;
    suppress.current = true;
    const dy = y - start.y,
      dx = x - start.x;
    if (
      start.axis === "horizontal" &&
      Math.abs(dx) >= 56 &&
      Math.abs(dx) > Math.abs(dy) * 1.3
    )
      selectPaletteCategory(categoryAfterSwipe(dx).id);
    else if (
      start.axis === "down" &&
      start.canClose &&
      dy >= 56 &&
      dy > Math.abs(dx) * 1.3
    )
      closePalette();
  }
  useEffect(() => {
    const surface = paletteRef.current;
    if (!palette || !surface) return;
    // Horizontal paging works at any scroll offset. Vertical native scrolling
    // owns its gesture; only a pull that starts at the top may dismiss the palette.
    function begin(e: TouchEvent) {
      paletteDrag.current = null;
      suppress.current = false;
      if (
        e.touches.length !== 1 ||
        (e.target as HTMLElement).closest("input, .palette-tabs")
      )
        return;
      const t = e.touches[0];
      paletteDrag.current = {
        x: t.clientX,
        y: t.clientY,
        id: t.identifier,
        moved: false,
        canClose: (resultsRef.current?.scrollTop || 0) <= 1,
        axis: null,
      };
    }
    function move(e: TouchEvent) {
      const start = paletteDrag.current;
      if (!start) return;
      const t = Array.from(e.touches).find((t) => t.identifier === start.id);
      if (t && movePalettePull(t.clientX, t.clientY) && e.cancelable)
        e.preventDefault();
    }
    function end(e: TouchEvent) {
      const start = paletteDrag.current;
      const t =
        start &&
        Array.from(e.changedTouches).find((t) => t.identifier === start.id);
      if (t) endPalettePull(t.clientX, t.clientY);
    }
    function cancel() {
      paletteDrag.current = null;
      setPreview("");
    }
    surface.addEventListener("touchstart", begin, { passive: true });
    surface.addEventListener("touchmove", move, { passive: false });
    surface.addEventListener("touchend", end);
    surface.addEventListener("touchcancel", cancel);
    return () => {
      surface.removeEventListener("touchstart", begin);
      surface.removeEventListener("touchmove", move);
      surface.removeEventListener("touchend", end);
      surface.removeEventListener("touchcancel", cancel);
    };
  }, [palette]);
  const context = recomputeKeyboardContext(state);
  const frame = suggestionFrame(
    state,
    mode,
    shortcuts,
    suggestionMemory,
    exercise,
  );
  const shownSymbols: SymbolKey[] = query.trim()
    ? filterSymbols(query, "common")
    : paletteTab === "recent"
      ? recents.flatMap((value) => {
          const symbol = symbolByValue.get(value);
          return symbol ? [symbol] : [];
        })
      : filterSymbols("", paletteTab);
  const quickSymbols = shortcuts.flatMap((value) => {
    const symbol = symbolByValue.get(value);
    return symbol ? [symbol] : [];
  });
  function remember(value: string) {
    if (!symbolByValue.has(value)) return;
    setRecents((previous) => {
      const next = [value, ...previous.filter((item) => item !== value)].slice(
        0,
        24,
      );
      try {
        localStorage.setItem(recentsKey, JSON.stringify(next));
      } catch {
        // The keyboard remains usable even when device storage is unavailable.
      }
      return next;
    });
  }
  function run(key: Key, source = "key") {
    if (key.kind) act({ type: "structure", kind: key.value as "root" }, source);
    else act({ type: "input", latex: key.value }, source);
    remember(key.value);
    setSuggestionMemory((previous) => {
      const next = learnSuggestion(previous, frame.phase, key.value);
      if (next !== previous) saveSuggestionMemory(next);
      return next;
    });
  }
  function resetKeyVisual(committed = false) {
    const button = pressedKey.current;
    if (!button) return;
    button.classList.remove(
      "is-flicking",
      "is-flicking-down",
      "is-flicking-left",
      "is-flicking-right",
    );
    button.style.removeProperty("--flick-pull");
    pressedKey.current = null;
    if (committed) {
      settledKey.current?.classList.remove("flick-committed");
      clearTimeout(releaseTimer.current);
      button.classList.add("flick-committed");
      settledKey.current = button;
      releaseTimer.current = setTimeout(() => {
        button.classList.remove("flick-committed");
        if (settledKey.current === button) settledKey.current = null;
      }, 230);
    }
  }
  function closePalette() {
    searchRef.current?.blur();
    if (Capacitor.isNativePlatform())
      void NativeKeyboard.hide().catch(() => {});
    setPalette(false);
    setQuery("");
    setPinMode(false);
    setKeepOpen(false);
    setPinMessage("");
  }
  function openPalette() {
    if (!explicitlyChosenTab.current && mode === "LOGIC_SET")
      setPaletteTab("sets");
    setPalette(true);
  }
  function changeShortcut(value: string) {
    const result = toggleShortcut(shortcuts, value);
    if (result.full) {
      setPinMessage(
        `אפשר להצמיד עד ${SHORTCUT_LIMIT} סימנים. הסירו אחד תחילה.`,
      );
      return;
    }
    setShortcuts(result.values);
    saveShortcuts(result.values);
    setPinMessage(
      result.values.includes(value) ? "נוסף לקיצורים" : "הוסר מהקיצורים",
    );
  }
  function chooseSymbol(symbol: SymbolKey) {
    searchRef.current?.blur();
    if (Capacitor.isNativePlatform())
      void NativeKeyboard.hide().catch(() => {});
    run(symbol, "palette");
    if (!explicitlyChosenTab.current) setPaletteTab(symbol.category);
    if (!keepOpen) setPalette(false);
    setQuery("");
  }
  function key(
    label: React.ReactNode,
    aria: string,
    action: () => void,
    cls = "",
    test?: string,
    alternates?: FlickVariants | null,
  ) {
    const hints = [
      alternates?.down && `החלקה למטה: ${alternates.down.name}`,
      alternates?.left && `למטה ואז שמאלה: ${alternates.left.name}`,
      alternates?.right && `למטה ואז ימינה: ${alternates.right.name}`,
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <button
        key={test}
        type="button"
        className={`key ${cls}${alternates ? " has-alternate" : ""}`}
        aria-label={`${aria}${hints ? `, ${hints}` : ""}`}
        title={`${aria}${alternates?.down ? ` · ↓ ${alternates.down.label}` : ""}${alternates?.left ? ` · ↓← ${alternates.left.label}` : ""}${alternates?.right ? ` · ↓→ ${alternates.right.label}` : ""}`}
        data-flick-down={
          alternates?.down ? JSON.stringify(alternates.down) : undefined
        }
        data-flick-left={
          alternates?.left ? JSON.stringify(alternates.left) : undefined
        }
        data-flick-right={
          alternates?.right ? JSON.stringify(alternates.right) : undefined
        }
        data-testid={test}
        onClick={(e) => {
          e.preventDefault();
          if (suppress.current) {
            suppress.current = false;
            return;
          }
          action();
        }}
      >
        <span className="key-face">{label}</span>
        {alternates?.down && (
          <span className="key-alternate down" aria-hidden="true">
            {alternates.down.label}
          </span>
        )}
        {alternates?.left && (
          <span className="key-alternate left" aria-hidden="true">
            {alternates.left.label}
          </span>
        )}
        {alternates?.right && (
          <span className="key-alternate right" aria-hidden="true">
            {alternates.right.label}
          </span>
        )}
      </button>
    );
  }
  return (
    <section
      className={`keyboard-shell compact-keyboard${palette ? " palette-open" : ""}${searching ? " searching" : ""}`}
      aria-label="מקלדת MathFlow"
      data-testid="math-keyboard"
      dir="ltr"
      onClickCapture={(e) => {
        if (suppress.current) {
          e.preventDefault();
          e.stopPropagation();
          suppress.current = false;
        }
      }}
      onPointerDownCapture={(e) => {
        if ((e.target as HTMLElement).closest(".symbol-palette")) return;
        if (pid.current !== null) return;
        pid.current = e.pointerId;
        suppress.current = false;
        const rail = (e.target as HTMLElement).closest<HTMLElement>(
          ".suggestions",
        );
        railDrag.current = rail
          ? {
              element: rail,
              x: e.clientX,
              left: rail.scrollLeft,
              gesture: new SuggestionRailGesture(e.clientX, e.clientY),
            }
          : null;
        const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
          "button[data-flick-down], button[data-flick-left], button[data-flick-right]",
        );
        settledKey.current?.classList.remove("flick-committed");
        clearTimeout(releaseTimer.current);
        settledKey.current = null;
        pressedKey.current = button;
        gestureStartY.current = e.clientY;
        flickTargets.current = button
          ? {
              down: button.dataset.flickDown
                ? JSON.parse(button.dataset.flickDown)
                : undefined,
              left: button.dataset.flickLeft
                ? JSON.parse(button.dataset.flickLeft)
                : undefined,
              right: button.dataset.flickRight
                ? JSON.parse(button.dataset.flickRight)
                : undefined,
            }
          : null;
        controller.current.begin(e.clientX, e.clientY, {
          down: !!flickTargets.current?.down,
          left: !!flickTargets.current?.left,
          right: !!flickTargets.current?.right,
        });
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        e.preventDefault();
        if ((e.target as HTMLElement).closest('[data-testid="key-x"]'))
          long.current = setTimeout(() => {
            setPaletteTab("latin");
            explicitlyChosenTab.current = true;
            setPalette(true);
            suppress.current = true;
          }, 550);
      }}
      onPointerMoveCapture={(e) => {
        if (pid.current !== e.pointerId) return;
        const rail = railDrag.current;
        if (rail?.gesture.move(e.clientX, e.clientY)) {
          clearTimeout(long.current);
          suppress.current = true;
          e.preventDefault();
          rail.element.scrollLeft = rail.left - (e.clientX - rail.x);
          setPreview("");
          return;
        }
        const p = controller.current.move(e.clientX, e.clientY);
        const variant = p.flick && flickTargets.current?.[p.flick];
        if (rail && variant && pressedKey.current) {
          const rect = pressedKey.current.getBoundingClientRect();
          setRailPreview({
            label: variant.label,
            direction: p.flick!,
            x: rect.left + rect.width / 2,
            y: Math.max(8, rect.top - 52),
          });
        } else setRailPreview(null);
        if (p.swiping) {
          clearTimeout(long.current);
          suppress.current = true;
          e.preventDefault();
          pressedKey.current?.classList.toggle("is-flicking", !!p.flick);
          pressedKey.current?.classList.toggle(
            "is-flicking-left",
            p.flick === "left",
          );
          pressedKey.current?.classList.toggle(
            "is-flicking-down",
            p.flick === "down",
          );
          pressedKey.current?.classList.toggle(
            "is-flicking-right",
            p.flick === "right",
          );
          if (p.flick)
            pressedKey.current?.style.setProperty(
              "--flick-pull",
              `${Math.max(0, Math.min(8, (Math.abs(e.clientY - gestureStartY.current) - 18) * 0.13))}px`,
            );
          else pressedKey.current?.style.removeProperty("--flick-pull");
          setPreview(
            p.flick
              ? ""
              : p.cancelled
                ? "ביטול"
                : p.direction
                  ? directions[p.direction]
                  : e.clientY - gestureStartY.current > 16
                    ? ""
                    : "בחרו כיוון",
          );
        }
      }}
      onPointerUpCapture={(e) => {
        if (pid.current !== e.pointerId) return;
        clearTimeout(long.current);
        setRailPreview(null);
        if (railDrag.current?.gesture.scrolling) {
          railDrag.current = null;
          controller.current.cancel();
          resetKeyVisual();
          pid.current = null;
          suppress.current = true;
          e.preventDefault();
          return;
        }
        railDrag.current = null;
        const p = controller.current.end(e.clientX, e.clientY);
        const alternate = p.flick ? flickTargets.current?.[p.flick] : undefined;
        const flickSource =
          p.flick && p.flick !== "down" ? `flick:down-${p.flick}` : "flick";
        const committed = !!alternate;
        resetKeyVisual(committed);
        if (p.swiping) {
          suppress.current = true;
          e.preventDefault();
          if (alternate) {
            if (alternate.action) act(alternate.action, flickSource);
            else run(alternate, flickSource);
          } else if (
            p.direction &&
            keyboardSwipeAction(p.direction) &&
            !p.cancelled
          ) {
            gesture(p.direction);
            if (p.direction === "up") openPalette();
          }
        }
        flickTargets.current = null;
        pid.current = null;
        setPreview("");
      }}
      onPointerCancel={() => {
        railDrag.current = null;
        setRailPreview(null);
        clearTimeout(long.current);
        resetKeyVisual();
        pid.current = null;
        suppress.current = true;
        flickTargets.current = null;
        controller.current.cancel();
        setPreview("");
      }}
    >
      <div className="keyboard-head" dir="rtl">
        <div className="context-trail">
          <span className="context-dot" />
          {["GENERAL", "LOGIC_SET", "AFTER_STRUCTURE"].includes(context)
            ? frame.label
            : contextLabel[context]}
        </div>
        <FinalAnswerToggle mode={answerMode} onClick={onBox} />
        <button
          className="quiet icon-only display-toggle"
          onClick={onDisplay}
          aria-label={
            display ? "מעבר לנוסחה בתוך השורה" : "מעבר לנוסחה בשורה נפרדת"
          }
          title={display ? "בתוך השורה" : "שורה נפרדת"}
          aria-pressed={display}
        >
          {display ? <AlignCenter size={20} /> : <TextCursorInput size={20} />}
        </button>
        {exercise && (
          <button
            className="quiet icon-only"
            onClick={onExerciseEdit}
            aria-label="עריכת תרגיל"
            title="עריכת תרגיל"
          >
            <Pencil size={18} />
          </button>
        )}
      </div>
      {!palette && (
        <>
          <div
            className="suggestions"
            aria-label="הצעות לפי ההקשר ומקשים מוכרים"
          >
            {calculation &&
              key(
                <span className="calculation-face">
                  <small>תוצאה</small>
                  <b dir="ltr">{calculation.label}</b>
                </span>,
                `הכנסת התוצאה ${calculation.label}`,
                onCalculation,
                "suggestion calculation-suggestion",
                "calculate-result",
              )}
            {frame.predicted
              .slice(calculation ? 1 : 0)
              .filter((key) => key.value !== "root")
              .map((k) =>
                key(
                  k.label,
                  `${frame.exerciseValues.includes(k.value) ? "הצעה לפי התרגיל" : "הצעה לפי ההקשר"}: ${k.name}`,
                  () =>
                    run(
                      k,
                      frame.exerciseValues.includes(k.value)
                        ? "exercise-prediction"
                        : "prediction",
                    ),
                  "suggestion prediction",
                  `predict-${k.value}`,
                  flickVariants(k.value, frame.numberSets),
                ),
              )}
            {frame.anchors
              .filter((key) => key.value !== "root")
              .map((k) =>
                key(
                  k.label,
                  k.name,
                  () => run(k, "suggestion"),
                  "suggestion",
                  `suggest-${k.label}`,
                  flickVariants(k.value, frame.numberSets),
                ),
              )}
            {quickSymbols
              .filter(
                (symbol) =>
                  symbol.value !== "\\cdot" &&
                  ![...frame.predicted, ...frame.anchors].some(
                    (key) => key.value === symbol.value,
                  ),
              )
              .map((symbol) =>
                key(
                  symbol.label,
                  `קיצור ${symbol.name}`,
                  () => run(symbol, "shortcut"),
                  "suggestion favorite-key",
                  `shortcut-${symbol.value}`,
                  flickVariants(symbol.value, frame.numberSets),
                ),
              )}
          </div>
        </>
      )}
      {palette && (
        <div
          className="symbol-palette"
          dir="rtl"
          aria-label="לוח סימנים מתמטיים"
          ref={paletteRef}
          onPointerDown={(e) => {
            if (e.pointerType === "touch") return;
            suppress.current = false;
            if ((e.target as HTMLElement).closest("input, .palette-tabs"))
              return;
            paletteDrag.current = {
              x: e.clientX,
              y: e.clientY,
              id: e.pointerId,
              moved: false,
              canClose: (resultsRef.current?.scrollTop || 0) <= 1,
              axis: null,
            };
          }}
          onPointerMoveCapture={(e) => {
            if (e.pointerType === "touch") return;
            const start = paletteDrag.current;
            if (!start || start.id !== e.pointerId) return;
            if (movePalettePull(e.clientX, e.clientY)) {
              e.currentTarget.setPointerCapture(e.pointerId);
              e.preventDefault();
            }
          }}
          onPointerUpCapture={(e) => {
            if (e.pointerType !== "touch") endPalettePull(e.clientX, e.clientY);
          }}
          onPointerCancel={(e) => {
            if (e.pointerType !== "touch") {
              paletteDrag.current = null;
              setPreview("");
            }
          }}
        >
          <div className="palette-head">
            <label className="palette-search">
              <Search size={17} aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder="חיפוש סימן בעברית, English או בסמל"
                aria-label="חיפוש סימן"
                autoComplete="off"
                onFocus={() => setSearching(true)}
                onBlur={() => setSearching(false)}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    closePalette();
                  } else if (
                    event.key === "Enter" &&
                    shownSymbols.length === 1 &&
                    !pinMode
                  ) {
                    chooseSymbol(shownSymbols[0]);
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="palette-close"
              aria-label="סגירת סימנים"
              onPointerDown={(event) => event.preventDefault()}
              onClick={closePalette}
            >
              <X size={19} />
            </button>
          </div>
          <div
            className="palette-tabs"
            ref={tabsRef}
            role="tablist"
            aria-label="קבוצות סימנים"
          >
            {paletteCategories.map((category) => (
              <button
                type="button"
                key={category.id}
                role="tab"
                aria-selected={!query && paletteTab === category.id}
                className={!query && paletteTab === category.id ? "chosen" : ""}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => selectPaletteCategory(category.id)}
              >
                {category.label}
              </button>
            ))}
          </div>
          <div
            className="palette-results"
            ref={resultsRef}
            role="tabpanel"
            dir="ltr"
          >
            {shownSymbols.length ? (
              shownSymbols.map((symbol, index) => (
                <button
                  className={`key palette-key${shortcuts.includes(symbol.value) ? " pinned" : ""}${pinMode ? " pin-mode" : ""}`}
                  type="button"
                  key={`${symbol.category}-${symbol.value}-${index}`}
                  title={symbol.name}
                  aria-label={`${pinMode ? (shortcuts.includes(symbol.value) ? "הסרת קיצור" : "הצמדה לקיצורים") : symbol.name} ${symbol.label}`}
                  aria-pressed={
                    pinMode ? shortcuts.includes(symbol.value) : undefined
                  }
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() =>
                    pinMode
                      ? changeShortcut(symbol.value)
                      : chooseSymbol(symbol)
                  }
                >
                  {symbol.label}
                  {(pinMode || shortcuts.includes(symbol.value)) && (
                    <span className="palette-pin" aria-hidden="true">
                      {shortcuts.includes(symbol.value) ? "★" : "☆"}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <p className="palette-empty" dir="rtl">
                {query
                  ? "לא נמצא סימן. נסו שם אחר."
                  : "הסימנים שתבחרו יופיעו כאן."}
              </p>
            )}
          </div>
          <div className="palette-controls">
            <button
              type="button"
              className={pinMode ? "chosen" : ""}
              aria-pressed={pinMode}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                setPinMode(!pinMode);
                if (!pinMode) setKeepOpen(false);
                setPinMessage("");
              }}
            >
              {pinMode ? "✓ סיום קיצורים" : "☆ עריכת קיצורים"}
            </button>
            <button
              type="button"
              className={keepOpen ? "chosen" : ""}
              aria-pressed={keepOpen}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                setKeepOpen(!keepOpen);
                if (!keepOpen) setPinMode(false);
                setPinMessage("");
              }}
            >
              {keepOpen ? "רצף פעיל" : "רצף סימנים"}
            </button>
          </div>
          <small className="palette-count" dir="rtl" role="status">
            {pinMessage ||
              (pinMode
                ? `הקישו להצמדה או הסרה · עד ${SHORTCUT_LIMIT} קיצורים`
                : keepOpen
                  ? "בחירה מוסיפה ומשאירה את הלוח פתוח"
                  : `${shownSymbols.length} סימנים · בחירה מוסיפה לנוסחה`)}
          </small>
        </div>
      )}
      {!palette && (
        <div className="key-grid" aria-label="ספרות ופעולות קבועות">
          {["7", "8", "9"].map((n) =>
            key(n, n, () => run({ label: n, value: n }), "digit", `digit-${n}`),
          )}
          {key(
            "(",
            "פתיחת סוגריים",
            () => act({ type: "structure", kind: "group" }),
            "operator",
            "open-paren",
            flickVariants("openParen"),
          )}
          {key(
            ")",
            "סגירת סוגריים",
            () => act({ type: "up" }),
            "operator",
            "close-paren",
            flickVariants("closeParen"),
          )}
          {key(
            <Delete size={22} />,
            "מחיקה",
            () => act({ type: "backspace" }),
            "utility",
            "backspace",
          )}
          {["4", "5", "6"].map((n) =>
            key(n, n, () => run({ label: n, value: n }), "digit", `digit-${n}`),
          )}
          {key(
            "·",
            "כפל בנקודה",
            () => run({ label: "·", value: "\\cdot" }),
            "operator",
            "multiply",
            flickVariants("\\cdot"),
          )}
          {key(
            <span className="fraction-icon">
              <span>a</span>
              <span>b</span>
            </span>,
            "שבר",
            () => act({ type: "structure", kind: "fraction" }),
            "structure",
            "fraction",
            flickVariants("fractionKey"),
          )}
          {key(
            "√",
            "שורש",
            () => act({ type: "structure", kind: "root" }),
            "structure",
            "root",
          )}
          {["1", "2", "3"].map((n) =>
            key(n, n, () => run({ label: n, value: n }), "digit", `digit-${n}`),
          )}
          {key(
            "+",
            "פלוס",
            () => run({ label: "+", value: "+" }),
            "operator",
            "plus",
            flickVariants("+"),
          )}
          {key(
            "−",
            "מינוס",
            () => run({ label: "−", value: "-" }),
            "operator",
            "minus",
            flickVariants("-"),
          )}
          {key(
            <span>
              x<sup>n</sup>
            </span>,
            "חזקה",
            () => act({ type: "structure", kind: "power" }),
            "structure",
            "power",
            flickVariants("power"),
          )}
          {key(
            "0",
            "0",
            () => run({ label: "0", value: "0" }),
            "digit",
            "digit-0",
          )}
          {key(
            ".",
            "נקודה",
            () => run({ label: ".", value: "." }),
            "operator",
            "decimal",
            flickVariants("."),
          )}
          {key(
            "x",
            "x",
            () => run({ label: "x", value: "x" }),
            "variable",
            "key-x",
            flickVariants("x"),
          )}
          {key(
            "=",
            "שווה",
            () => run({ label: "=", value: "=" }),
            "operator",
            "equals",
            flickVariants("="),
          )}
          {key(
            <span className="next-content">
              <span className="next-copy">
                <strong>NEXT</strong>
                <small>{nextHint(state)}</small>
              </span>
              <span className="next-icon" aria-hidden="true">
                {nextWillInsertLine(state) ? (
                  <CornerDownLeft size={20} strokeWidth={2.4} />
                ) : (
                  <ArrowRight size={20} strokeWidth={2.4} />
                )}
              </span>
            </span>,
            `NEXT: ${nextHint(state)}`,
            () => act({ type: "next" }),
            "next",
            "next",
          )}
        </div>
      )}
      <div className="keyboard-foot" dir="rtl">
        <button
          className="catalog-text abc-switch"
          data-testid="abc"
          aria-label="מקלדת טקסט ABC"
          onClick={onText}
        >
          ABC
        </button>
        <button
          className={`exercise-keyboard-toggle${exercise?.enabled ? " selected" : ""}`}
          aria-label={
            exercise ? "הפעלת או כיבוי הצעות לפי תרגיל" : "הוספת תרגיל"
          }
          aria-pressed={!!exercise?.enabled}
          onClick={exercise ? onExerciseToggle : onExerciseEdit}
          title={exercise ? "הצעות לפי תרגיל" : "הוספת תרגיל"}
        >
          <NotebookPen size={19} />
        </button>
        <button
          className="catalog-trigger"
          aria-expanded={palette}
          aria-label={palette ? "חזרה למקשים" : "כל הסימנים"}
          onClick={() => (palette ? closePalette() : openPalette())}
        >
          {palette ? <X size={17} /> : <Search size={17} />}{" "}
          <span>{palette ? "חזרה למקשים" : "סימנים"}</span>
        </button>
        <div
          className="history-controls"
          role="group"
          aria-label="היסטוריית עריכה"
        >
          <button
            type="button"
            className="history-action"
            data-testid="math-undo"
            aria-label="בטל פעולה"
            title="בטל פעולה"
            disabled={!undoAvailable}
            onClick={onUndo}
          >
            <Undo2 size={20} />
          </button>
          <button
            type="button"
            className="history-action"
            data-testid="math-redo"
            aria-label="בצע שוב"
            title="בצע שוב"
            disabled={!redoAvailable}
            onClick={onRedo}
          >
            <Redo2 size={20} />
          </button>
        </div>
        {backAvailable && (
          <button
            className="keyboard-back"
            onClick={onBack}
            aria-label="חזרה למצב מקלדת קודם"
            title="מצב קודם"
          >
            <RotateCcw size={18} />
          </button>
        )}
      </div>
      {preview && (
        <div className="gesture-preview" role="status">
          {preview}
        </div>
      )}
      {railPreview &&
        createPortal(
          <div
            className={`flick-rail-preview ${railPreview.direction}`}
            style={{ left: railPreview.x, top: railPreview.y }}
            aria-hidden="true"
          >
            {railPreview.label}
          </div>,
          document.body,
        )}
    </section>
  );
}
