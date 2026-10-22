// A deliberately small, local calculator. Every intermediate value is an
// exact rational; unsupported or ambiguous expressions have no suggestion.
export interface ExactResult {
  numerator: string;
  denominator: string;
  label: string;
}
type Rational = { n: bigint; d: bigint };
type Token = string;
const limit = 1_000_000_000_000n;
const abs = (n: bigint) => (n < 0n ? -n : n);
function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}
function rational(n: bigint, d: bigint): Rational {
  if (!d) throw Error("division by zero");
  if (d < 0n) [n, d] = [-n, -d];
  const divisor = gcd(abs(n), d);
  n /= divisor;
  d /= divisor;
  if (abs(n) > limit || d > limit) throw Error("out of range");
  return { n, d };
}
function numeric(value: string): Rational {
  const [whole, fraction] = value.split(".");
  if (!fraction) return rational(BigInt(whole), 1n);
  if (fraction.length > 6) throw Error("too precise");
  const denominator = 10n ** BigInt(fraction.length);
  return rational(BigInt(whole) * denominator + BigInt(fraction), denominator);
}
function tokenize(input: string): Token[] {
  const normalized = input
    .replace(/[−–]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/");
  const tokens: Token[] = [];
  for (let i = 0; i < normalized.length;) {
    if (/\s/.test(normalized[i])) {
      i++;
      continue;
    }
    const match = /^(?:\d+(?:\.\d+)?|[()+*/^\-])/.exec(normalized.slice(i));
    if (!match) throw Error("unsupported symbol");
    const token = match[0];
    const prev = tokens.at(-1);
    if (
      (token === "(" && (prev === ")" || (!!prev && /^\d/.test(prev)))) ||
      (/^\d/.test(token) && prev === ")")
    )
      tokens.push("*");
    tokens.push(token);
    i += token.length;
    if (tokens.length > 70) throw Error("too long");
  }
  return tokens;
}
const priority: Record<string, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "^": 4,
};
function apply(operator: string, a: Rational, b: Rational): Rational {
  switch (operator) {
    case "+":
      return rational(a.n * b.d + b.n * a.d, a.d * b.d);
    case "-":
      return rational(a.n * b.d - b.n * a.d, a.d * b.d);
    case "*":
      return rational(a.n * b.n, a.d * b.d);
    case "/":
      return rational(a.n * b.d, a.d * b.n);
    case "^": {
      if (b.d !== 1n || abs(b.n) > 12n) throw Error("unsupported power");
      const exponent = abs(b.n);
      return b.n < 0n
        ? rational(a.d ** exponent, a.n ** exponent)
        : rational(a.n ** exponent, a.d ** exponent);
    }
    default:
      throw Error("unknown operation");
  }
}
export function calculateExact(input: string): ExactResult | null {
  if (!input || input.length > 100) return null;
  try {
    const tokens = tokenize(input);
    let index = 0;
    function parse(minimum = 0): Rational {
      let left: Rational;
      const first = tokens[index++];
      if (first === "+" || first === "-") {
        const value = parse(3); // -2^2 means -(2^2)
        left = first === "-" ? rational(-value.n, value.d) : value;
      } else if (first === "(") {
        left = parse();
        if (tokens[index++] !== ")") throw Error("unclosed group");
      } else if (first && /^\d/.test(first)) left = numeric(first);
      else throw Error("incomplete expression");
      while (index < tokens.length) {
        const op = tokens[index];
        const precedence = priority[op];
        if (!precedence || precedence < minimum) break;
        index++;
        left = apply(op, left, parse(precedence + (op === "^" ? 0 : 1)));
      }
      return left;
    }
    const value = parse();
    if (index !== tokens.length) return null;
    const numerator = String(value.n),
      denominator = String(value.d);
    // Keep the suggestion readable on a narrow phone. Exact calculations that
    // grow beyond this size remain in the document without an automatic answer.
    if (numerator.length > 8 || denominator.length > 6) return null;
    return {
      numerator,
      denominator,
      label:
        denominator === "1"
          ? numerator.replace("-", "−")
          : `${numerator.replace("-", "−")}⁄${denominator}`,
    };
  } catch {
    return null;
  }
}

// Scan only the complete numeric expression immediately before the last '='.
// A touching variable/function makes the boundary ambiguous: stay silent.
export function calculationFromPrefix(prefix: string): ExactResult | null {
  if (!prefix.endsWith("=")) return null;
  let start = prefix.length - 2;
  while (start >= 0 && /[\d\s()+*/^\.×÷·−–\-]/.test(prefix[start])) start--;
  if (
    start >= 0 &&
    !/[\s:;,]/.test(prefix[start]) &&
    !/\s/.test(prefix[start + 1])
  )
    return null;
  const candidate = prefix.slice(start + 1, -1).trim();
  return calculateExact(candidate);
}
