import type { TurnItem } from "@pi-web/protocol";

export interface TimelineMinimapItem {
  readonly id: string;
  readonly userText: string | null;
  readonly assistantText: string | null;
}

const TIMELINE_MINIMAP_ITEM_SPACING = 8;
export const TIMELINE_MINIMAP_MIN_ITEMS = 2;
const TIMELINE_MINIMAP_MAX_HEIGHT_CSS = "calc(100vh - 18rem)";

export function deriveTimelineMinimapItems(items: readonly TurnItem[]): TimelineMinimapItem[] {
  const minimapItems: TimelineMinimapItem[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || item.type !== "user_message") continue;

    let finalAssistantText: string | null = null;
    for (let j = i + 1; j < items.length; j += 1) {
      const next = items[j];
      if (!next) continue;
      if (next.type === "user_message") break;
      if (next.type === "assistant_message") {
        finalAssistantText = next.text;
      }
    }

    minimapItems.push({
      id: item.id,
      userText: item.text,
      assistantText: finalAssistantText,
    });
  }
  return minimapItems;
}

function stripMarkdownSyntax(raw: string): string {
  return raw
    .slice(0, 1500)
    .replace(/```[\s\S]*?```/g, " [code] ")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/^[#>*+-]+\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveTimelineMinimapPreview(
  item: TimelineMinimapItem | null,
): TimelineMinimapItem | null {
  if (!item) return null;
  const userCompact = item.userText?.replace(/\s+/g, " ").trim() || null;
  const assistantCompact = item.assistantText ? stripMarkdownSyntax(item.assistantText) || null : null;
  return {
    ...item,
    userText: userCompact,
    assistantText: assistantCompact,
  };
}

export function resolveTimelineMinimapHeightStyle(itemCount: number): string {
  const naturalHeight = Math.max(1, (itemCount - 1) * TIMELINE_MINIMAP_ITEM_SPACING);
  return `min(${naturalHeight}px, ${TIMELINE_MINIMAP_MAX_HEIGHT_CSS})`;
}

export function resolveTimelineMinimapTopPercent(index: number, itemCount: number): number {
  if (itemCount <= 1) return 0;
  return (Math.max(0, Math.min(index, itemCount - 1)) / (itemCount - 1)) * 100;
}

export function resolveTimelineMinimapIndexFromPointer(input: {
  readonly itemCount: number;
  readonly railTop: number;
  readonly railHeight: number;
  readonly pointerY: number;
}): number | null {
  if (input.itemCount <= 0 || input.railHeight <= 0) return null;
  if (input.itemCount === 1) return 0;

  const progress = Math.max(0, Math.min(1, (input.pointerY - input.railTop) / input.railHeight));
  return Math.max(0, Math.min(input.itemCount - 1, Math.round(progress * (input.itemCount - 1))));
}

const MAX_COLLAPSED_USER_MESSAGE_LINES = 8;
const MAX_COLLAPSED_USER_MESSAGE_LENGTH = 600;

export function shouldCollapseUserMessage(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  return (
    trimmed.length > MAX_COLLAPSED_USER_MESSAGE_LENGTH ||
    trimmed.split("\n").length > MAX_COLLAPSED_USER_MESSAGE_LINES
  );
}
