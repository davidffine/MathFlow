/** Small real-valued expression language. No eval, Function, property access or JS execution. */
export interface CompiledFunction {
  expression: string;
  evaluate: (x: number) => number;
}
type Expr =
  | { kind: "number"; value: number }
  | { kind: "variable" }
  | { kind: "unary"; op: string; child: Expr }
  | { kind: "binary"; op: string; left: Expr; right: Expr }
  | { kind: "call"; name: string; child: Expr };
type Token = { kind: "number" | "name" | "op" | "end"; text: string };
const functions: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  exp: Math.exp,
};
export function compileFunction(input: string): CompiledFunction {
  const source = input
    .trim()
    .replace(/^(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, "")
    .replace(/−|–/g, "-")
    .replace(/×|·/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/\*\*/g, "^")
    .toLowerCase();
  if (!source) throw new Error("הקלידו פונקציה של x כדי להציג גרף.");
  if (source.length > 256)
    throw new Error("הפונקציה ארוכה מדי. אפשר להזין עד 256 תווים.");
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < source.length) {
    const rest = source.slice(pos);
    if (/^\s/.test(rest)) {
      pos++;
      continue;
    }
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/);
    const name = rest.match(/^[a-z][a-z0-9]*/);
    if (number) {
      tokens.push({ kind: "number", text: number[0] });
      pos += number[0].length;
    } else if (name) {
      tokens.push({ kind: "name", text: name[0] });
      pos += name[0].length;
    } else if ("+-*/^()".includes(rest[0])) {
      tokens.push({ kind: "op", text: rest[0] });
      pos++;
    } else
      throw new Error(
        `הסימן ״${rest[0]}״ אינו נתמך. השתמשו ב־x, מספרים ופעולות מתמטיות.`,
      );
    if (tokens.length > 160)
      throw new Error("הפונקציה מורכבת מדי לתצוגה הזאת.");
  }
  tokens.push({ kind: "end", text: "" });
  let index = 0;
  const peek = () => tokens[index];
  function expression(min = 0, depth = 0): Expr {
    if (depth > 32) throw new Error("יש יותר מדי סוגריים או חזקות מקוננים.");
    const t = tokens[index++];
    let left: Expr;
    if (t.kind === "number") {
      const value = Number(t.text);
      if (!Number.isFinite(value)) throw new Error("המספר גדול מדי.");
      left = { kind: "number", value };
    } else if (t.text === "+" || t.text === "-") {
      left = { kind: "unary", op: t.text, child: expression(30, depth + 1) };
    } else if (t.text === "(") {
      left = expression(0, depth + 1);
      if (peek().text !== ")") throw new Error("חסר סוגר סוגר.");
      index++;
    } else if (t.kind === "name") {
      if (t.text === "x") left = { kind: "variable" };
      else if (t.text === "pi" || t.text === "e")
        left = { kind: "number", value: t.text === "pi" ? Math.PI : Math.E };
      else if (Object.hasOwn(functions, t.text)) {
        if (peek().text !== "(")
          throw new Error(`כתבו ${t.text}(x) עם סוגריים.`);
        index++;
        const child = expression(0, depth + 1);
        if (peek().text !== ")") throw new Error("חסר סוגר סוגר.");
        index++;
        left = { kind: "call", name: t.text, child };
      } else
        throw new Error(
          `״${t.text}״ אינו נתמך. המשתנה הוא x; לדוגמה sin(x) או sqrt(x).`,
        );
    } else throw new Error("הביטוי אינו שלם. בדקו מספרים, פעולות וסוגריים.");
    while (true) {
      const next = peek();
      const implicit = next.kind === "name" || next.text === "(";
      const op = implicit ? "*" : next.text;
      const precedence =
        op === "^"
          ? 40
          : op === "*" || op === "/"
            ? 20
            : op === "+" || op === "-"
              ? 10
              : -1;
      if (precedence < min) break;
      if (!implicit) index++;
      const right = expression(
        op === "^" ? precedence : precedence + 1,
        depth + 1,
      );
      left = { kind: "binary", op, left, right };
    }
    return left;
  }
  const tree = expression();
  if (peek().kind !== "end")
    throw new Error("בדקו את הסוגריים והוסיפו סימן פעולה בין המספרים.");
  function evaluate(n: Expr, x: number): number {
    switch (n.kind) {
      case "number":
        return n.value;
      case "variable":
        return x;
      case "unary":
        return (n.op === "-" ? -1 : 1) * evaluate(n.child, x);
      case "call":
        return functions[n.name](evaluate(n.child, x));
      case "binary": {
        const a = evaluate(n.left, x),
          b = evaluate(n.right, x);
        switch (n.op) {
          case "+":
            return a + b;
          case "-":
            return a - b;
          case "*":
            return a * b;
          case "/":
            return a / b;
          default:
            return Math.pow(a, b);
        }
      }
    }
  }
  return {
    expression: source,
    evaluate: (x) => {
      const y = evaluate(tree, x);
      return Number.isFinite(y) ? y : NaN;
    },
  };
}
