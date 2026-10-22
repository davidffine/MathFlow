// Small, visible secondaries on familiar keys. This is intentionally a short
// list: unfamiliar pairs slow users down more than opening the catalog.
import { symbolByValue } from "./symbols";
import { numberSets, symbolFamilies } from "./symbolFamilies";
export interface FlickVariant {
  label: string;
  value: string;
  name: string;
  action?: import("../navigation/SmartNextEngine").MathAction;
}

export interface FlickVariants {
  down?: FlickVariant;
  left?: FlickVariant;
  right?: FlickVariant;
}

const down: Record<string, FlickVariant> = {
  x: { label: "y", value: "y", name: "y" },
  "+": { label: "±", value: "\\pm", name: "פלוס מינוס" },
  "-": { label: "∓", value: "\\mp", name: "מינוס פלוס" },
  "\\cdot": { label: "×", value: "\\times", name: "כפל ב־×" },
  "\\times": { label: "·", value: "\\cdot", name: "כפל בנקודה" },
  fractionKey: { label: "÷", value: "\\div", name: "סימן חילוק" },
  "\\div": { label: "/", value: "/", name: "לוכסן" },
  power: {
    label: "1/x",
    value: "reciprocal",
    name: "אחד חלקי הבסיס",
    action: { type: "reciprocal" },
  },
  openParen: {
    label: "[",
    value: "square",
    name: "פתיחת סוגריים מרובעים",
    action: { type: "structure", kind: "square" },
  },
  closeParen: {
    label: "]",
    value: "closeSquare",
    name: "סגירת סוגריים מרובעים",
    action: { type: "closeSquare" },
  },
  "=": { label: "≠", value: "\\ne", name: "לא שווה" },
  ".": { label: ",", value: ",", name: "פסיק" },
  "\\le": { label: "<", value: "<", name: "קטן" },
  "\\ge": { label: ">", value: ">", name: "גדול" },
  "\\in": { label: "∉", value: "\\notin", name: "לא שייך" },
  "\\sum": { label: "∏", value: "\\prod", name: "מכפלה" },
  "\\int": { label: "∬", value: "\\iint", name: "אינטגרל כפול" },
  "\\sin": { label: "cos", value: "\\cos", name: "קוסינוס" },
  "\\pi": { label: "θ", value: "\\theta", name: "תטא" },
  "\\forall": { label: "∃", value: "\\exists", name: "קיים" },
};

// A side action always follows a downward movement. Left is logic/sets;
// right is arithmetic/algebra. Slots stay empty when a pairing is unclear.
const left: Record<string, FlickVariant> = {
  "+": { label: "∪", value: "\\cup", name: "איחוד קבוצות" },
  "-": { label: "∖", value: "\\setminus", name: "הפרש קבוצות" },
  "\\cdot": { label: "∩", value: "\\cap", name: "חיתוך קבוצות" },
  fractionKey: { label: "∈", value: "\\in", name: "שייכות לקבוצה" },
  "=": { label: "⇔", value: "\\Leftrightarrow", name: "אם ורק אם" },
};

const right: Record<string, FlickVariant> = {
  "+": { label: "⊕", value: "\\oplus", name: "סכום ישר" },
  "\\cdot": { label: "⊗", value: "\\otimes", name: "מכפלה טנזורית" },
  fractionKey: { label: "mod", value: "\\bmod", name: "שארית בחלוקה" },
  "=": { label: "≈", value: "\\approx", name: "שווה בקירוב" },
};

export function flickVariant(value: string): FlickVariant | null {
  return down[value] ?? null;
}

export function flickVariants(
  value: string,
  rankedSets: readonly string[] = numberSets,
): FlickVariants | null {
  const family = symbolFamilies.find((f) => f.includes(value));
  if (family) {
    let others: string[];
    if (family === numberSets)
      others = rankedSets.filter((v) => v !== value).slice(0, 3);
    else if (
      family[0] === "\\in" ||
      family[0] === "\\subseteq" ||
      family[0] === "\\subset"
    ) {
      const index = family.indexOf(value);
      others = [family[index ^ 1], family[index ^ 2], family[index ^ 3]];
    } else others = family.filter((v) => v !== value);
    const variant = (v: string | undefined): FlickVariant | undefined => {
      const symbol = v && symbolByValue.get(v);
      return symbol
        ? { label: symbol.label, value: symbol.value, name: symbol.name }
        : undefined;
    };
    return {
      down: variant(others[0]),
      left: variant(others[1]),
      right: variant(others[2]),
    };
  }
  const variants = {
    down: down[value],
    left: left[value],
    right: right[value],
  };
  return variants.down || variants.left || variants.right ? variants : null;
}
