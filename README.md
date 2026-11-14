# hammerhead-debug

> **Beta.** `npm install @gotako/hammerhead-debug`. Versions are prereleases (`0.5.0-beta.N`); the CLI, the session format and the library can change between betas.

A debugging CLI that keeps a written record of each debugging attempt and refuses to record a fix until one hypothesis has been marked CONFIRMED against a captured observation.

You open a session for one symptom. You state a hypothesis and what you predict you will see if it is right. You collect one observation (a real debugger stop, a log line, a test output). You record a verdict. Only after a CONFIRMED verdict will `hammerhead-debug fix` record a fix. After four REFUTED hypotheses (the default) it refuses to open another one and tells you to escalate.

It ships as three things in one package:

- a CLI, `hammerhead-debug`;
- a TypeScript/JavaScript library with the same operations (ESM only);
- a skill file (`skill/SKILL.md`) that teaches Claude Code or Codex to use the CLI, installed with `hammerhead-debug install`.

## What it is not

- It does not stop you or an agent from editing source files. The gate only controls what the CLI will *record*: you cannot record a fix without a confirmed cycle, but nothing prevents editing code first. See [guard rules](docs/guard-rules.md).
- It does not decide whether a hypothesis is true. You (or your agent) choose CONFIRMED or REFUTED. The tool checks that an observation exists and has not been edited, not that it supports the prediction.
- It does not authenticate evidence. The SHA-256 stored with an observation detects later edits to the session file. It does not prove the text came from a real log or debugger. See [known limitations](docs/known-limitations.md).
- It is not a debugger. Its `dap` probe calls the separate [`dap` CLI](https://github.com/AlmogBaku/debug-skill), which you install yourself.
- It does not need GitHub, an account, a network connection, or an AI agent. Sessions are plain JSON files in a directory.

## Install

Requires Node.js 22 or newer.

```bash
npm install --save-dev @gotako/hammerhead-debug   # in a project
npx hammerhead-debug --help

# or install the command globally
npm install -g @gotako/hammerhead-debug
hammerhead-debug --help
```

Optional, for Claude Code and Codex users: copy the skill so the agent picks the workflow up on its own.

```bash
npx hammerhead-debug install            # ~/.claude/skills/hammerhead-debug and ~/.codex/skills/hammerhead-debug
npx hammerhead-debug install --project  # ./.claude/skills and ./.codex/skills instead
```

## Quick start (about 5 minutes, no debugger needed)

This was run against a packed copy of this version in an empty directory. You need Node.js and git.

Create a project with a small bug. `total(100, 10)` should return 90 but subtracts the discount twice.

```bash
mkdir demo && cd demo && git init -q && npm init -y >/dev/null
npm install --save-dev @gotako/hammerhead-debug
printf 'node_modules/\n.hammerhead-debug/\n' > .gitignore

cat > cart.mjs <<'EOF'
export function total(price, discount) {
  const applied = discount * 2 // bug: discount is doubled
  return price - applied
}
EOF

cat > repro.mjs <<'EOF'
import { total } from './cart.mjs'
const got = total(100, 10)
if (got !== 90) {
  console.error('expected total 90, got ' + got)
  process.exit(1)
}
console.log('ok')
EOF

git add -A && git commit -qm init
node repro.mjs        # prints "expected total 90, got 80", exit 1
```

1. Open a session. It prints a session id; yours will differ from `dbg-2096e0ba`.

   ```bash
   npx hammerhead-debug open --symptom "total is 80, expected 90" --repro "node repro.mjs"
   # { "session_id": "dbg-2096e0ba", "dir": ".hammerhead-debug" }
   ```

2. State a hypothesis and a prediction.

   ```bash
   npx hammerhead-debug hypothesis dbg-2096e0ba "total() subtracts the discount twice" \
     --predict "total(100, 10) returns 80, so 20 is being subtracted"
   # { "cycle_id": "c-1" }
   ```

3. Try to record a fix now. It is refused.

   ```bash
   npx hammerhead-debug fix dbg-2096e0ba --diff-sha256 abc
   # Error: no confirmed hypothesis — collect evidence before fixing     (exit 1)
   ```

4. Collect an observation from the real code and record it. The text after `--observation` is stored as given, so capture it from a command instead of typing it.

   ```bash
   npx hammerhead-debug probe dbg-2096e0ba --kind isolated_test --action "call total(100, 10) directly" \
     --observation "$(node -e "import('./cart.mjs').then(m => console.log('total(100, 10) = ' + m.total(100, 10)))" 2>&1)"
   # { "captured": "total(100, 10) = 80", "observation_sha256": "a10f2aa7..." }
   ```

5. Record the verdict.

   ```bash
   npx hammerhead-debug verdict dbg-2096e0ba --result CONFIRMED \
     --reason "total(100, 10) returned 80, matching the prediction"
   # { "cycle_id": "c-1", "status": "confirmed", "escalation": { "escalate": false } }
   ```

6. Fix the code (change `discount * 2` to `discount` in `cart.mjs`), then record the fix with a hash of the diff.

   ```bash
   npx hammerhead-debug fix dbg-2096e0ba --diff-sha256 "$(git diff | shasum -a 256 | cut -d' ' -f1)"
   # { "authorized": true, "fix": { "authorized_by_cycle": "c-1", "applied": true, "diff_sha256": "..." } }
   ```

   On Linux you can use `sha256sum` instead of `shasum -a 256`. The CLI stores whatever string you give it; it does not check that it matches a diff.

7. Check that the symptom is gone. This re-runs the `--repro` command.

   ```bash
   npx hammerhead-debug check dbg-2096e0ba
   # { "resolved": true }
   ```

The whole record is in `.hammerhead-debug/dbg-2096e0ba.json`. Print it with `npx hammerhead-debug status dbg-2096e0ba`.

To get a real debugger stop instead of a recorded log line, see [DAP probes](docs/dap-probes.md).

## Documentation

| Page | Contents |
|---|---|
| [Concepts](docs/concepts.md) | The loop, the vocabulary, the two ways to use the tool |
| [CLI reference](docs/cli.md) | Every command, flag, output and exit code |
| [Session file format](docs/session-format.md) | The JSON schema, field by field |
| [Guard rules](docs/guard-rules.md) | What each check blocks, and what it does not |
| [DAP probes](docs/dap-probes.md) | Requirements, supported backends, what gets recorded |
| [Library reference](docs/library.md) | The exported functions and types |
| [Agent skill](docs/agent-skill.md) | Installing and using the skill in Claude Code and Codex |
| [Orca handoff](docs/orca-handoff.md) | How an Orca loop leads to a session and back |
| [Tool family](docs/family.md) | Orca, seal-gate, pilotfish and how they relate |
| [Troubleshooting](docs/troubleshooting.md) | Error messages and fixes |
| [Known limitations](docs/known-limitations.md) | Open issues and design limits |

## Known limitations

- [Issue #7](https://github.com/rfcclub/hammerhead-debug/issues/7): the `dap` probe can record a failed evaluation at a relocated breakpoint as an observation, and `verdict --result CONFIRMED` is accepted on it. In testing, a program that exits before reaching the breakpoint is also recorded as an observation. Check the `captured` text yourself before you confirm. Details in [known limitations](docs/known-limitations.md).
- CONFIRMED is a judgment made by the operator. The tool does not compare the observation with the prediction.
- The observation hash detects edits to a session file; it does not authenticate the evidence.
- The CLI cannot stop file edits made before a CONFIRMED verdict.

## Develop

```bash
git clone https://github.com/rfcclub/hammerhead-debug
cd hammerhead-debug
npm ci
npm run build    # tsc, writes dist/
npm test         # vitest; the CLI tests run dist/, so build first
```

## Links

- Source and issues: https://github.com/rfcclub/hammerhead-debug
- Orca (the harness this tool plugs into): https://www.npmjs.com/package/@gotako/orca

## License

MIT. See [LICENSE](LICENSE).
