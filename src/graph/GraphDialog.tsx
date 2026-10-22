import { useEffect, useMemo, useRef, useState } from "react";
import { ChartNoAxesCombined, ImagePlus, X } from "lucide-react";
import { compileFunction } from "./expression";
import { makePlot, tickLabel } from "./plot";
import { drawGraph, graphPng } from "./renderGraph";
import "./graph.css";
export function GraphDialog({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (blob: Blob, alt: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [formula, setFormula] = useState("x^2 - 4");
  const [xmin, setXmin] = useState("-5"),
    [xmax, setXmax] = useState("5");
  const [automatic, setAutomatic] = useState(true);
  const [ymin, setYmin] = useState("-5"),
    [ymax, setYmax] = useState("5");
  const [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState("");
  const result = useMemo(() => {
    try {
      const number = (text: string) =>
        text.trim() ? Number(text.replace(/−/g, "-")) : NaN;
      const fn = compileFunction(formula);
      const plot = makePlot(
        fn,
        { min: number(xmin), max: number(xmax) },
        automatic ? undefined : { min: number(ymin), max: number(ymax) },
      );
      if (!plot.visible)
        throw new Error(
          "הגרף אינו נראה בטווח שנבחר. הרחיבו את הטווח או הפעילו טווח y אוטומטי.",
        );
      return { fn, plot, error: "" };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "לא ניתן להציג את הגרף.",
      };
    }
  }, [formula, xmin, xmax, automatic, ymin, ymax]);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    setSaveError("");
    if (canvas.current && result.plot && result.fn)
      drawGraph(canvas.current, result.plot, result.fn.expression);
  }, [result]);
  async function insert() {
    if (!canvas.current || !result.plot || !result.fn || busy) return;
    setBusy(true);
    setSaveError("");
    try {
      const p = result.plot;
      const alt = `גרף y = ${result.fn.expression}; x: ${tickLabel(p.x.min)}…${tickLabel(p.x.max)}; y: ${tickLabel(p.y.min)}…${tickLabel(p.y.max)}`;
      await onInsert(await graphPng(canvas.current), alt);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "לא ניתן להוסיף את הגרף.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="graph-dialog"
      aria-labelledby="graph-heading"
      dir="rtl"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="graph-content"
        onSubmit={(e) => {
          e.preventDefault();
          void insert();
        }}
      >
        <header className="graph-heading">
          <span className="graph-heading-icon">
            <ChartNoAxesCombined size={22} />
          </span>
          <div>
            <h2 id="graph-heading">גרף מפונקציה</h2>
            <p>מזינים, רואים, ומוסיפים לדף.</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="סגירת גרף"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </header>
        <fieldset disabled={busy}>
          <label className="graph-expression-label" htmlFor="graph-expression">
            הפונקציה
          </label>
          <div className="graph-expression" dir="ltr">
            <span>y =</span>
            <input
              id="graph-expression"
              aria-label="פונקציה של x"
              value={formula}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={256}
              onChange={(e) => setFormula(e.target.value)}
              aria-describedby="graph-syntax"
            />
          </div>
          <div className="graph-examples">
            <span>נסו:</span>
            {["x^2 - 4", "sin(x)", "1/x", "sqrt(x)"].map((example) => (
              <button
                type="button"
                key={example}
                dir="ltr"
                onClick={() => setFormula(example)}
              >
                {example}
              </button>
            ))}
          </div>
          <div className="graph-preview" aria-label="תצוגה מקדימה של הגרף">
            {result.error ? (
              <p className="graph-error" role="status">
                {result.error}
              </p>
            ) : (
              <canvas
                ref={canvas}
                role="img"
                aria-label={`תצוגה מקדימה: y = ${formula}`}
              />
            )}
          </div>
          <div className="graph-range">
            <span>טווח x</span>
            <label>
              מ־
              <input
                aria-label="x מינימלי"
                dir="ltr"
                inputMode="decimal"
                value={xmin}
                onChange={(e) => setXmin(e.target.value)}
              />
            </label>
            <label>
              עד
              <input
                aria-label="x מקסימלי"
                dir="ltr"
                inputMode="decimal"
                value={xmax}
                onChange={(e) => setXmax(e.target.value)}
              />
            </label>
          </div>
          <label className="graph-auto">
            <input
              type="checkbox"
              checked={automatic}
              onChange={(e) => setAutomatic(e.target.checked)}
            />
            טווח y אוטומטי
            {automatic && result.plot && (
              <small dir="ltr">
                {tickLabel(result.plot.y.min)} … {tickLabel(result.plot.y.max)}
              </small>
            )}
          </label>
          {!automatic && (
            <div className="graph-range">
              <span>טווח y</span>
              <label>
                מ־
                <input
                  aria-label="y מינימלי"
                  dir="ltr"
                  inputMode="decimal"
                  value={ymin}
                  onChange={(e) => setYmin(e.target.value)}
                />
              </label>
              <label>
                עד
                <input
                  aria-label="y מקסימלי"
                  dir="ltr"
                  inputMode="decimal"
                  value={ymax}
                  onChange={(e) => setYmax(e.target.value)}
                />
              </label>
            </div>
          )}
          <details className="graph-help" id="graph-syntax">
            <summary>איך כותבים פונקציה?</summary>
            <p>
              חזקות: <bdi>x^2</bdi> · כפל: <bdi>2x</bdi> או <bdi>2*(x+1)</bdi> ·
              שבר: <bdi>1/(x-2)</bdi>.<br />
              פונקציות: <bdi>sqrt, abs, sin, cos, tan, exp, ln, log</bdi>.
              זוויות ברדיאנים; <bdi>ln</bdi> הוא לוגריתם טבעי, <bdi>log</bdi>{" "}
              בבסיס 10. קבועים: <bdi>pi</bdi>, <bdi>e</bdi>.<br />
              הגרף הוא תמונה קבועה. אפשר לשנות גודל, יישור או למחוק אותה במסמך.
            </p>
          </details>
        </fieldset>
        {saveError && (
          <p className="graph-error" role="alert">
            {saveError}
          </p>
        )}
        <footer>
          <button
            className="primary-button"
            type="submit"
            disabled={busy || !!result.error}
          >
            <ImagePlus size={18} />
            {busy ? "מוסיף גרף…" : "הכנסת גרף למסמך"}
          </button>
          <button
            className="quiet"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            ביטול
          </button>
        </footer>
      </form>
    </dialog>
  );
}
