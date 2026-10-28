import { useEffect } from "react";
import { clampThreadFindIndex, findThreadSearchOccurrences } from "./threadFind";

const THREAD_FIND_HIGHLIGHT_NAME = "t3-thread-find";
const THREAD_FIND_ACTIVE_HIGHLIGHT_NAME = "t3-thread-find-active";

const THREAD_FIND_TEXT_SELECTOR = "[data-thread-find-text]";
const THREAD_FIND_IGNORE_SELECTOR = "[data-thread-find-ignore], [role='toolbar'], svg";
const FOLD_SELECTOR = "[hidden], [data-thread-find-fold]";

export interface ThreadFindRange {
  readonly rowId: string;
  readonly occurrence: number;
  readonly range: Range;
}

/**
 * Collect matching text ranges inside `[data-thread-find-text]` elements using
 * `TreeWalker` (`NodeFilter.SHOW_TEXT`), setting range bounds directly on text nodes.
 */
export function collectThreadFindRanges(container: HTMLElement, query: string): ThreadFindRange[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const ranges: ThreadFindRange[] = [];
  const occurrenceByRowId = new Map<string, number>();

  for (const scope of container.querySelectorAll<HTMLElement>(THREAD_FIND_TEXT_SELECTOR)) {
    if (scope.parentElement?.closest(THREAD_FIND_TEXT_SELECTOR)) continue;
    const rowId =
      scope.closest("[data-timeline-row-id]")?.getAttribute("data-timeline-row-id") ?? "row";

    const treeWalker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest(THREAD_FIND_IGNORE_SELECTOR)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const allTextNodes: Text[] = [];
    let currentNode = treeWalker.nextNode();
    while (currentNode) {
      allTextNodes.push(currentNode as Text);
      currentNode = treeWalker.nextNode();
    }

    for (const textNode of allTextNodes) {
      const text = textNode.nodeValue ?? "";
      for (const matchStartIndex of findThreadSearchOccurrences(text, trimmed)) {
        const matchEndIndex = matchStartIndex + trimmed.length;
        const range = new Range();
        range.setStart(textNode, matchStartIndex);
        range.setEnd(textNode, matchEndIndex);
        const occurrence = occurrenceByRowId.get(rowId) ?? 0;
        ranges.push({ rowId, occurrence, range });
        occurrenceByRowId.set(rowId, occurrence + 1);
      }
    }
  }

  return ranges;
}

function revealFoldedAncestors(range: Range, container: HTMLElement): boolean {
  let revealed = false;
  for (
    let fold = range.startContainer.parentElement?.closest(FOLD_SELECTOR);
    fold && container.contains(fold);
    fold = fold.parentElement?.closest(FOLD_SELECTOR)
  ) {
    if (fold.hasAttribute("hidden") || fold.getAttribute("data-thread-find-fold") === "closed") {
      fold.dispatchEvent(new Event("beforematch"));
      revealed = true;
    }
  }
  return revealed;
}

export function useThreadFindHighlights(input: {
  readonly container: HTMLElement | null;
  readonly open: boolean;
  readonly query: string;
  readonly activeIndex: number;
  readonly onMatchCountChange: (count: number) => void;
}): void {
  const { container, open, query, activeIndex, onMatchCountChange } = input;

  useEffect(() => {
    const clearHighlights = () => {
      if (typeof CSS !== "undefined" && CSS.highlights) {
        CSS.highlights.delete(THREAD_FIND_HIGHLIGHT_NAME);
        CSS.highlights.delete(THREAD_FIND_ACTIVE_HIGHLIGHT_NAME);
      }
    };

    if (!open || !container || query.trim().length === 0) {
      clearHighlights();
      onMatchCountChange(0);
      return;
    }

    let lastScrolledIndex = -1;
    let lastScrolledQuery = "";

    const paint = () => {
      const matches = collectThreadFindRanges(container, query);
      onMatchCountChange(matches.length);

      if (matches.length === 0) {
        clearHighlights();
        return;
      }

      const clampedIndex = clampThreadFindIndex(activeIndex, matches.length);
      const activeMatch = matches[clampedIndex] ?? null;

      if (activeMatch && revealFoldedAncestors(activeMatch.range, container)) {
        // Re-collect on the next animation frame after the folded section mounts/expands.
        requestAnimationFrame(paint);
        return;
      }

      if (typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined") {
        clearHighlights();
        const inactiveRanges = matches
          .filter((_, idx) => idx !== clampedIndex)
          .map((m) => m.range);
        const secondary = new Highlight(...inactiveRanges);
        secondary.priority = 0;
        CSS.highlights.set(THREAD_FIND_HIGHLIGHT_NAME, secondary);

        if (activeMatch) {
          const primary = new Highlight(activeMatch.range);
          primary.priority = 1;
          CSS.highlights.set(THREAD_FIND_ACTIVE_HIGHLIGHT_NAME, primary);
        }
      }

      if (
        activeMatch &&
        (lastScrolledIndex !== clampedIndex || lastScrolledQuery !== query.trim())
      ) {
        lastScrolledIndex = clampedIndex;
        lastScrolledQuery = query.trim();
        const targetElement = activeMatch.range.startContainer.parentElement;
        targetElement?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };

    paint();

    let frame: number | null = null;
    const observer = new MutationObserver(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        paint();
      });
    });

    observer.observe(container, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden", "data-thread-find-fold"],
    });

    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      clearHighlights();
    };
  }, [activeIndex, container, onMatchCountChange, open, query]);
}

/**
 * Callback ref helper for foldable containers (`[data-thread-find-fold]`) so Find in Thread
 * automatically expands them when a match inside them becomes active.
 */
export function findRevealRef(onReveal: () => void) {
  return (node: HTMLElement | null) => {
    if (!node) return;
    const handler = () => onReveal();
    node.addEventListener("beforematch", handler);
    return () => node.removeEventListener("beforematch", handler);
  };
}
