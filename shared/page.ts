// The page an html_render call published, as the chat frames it: the app's theme, the built-in styles and the boot script. Shared so the
// daemon can lay a page out the same way when it checks it (server/page-check.ts).

export interface HtmlColors {
  surface0: string;
  surface1: string;
  border: string;
  foreground: string;
  foregroundMuted: string;
  accent: string;
  accentForeground: string;
  statusSuccess: string;
  statusWarning: string;
  statusDanger: string;
}

const isLight = (hex: string) => {
  const m = /^#([0-9a-f]{6})/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 140;
};

/** The variables a page styles itself with; posted again when the app's theme changes. `series` are the chart colors mermaid and Pele use. */
export function themeCss(c: HtmlColors, fonts: { sans: string; mono: string }, series: readonly string[]) {
  const scheme = isLight(c.surface0) ? "light" : "dark";
  const vars: Record<string, string> = {
    "--fg": c.foreground,
    "--muted": c.foregroundMuted,
    "--bg": c.surface0,
    "--surface": c.surface1,
    "--border": c.border,
    "--accent": c.accent,
    "--accent-fg": c.accentForeground,
    "--success": c.statusSuccess,
    "--warning": c.statusWarning,
    "--danger": c.statusDanger,
    ...Object.fromEntries(series.slice(0, 6).map((color, i) => [`--chart-${i + 1}`, color])),
    "--radius": "8px",
    "--font": fonts.sans,
    "--mono": fonts.mono,
  };
  return `:root{color-scheme:${scheme};${Object.entries(vars).map(([k, v]) => `${k}:${v};`).join("")}}`;
}

// The kit the tool's description promises (server/html.ts). The page's own styles come after it, so they win.
const KIT = [
  "*,*::before,*::after{box-sizing:border-box}",
  "html{background:transparent;color:var(--fg);font:14px/1.5 var(--font);-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;scrollbar-width:none}",
  "html::-webkit-scrollbar{display:none}body{margin:0}",
  "h1,h2,h3,h4{margin:0;line-height:1.3;font-weight:600}h1{font-size:20px}h2{font-size:16px}h3,h4{font-size:14px}p{margin:0}",
  "code,kbd,pre,samp{font-family:var(--mono);font-size:12.5px}",
  ":not(pre)>code,kbd{padding:1px 5px;border-radius:4px;background:var(--surface);border:1px solid var(--border)}",
  "pre{margin:0;padding:12px;overflow:auto;border-radius:var(--radius);background:var(--surface);border:1px solid var(--border)}",
  ".stack{display:flex;flex-direction:column;gap:12px}.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}",
  ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}",
  ".card{padding:16px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--border)}",
  ".stat .label{color:var(--muted);font-size:12px}.stat .value{font-size:22px;font-weight:600;line-height:1.3;font-variant-numeric:tabular-nums}",
  ".muted{color:var(--muted)}.small{font-size:12px}",
  ".chip{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;font-size:12px;background:var(--surface);border:1px solid var(--border)}",
  "button{font:inherit;font-size:13px;color:var(--fg);padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface);cursor:pointer;transition:border-color .15s ease-out,background-color .15s ease-out,transform .16s cubic-bezier(.23,1,.32,1)}",
  "button:hover{border-color:var(--muted)}button:active:not(:disabled){transform:scale(.97)}button:disabled{opacity:.5;cursor:default}",
  "@media (prefers-reduced-motion:reduce){button:active:not(:disabled){transform:none}}",
  "button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}button.primary:hover{filter:brightness(1.08)}",
  "input,select,textarea{font:inherit;font-size:13px;color:var(--fg);background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:5px 8px}",
  "input[type=range],input[type=checkbox],input[type=radio]{accent-color:var(--accent);padding:0}",
  "table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:6px 10px;text-align:left;border-bottom:1px solid var(--border)}",
  "th{color:var(--muted);font-weight:500;font-size:12px}",
  ":focus-visible{outline:2px solid var(--accent);outline-offset:-2px}",
].join("");

// Applies the theme the chat posts and reports the content's height, so the frame fits the page instead of scrolling inside it.
// A link to another site opens in the system browser through the chat (or a new tab, on its own), never in place of the page. A framed srcdoc
// page resolves relative links against the chat's own address, so an "#anchor" sets the page's hash itself (it scrolls, hashchange fires)
// and other relative links do nothing. Esc and app shortcuts (⌘ or Ctrl chords, but not clipboard, undo or select-all, nor in a text field) reach the
// chat unless one of the page's own listeners handled them; the check waits a tick so they all run first.
const BOOT = `(function(){var t=document.getElementById("cp-theme"),r=document.documentElement,h=-1,w=-1;addEventListener("message",function(e){var d=e.data;if(e.source===parent&&d&&d.type==="cp-html-theme"&&typeof d.css==="string")t.textContent=d.css;});function post(){var v=Math.ceil(r.scrollHeight>r.clientHeight?r.scrollHeight:r.getBoundingClientRect().height),x=innerWidth;if(v!==h||x!==w){h=v;w=x;parent.postMessage({type:"cp-html-height",height:v,width:x},"*");}}if(window.ResizeObserver){var o=new ResizeObserver(post);o.observe(r);document.addEventListener("DOMContentLoaded",function(){o.observe(document.body);post();});}addEventListener("load",post);document.addEventListener("click",function(e){var l=e.isTrusted&&e.composedPath().find(function(n){return n&&n.matches&&n.matches("a[href]");}),h,u;if(!l)return;h=l.getAttribute("href").trim();if(h.charAt(0)==="#"){e.preventDefault();location.hash=h;return;}try{u=new URL(h);}catch(x){if(parent!==window)e.preventDefault();return;}if(!/^https?:$/.test(u.protocol))return;if(parent!==window){e.preventDefault();parent.postMessage({type:"cp-html-link",url:u.href},"*");}else{l.setAttribute("target","_blank");l.setAttribute("rel","noopener");}},true);if(parent!==window)addEventListener("keydown",function(e){var n=e.composedPath()[0],k=e.key==="Escape"||(e.metaKey||e.ctrlKey)&&!/^(?:[acvxyz]|Meta|Control|Shift|Alt)$/i.test(e.key)&&!(n&&(n.isContentEditable||/^(?:INPUT|TEXTAREA|SELECT)$/.test(n.tagName)));if(!e.isTrusted||e.isComposing||!k)return;setTimeout(function(){if(!e.defaultPrevented)parent.postMessage({type:"cp-html-key",key:e.key,code:e.code,metaKey:e.metaKey,ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey},"*");});});})();`;

// A page on its own (browser tab) has no chat around it: it takes the chat's background and a centered column.
const STANDALONE = "html{background:var(--bg)}body{max-width:1120px;margin:0 auto;padding:32px 24px}";

/** The agent's page with the theme, kit and boot script first in its head. */
export function htmlPage(html: string, theme: string, standalone = false) {
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style id="cp-theme">${theme}</style><style>${KIT}${standalone ? STANDALONE : ""}</style><script>${BOOT}</script>`;
  // ponytail: the first <head>/<html> tag wins, even one inside a comment or script before the real one; scan past those if pages break.
  const open = /<head(?:\s[^>]*)?>/i.exec(html) ?? /<html(?:\s[^>]*)?>/i.exec(html) ?? /^\s*<!doctype[^>]*>/i.exec(html);
  if (!open) return `<!doctype html><head>${head}</head>${html}`;
  const at = open.index + open[0].length;
  const inHead = /^<head/i.test(open[0]);
  return html.slice(0, at) + (inHead ? head : `<head>${head}</head>`) + html.slice(at);
}
