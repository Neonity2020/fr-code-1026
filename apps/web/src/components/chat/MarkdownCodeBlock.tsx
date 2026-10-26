/**
 * 代码块：@pierre/highlights WASM 词法器（t3code lib/syntaxHighlighting 同源，
 * 注释标注比 Shiki 快 10-40x）。主题经 diffRendering 解析，light/dark 双注册。
 */
import { useEffect, useState } from "react";
import { resolveDiffThemeName } from "~/lib/diffRendering";
import { getSyntaxHighlighterPromise } from "~/lib/syntaxHighlighting";

export function MarkdownCodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [lines, setLines] = useState<{ content: string; color?: string }[][]>([]);

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
    <div className="bg-code my-2 overflow-hidden rounded-lg border border-border">
      <div className="text-muted-foreground flex items-center justify-between px-3 py-1 text-2xs">
        <span>{language}</span>
      </div>
      <pre className="text-code-foreground overflow-x-auto px-3 pb-3 font-mono text-xs leading-relaxed">
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
