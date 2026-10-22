export const numberSets = [
  "\\mathbb{R}",
  "\\mathbb{N}",
  "\\mathbb{Z}",
  "\\mathbb{Q}",
  "\\mathbb{C}",
];
export const symbolFamilies = [
  ["\\forall", "\\exists"],
  ["\\Leftrightarrow", "\\Rightarrow", "\\Leftarrow", "\\nRightarrow"],
  ["\\in", "\\notin", "\\ni", "\\not\\ni"],
  ["\\subseteq", "\\nsubseteq", "\\supseteq", "\\nsupseteq"],
  ["\\subset", "\\not\\subset", "\\supset", "\\not\\supset"],
  numberSets,
];
export function symbolFamily(value: string): string {
  return symbolFamilies.find((family) => family.includes(value))?.[0] || value;
}
