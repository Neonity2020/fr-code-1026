export interface SlashCommandItem {
  id: string;
  command: string;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  icon: "new" | "fork" | "model" | "terminal" | "scripts" | "changes" | "export";
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: "new",
    command: "/new",
    titleZh: "新建线程",
    titleEn: "New thread",
    descriptionZh: "在当前项目下创建一个全新的对话线程",
    descriptionEn: "Create a fresh thread in current project",
    icon: "new",
  },
  {
    id: "fork",
    command: "/fork",
    titleZh: "分叉当前线程",
    titleEn: "Fork current thread",
    descriptionZh: "复制当前历史记录，创建并行分支探索",
    descriptionEn: "Duplicate thread history into a new branch",
    icon: "fork",
  },
  {
    id: "changes",
    command: "/changes",
    titleZh: "查看 Git 变更",
    titleEn: "Show Git changes",
    descriptionZh: "对比工作区与暂存区的代码 Diff",
    descriptionEn: "Inspect working tree diff and file edits",
    icon: "changes",
  },
  {
    id: "terminal",
    command: "/terminal",
    titleZh: "打开终端",
    titleEn: "Open terminal",
    descriptionZh: "唤起底部终端抽屉执行命令",
    descriptionEn: "Open integrated terminal drawer",
    icon: "terminal",
  },
  {
    id: "scripts",
    command: "/scripts",
    titleZh: "运行脚本",
    titleEn: "Run project scripts",
    descriptionZh: "查看和执行项目构建、测试与运行脚本",
    descriptionEn: "Manage and run build, dev or test scripts",
    icon: "scripts",
  },
  {
    id: "export",
    command: "/export",
    titleZh: "导出对话 (Markdown)",
    titleEn: "Export to Markdown",
    descriptionZh: "将完整对话记录下载为 Markdown 文档",
    descriptionEn: "Download conversation as Markdown document",
    icon: "export",
  },
];

export function filterSlashCommands(
  commands: readonly SlashCommandItem[],
  query: string,
): SlashCommandItem[] {
  const q = query.trim().toLowerCase().replace(/^\//, "");
  if (q.length === 0) return [...commands];
  return commands.filter(
    (cmd) =>
      cmd.command.toLowerCase().includes(q) ||
      cmd.id.toLowerCase().includes(q) ||
      cmd.titleZh.toLowerCase().includes(q) ||
      cmd.titleEn.toLowerCase().includes(q) ||
      cmd.descriptionZh.toLowerCase().includes(q) ||
      cmd.descriptionEn.toLowerCase().includes(q),
  );
}
