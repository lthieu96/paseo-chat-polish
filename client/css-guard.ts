export const POSITIONAL = /:(?:nth-(?:last-)?child\([^)]*\)|first-child|last-child|only-child)/;

/** Splits at a top-level character (outside parentheses, brackets and quotes). */
export function splitTop(text: string, at: (ch: string) => boolean) {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) quote = ch === quote ? "" : quote;
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && at(ch)) (parts.push(text.slice(start, i)), (start = i + 1));
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Prefixes the subject of a selector that uses a positional pseudo-class with the same selector minus those pseudo-classes, in
 * :where() so specificity is unchanged. Chrome then tests :first-child / :nth-child only on elements already in the right place;
 * otherwise testing them on every div of the timeline flags its rows, and each row Paseo's virtual list mounts restyles its siblings.
 * Measured on a long chat: 6.9ms → 1.2ms to mount a row, with the parts web.ts tags instead of picking them by position.
 */
export function guardPositional(complex: string) {
  if (!POSITIONAL.test(complex)) return complex;
  const compounds = splitTop(complex, (ch) => ch === " " || ch === ">" || ch === "+" || ch === "~");
  const subject = compounds.at(-1)!;
  const head = complex.slice(0, complex.length - subject.length);
  let pre = complex
    .replace(/:not\(\s*:(?:first|last|only)-child\s*\)/g, "")
    .replace(new RegExp(POSITIONAL.source, "g"), "")
    .replace(/::?(?:before|after|placeholder|marker|selection)\b/g, "")
    .trimStart();
  // A bare positional subject ("X > :first-child") leaves a dangling combinator; :where(X >) is invalid and matches nothing.
  pre = (/[\s>+~]$/.test(pre) ? `${pre.trimEnd()} *` : pre).trim();
  if (!pre || !subject) return complex;
  const lead = /^(?:\*|[a-zA-Z][\w-]*)?/.exec(subject)![0];
  return `${head}${lead}:where(${pre})${subject.slice(lead.length)}`;
}
