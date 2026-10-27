/**
 * 代码块：@pierre/highlights WASM 词法器（t3code lib/syntaxHighlighting 同源，
 * 注释标注比 Shiki 快 10-40x）。主题经 diffRendering 解析，light/dark 双注册。
 *
 * 头部对齐 t3code MarkdownCodeBlock：语言标签 + 复制按钮 + 换行开关。
 */
import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, WrapTextIcon } from "lucide-react";
import { resolveDiffThemeName } from "~/lib/diffRendering";
import { getSyntaxHighlighterPromise } from "~/lib/syntaxHighlighting";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function MarkdownCodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [lines, setLines] = useState<{ content: string; color?: string }[][]>([]);
  const [wrapped, setWrapped] = useState(true);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  useEffect(() => {
    let cancelled = false;
    void getSyntaxHighlighterPromise(language)
      .then((highlighter) => {
        if (cancelled) return;
        const theme = resolveDiffThemeName(
          document.documentElement.classList.contains("dark") ? "dark" : "light",
        );
        const result = highlighter.codeToTokens(code, { lang: language, theme });
        setLines(
          result.tokens.map((line) =>
            line.map((token) => ({ content: token.content, color: token.color })),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setLines(code.split("\n").map((line) => [{ content: line }]));
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <div
      className="chat-markdown-codeblock bg-code my-2 overflow-hidden rounded-lg border border-border"
      data-language={language}
      data-wrap={wrapped ? "true" : "false"}
    >
      <div className="flex items-center justify-between gap-2 pt-1.5 pr-1.5 pb-0 pl-3 select-none">
        <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 font-mono text-2xs">
          <span className="truncate">{language}</span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost-muted"
                  size="icon-tiny"
                  aria-label={wrapped ? "关闭自动换行" : "开启自动换行"}
                  onClick={() => setWrapped((previous) => !previous)}
                >
                  <WrapTextIcon />
                </Button>
              }
            />
            <TooltipPopup side="bottom">
              {wrapped ? "关闭自动换行" : "开启自动换行"}
            </TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost-muted"
                  size="icon-tiny"
                  aria-label={isCopied ? "已复制" : "复制代码"}
                  onClick={() => void copyToClipboard(code)}
                >
                  {isCopied ? <CheckIcon /> : <CopyIcon />}
                </Button>
              }
            />
            <TooltipPopup side="bottom">{isCopied ? "已复制" : "复制代码"}</TooltipPopup>
          </Tooltip>
        </span>
      </div>
      <pre
        className={cn(
          "text-code-foreground overflow-x-auto px-3 pb-3 font-mono text-xs leading-relaxed",
          wrapped ? "whitespace-pre-wrap break-words" : "whitespace-pre",
        )}
      >
        <code>
          {lines.length === 0
            ? code
            : lines.map((tokens, lineIndex) => (
                <span key={lineIndex}>
                  {tokens.length === 0
                    ? "\n"
                    : tokens.map((token, tokenIndex) => (
                        <span
                          key={tokenIndex}
                          style={token.color ? { color: token.color } : undefined}
                        >
                          {token.content}
                        </span>
                      ))}
                  {lineIndex < lines.length - 1 ? "\n" : ""}
                </span>
              ))}
        </code>
      </pre>
    </div>
  );
}
