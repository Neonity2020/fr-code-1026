import { useEffect, useRef, type KeyboardEvent } from "react";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { useI18n } from "~/i18n";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { formatThreadFindCount } from "./threadFind";

interface ThreadFindBarProps {
  readonly open: boolean;
  readonly query: string;
  readonly matchCount: number;
  readonly activeIndex: number;
  readonly focusRequestId: number;
  readonly onQueryChange: (query: string) => void;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onClose: () => void;
}

export function ThreadFindBar(props: ThreadFindBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { tr } = useI18n();

  useEffect(() => {
    if (!props.open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [props.focusRequestId, props.open]);

  if (!props.open) return null;

  const hasQuery = props.query.trim().length > 0;
  const noResults = hasQuery && props.matchCount === 0;
  const label = hasQuery ? formatThreadFindCount(props.activeIndex, props.matchCount) : "";
  const navigationDisabled = props.matchCount === 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) props.onPrevious();
      else props.onNext();
    }
  };

  return (
    <div
      data-thread-find-bar
      className="
        absolute top-[calc(var(--workspace-topbar-height)+0.75rem)] right-3 z-40
        w-[min(280px,calc(100%-1.5rem))] transition-opacity duration-150 ease-out
        starting:opacity-0
        motion-reduce:transition-none
      "
    >
      <InputGroup
        variant="popover"
        size="lg"
        onContextMenu={(event) => event.stopPropagation()}
        role="search"
        aria-label={tr("在对话中查找", "Find in thread")}
        className="w-full"
      >
        <InputGroupInput
          ref={inputRef}
          type="search"
          size="sm"
          value={props.query}
          aria-label={tr("在对话中查找", "Find in thread")}
          placeholder={tr("在对话中查找", "Find in thread")}
          maxLength={200}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => props.onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <InputGroupAddon align="inline-end" inset="pill">
          <span
            aria-live="polite"
            className={cn(
              "min-w-10 text-center text-xs tabular-nums",
              noResults ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={tr("上一个匹配项", "Previous match")}
            disabled={navigationDisabled}
            onClick={props.onPrevious}
          >
            <ChevronUpIcon />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={tr("下一个匹配项", "Next match")}
            disabled={navigationDisabled}
            onClick={props.onNext}
          >
            <ChevronDownIcon />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={tr("关闭查找", "Close find")}
            onClick={props.onClose}
          >
            <XIcon />
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
