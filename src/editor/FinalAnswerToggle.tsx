import { Square, Check } from "lucide-react";
import {
  answerModeLabel,
  nextAnswerMode,
  type FinalAnswerMode,
} from "./finalAnswer";

export function FinalAnswerToggle({
  mode,
  onClick,
}: {
  mode: FinalAnswerMode;
  onClick: () => void;
}) {
  const active = mode !== "off";
  const label = `תשובה סופית: ${answerModeLabel[mode]}. לחצו למעבר למצב ${answerModeLabel[nextAnswerMode(mode)]}`;
  return (
    <button
      type="button"
      className={`final-toggle${active ? " selected" : ""}`}
      data-answer-mode={mode}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {active ? (
        <Check size={16} aria-hidden="true" />
      ) : (
        <Square size={16} aria-hidden="true" />
      )}
      <span className="answer-toggle-copy">
        <span>תשובה סופית</span>
        <small>{mode === "element" ? "אלמנט" : answerModeLabel[mode]}</small>
      </span>
      <span className="answer-mode-steps" aria-hidden="true">
        {(["off", "line", "element"] as const).map((step) => (
          <i key={step} className={step === mode ? "current" : ""} />
        ))}
      </span>
    </button>
  );
}
