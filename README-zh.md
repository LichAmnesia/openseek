# OpenSeek - 广度求索

开源 TUI 编码代理 — TypeScript / Bun monorepo。

轻量的终端编码搭子, 支持多 provider 路由 (OpenAI 兼容 / Anthropic /
Bedrock / Vertex / Azure)、50+ 工具、100+ slash 命令、Plan / Agent / YOLO
三种模式、MCP client、LSP 反馈, 以及无头 HTTP/SSE Runtime API。

> English: [README.md](./README.md)
> 官网: https://openseek.dev/

## 环境要求

- macOS 或 Linux (Windows 请用 WSL2)
- [Bun](https://bun.sh) ≥ 1.3 — **运行时必装, 不是可选项。** 代码里大量用
  `Bun.spawn` / `Bun.serve` / `Bun.file`, 单 node 跑不起来。即便走
  `npm i -g`, `openseek` 命令启动时也会 spawn `bun`, 没装会报
  `env: bun: No such file or directory`。

## 安装

### Step 1 — 装 bun (装过就跳过)

```bash
curl -fsSL https://bun.sh/install | bash   # 任意 Unix
brew install oven-sh/bun/bun               # macOS (Homebrew)
```

验证: `bun --version` 应该输出 ≥ `1.3.0`。

### Step 2 — 装 openseek

三选一。都会把 `openseek` 放到 PATH 上。

```bash
# A. npm
npm install -g openseek

# B. bun (跟 A 同一个 registry, 已经在用 bun 时更顺)
bun add -g openseek

# C. 源码 (开发 / 想看源码时推荐)
git clone https://github.com/LichAmnesia/openseek.git
cd openseek
bun install
bun run build
ln -sf "$PWD/bin/openseek" ~/.local/bin/openseek
```

### Step 3 — 跑

```bash
openseek               # 启动 TUI
openseek doctor        # 打印 resolved config + 每个字段的来源层
openseek serve --http  # 无头模式, HTTP/SSE 监听 :7117
```

## 配置

OpenSeek 用**分层覆盖**解析每个设置 (provider / model / API key / base URL),
高层覆盖低层。

| # | 层 | 位置 | 说明 |
|---|---|---|---|
| 1 | **env** | `OPENSEEK_PROVIDER` / `OPENSEEK_MODEL` / `OPENSEEK_API_KEY` / `OPENSEEK_BASE_URL` | 也认 provider 专属变量 (`DEEPSEEK_API_KEY` / `ANTHROPIC_API_KEY` 等) |
| 2 | **project overlay** | `<workspace>/.openseek/config.toml` | 沙盒化 — 只认 `model`。`api_key` / `base_url` / `provider` 字段会被静默丢弃, 防止 checked-in 的 overlay 泄密钥或劫持 provider。 |
| 3 | **user config** | `~/.openseek/config.toml` | 首次运行向导 (`openseek setup`) 写入, 0600 权限。 |
| 4 | **default** | 内置 fallback | binary 里 hard-code 的值。 |

跑 `openseek doctor` 看每个值具体从哪一层来:

```
$ openseek doctor
openseek doctor

Resolved configuration:
  provider   deepseek                       ← user (~/.openseek/config.toml)
  model      deepseek-v4-flash              ← user (~/.openseek/config.toml)
  api_key    sk-a…b8e2                      ← env
  base_url   (provider default)             ← built-in default

Precedence (highest first):
  1. env       OPENSEEK_PROVIDER / OPENSEEK_MODEL / OPENSEEK_API_KEY / OPENSEEK_BASE_URL
  2. project   <workspace>/.openseek/config.toml  (model only — secrets ignored)
  3. user      ~/.openseek/config.toml
  4. default   built-in fallbacks
```

TUI 里 `/help` 按 category 分组列出所有 slash 命令; `/help <name>` 看单条详情,
`/help <category>` 按分类过滤 (`session` / `config` / `tools` / `git` / `agent`
/ `skills` / `diagnostics` / `advanced` / …), `/help all` 是平铺列表。

## 开发

```bash
bun install
bun run dev          # 直接从 TypeScript 源码启动 CLI, 无需 build
```

## 校验

```bash
bun run lint        # biome
bun run typecheck   # tsc --noEmit
bun run test        # bun test
bun run verify      # 三件套全跑
```

## 仓库结构

```
openseek/
├── packages/         14 个 workspace package
│   ├── core/         共享叶子工具
│   ├── provider/     25+ provider 适配 (Vercel ai SDK)
│   ├── session/      主对话循环 + compaction 策略
│   ├── tool/         内置工具注册表
│   ├── command/      slash 命令注册表
│   ├── tui/          @opentui/solid 终端渲染
│   ├── mcp/          MCP client (stdio / SSE / websocket)
│   ├── skill/        skill 加载器
│   ├── agent/        sub-agent + RLM 并行
│   ├── memory/       SessionMemory
│   ├── plugin/       插件协议
│   ├── server/       HTTP / SSE Runtime API
│   ├── lsp/          LSP client (tsserver, rust-analyzer, pyright, ...)
│   └── cli/          入口
├── scripts/          init / build / lint / typecheck / test / verify
├── tests/            跨包 smoke / e2e / coverage gate
├── install/          curl-bash 安装脚本 + Brewfile + Nix 表达式
├── bin/openseek      可执行 shim
└── package.json      bun workspaces 根
```

## 许可

见 `LICENSE`。
