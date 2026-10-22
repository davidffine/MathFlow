// The palette is data, separate from the stable key layout. Every value is
// explicit LaTeX so documents and PDF export use the same mathematical atom.
export type SymbolCategory =
  | "common"
  | "relations"
  | "latin"
  | "greek"
  | "sets"
  | "calculus"
  | "functions"
  | "arrows"
  | "geometry";

export interface SymbolKey {
  label: string;
  value: string;
  name: string;
  search: string;
  category: SymbolCategory;
  kind?: "structure";
}

export const symbolCategories: { id: SymbolCategory; label: string }[] = [
  { id: "common", label: "נפוצים" },
  { id: "relations", label: "יחסים" },
  { id: "greek", label: "יוונית" },
  { id: "sets", label: "קבוצות" },
  { id: "calculus", label: "חדו״א" },
  { id: "functions", label: "פונקציות" },
  { id: "arrows", label: "חצים" },
  { id: "geometry", label: "גאומטריה" },
  { id: "latin", label: "אותיות" },
];

// Format: visible label | LaTeX or structure name | Hebrew name | English aliases.
// The short aliases are searchable but never inserted into the formula.
const catalog: Partial<Record<SymbolCategory, string>> = {
  common: String.raw`
√|root|שורש|root square sqrt
|x||abs|ערך מוחלט|absolute value modulus
≤|\le|קטן שווה|less equal leq
≥|\ge|גדול שווה|greater equal geq
≠|\ne|לא שווה|not equal neq
≈|\approx|בקירוב|approximately approx
≡|\equiv|זהות|equivalent congruent
±|\pm|פלוס מינוס|plus minus
∓|\mp|מינוס פלוס|minus plus
∞|\infty|אינסוף|infinity
·|\cdot|נקודה כפל|dot multiply
∝|\propto|פרופורציוני|proportional
%|\%|אחוז|percent
!|!|עצרת|factorial
∑|\sum|סכום|sum sigma
∏|\prod|מכפלה|product pi
∫|\int|אינטגרל|integral
∂|\partial|נגזרת חלקית|partial derivative
π|\pi|פאי|pi
θ|\theta|תטא|theta
Δ|\Delta|דלתא|delta
°|^\circ|מעלות|degree degrees
…|\ldots|שלוש נקודות|ellipsis dots
⋯|\cdots|שלוש נקודות ממורכזות|centered dots
⋮|\vdots|נקודות אנכיות|vertical dots
⋱|\ddots|נקודות אלכסוניות|diagonal dots
⊕|\oplus|סכום ישר|direct sum
⊗|\otimes|מכפלה טנזורית|tensor product
`,
  relations: String.raw`
<|<|קטן|less than
>|>|גדול|greater than
≤|\le|קטן שווה|less equal leq
≥|\ge|גדול שווה|greater equal geq
≠|\ne|לא שווה|not equal neq
≈|\approx|בקירוב|approximately approx
≡|\equiv|זהות|identical equivalent
∼|\sim|דומה|similar sim
≃|\simeq|דומה בקירוב|simeq
≅|\cong|חופף|congruent
∝|\propto|פרופורציוני|proportional
≪|\ll|קטן בהרבה|much less
≫|\gg|גדול בהרבה|much greater
≺|\prec|קודם|precedes
≼|\preceq|קודם או שווה|precedes equal
≻|\succ|עוקב|succeeds
≽|\succeq|עוקב או שווה|succeeds equal
∣|\mid|מחלק|divides mid
∤|\nmid|אינו מחלק|not divides
∥|\parallel|מקביל|parallel
⊥|\perp|מאונך|perpendicular
±|\pm|פלוס מינוס|plus minus
∓|\mp|מינוס פלוס|minus plus
`,
  greek: String.raw`
α|\alpha|אלפא|alpha
β|\beta|בטא|beta
γ|\gamma|גמא|gamma
δ|\delta|דלתא|delta
ε|\epsilon|אפסילון|epsilon
ϵ|\varepsilon|אפסילון חלופי|varepsilon
ζ|\zeta|זטא|zeta
η|\eta|אטא|eta
θ|\theta|תטא|theta
ϑ|\vartheta|תטא חלופי|vartheta
ι|\iota|יוטא|iota
κ|\kappa|קפא|kappa
λ|\lambda|למדא|lambda
μ|\mu|מיו|mu
ν|\nu|ניו|nu
ξ|\xi|קסי|xi
π|\pi|פאי|pi
ϖ|\varpi|פאי חלופי|varpi
ρ|\rho|רו|rho
ϱ|\varrho|רו חלופי|varrho
σ|\sigma|סיגמא|sigma
ς|\varsigma|סיגמא סופית|varsigma
τ|\tau|טאו|tau
υ|\upsilon|אופסילון|upsilon
φ|\phi|פי|phi
ϕ|\varphi|פי חלופי|varphi
χ|\chi|כי|chi
ψ|\psi|פסי|psi
ω|\omega|אומגה|omega
Γ|\Gamma|גמא גדולה|capital Gamma
Δ|\Delta|דלתא גדולה|capital Delta
Θ|\Theta|תטא גדולה|capital Theta
Λ|\Lambda|למדא גדולה|capital Lambda
Ξ|\Xi|קסי גדולה|capital Xi
Π|\Pi|פאי גדולה|capital Pi
Σ|\Sigma|סיגמא גדולה|capital Sigma
Υ|\Upsilon|אופסילון גדולה|capital Upsilon
Φ|\Phi|פי גדולה|capital Phi
Ψ|\Psi|פסי גדולה|capital Psi
Ω|\Omega|אומגה גדולה|capital Omega
`,
  sets: String.raw`
∀|\forall|לכל|for all universal
∃|\exists|קיים|exists
∄|\nexists|לא קיים|does not exist
∈|\in|שייך|in element of
∉|\notin|לא שייך|not in
∋|\ni|מכיל איבר|contains member
∌|\not\ni|לא מכיל איבר לא שייך שמאלה|not contains reverse membership
⊂|\subset|תת קבוצה|subset
⊆|\subseteq|תת קבוצה או שווה|subset equal
⊈|\nsubseteq|אינה תת קבוצה|not subset
⊄|\not\subset|אינה תת קבוצה ממש|not strict subset
⊃|\supset|קבוצת על|superset
⊇|\supseteq|קבוצת על או שווה|superset equal
⊉|\nsupseteq|אינה קבוצת על|not superset
⊅|\not\supset|אינה קבוצת על ממש|not strict superset
∪|\cup|איחוד|union
∩|\cap|חיתוך|intersection
⋃|\bigcup|איחוד גדול|big union
⋂|\bigcap|חיתוך גדול|big intersection
∖|\setminus|הפרש קבוצות|set difference
∅|\varnothing|קבוצה ריקה|empty set
ℕ|\mathbb{N}|טבעיים|natural numbers
ℤ|\mathbb{Z}|שלמים|integers
ℚ|\mathbb{Q}|רציונליים|rationals
ℝ|\mathbb{R}|ממשיים|real numbers
ℂ|\mathbb{C}|מרוכבים|complex numbers
∧|\land|וגם|and conjunction
∨|\lor|או|or disjunction
¬|\neg|שלילה|not negation
⇒|\Rightarrow|גורר|implies
⇐|\Leftarrow|נובע מ|implied by
⇔|\Leftrightarrow|אם ורק אם|iff equivalence
⇏|\nRightarrow|לא גורר ימינה|does not imply
:|:|כך ש נקודתיים|such that colon
∣|\mid|כך ש קו אנכי|such that vertical bar divides
⊢|\vdash|מוכיח|proves turnstile
⊨|\models|מספק|models entails
⊤|\top|אמת|true top
⊥|\bot|סתירה|false bottom
∴|\therefore|לכן|therefore
∵|\because|מכיוון|because
`,
  calculus: String.raw`
∑|\sum|סכום|summation sum
∏|\prod|מכפלה|product
∐|\coprod|מכפלה משותפת|coproduct
∫|\int|אינטגרל|integral
∬|\iint|אינטגרל כפול|double integral
∭|\iiint|אינטגרל משולש|triple integral
∮|\oint|אינטגרל מסילתי|contour integral
∂|\partial|נגזרת חלקית|partial derivative
∇|\nabla|נבלה|gradient nabla
lim|\lim|גבול|limit
lim sup|\limsup|גבול עליון|limit superior
lim inf|\liminf|גבול תחתון|limit inferior
∞|\infty|אינסוף|infinity
′|\prime|פריים נגזרת|prime derivative
`,
  functions: String.raw`
sin|\sin|סינוס|sine
cos|\cos|קוסינוס|cosine
tan|\tan|טנגנס|tangent
cot|\cot|קוטנגנס|cotangent
sec|\sec|סקנס|secant
csc|\csc|קוסקנס|cosecant
arcsin|\arcsin|ארקסינוס|inverse sine
arccos|\arccos|ארקקוסינוס|inverse cosine
arctan|\arctan|ארקטנגנס|inverse tangent
sinh|\sinh|סינוס היפרבולי|hyperbolic sine
cosh|\cosh|קוסינוס היפרבולי|hyperbolic cosine
tanh|\tanh|טנגנס היפרבולי|hyperbolic tangent
log|\log|לוגריתם|logarithm
ln|\ln|לוגריתם טבעי|natural logarithm
exp|\exp|אקספוננט|exponential
max|\max|מקסימום|maximum
min|\min|מינימום|minimum
sup|\sup|סופרימום|supremum
inf|\inf|אינפימום|infimum
arg|\arg|ארגומנט|argument
det|\det|דטרמיננטה|determinant
dim|\dim|ממד|dimension
gcd|\gcd|מחלק משותף מרבי|greatest common divisor
mod|\bmod|שארית בחלוקה|mod modulo remainder
ker|\ker|גרעין|kernel
Pr|\Pr|הסתברות|probability
`,
  arrows: String.raw`
→|\to|חץ ימינה|right arrow
←|\leftarrow|חץ שמאלה|left arrow
↔|\leftrightarrow|חץ דו כיווני|two way arrow
↦|\mapsto|ממופה אל|maps to
↑|\uparrow|חץ למעלה|up arrow
↓|\downarrow|חץ למטה|down arrow
⇒|\Rightarrow|גורר|implies
⇐|\Leftarrow|נובע מ|left double arrow
⇔|\Leftrightarrow|אם ורק אם|iff
⟶|\longrightarrow|חץ ארוך ימינה|long right arrow
⟵|\longleftarrow|חץ ארוך שמאלה|long left arrow
⟷|\longleftrightarrow|חץ ארוך דו כיווני|long two way arrow
⟼|\longmapsto|ממופה אל ארוך|long maps to
↗|\nearrow|חץ אלכסוני מעלה|north east arrow
↘|\searrow|חץ אלכסוני מטה|south east arrow
`,
  geometry: String.raw`
∠|\angle|זווית|angle
∡|\measuredangle|זווית נמדדת|measured angle
△|\triangle|משולש|triangle
□|\square|ריבוע|square
⊙|\odot|עיגול עם נקודה|circle dot
○|\circ|מעגל|circle
⊥|\perp|מאונך|perpendicular
∥|\parallel|מקביל|parallel
∦|\nparallel|לא מקביל|not parallel
≅|\cong|חופף|congruent
∼|\sim|דומה|similar
°|^\circ|מעלות|degree
ℓ|\ell|אורך|length ell
`,
};

const latin: SymbolKey[] = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
].map((label) => ({
  label,
  value: label,
  name: `אות ${label}`,
  search: `latin letter variable ${label}`,
  category: "latin",
}));

export const symbols: SymbolKey[] = [
  ...Object.entries(catalog).flatMap(([category, rows]) =>
    (rows ?? "")
      .trim()
      .split("\n")
      .map((row) => {
        // A visible absolute-value key contains a pipe. The delimiter is the
        // last three pipes, keeping the printable label intact.
        const parts = row.trim().split("|");
        const search = parts.pop() ?? "";
        const name = parts.pop() ?? "";
        const value = parts.pop() ?? "";
        const label = parts.join("|");
        return {
          label,
          value,
          name,
          search,
          category: category as SymbolCategory,
          ...(value === "root" || value === "abs"
            ? { kind: "structure" as const }
            : {}),
        };
      }),
  ),
  ...latin,
];

export const symbolByValue = new Map(
  symbols.map((symbol) => [symbol.value, symbol]),
);

export function filterSymbols(
  query: string,
  category: SymbolCategory,
): SymbolKey[] {
  const q = query.trim().toLocaleLowerCase();
  const matches = symbols.filter((symbol) => {
    if (!q) return symbol.category === category;
    if (/^[a-z]$/.test(q)) return symbol.label.toLowerCase() === q;
    const aliases = symbol.search.toLocaleLowerCase();
    return (
      symbol.label.toLocaleLowerCase().includes(q) ||
      symbol.name.toLocaleLowerCase().includes(q) ||
      symbol.value.toLocaleLowerCase().includes(q) ||
      aliases.split(/\s+/).some((word) => word.startsWith(q)) ||
      (q.includes(" ") && aliases.includes(q))
    );
  });
  return q
    ? matches.filter(
        (symbol, index) =>
          matches.findIndex((item) => item.value === symbol.value) === index,
      )
    : matches;
}
