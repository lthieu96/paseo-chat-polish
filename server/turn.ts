import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";

type Cursor = { epoch: string; seq: number };
type Entry = { item: AgentTimelineItem; turnId?: string };
type Page = { entries: Entry[]; startCursor: Cursor | null; hasOlder: boolean };
type Timeline = { refetch(options: { direction: "tail" | "before"; cursor?: Cursor; limit: number; projection: "canonical" }): Promise<Page> };

const PAGE = 200;
// A runaway turn stops here; the recap then covers its last 2,000 items.
const MAX_PAGES = 10;

/** The latest turn's items, fetched page by page from the tail. Canonical history has no user messages, so the turn is the trailing run of entries tagged with its turnId. */
export async function latestTurn(timeline: Timeline, turnId: string | null): Promise<AgentTimelineItem[]> {
  const turn: AgentTimelineItem[] = [];
  let target = turnId;
  let page = await timeline.refetch({ direction: "tail", limit: PAGE, projection: "canonical" });
  for (let n = 1; ; n++) {
    for (const { item, turnId: id } of [...page.entries].reverse()) {
      // Plugin rows, like earlier recaps, carry no turnId.
      if (!id && item.type === "plugin") continue;
      target ??= id ?? null;
      if (item.type === "user_message" || !id || id !== target) return turn.reverse();
      turn.push(item);
    }
    if (!page.hasOlder || !page.startCursor || n >= MAX_PAGES) return turn.reverse();
    page = await timeline.refetch({ direction: "before", cursor: page.startCursor, limit: PAGE, projection: "canonical" });
  }
}
