# Claude Code Mini

[English](README_EN.md) | 简体中文

一个从零实现的极简 AI 编程代理，灵感来自 [Claude Code](https://claude.ai/code)。

> Forked from [Windy3f3f3f3f/claude-code-from-scratch](https://github.com/Windy3f3f3f3f/claude-code-from-scratch)，在原项目基础上进行了修改。

## 特性

- **双后端支持**：Anthropic Claude（原生）+ 任意 OpenAI 兼容 API
- **7 个内置工具**：read\_file、write\_file、edit\_file、list\_files、grep\_search、run\_shell、skill
- **子代理系统**：explore（只读探索）、plan（规划）、general（全功能）三种内置类型，支持自定义代理
- **4 层上下文压缩**：budget → snip → microcompact → auto-compact，镜像 Claude Code 的压缩管线
- **5 种权限模式**：default / plan / acceptEdits / bypassPermissions / dontAsk
- **会话持久化**：自动保存对话，`--resume` 恢复上次会话
- **记忆系统**：按项目存储 user / feedback / project / reference 四类记忆
- **技能扩展**：通过 `.claude/skills/` 目录定义可复用的技能模板
- **扩展思考**：支持 Claude 4.6 的 adaptive thinking

## 快速开始

```bash
# 安装依赖
npm install

# 构建
npm run build

# 设置 API Key（二选一）
export ANTHROPIC_API_KEY=sk-ant-...
# 或使用 OpenAI 兼容接口
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://your-api.com/v1

# 交互模式
npm start

# 单次执行
node dist/cli.js "修复 src/app.ts 中的 bug"

# 开发模式（构建 + 立即运行）
npm run dev
```

## CLI 参数

```
用法: mini-claude [选项] [提示词]

选项:
  --yolo, -y          跳过所有确认提示
  --plan              只读模式，只分析不执行
  --accept-edits      自动批准文件编辑，危险命令仍需确认
  --dont-ask          自动拒绝所有需要确认的操作（适用于 CI）
  --thinking          启用扩展思考（仅 Anthropic）
  --model, -m MODEL   指定模型（默认: claude-opus-4-6）
  --api-base URL      使用 OpenAI 兼容端点
  --resume            恢复上次会话
  --max-cost USD      费用上限（美元）
  --max-turns N       最大轮次限制
  --help, -h          显示帮助
```

## REPL 命令

在交互模式下可使用：

| 命令            | 说明                            |
| ------------- | ----------------------------- |
| `/clear`      | 清空对话历史                        |
| `/cost`       | 显示 token 用量和费用                |
| `/compact`    | 手动压缩对话                        |
| `/memory`     | 列出已保存的记忆                      |
| `/skills`     | 列出可用技能                        |
| `/<技能名> [参数]` | 调用技能（如 `/commit "fix types"`） |

## 项目结构

```
src/
├── cli.ts                    # 主入口
├── cli/
│   ├── args.ts               # 参数解析
│   ├── config.ts             # API 配置解析
│   └── repl.ts               # REPL 交互循环
├── core/
│   ├── agent.ts              # Agent 核心类（对话循环、工具执行）
│   ├── agent-compression.ts  # 上下文压缩管线
│   ├── agent-model.ts        # 模型配置与选择
│   ├── agent-openai-tools.ts # OpenAI 工具格式转换
│   ├── agent-retry.ts        # API 重试逻辑
│   └── prompt.ts             # 系统提示词构建
├── tools/
│   ├── tools.ts              # 工具模块入口
│   ├── definitions.ts        # 工具定义（Anthropic 格式）
│   ├── dispatcher.ts         # 工具调度与执行
│   ├── executors.ts          # 各工具的具体实现
│   └── permissions.ts        # 权限检查与危险命令检测
├── ui/
│   └── ui.ts                 # 终端 UI（颜色、spinner、Markdown 渲染）
├── storage/
│   ├── session.ts            # 会话持久化
│   └── memory.ts             # 记忆系统
├── extensions/
│   ├── skills.ts             # 技能发现与执行
│   └── subagent.ts           # 子代理系统
├── utils/
│   └── frontmatter.ts        # YAML frontmatter 解析
└── templates/
    └── system-prompt.md      # 系统提示词模板
```

## 架构概览

### 执行流程

```
cli.ts → parseArgs() → resolveApiConfig() → new Agent() → chat() 或 runRepl()
```

### Agent 核心循环

```
用户输入 → 压缩管线 → API 调用 → 解析响应
                                      ├── 文本 → 输出到终端
                                      └── 工具调用 → 权限检查 → 执行 → 结果入历史 → 继续循环
```

### 上下文压缩管线

每次 API 调用前执行 4 层渐进式压缩（前 3 层零 API 消耗）：

| 层级 | 名称           | 触发条件         | 策略                       |
| -- | ------------ | ------------ | ------------------------ |
| 1  | Budget       | 上下文利用率 > 50% | 截断大的工具结果，保留头尾            |
| 2  | Snip         | 利用率超过阈值      | 用占位符替换旧的/重复的工具结果         |
| 3  | Microcompact | 空闲超过 5 分钟    | 激进清除旧结果（prompt cache 已冷） |
| 4  | Auto-compact | 利用率 > 85%    | 调用 API 对整段对话进行摘要压缩       |

### 双后端支持

Agent 维护两套独立的消息历史（`anthropicMessages` / `openaiMessages`），通过 `useOpenAI` 标志路由。工具定义以 Anthropic 格式为规范形式，通过 `toOpenAITools()` 按需转换为 OpenAI 格式。

## 扩展

### 自定义技能

在项目根目录创建 `.claude/skills/<名称>/SKILL.md`：

```yaml
---
name: my-skill
description: 技能描述
user-invocable: true
context: inline
---
这里是技能的提示词模板。
使用 $ARGUMENTS 引用用户传入的参数。
```

然后在 REPL 中通过 `/my-skill 参数` 调用。

### 自定义代理

在 `.claude/agents/<名称>.md` 中定义：

```yaml
---
name: my-agent
description: 代理描述
allowed-tools: read_file, grep_search, list_files
---
这里是代理的系统提示词。
```

### 权限配置

在 `.claude/settings.json` 中配置：

```json
{
  "permissions": {
    "allow": ["read_file(src/**)", "run_shell(npm test)"],
    "deny": ["run_shell(rm -rf *)"]
  }
}
```

## 环境变量

| 变量                   | 说明                  |
| -------------------- | ------------------- |
| `ANTHROPIC_API_KEY`  | Anthropic API 密钥    |
| `ANTHROPIC_BASE_URL` | Anthropic 自定义端点（可选） |
| `OPENAI_API_KEY`     | OpenAI 兼容 API 密钥    |
| `OPENAI_BASE_URL`    | OpenAI 兼容端点         |
| `MINI_CLAUDE_MODEL`  | 默认模型覆盖              |

## 使用示例

```bash
# 基本使用
mini-claude "解释这个项目的架构"

# 跳过确认，全自动执行
mini-claude --yolo "运行所有测试并修复失败的用例"

# 只读分析模式
mini-claude --plan "如何重构这个模块？"

# 自动批准编辑
mini-claude --accept-edits "给 api.ts 添加错误处理"

# 设置费用和轮次上限
mini-claude --max-cost 0.50 --max-turns 20 "实现功能 X"

# 使用 OpenAI 兼容接口
OPENAI_API_KEY=sk-xxx mini-claude --api-base https://aihubmix.com/v1 --model gpt-4o "你好"

# 恢复上次对话
mini-claude --resume
```

## 依赖

- `@anthropic-ai/sdk` — Anthropic API 客户端
- `openai` — OpenAI API 客户端
- `chalk` — 终端颜色
- `glob` — 文件模式匹配

## 许可证

MIT
