// Code in the user's own messages: fenced blocks and inline code, the two that read badly as plain text.

export type UserInline = { text: string; code?: true };
export type UserBlock = { kind: "text"; parts: UserInline[] } | { kind: "code"; lang: string; code: string };

// CommonMark: up to three spaces, then 3+ backticks or 3+ tildes, then an info string (which may not hold a backtick after backticks).
const OPEN = /^ {0,3}(`{3,}|~{3,})[ \t]*(\S*)(.*)$/;

/**
 * Splits a message into text and fenced code blocks, and marks inline code in the text. Returns null when the message has
 * no code at all, so plain prompts stay exactly as Paseo draws them. An unclosed fence runs to the end, as in CommonMark.
 */
export function parseUserMarkdown(source: string): UserBlock[] | null {
  if (!source.includes("`") && !source.includes("~~~")) return null;
  const blocks: UserBlock[] = [];
  const lines = source.split(/\r?\n/);
  let prose: string[] = [];
  const flush = () => {
    // The blank line between prose and a fence is the block gap, not text.
    const text = prose.join("\n").replace(/^\n+|\n+$/g, "");
    if (text) blocks.push({ kind: "text", parts: inlineCode(text) });
    prose = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(lines[i]!);
    if (!open || (open[1]![0] === "`" && (open[2]! + open[3]!).includes("`"))) {
      prose.push(lines[i]!);
      continue;
    }
    const fence = open[1]!;
    const indent = lines[i]!.length - lines[i]!.trimStart().length;
    const close = new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`);
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length && !close.test(lines[j]!); j++) body.push(indent ? lines[j]!.replace(new RegExp(`^ {0,${indent}}`), "") : lines[j]!);
    flush();
    blocks.push({ kind: "code", lang: open[2] ?? "", code: body.join("\n") });
    i = j;
  }
  flush();
  return blocks.some((b) => b.kind === "code" || b.parts.some((p) => p.code)) ? blocks : null;
}

/** Inline code: a run of n backticks up to the next run of exactly n; one space padding both ends is dropped (CommonMark). */
export function inlineCode(text: string): UserInline[] {
  const parts: UserInline[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "`") {
      plain += text[i++];
      continue;
    }
    let n = 0;
    while (text[i + n] === "`") n++;
    const run = "`".repeat(n);
    let close = -1;
    for (let k = text.indexOf(run, i + n); k !== -1; k = text.indexOf(run, k + 1)) {
      let m = 0;
      while (text[k + m] === "`") m++;
      if (m === n && text[k - 1] !== "`") {
        close = k;
        break;
      }
      k += m - 1;
    }
    if (close === -1) {
      plain += run;
      i += n;
      continue;
    }
    let code = text.slice(i + n, close).replace(/\n/g, " ");
    if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim()) code = code.slice(1, -1);
    if (plain) parts.push({ text: plain });
    plain = "";
    parts.push({ text: code, code: true });
    i = close + n;
  }
  if (plain) parts.push({ text: plain });
  return parts;
}
