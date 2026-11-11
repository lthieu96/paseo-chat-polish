import { spawn } from "node:child_process";
import { translate, type Language } from "../shared/i18n";
import type { UpdateStatus } from "../shared/update";

// Paseo hands plugin processes its CLI's path; a daemon started from the CLI has it on PATH.
const CLI = process.env.PASEO_CLI || "paseo";
const NAME = "Chat Polish";

type Revision = { kind: "git"; commit: string } | { kind: "npm"; version: string };
type Preview = {
  id: string;
  outcome: "update" | "current" | "installed-newer" | "local" | "error";
  current?: { identity?: { kind: string }; currentRevision?: string };
  target?: Revision;
  links?: string[];
  error?: string;
};

/**
 * Runs `paseo plugin <args> --json`. Detached, so an update survives the restart it triggers in this process
 * (Paseo stops the old plugin process while it installs the new one).
 */
function plugin(args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLI, ["plugin", ...args, "--json"], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(err.trim() || `paseo exited with ${code}`));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error(`Unexpected output from paseo: ${out.slice(0, 200)}`));
      }
    });
  });
}

/** The runtime id this copy runs under: the manifest id, unless it was installed with `--id`. A folder copy loses to an installed one. */
async function ownId() {
  const list = (await plugin(["ls"])) as Array<{ id: string; name?: string; installation?: { identity?: { kind: string } } }>;
  const mine = list.filter((p) => p.name === NAME);
  return (mine.find((p) => p.installation?.identity?.kind !== "directory") ?? mine[0])?.id ?? "paseo-chat-polish";
}

const short = (r: Revision | undefined) => (r?.kind === "git" ? r.commit.slice(0, 7) : r?.version);
const shortRevision = (rev: string | undefined) => (rev && /^[0-9a-f]{40}$/.test(rev) ? rev.slice(0, 7) : rev);

export async function checkForUpdate(lang: Language = "en"): Promise<UpdateStatus> {
  try {
    const [item] = (await plugin(["update", await ownId(), "--check"])) as Preview[];
    if (!item) return { state: "error", links: [], error: translate(lang, "server.noResult") };
    const state = item.outcome === "installed-newer" ? "current" : item.outcome;
    return { state, current: shortRevision(item.current?.currentRevision), target: short(item.target), links: item.links ?? [], error: item.error };
  } catch (error) {
    return { state: "error", links: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function installUpdate(lang: Language = "en"): Promise<{ error?: string }> {
  try {
    const [result] = (await plugin(["update", await ownId(), "--yes"])) as Array<{ outcome: string; error?: string }>;
    return result?.outcome === "error" ? { error: result.error ?? translate(lang, "server.updateFailed") } : {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
