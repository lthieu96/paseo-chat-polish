import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

// Icon sets the Icon set pref offers beside Lucide. Their artwork isn't in this repo (Untitled UI's license forbids
// publishing it) and isn't installed with the plugin: the first time a set is picked, the daemon downloads that one
// package from the npm registry, checks it against the pinned hash, keeps the mapped icons in a small cache file and
// drops the rest.

/** Lucide name → Untitled UI icon (@untitledui/icons component name). */
export const UNTITLED: Record<string, string> = {
  Activity: "Activity", AppWindow: "Browser", Archive: "Archive", ArrowDownToLine: "Download01", ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight", ArrowUp: "ArrowUp", ArrowUpRight: "ArrowUpRight", AudioLines: "Recording02", Bell: "Bell01",
  Blend: "IntersectCircle", Blocks: "PuzzlePiece01", BookOpen: "BookOpen01", Bot: "MessageSmileSquare", Boxes: "Package",
  Brain: "Atom02", CalendarClock: "Calendar", Check: "Check", ChevronDown: "ChevronDown", ChevronLeft: "ChevronLeft",
  ChevronRight: "ChevronRight", ChevronUp: "ChevronUp", Circle: "Circle", CircleAlert: "AlertCircle", CircleCheck: "CheckCircle",
  CircleGauge: "Speedometer04", CircleQuestionMark: "HelpCircle", CircleSlash: "SlashCircle01", ClipboardPaste: "Clipboard",
  Clock: "Clock", Cloud: "Cloud01", Code: "Code01", CodeXml: "Code02", Copy: "Copy01", CopyPlus: "Copy06", Cpu: "CpuChip01",
  Download: "Download01", Ellipsis: "DotsHorizontal", EllipsisVertical: "DotsVertical", ExternalLink: "LinkExternal01", Eye: "Eye",
  EyeOff: "EyeOff", File: "File02", FileDiff: "FileCode01", FilePlus: "FilePlus02", FileText: "File04", Folder: "Folder",
  FolderGit2: "FolderCode", FolderMinus: "FolderMinus", FolderOpen: "Folder", FolderPlus: "FolderPlus", Forward: "FlipForward",
  Gauge: "Speedometer03", Gift: "Gift01", GitBranch: "GitBranch01", GitCommitHorizontal: "GitCommit",
  GitPullRequest: "GitPullRequest", Globe: "Globe02", HardDrive: "HardDrive", Image: "Image01", ImageOff: "ImageX",
  Inbox: "Inbox01", Info: "InfoCircle", Keyboard: "Keyboard01", Layers: "LayersTwo01", Lightbulb: "Lightbulb02", Link: "Link01",
  Link2: "Link03", ListChecks: "CheckDone01", ListTodo: "CheckDone02", ListTree: "Rows01", LoaderCircle: "Loading02",
  Lock: "Lock01", Map: "Map01", Merge: "GitMerge", MessageCircleQuestion: "MessageQuestionCircle",
  MessageSquare: "MessageSquare01", MessageSquarePlus: "MessagePlusSquare", MessageSquareText: "MessageTextSquare01",
  MessageSquareWarning: "MessageAlertSquare", Mic: "Microphone01", MicOff: "MicrophoneOff01", MicVocal: "Microphone01",
  Minimize2: "Minimize01", Minus: "Minus", Monitor: "Monitor01", Moon: "Moon01", Network: "Dataflow01",
  OctagonAlert: "AlertOctagon", Paintbrush: "Brush01", Palette: "Palette", PanelLeft: "LayoutLeft", PanelRight: "LayoutRight",
  Pencil: "Edit05", Plus: "Plus", Pointer: "Cursor01", Puzzle: "PuzzlePiece01", QrCode: "QrCode01", RefreshCcw: "RefreshCcw01",
  RotateCcw: "RefreshCcw01", RotateCcwClock: "ClockRewind", RotateCw: "RefreshCw01", Scan: "Scan", Scissors: "Scissors01",
  Search: "SearchMd", Send: "Send01", Server: "Server01", Settings: "Settings01", Settings2: "Sliders04", Shapes: "Cube01",
  Shield: "Shield01", ShieldCheck: "ShieldTick", ShieldOff: "ShieldOff", ShieldPlus: "ShieldPlus", Smartphone: "Phone01",
  Sparkle: "Star06", Sparkles: "Stars02", Split: "GitBranch02", Square: "Square", SquareCheck: "CheckSquare", SquarePen: "Edit01",
  SquareTerminal: "TerminalSquare", Sun: "Sun", Table: "Table", Tag: "Tag01", Terminal: "Terminal", TriangleAlert: "AlertTriangle",
  Type: "Type01", Undo2: "FlipBackward", Upload: "Upload01", User: "User01", Users: "Users01", Workflow: "Dataflow04",
  Wrench: "Tool02", X: "XClose", Zap: "Zap", ZoomIn: "ZoomIn", ZoomOut: "ZoomOut",
};

/** Lucide name → Hugeicons icon (@iconify-json/hugeicons name, Stroke Rounded). */
export const HUGEICONS: Record<string, string> = {
  Activity: "activity-01", AppWindow: "app-window", Archive: "archive", ArrowDownToLine: "arrow-down-to-line",
  ArrowLeft: "arrow-left-02", ArrowRight: "arrow-right-02", ArrowUp: "arrow-up-02", ArrowUpRight: "arrow-up-right-01",
  AudioLines: "audio-lines", Bell: "bell", Blend: "blend", Blocks: "blocks", BookOpen: "book-open-01", Bot: "bot", Boxes: "boxes",
  Brain: "ai-brain-01", CalendarClock: "calendar-clock", Check: "check", ChevronDown: "chevron-down", ChevronLeft: "chevron-left",
  ChevronRight: "chevron-right", ChevronUp: "chevron-up", Circle: "circle", CircleAlert: "alert-circle",
  CircleCheck: "circle-check", CircleGauge: "circle-gauge", CircleQuestionMark: "circle-question-mark",
  CircleSlash: "circle-slash", ClipboardPaste: "clipboard-paste", Clock: "clock-01", Cloud: "cloud", Code: "code",
  CodeXml: "code-xml", Copy: "copy", CopyPlus: "copy-plus", Cpu: "cpu", Download: "download-01", Ellipsis: "ellipsis",
  EllipsisVertical: "ellipsis-vertical", ExternalLink: "external-link", Eye: "view", EyeOff: "eye-off", File: "file-01",
  FileDiff: "file-diff", FilePlus: "file-plus", FileText: "file-text", Folder: "folder-01", FolderGit2: "folder-git-2",
  FolderMinus: "folder-minus", FolderOpen: "folder-open", FolderPlus: "folder-plus", Forward: "arrow-turn-forward", Gauge: "gauge",
  Gift: "gift", GitBranch: "git-branch", GitCommitHorizontal: "git-commit-horizontal", GitPullRequest: "git-pull-request",
  Globe: "globe", HardDrive: "hard-drive", Image: "image-01", ImageOff: "image-off", Inbox: "inbox", Info: "info",
  Keyboard: "keyboard", Layers: "layers-01", Lightbulb: "lightbulb", Link: "link", Link2: "link-02", ListChecks: "list-checks",
  ListTodo: "list-todo", ListTree: "list-tree", LoaderCircle: "loader-circle", Lock: "lock", Map: "map", Merge: "git-merge",
  MessageCircleQuestion: "message-question", MessageSquare: "message-square", MessageSquarePlus: "message-square-plus",
  MessageSquareText: "message-square-text", MessageSquareWarning: "message-square-warning", Mic: "mic-01", MicOff: "mic-off-01",
  MicVocal: "mic-vocal", Minimize2: "arrow-shrink-02", Minus: "minus", Monitor: "monitor", Moon: "moon", Network: "network",
  OctagonAlert: "octagon-alert", Paintbrush: "paintbrush", Palette: "palette", PanelLeft: "panel-left", PanelRight: "panel-right",
  Pencil: "pencil-edit-02", Plus: "plus", Pointer: "pointer", Puzzle: "puzzle", QrCode: "qr-code", RefreshCcw: "refresh-ccw",
  RotateCcw: "undo", RotateCcwClock: "history", RotateCw: "redo", Scan: "scan", Scissors: "scissors", Search: "search-01",
  Send: "send", Server: "server", Settings: "settings-01", Settings2: "sliders-horizontal", Shapes: "shapes", Shield: "shield-01",
  ShieldCheck: "shield-check", ShieldOff: "shield-off", ShieldPlus: "shield-plus", Smartphone: "smartphone", Sparkle: "sparkle",
  Sparkles: "sparkles", Split: "split", Square: "square", SquareCheck: "square-check", SquarePen: "square-pen",
  SquareTerminal: "square-terminal", Sun: "sun-03", Table: "table", Tag: "tag-01", Terminal: "terminal",
  TriangleAlert: "triangle-alert", Type: "type", Undo2: "undo-02", Upload: "upload-01", User: "user", Users: "users",
  Workflow: "workflow", Wrench: "wrench-01", X: "x", Zap: "zap", ZoomIn: "zoom-in", ZoomOut: "zoom-out",
};

const PACKAGES = {
  untitled: {
    tarball: "https://registry.npmjs.org/@untitledui/icons/-/icons-0.0.23.tgz",
    integrity: "sha512-WoBtPCXaxweF0RXS9IuqgEeJkBmT7A9SszPHB+vQJOxeAl0hDTFXHlWXsooYniXQ0JmP4+7RADdhWb39GWFT8g==",
    twins: (files: Map<string, string>) => twins(UNTITLED, (name) => untitledIcon(files.get(`package/dist/${name}.mjs`), name)),
  },
  hugeicons: {
    tarball: "https://registry.npmjs.org/@iconify-json/hugeicons/-/hugeicons-1.2.35.tgz",
    integrity: "sha512-c06tY90JZnKhOLBAKoQ1z2pqXMRdATuYXslTKwaaIAjLzKsTIsE+GGknY6+qo/SP0U/NG9xQjr4N+zfDqOeQiQ==",
    twins: (files: Map<string, string>) => {
      const set = JSON.parse(files.get("package/icons.json") ?? "{}") as IconifySet;
      return twins(HUGEICONS, (name) => hugeicon(set, name));
    },
  },
};
export type IconSetName = keyof typeof PACKAGES;
type IconifySet = { icons: Record<string, { body: string }>; aliases?: Record<string, { parent: string }> };

const twins = (map: Record<string, string>, read: (name: string) => string) =>
  Object.fromEntries(Object.entries(map).map(([lucide, name]) => [lucide, read(name)]));

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** An Untitled UI icon's 24px markup, read from the paths in its React component. */
export function untitledIcon(source: string | undefined, name: string) {
  const paths = [...(source ?? "").matchAll(/createElement\("path",\{([^}]*)\}/g)].map(
    ([, props]) => `<path ${[...props!.matchAll(/(\w+):"([^"]*)"/g)].map(([, key, value]) => `${kebab(key!)}="${value}"`).join(" ")}/>`,
  );
  if (!paths.length) throw new Error(`No Untitled UI icon ${name}`);
  return paths.join("");
}

// Two decimals. Numbers are read left to right as SVG does ("-.17.213" is -.17 and .213); a rounded one that would run
// into a neighbouring number gets a space.
export const roundPath = (body: string) =>
  body.replace(/-?(?:\d+(?:\.\d*)?|\.\d+)/g, (n, at: number, all: string) => {
    if (!/\.\d{3,}$/.test(n)) return n;
    const r = (n.startsWith("-") ? "-" : "") + String(+Math.abs(+n).toFixed(2));
    const before = /[\d.]/.test(all[at - 1] ?? "") && !r.startsWith("-") ? " " : "";
    const after = !r.includes(".") && all[at + n.length] === "." ? " " : "";
    return before + r + after;
  });

/** A Hugeicons icon's 24px markup; its strokes inherit the host svg's stroke instead of currentColor. */
export function hugeicon(set: IconifySet, name: string) {
  const body = set.icons[name]?.body ?? set.icons[set.aliases?.[name]?.parent ?? ""]?.body;
  if (!body) throw new Error(`No Hugeicons icon ${name}`);
  return roundPath(body).replace(/ stroke="currentColor"/g, "");
}

/** The regular files in a tar archive by path: ustar (name prefix for long paths), with pax and GNU long-name records. */
export function untar(tar: Buffer) {
  const files = new Map<string, string>();
  let longName: string | undefined;
  for (let at = 0; at + 512 <= tar.length; ) {
    const field = (from: number, length: number) => tar.subarray(at + from, at + from + length).toString("utf8").replace(/\0.*$/s, "");
    const name = field(0, 100);
    if (!name) break;
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const prefix = field(345, 155);
    const type = field(156, 1);
    const body = tar.subarray(at + 512, at + 512 + size).toString("utf8");
    // A pax "x" or GNU "L" record names the entry that follows it.
    if (type === "x") longName = /(?:^|\n)\d+ path=([^\n]*)/.exec(body)?.[1] ?? longName;
    else if (type === "L") longName = body.replace(/\0.*$/s, "");
    else {
      if (type === "0" || type === "") files.set(longName ?? (prefix ? `${prefix}/${name}` : name), body);
      longName = undefined;
    }
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

const cacheDir = () => join(process.env.PASEO_HOME || join(homedir(), ".paseo"), "plugin-cache", "paseo-chat-polish");
const loading = new Map<IconSetName, Promise<Record<string, string>>>();

/** A set's twins, Lucide name → 24px markup: from the cache, or downloaded once and cached. */
export function loadIconSet(set: IconSetName) {
  let pending = loading.get(set);
  if (!pending) {
    pending = readIconSet(set);
    loading.set(set, pending);
    // A failed download can be retried the next time the set is picked.
    pending.catch(() => loading.delete(set));
  }
  return pending;
}

async function readIconSet(set: IconSetName) {
  const pkg = PACKAGES[set];
  // Named after the pinned version, so a bump or a changed map (bump the suffix) skips an old cache.
  const file = join(cacheDir(), `${set}-${/-([^-/]+)\.tgz$/.exec(pkg.tarball)![1]}.v1.json`);
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, string>;
  } catch {
    // Not cached yet.
  }
  // React Native's global AbortSignal type shadows Node's here; at runtime it's Node's.
  const response = await fetch(pkg.tarball, { signal: AbortSignal.timeout(30_000) as RequestInit["signal"] });
  if (!response.ok) throw new Error(`Downloading ${pkg.tarball} failed: HTTP ${response.status}`);
  const tgz = Buffer.from(await response.arrayBuffer());
  const integrity = `sha512-${createHash("sha512").update(tgz).digest("base64")}`;
  if (integrity !== pkg.integrity) throw new Error(`${pkg.tarball} doesn't match its pinned hash`);
  const result = pkg.twins(untar(gunzipSync(tgz)));
  await mkdir(cacheDir(), { recursive: true });
  await writeFile(file, JSON.stringify(result));
  return result;
}
