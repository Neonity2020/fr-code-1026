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

```bash
pnpm install

# 开发：终端 1 起服务端（6115），终端 2 起 vite（6116，已代理 /api 与 /ws）
pnpm dev        # = apps/server dev (tsx watch)
pnpm dev:web    # = apps/web dev (vite)

# 全量类型检查（覆盖 6 个 workspace 包）
pnpm typecheck

# 生产：构建前端后由服务端在 6115 端口一并托管
pnpm build
pnpm start
```

前提：本机已安装并登录 pi CLI（`pi --version`；未安装时应用仍可启动，发送消息会得到明确错误提示）。数据（事件日志 JSONL）存于 `.data/`（gitignored）。可用环境变量：`PORT`（默认 6115）、`PI_WEB_DATA_DIR`、`PI_WEB_DEFAULT_CWD`、`PI_BIN`。

> **注意从仓库根启动服务端**：新线程的默认工作目录取自服务端 `process.cwd()`。
> 如果你在 `apps/server/` 下启动，默认 cwd 会变成 `apps/server`。不想从根启动就设
> `PI_WEB_DEFAULT_CWD=/path/to/your/project`。

## Monorepo 包结构

| Workspace 包 | 路径 | 职责与内容 | 对齐 t3code 来源 |
|---|---|---|---|
| `@pi-web/protocol` | `packages/protocol` | 前后端唯一协议契约：`TurnItem` / `DomainEvent` / `Command` / WS 消息类型 + 投影折叠纯函数（`upsertTurnItem`、`applyTurnItemPreview` 等） | `packages/contracts/src/orchestrationV2.ts` |
| `@pi-web/shared` | `packages/shared` | 跨端纯函数与通用引擎（子路径导出）：`./themePalettes`（5 套内置主题与 40+ 语义色 role）、`./color`（HSV/Hex 转换）、`./qrCode`（QR 生成）、`./markdownIncremental`（流式增量 Markdown 解析插件） | `packages/shared` + `apps/web/src/markdown-incremental.ts` |
| `@pi-web/provider-pi` | `packages/provider-pi` | `PiRpcConnection`（LF-JSON 分帧，禁用 `readline` 防 U+2028/U+2029 断行）+ `PiThreadRunner`（pi 事件 → `TurnItem` 领域事件映射，通过 `PiThreadStorePort` 与具体存储解耦） | `packages/provider-pi/src/server/{rpc,adapter}.ts` |
| `@pi-web/client-runtime` | `packages/client-runtime` | 客户端状态与同步引擎：Zustand 线程投影 Store（`useAppStore`，带 `sequence` 门控去重）+ WS 传输层（`transport`，250ms→30s 指数退避重连 + `afterSequence` 增量续传） | `packages/client-runtime`（去 Effect 化轻量实现） |
| `@pi-web/server` | `apps/server` | 事件溯源线程存储（`ThreadStore`，JSONL 持久化 + 订阅者快照/增量回放）+ HTTP/WS 网关与静态资源托管 | `apps/server/src/orchestration-v2` 最小等价物 |
| `@pi-web/web` | `apps/web` | React 19 + Tailwind v4 纯视图层：52 个 `@base-ui/react` 通用 UI 组件、2520 行主题 CSS 与调色板运行时、TipTap 3 Composer、WASM 语法高亮与聊天时间线 | `apps/web`（完全移除 `effect` 依赖） |

## 与 t3code 的协议对齐点（升级回完整版时的兼容面）

- 订阅流：`snapshot → event… → synchronized`，客户端可带 `afterSequence` 续传；未知事件以 `unknown-event` 推进游标。
- 命令：统一 dispatch 单入口 + 客户端生成 `commandId`（幂等键）；ack 只表示意图已提交。
- TurnItem：`user_message / assistant_message / reasoning / command_execution / file_change / dynamic_tool / approval_request / error / system_notice`，与 t3code 同名同语义（工具映射规则对齐 `provider-pi` adapter）。
- 事件溯源：全局递增 `sequence`，UI 状态 = 投影折叠，重启 = 事件重放。
