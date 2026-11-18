# Library reference

```js
import {
  createDebugLoopJson, readDebugLoopJson, writeDebugLoopJson,
  DebugGuard, checkSymptomResolved,
  runDapProbe, runDapCli, classifyDapOutput, defaultDapCliRunner,
  installSkill, defaultSkillSourcePath,
  sha256File, sha256String,
} from '@gotako/hammerhead-debug'
```

The package is ESM (`"type": "module"`, entry `dist/index.js`, types `dist/index.d.ts`), requires Node.js 22 or newer, and has no runtime dependencies. All functions are synchronous except `runDapProbe` and `runDapCli`. Types are exported too: `CycleStatus`, `ProbeKind`, `DebugProbe`, `DapProbeSpec`, `DebugObservation`, `DebugVerdict`, `DebugCycle`, `DebugSymptom`, `DebugFix`, `DebugEscalation`, `DebugLoopJson`, `DapCliResult`, `DapCliRunner`, `StoppedData`, `EvalData`, `AgentTarget`, `InstallOptions`, `InstallResult`. The field-by-field meaning of the session types is in [session format](session-format.md).

The library has no helper that appends a cycle or sets a verdict. The CLI does that by editing the session object, and a library user does the same, using `DebugGuard` for the checks. The example at the end of this page was run and works.

## Sessions

| Function | Behavior |
|---|---|
| `createDebugLoopJson(changeDir, sessionId, opts): DebugLoopJson` | Builds a new session and writes it to `<changeDir>/<sessionId>.json` (creating the directory). `opts`: `{ boundRepoSha: string, servesTask?: { plan, task } \| null, symptom: { description, repro_cmd } }`. Budget is 4. |
| `readDebugLoopJson(changeDir, sessionId): DebugLoopJson` | Reads and `JSON.parse`s the file. Throws `debug-loop session not found at <path>` if it is missing. No schema validation. |
| `writeDebugLoopJson(changeDir, session): void` | Writes `<changeDir>/<session.session_id>.json`, creating the directory. |
| `checkSymptomResolved(session, cwd): boolean` | Runs `session.symptom.repro_cmd` with `sh -c` in `cwd`. `true` if it exits 0, `false` on any failure. No timeout. Output discarded. |

Session ids are used as file names without validation.

## `DebugGuard`

`new DebugGuard()`. Every method returns `void` and throws an `Error` with the message from [guard rules](guard-rules.md), except `escalateIfNeeded`.

| Method | Throws when |
|---|---|
| `canOpenCycle(session, { prediction })` | budget invalid or exhausted; prediction blank; a cycle is already open |
| `probeIsLegal(probe)` | `probe.kind` is not one of the four legal kinds |
| `verdictIsHonest(cycle)` | no observation hash; blank `captured`; hash mismatch |
| `canWriteFix(session)` | no confirmed cycle; `fix.authorized_by_cycle` is not one of them; its observation fails `verdictIsHonest` |
| `escalateIfNeeded(session)` | never throws; returns `{ escalate: boolean, reason?: string }` |

## DAP

| Function | Behavior |
|---|---|
| `runDapProbe(spec, opts?): Promise<DebugObservation>` | Runs `dap debug`, then `dap eval` if stopped, then `dap stop`. Returns `{ captured, observation_sha256 }`. Rejects with `dap debug failed: <message>` when `dap` errors, and with `dap probe recorded no observation: ...` when the program exits without stopping, the stop is not at any requested breakpoint, or the evaluation fails or returns no value (a returned observation is always a real stop at a requested breakpoint with an evaluated value). `opts`: `{ binPath?: string, runner?: DapCliRunner }`; `binPath` defaults to `dap`. See [DAP probes](dap-probes.md) for the recorded text. |
| `runDapCli(run, args): Promise<DapCliResult>` | Runs one `dap` call with `--json` appended and classifies it. A nonzero exit code turns a `stopped` or `ok` result into `{ kind: 'error', message: 'dap exited with code N', raw }`. |
| `classifyDapOutput(stdout): DapCliResult` | Text starting `Error:` gives `error`; starting `Program terminated` gives `terminated` (with the exit code if the text has `Exit code: <digits>`); JSON with `reason` and `location` gives `stopped`; other JSON or text gives `ok`. |
| `defaultDapCliRunner(binPath, timeoutMs = 60000): DapCliRunner` | Runs the executable with `execFile`. Never throws: a spawn failure or timeout becomes exit code 1. |

`DapCliRunner` is `(args: string[]) => Promise<{ stdout: string; exitCode: number }>`. Pass your own as `runner` to test without a real debugger.

`DapProbeSpec`: `{ script?, attach?, pid?, backend?, breakpoints: { path, line, condition? }[], evaluate, stopOnEntry? }`.

## Skill installer and hashing

| Function | Behavior |
|---|---|
| `installSkill(opts?): { installed: { agent, path }[] }` | Copies `skill/SKILL.md` to `<base>/.claude/skills/hammerhead-debug/` and/or `<base>/.codex/skills/hammerhead-debug/`. `opts`: `agents` (default both), `global` (default `true`; base is the home directory, otherwise the current directory), `cwd` (overrides the base), `skillSourcePath`. Throws if the source file is missing. Overwrites existing files. |
| `defaultSkillSourcePath(): string` | Path of the packaged `skill/SKILL.md`. |
| `sha256String(s): string` | Lower-case hex SHA-256 of the UTF-8 string. |
| `sha256File(path): string` | Lower-case hex SHA-256 of the file's bytes. |

## Example

```js
import {
  createDebugLoopJson, readDebugLoopJson, writeDebugLoopJson,
  DebugGuard, checkSymptomResolved, sha256String,
} from '@gotako/hammerhead-debug'

const dir = '.hammerhead-debug'
const guard = new DebugGuard()

const session = createDebugLoopJson(dir, 'dbg-example', {
  boundRepoSha: 'unknown',
  symptom: { description: 'total is 80, expected 90', repro_cmd: 'node repro.mjs' },
})

guard.canOpenCycle(session, { prediction: 'total(100, 10) returns 80' })
const cycle = { id: 'c-1', status: 'open', hypothesis: 'discount subtracted twice', prediction: 'total(100, 10) returns 80' }
session.cycles.push(cycle)

const captured = 'total(100, 10) = 80'
cycle.probe = { action: 'call total directly', kind: 'isolated_test' }
cycle.observation = { captured, observation_sha256: sha256String(captured) }

guard.verdictIsHonest(cycle)                       // throws if the observation is missing or edited
cycle.verdict = { prediction_held: true, result: 'CONFIRMED' }
cycle.status = 'confirmed'
session.fix.authorized_by_cycle = cycle.id

guard.canWriteFix(session)                         // throws unless a confirmed cycle authorizes the fix
writeDebugLoopJson(dir, session)

console.log(readDebugLoopJson(dir, 'dbg-example').cycles[0].status)  // confirmed
console.log(guard.escalateIfNeeded(session))                         // { escalate: false }
console.log(checkSymptomResolved(session, process.cwd()))            // false while the bug exists
```

Because the library only checks what you ask it to check, a program that writes sessions directly can skip the guard. The guard is a convention that the CLI follows, not an access control.
