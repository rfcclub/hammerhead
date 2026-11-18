# DAP probes

`probe --kind dap` drives a real debugger through the [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/) by calling the external `dap` CLI from [AlmogBaku/debug-skill](https://github.com/AlmogBaku/debug-skill). hammerhead-debug does not bundle `dap` or any debugger.

DAP probes are optional. The other three probe kinds need no extra tools.

## Requirements

1. The `dap` executable, on `PATH` or passed as `--dap-bin <path>`. Ways to get it, from the `dap` README (only the release binary was tried here):
   - a prebuilt binary from https://github.com/AlmogBaku/debug-skill/releases/latest (the tested one is `dap-darwin-arm64` from release v0.4.2; rename it to `dap` or point `--dap-bin` at it);
   - `brew install AlmogBaku/tap/dap`;
   - `go install github.com/AlmogBaku/debug-skill/cmd/dap@latest`;
   - from source, `go build -o dap ./cmd/dap` in a checkout (needs Go).
2. A debugger backend for your language, chosen by `dap` from the script's file extension:

   | Extension | Backend | Verified here |
   |---|---|---|
   | `.py` | debugpy | Yes (debugpy 1.8.22, Python 3.14) |
   | `.go` | dlv | No |
   | `.js`, `.ts` | js-debug | No |
   | `.rs`, `.c`, `.cpp` | lldb-dap | No |

   The extension table is the output of `dap --help`. For Python, `pip install debugpy` into the interpreter that `dap` will use (the first `python` on `PATH`; not verified how `dap` picks it).
3. The program under test must be launchable by `dap` with no extra arguments. The CLI cannot pass program arguments.

`dap` runs a background daemon for the session and keeps sockets under `~/.dap-cli/` (per `dap --help`). hammerhead-debug calls `dap stop` after every probe, even after a failure; after a normal run no `dap` process was left behind.

## What the CLI does

For `probe --kind dap --script app.py --break app.py:42 --evaluate "total"`, hammerhead-debug runs, each with `--json` appended and a 60 second timeout:

1. `dap debug app.py --break app.py:42` (blocks until the program stops or exits)
2. `dap eval "total"` (only if the program stopped)
3. `dap stop` (always)

## What gets recorded

The observation text is built by hammerhead-debug from `dap`'s answer:

| Situation | Recorded `captured` text | Exit code of `probe` |
|---|---|---|
| Stopped at a requested breakpoint, evaluation returned a value | `stopped(<reason>) at <file>:<line>: <expression> = <value>` | 0 |
| Stopped, evaluation failed or returned no value | nothing recorded | 1, message `dap probe recorded no observation: ... eval "<expression>" failed` |
| Stopped at a file or line that is not any requested breakpoint (for example the debugger moved a breakpoint requested on a line that does not exist) | nothing recorded | 1, message `dap probe recorded no observation: stopped at <file>:<line>, which differs from the requested breakpoint(s) ...` |
| Program exited without stopping | nothing recorded | 1, message `dap probe recorded no observation: program terminated ... before hitting a breakpoint` |
| `dap` reported an error, was not found, timed out, or exited nonzero | nothing recorded | 1, message `dap debug failed: ...` |

Only the first row records an observation, so only it can lead to a CONFIRMED verdict; `verdict` is refused when the probe failed because no observation exists. The stop location is compared with each requested `--break` by line number and by file (an absolute path reported by `dap` matches a relative `--break` path when it ends with the same whole path segments). A stop requested with `stopOnEntry` (reason `entry`) is accepted as requested. The value is still only what the debugger evaluated: whether it supports your prediction is your judgment (see [known limitations](known-limitations.md)).

Example of a successful stop from a real run with `dap` v0.4.2 and debugpy:

```
stopped(breakpoint) at /path/reloc.py:2: s = 80
```

## CLI versus library

| Capability | CLI | Library (`runDapProbe`) |
|---|---|---|
| Launch a script | `--script` | `script` |
| Breakpoints | one, `--break path:line` | any number, each with optional `condition` |
| Attach to `host:port` | no | `attach` |
| Attach to a PID | no | `pid` |
| Backend override | no | `backend` |
| Stop on entry | no | `stopOnEntry` |
| Program arguments | no | no |
| Custom `dap` path | `--dap-bin` | `binPath` option |
| Custom runner, timeout | no | `runner` option; `defaultDapCliRunner(binPath, timeoutMs)` |

The argument mapping was checked with a stub runner: a breakpoint with a condition becomes `--break path:line:condition`, and the library passes `--attach`, `--pid`, `--backend` and `--stop-on-entry` through to `dap debug`. A conditional breakpoint was also run against a real `dap` (`i == 3` in a Python loop stopped with `i = 3`). Attach and PID modes were not run against a real target.

## Windows

`--break` is split on `:`, so a Windows path with a drive letter (`C:\\app\\x.py:10`) does not parse. Not tested on Windows.

## When it fails

See [troubleshooting](troubleshooting.md#dap-probe-fails). If DAP is not available, record the same evidence with `--kind instrumentation`, `isolated_test` or `trace_read` and `--observation`.
