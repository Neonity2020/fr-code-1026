import type { ThreadSummary, TurnItem } from "@pi-web/protocol";

export function formatThreadMarkdown(
  thread: ThreadSummary,
  items: readonly TurnItem[],
): string {
  const sorted = [...items].sort((a, b) => a.ordinal - b.ordinal);
  const createdDate = new Date(thread.createdAt).toLocaleString();
  const lines: string[] = [
    `# ${thread.title || "Thread"}`,
    "",
    `- **ID**: \`${thread.id}\``,
    `- **Workspace**: \`${thread.cwd}\``,
    `- **Model**: \`${thread.model ?? "default"}\``,
    `- **Created**: ${createdDate}`,
    "",
    "---",
    "",
  ];

  for (const item of sorted) {
    switch (item.type) {
      case "user_message": {
        lines.push("### 👤 User", "", item.text || "*(Empty message)*", "");
        if (item.attachments && item.attachments.length > 0) {
          lines.push("**Attachments:**");
          for (const att of item.attachments) {
            lines.push(`- \`${att.name}\` (${att.mimeType})`);
          }
          lines.push("");
        }
        break;
      }
      case "assistant_message": {
        lines.push("### 🤖 Assistant", "", item.text || "*(Empty response)*", "");
        break;
      }
      case "reasoning": {
        if (item.text.trim().length > 0) {
          lines.push(
            "<details>",
            "<summary>💭 <i>Thought process</i></summary>",
            "",
            item.text,
            "",
            "</details>",
            "",
          );
        }
        break;
      }
      case "command_execution": {
        lines.push(`> ⚡ **Command**: \`${item.input}\``, "");
        if (item.output && item.output.trim().length > 0) {
          lines.push("```sh", item.output.trim(), "```", "");
        }
        break;
      }
      case "file_change": {
        lines.push(`> 📝 **File Change**: \`${item.fileName}\``, "");
        if (item.diffStr && item.diffStr.trim().length > 0) {
          lines.push("```diff", item.diffStr.trim(), "```", "");
        } else if (item.newStr && item.newStr.trim().length > 0) {
          lines.push("```", item.newStr.trim(), "```", "");
        }
        break;
      }
      case "dynamic_tool": {
        lines.push(`> 🔧 **Tool**: \`${item.toolName}\``, "");
        if (item.output && item.output.trim().length > 0) {
          lines.push("```", item.output.trim(), "```", "");
        }
        break;
      }
      case "approval_request": {
        lines.push(
          `> ⚠️ **Approval Request**: ${item.title} (${item.status === "completed" ? "Approved" : item.status === "failed" ? "Declined" : "Pending"})`,
          "",
        );
        break;
      }
      case "error": {
        lines.push(`> ❌ **Error**: ${item.text}`, "");
        break;
      }
      default:
        break;
    }
  }

  return lines.join("\n");
}

export function formatThreadJson(
  thread: ThreadSummary,
  items: readonly TurnItem[],
): string {
  const sorted = [...items].sort((a, b) => a.ordinal - b.ordinal);
  return JSON.stringify({ summary: thread, items: sorted }, null, 2);
}

export function downloadFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadThreadAsMarkdown(
  thread: ThreadSummary,
  items: readonly TurnItem[],
): void {
  const content = formatThreadMarkdown(thread, items);
  const safeTitle = (thread.title || "thread")
    .replace(/[^\w\s\u4e00-\u9fa5-]/g, "")
    .trim()
    .slice(0, 50);
  downloadFile(`${safeTitle || "thread"}.md`, content, "text/markdown;charset=utf-8");
}

export function downloadThreadAsJson(
  thread: ThreadSummary,
  items: readonly TurnItem[],
): void {
  const content = formatThreadJson(thread, items);
  const safeTitle = (thread.title || "thread")
    .replace(/[^\w\s\u4e00-\u9fa5-]/g, "")
    .trim()
    .slice(0, 50);
  downloadFile(`${safeTitle || "thread"}.json`, content, "application/json;charset=utf-8");
}
