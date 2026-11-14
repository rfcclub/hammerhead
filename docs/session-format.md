# Session file format

A session is one JSON file, `<dir>/<session-id>.json`, written with two-space indentation. The CLI rewrites the whole file on every change. The format is the TypeScript type `DebugLoopJson` (see [library reference](library.md)). Example from a real run (shortened):

```json
{
  "schema_version": "1.0",
  "session_id": "dbg-2096e0ba",
  "bound_repo_sha": "da8ac8e580d6114aa6ea58c9f190a293aa598d4d",
  "serves_task": null,
  "symptom": {
    "description": "total is 80, expected 90",
    "repro_cmd": "node repro.mjs",
    "repro_sha256": null
  },
  "cycles": [
    {
      "id": "c-1",
      "status": "confirmed",
      "hypothesis": "total() subtracts the discount twice",
      "prediction": "total(100, 10) returns 80, so 20 is being subtracted",
      "probe": { "action": "call total(100, 10) directly", "kind": "isolated_test" },
      "observation": {
        "captured": "total(100, 10) = 80",
        "observation_sha256": "a10f2aa73c62ba418d2598414927af45fc6cbdcb8fdb5016ecd689e44013d565"
      },
      "verdict": {
        "prediction_held": true,
        "result": "CONFIRMED",
        "reason": "total(100, 10) returned 80, matching the prediction"
      }
    }
  ],
  "fix": { "authorized_by_cycle": "c-1", "applied": true, "diff_sha256": "<sha256 of your diff>" },
  "escalation": {
    "max_refuted_cycles": 4,
    "on_exhaust": "STOP and escalate — hand session + all cycles to stronger model or human"
  }
}
```

## Top-level fields

| Field | Type | Set by | Notes |
|---|---|---|---|
| `schema_version` | `"1.0"` | `open` | Always `"1.0"`. Not checked when a session is read. |
| `session_id` | string | `open` | `dbg-` plus the first 8 hex characters of a random UUID. Also the file name. |
| `bound_repo_sha` | string | `open` | Output of `git rev-parse HEAD` in the current directory, or `"unknown"`. Inside a subdirectory of a repository it is the enclosing repository's HEAD. Informational; never compared later. |
| `serves_task` | `{ plan, task }` or `null` | `open` | Set only when both `--plan` and `--task` are passed. Informational. Orca does not read it. |
| `symptom` | object | `open` | See below. |
| `cycles` | array | `hypothesis`, `probe`, `verdict` | Ordered; ids are `c-1`, `c-2`, ... assigned as `c-<count + 1>`. |
| `fix` | object | `verdict` (CONFIRMED), `fix` | See below. |
| `escalation` | object | `open` | See below. |

## `symptom`

| Field | Type | Notes |
|---|---|---|
| `description` | string | From `--symptom`. |
| `repro_cmd` | string | From `--repro`. Run by `check` with `sh -c`. |
| `repro_sha256` | string or `null` | Declared in the type, always `null`. Nothing writes it. |

## Cycle

| Field | Type | Notes |
|---|---|---|
| `id` | string | `c-1`, `c-2`, ... |
| `status` | `"open"`, `"confirmed"`, `"refuted"` | `open` until `verdict`. |
| `hypothesis` | string | |
| `prediction` | string | Must be non-blank when the cycle is opened. |
| `probe` | object, optional | Present after `probe`. `{ action, kind }`; for `dap` also `dap` (below). |
| `observation` | object, optional | Present after `probe`. `{ captured, observation_sha256 }`. |
| `verdict` | object, optional | Present after `verdict`. `{ prediction_held, result, reason? }`. |

`probe.kind` is one of `instrumentation`, `isolated_test`, `trace_read`, `dap`. For `dap`, `probe.dap` holds the spec the CLI used: `script` (omitted if not given), `breakpoints` (`[{ "path", "line" }]`) and `evaluate`. The library type also allows `attach`, `pid`, `backend`, `stopOnEntry` and a breakpoint `condition`; the CLI never writes these.

`observation_sha256` is the lower-case hex SHA-256 of the exact UTF-8 `captured` string. Edit `captured` by hand and verdict and fix will refuse the cycle.

`verdict.prediction_held` is `true` for CONFIRMED and `false` for REFUTED. The type allows `null`, but the CLI never writes it. `verdict.result` is `"CONFIRMED"` or `"REFUTED"`. `reason` is omitted when `--reason` is not given.

## `fix`

| Field | Type | Notes |
|---|---|---|
| `authorized_by_cycle` | string or `null` | Id of the most recently CONFIRMED cycle; `null` until one exists. |
| `applied` | boolean | `true` after a successful `fix` command. |
| `diff_sha256` | string or `null` | The string passed to `--diff-sha256`, unchecked. |

## `escalation`

| Field | Type | Notes |
|---|---|---|
| `max_refuted_cycles` | integer | Default 4. Opening a new cycle is refused once the number of refuted cycles reaches this value. A value that is not a positive safe integer (0, negative, fractional, not a number) blocks new cycles with `invalid cycle budget`. No CLI flag sets it; you can only edit the file, which defeats the purpose of the budget. |
| `on_exhaust` | string | Human-readable text. Not interpreted. |
| `complexity_tripwire` | string, optional | In the type; nothing sets or reads it. |

## Editing and compatibility

- A session is read with `JSON.parse` and no schema validation. A malformed or hand-edited file fails in whatever way the next operation hits.
- Old sessions that have a placeholder hash, an empty capture, or a CONFIRMED status with a REFUTED verdict are refused at verdict and fix time. Re-run the probe on an open cycle to capture real evidence; a closed cycle cannot be reopened, so open a new session for it.
- The file is the only state. Copying it elsewhere (or committing it) keeps the full record.
