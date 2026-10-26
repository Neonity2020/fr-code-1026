/**
 * 聊天 markdown 渲染（t3code ChatMarkdown 的轻量版）：
 * react-markdown + gfm + math(KaTeX) + 代码高亮(@pierre/highlights WASM)
 * + t3code 的流式增量解析插件（打字机输出时避免整篇重解析）。
 */
import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { createIncrementalMarkdownPlugin } from "@pi-web/shared/markdownIncremental";
import { MarkdownCodeBlock } from "./MarkdownCodeBlock";

const incrementalPlugin = createIncrementalMarkdownPlugin();

export const ChatMarkdown = memo(function ChatMarkdown({ text }: { text: string }) {
  const remarkPlugins = useMemo(() => [incrementalPlugin, remarkGfm, remarkMath], []);
  const rehypePlugins = useMemo(() => [rehypeKatex], []);
  return (
    <div className="chat-markdown text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          code: CodeRenderer,
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

function CodeRenderer({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { node?: unknown }) {
  const match = /language-(\w[\w+-]*)/.exec(className ?? "");
  const text = String(children).replace(/\n$/, "");
  const isBlock = match !== null || text.includes("\n");
  if (!isBlock) {
    return (
      <code className="bg-code text-code-foreground rounded px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    );
  }
  return <MarkdownCodeBlock language={match?.[1] ?? "text"} code={text} />;
}
