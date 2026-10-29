# Pi Web

基于 **t3.code 前端体系**构建的单 provider（[pi coding agent](https://github.com/badlogic/pi-mono)，npm 包 `@earendil-works/pi-coding-agent`）Web 应用 Monorepo。t3code 的完整分析见上级目录 `AGENT-前端复用分析与项目骨架.md`。

```
浏览器 (apps/web + packages/client-runtime)
  ├── WS(/ws, snapshot→event→synchronized + afterSequence 续传) ──┐
  └── REST(/api/*) ───────────────────────────────────────────────┤
                                                                  ▼
                                                 Node 服务端 (apps/server)
                                                                  │ 调用 @pi-web/provider-pi
                                                                  │ spawn `pi --mode rpc`
                                                                  ▼
                                                          pi CLI 子进程（LF-JSON RPC）
```

## 运行

项目支持使用 **Bun** 执行开发和构建命令（推荐），服务端通过 Node.js 运行以支持伪终端：

```bash
# 1. 安装依赖（自动配置工作区并打入 @pierre/diffs 补丁）
bun install

# 2. 开发环境：
# 终端 1 启动后端服务（端口 6115，Node 监听 TypeScript 源码变更，确保伪终端兼容）
bun dev

# 终端 2 启动前端热重载（端口 6116，Vite 自动反代 API 与 WebSocket）
bun dev:web

# 3. 全量类型检查（tsc 严格检查根与全部 6 个 workspace 包）
bun run typecheck

# 4. 生产构建（Vite 编译前端生产静态资源到 apps/web/dist）
bun run build

# 5. 生产运行（服务端单端口 6115 托管完整 SPA 与 RPC 协议）
bun run start

# 6. 运行全量单元测试（54 个用例全部通过）
bun test
# 或使用 Node 原生测试运行器
bun run test:node
```

前提：本机已安装并登录 pi CLI（`pi --version`；未安装时应用仍可启动，发送消息会得到明确错误提示）。数据（事件日志 JSONL）存于 `.data/`（gitignored）。可用环境变量：`PORT`（默认 6115）、`PI_WEB_DATA_DIR`、`PI_WEB_DEFAULT_CWD`、`PI_BIN`。

> **注意从仓库根启动服务端**：新线程的默认工作目录取自服务端 `process.cwd()`。
> 如果你在 `apps/server/` 下启动，默认 cwd 会变成 `apps/server`。不想从根启动就设
> `PI_WEB_DEFAULT_CWD=/path/to/your/project`。

## Monorepo 包结构

| Workspace 包 | 路径 | 职责与内容 | 对齐 t3code 来源 |
|---|---|---|---|
| `@pi-web/protocol` | `packages/protocol` | 前后端唯一协议契约：`TurnItem` / `DomainEvent` / `Command` / WS 消息类型 + 投影折叠纯函数（`upsertTurnItem`、`applyTurnItemPreview` 等） | `packages/contracts/src/orchestrationV2.ts` |
| `@pi-web/shared` | `packages/shared` | 跨端纯函数与通用引擎（子路径导出）：`./themePalettes`（5 套内置主题与 40+ 语义色 role）、`./color`（HSV/Hex 转换）、`./qrCode`（QR 生成）、`./markdownIncremental`（流式增量 Markdown 解析插件）、`./paletteSearch`（命令面板搜索打分：折叠 / 词首匹配 / 拼写容错 / 分组排序 / 高亮区间） | `packages/shared` + `apps/web/src/markdown-incremental.ts` |
| `@pi-web/provider-pi` | `packages/provider-pi` | `PiRpcConnection`（LF-JSON 分帧，禁用 `readline` 防 U+2028/U+2029 断行）+ `PiThreadRunner`（pi 事件 → `TurnItem` 领域事件映射，通过 `PiThreadStorePort` 与具体存储解耦） | `packages/provider-pi/src/server/{rpc,adapter}.ts` |
| `@pi-web/client-runtime` | `packages/client-runtime` | 客户端状态与同步引擎：Zustand 线程投影 Store（`useAppStore`，带 `sequence` 门控去重）+ WS 传输层（`transport`，250ms→30s 指数退避重连 + `afterSequence` 增量续传） | `packages/client-runtime`（去 Effect 化轻量实现） |
| `@pi-web/server` | `apps/server` | 事件溯源线程存储（`ThreadStore`，JSONL 持久化 + 订阅者快照/增量回放）+ HTTP/WS 网关与静态资源托管 | `apps/server/src/orchestration-v2` 最小等价物 |
| `@pi-web/web` | `apps/web` | React 19 + Tailwind v4 纯视图层：52 个 `@base-ui/react` 通用 UI 组件、2520 行主题 CSS 与调色板运行时、TipTap 3 Composer、WASM 语法高亮与聊天时间线 | `apps/web`（完全移除 `effect` 依赖） |

## 与 t3code 的对齐点（UI 行为）

- **命令面板**：⌘K / Ctrl+K 唤起，分「命令 / 线程 / 项目」三组；排序与 t3code 共用同一套打分规则（`packages/shared/src/paletteSearch.ts`，移植自 t3code `paletteSearch`），支持词首命中、隐藏关键词、拼写容错与命中高亮。侧边栏搜索框右侧有快捷键提示入口。
- **时间线工作分组**：连续的命令执行 / 文件改动 / 工具调用折叠成一行摘要（“运行了 3 条命令 · 修改了 2 个文件”，对齐 t3code `summarizeToolGroup`），连续思考折叠成 “思考过程 (×N)”；单个工作条目保持单行，展开后缩进显示输出。分组逻辑在 `components/chat/timelineGrouping.ts`（纯函数 + 单测）。
- **工作日志行**：移植 t3code `WorkLog.tsx` 的呈现原语（扁平行：图标 + 文本 + 状态，展开详情缩进 `ms-7`）。
- **代码块**：头部显示语言标签 + 复制按钮 + 自动换行开关（对齐 t3code `MarkdownCodeBlock`）。
- **输入草稿**：按线程持久化未发送内容，切换线程不再丢输入（对齐 t3code `composerDraftStore`）。
- **外观偏好**：浅色 / 深色 / 跟随系统落盘到 `t3code:theme-appearance-mode`（与 `index.html` 首帧引导脚本同键，避免闪烁），设置页与命令面板共享同一份状态。
- **聊天面板动作总线**：`components/chat/chatPanelBus.ts` 让命令面板能打开当前线程的终端 / 脚本输出 / 变更抽屉。
- **线程分叉 (Thread Fork)**：支持从已有线程分叉（Fork）出独立分支线程，深拷贝历史 TurnItems 与模型/配置，便于并行探索方案；侧栏右键、命令面板（⌘K）与快捷指令 `/fork` 均可快速触发。
- **对话导出 (Markdown & JSON)**：顶栏操作区、侧栏右键、命令面板及 `/export` 指令支持一键将当前会话完整记录导出下载为规范的 Markdown 文档或 JSON 结构数据（服务端与客户端双重兜底）。
- **快捷指令 (Slash Commands)**：Composer 输入行首 `/` 呼出快捷指令浮层（`/new`、`/fork`、`/changes`、`/terminal`、`/scripts`、`/export`），支持键盘上下键与回车即时触发。
- **时间线行内 Pierre FileDiff**：时间线中的 `file_change` 条目展开后使用 `@pierre/diffs` 进行语法高亮与增删行着色渲染，并支持 Unified / Split 布局切换。
- **消息浮动操作条**：助手回复与用户消息悬停显示快捷操作栏，支持一键复制代码/文本并带对勾反馈提示。
- **提示词暂存（Prompt Stash）**：⌘S / Ctrl+S（或 `/stash`）把输入区内容压入暂存队列并清空输入区；composer 右上角书签页签显示暂存数，点击展开菜单可恢复 / 删除（上下键移动、Enter 恢复、⌘⌫ 删除、Esc 关闭），对齐 t3code `promptStashStore` + `ComposerStashMenu`。
- **顶栏标题区**：项目名可点击新建同项目线程；线程标题双击内联重命名（失焦/回车提交，Esc 取消），标题 chevron 打开线程操作菜单（重命名 / 分叉 / 导出 Markdown / 导出 JSON / 复制线程 ID），对齐 t3code `ChatHeader`。

## 与 t3code 的协议对齐点（升级回完整版时的兼容面）

- 订阅流：`snapshot → event… → synchronized`，客户端可带 `afterSequence` 续传；未知事件以 `unknown-event` 推进游标。
- 命令：统一 dispatch 单入口 + 客户端生成 `commandId`（幂等键）；ack 只表示意图已提交。
- TurnItem：`user_message / assistant_message / reasoning / command_execution / file_change / dynamic_tool / approval_request / error / system_notice`，与 t3code 同名同语义（工具映射规则对齐 `provider-pi` adapter）。
- 事件溯源：全局递增 `sequence`，UI 状态 = 投影折叠，重启 = 事件重放。
