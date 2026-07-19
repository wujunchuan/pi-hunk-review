# pi-hunk-review

A [Pi](https://github.com/earendil-works/pi-mono) extension that bridges Pi with live [Hunk](https://github.com/modem-dev/hunk) diff review sessions.

It automatically loads Hunk's bundled `hunk-review` Agent Skill and adds three Pi commands:

- `/hunk-review` — review the current diff and publish worthwhile findings as inline Hunk comments
- `/hunk-fix` — read Hunk comments, apply valid fixes, and run focused checks
- `/hunk-status` — check the live-session connection

Hunk remains in a separate terminal because Hunk and Pi are both terminal UIs.

## Requirements

- Pi
- Hunk on `PATH`
- A repository with a live Hunk session

Install Hunk with Homebrew or npm:

```bash
brew install hunk
# or
npm i -g hunkdiff
```

## Install

From a local checkout:

```bash
pi install /absolute/path/to/pi-hunk-review
```

Or try it without changing Pi settings:

```bash
cd /absolute/path/to/pi-hunk-review
pi -e .
```

After changing the extension source, run `/reload` in Pi.

## Usage

In the repository you want to review, start Hunk in one terminal:

```bash
hunk diff --watch
```

Start Pi in the same repository in another terminal, then run:

```text
/hunk-status
/hunk-review
```

Pi inspects the live diff and sends concrete findings back to Hunk as targeted inline agent comments. Extra text after the command becomes additional instructions:

```text
/hunk-review Focus on authentication and authorization regressions.
```

After adding your own inline comments in Hunk, ask Pi to address the review:

```text
/hunk-fix Run the full auth test suite after applying fixes.
```

`/hunk-fix` reads both user and agent comments. It does not automatically delete or clear comments after editing.

## How it works

On Pi resource discovery, the extension runs:

```bash
hunk skill path
```

and contributes the returned `SKILL.md` to Pi. The slash commands validate that a matching live session exists, then use `pi.sendUserMessage()` to start a constrained agent task. The Hunk Skill teaches the agent to use `hunk session review`, `comment`, and navigation commands; Pi's normal editing and shell tools perform fixes and validation.

The extension never starts Hunk inside Pi's terminal.

## Configuration

If `hunk` is not on `PATH`, point the extension at another executable:

```bash
export HUNK_BIN=/absolute/path/to/hunk
```

## Development

```bash
npm install
npm run validate
pi -e .
```

## License

MIT

---

## 中文说明

`pi-hunk-review` 自动加载 Hunk 自带的 Agent Skill，并提供：

- `/hunk-review`：让 Pi 审查当前 diff，并将意见写成 Hunk 行内评论
- `/hunk-fix`：读取 Hunk 中的人工和 Agent 评论，修改代码并运行检查
- `/hunk-status`：检查当前仓库是否连接了 Hunk 会话

Hunk 需要运行在另一个终端：

```bash
hunk diff --watch
```

随后在同一仓库的 Pi 中运行 `/hunk-review` 或 `/hunk-fix`。
