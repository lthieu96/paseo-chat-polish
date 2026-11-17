import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";

type Entry = { item: AgentTimelineItem; turnId?: string };
type Timeline = { refetch(options: { direction: "tail"; limit: number; projection: "canonical"; wholeTurns: true }): Promise<{ entries: Entry[] }> };

/**
 * The latest turn's items: one tail page with wholeTurns (Paseo 0.16+), which keeps the last turn whole, filtered to `turnId` (or the
 * newest entry's turn when it's null). Empty when a newer turn started first. Plugin rows, like earlier recaps, carry no turnId.
 */
export async function latestTurn(timeline: Timeline, turnId: string | null): Promise<AgentTimelineItem[]> {
  const { entries } = await timeline.refetch({ direction: "tail", limit: 1, projection: "canonical", wholeTurns: true });
  const target = turnId ?? entries.findLast((e) => e.turnId)?.turnId;
  return target ? entries.filter((e) => e.turnId === target).map((e) => e.item) : [];
}
