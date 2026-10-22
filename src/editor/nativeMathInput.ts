// Native IME input becomes explicit LaTeX tokens at the current structural cursor.
// One grapheme per token keeps backspace and selection predictable.
export function nativeMathTokens(input: string): string[] {
  const graphemes = Array.from(input.normalize("NFC"));
  const tokens: string[] = [];
  const math: Record<string, string> = {
    "+": "+",
    "-": "-",
    "=": "=",
    "<": "<",
    ">": ">",
    "*": "\\cdot",
    "/": "/",
    "(": "(",
    ")": ")",
    ".": ".",
    ",": ",",
    ";": ";",
  };
  const escaped: Record<string, string> = {
    "\\": "\\textbackslash{}",
    "{": "\\{",
    "}": "\\}",
    $: "\\$",
    "%": "\\%",
    "#": "\\#",
    "&": "\\&",
    _: "\\_",
    "^": "\\^{}",
    "~": "\\~{}",
  };
  for (const char of graphemes) {
    if (/\p{Mark}/u.test(char) && tokens.length) {
      const last = tokens.pop()!;
      tokens.push(
        last.startsWith("\\text{")
          ? last.replace(/}$/, `${char}}`)
          : `${last}\\text{${char}}`,
      );
    } else if (/^[0-9]$/.test(char)) tokens.push(char);
    else if (math[char]) tokens.push(math[char]);
    else
      tokens.push(`\\text{${escaped[char] || (char === " " ? "\\ " : char)}}`);
  }
  return tokens;
}
