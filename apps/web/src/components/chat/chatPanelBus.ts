/**
 * 聊天面板动作总线。
 *
 * 命令面板与顶栏按钮需要打开当前线程的终端 / 变更抽屉，
 * 但抽屉状态在 ChatView 内部，所以用一个小总线把动作传过去。
 */

export type ChatPanelAction = "open-terminal" | "open-script-output" | "open-changes";

type ChatPanelActionListener = (action: ChatPanelAction) => void;

const listeners = new Set<ChatPanelActionListener>();

export function subscribeChatPanelActions(listener: ChatPanelActionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitChatPanelAction(action: ChatPanelAction): void {
  for (const listener of listeners) listener(action);
}
