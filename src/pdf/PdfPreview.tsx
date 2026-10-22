import { useEffect, type RefObject } from "react";
import { ArrowLeft, Printer } from "lucide-react";
export function PdfPreview({
  html,
  frameRef,
  onClose,
  onPrint,
}: {
  html: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
  onClose: () => void;
  onPrint: () => void;
}) {
  function fit() {
    const frame = frameRef.current;
    if (!frame?.contentDocument) return;
    const scale = Math.min(1, frame.clientWidth / 834);
    frame.contentDocument.documentElement.style.setProperty(
      "--preview-scale",
      String(scale),
    );
  }
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [html]);
  return (
    <div
      className="pdf-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="תצוגת PDF"
    >
      <header>
        <button className="quiet" onClick={onClose}>
          <ArrowLeft size={18} /> חזרה לעריכה
        </button>
        <strong>
          תצוגת PDF <small>A4</small>
        </strong>
        <button className="primary-button" onClick={onPrint}>
          <Printer size={17} /> הדפסה / שמירה
        </button>
      </header>
      <div className="pdf-frame-wrap">
        <iframe
          ref={frameRef}
          title="דף A4 להדפסה"
          srcDoc={html}
          onLoad={fit}
        />
      </div>
      <p className="pdf-note">
        בחרו ״שמירה כ־PDF״ בחלון ההדפסה. מומלץ לכבות כותרות עליונות ותחתונות של
        הדפדפן.
      </p>
    </div>
  );
}
