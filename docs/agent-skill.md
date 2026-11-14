# Agent skill

This page is about the optional agent workflow. You do not need it to use the CLI by hand.

`skill/SKILL.md` is a single instruction file for AI coding agents. It tells the agent to debug in "DEBUG MODE": open a session, state a falsifiable hypothesis, collect real evidence, record an honest verdict, fix only after CONFIRMED, then run `check`. The loop and commands it describes are the ones in the [CLI reference](cli.md). The skill's frontmatter has `name: hammerhead-debug` and a description telling the agent to use it when a user reports a bug or asks to debug.

## Install

```bash
npx hammerhead-debug install                    # both agents, in your home directory
npx hammerhead-debug install --agent claude-code
npx hammerhead-debug install --agent codex
npx hammerhead-debug install --project          # into ./.claude/skills and ./.codex/skills
```

It copies the file to `.claude/skills/hammerhead-debug/SKILL.md` and/or `.codex/skills/hammerhead-debug/SKILL.md` under your home directory (or the current directory with `--project`). An existing file is overwritten. The copy is not updated when you upgrade the package; run `install` again. How an agent discovers and loads a skill is up to that agent; only the file copy was checked here.

The `hammerhead-debug` command must be reachable from the agent's shell (a global install, or a project install the agent invokes with `npx`). The skill text calls it as `hammerhead-debug`.

## What to expect

- The agent runs the same commands you would. Its evidence is whatever it passes to `--observation`, or a `dap` probe if `dap` is installed.
- The skill asks the agent to quote observations verbatim. Nothing checks that it does.
- The agent can edit files at any time. The CLI only refuses to *record* a fix before a CONFIRMED verdict. When you review agent work, run `hammerhead-debug status <session-id>` and read the `captured` text and the verdict reason of the confirmed cycle. Treat a CONFIRMED verdict on an observation that does not match the prediction as a failure. See [known limitations](known-limitations.md).
- After 4 refuted cycles the session refuses new hypotheses. The skill tells the agent to stop and hand off.

## Differences between the skill text and the CLI

The skill file is installed as shipped. Where it differs from the CLI:

- Its description mentions "stepping". The CLI exposes no stepping command; a `dap` probe sets one breakpoint, evaluates one expression and stops.
- It says `open` prints `{ "session_id": "dbg-XXXXXXXX" }`. The CLI also prints `"dir"`.
- It says the session is "auto-flagged for escalation" after 4 refuted cycles. The flag appears in the `verdict` and `status` output, and `hypothesis` is refused. Nothing else stops.

## Git and agent workflows

The skill and the CLI do not use GitHub. If you run unattended agents, GitHub issues or review bots, those come from other tools (see [tool family](family.md)); hammerhead-debug only supplies the session file they read.
