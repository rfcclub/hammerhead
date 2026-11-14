# Tool family

hammerhead-debug is one of four npm packages that were built to work together. Each can be used alone. hammerhead-debug has no dependency on the others; its `package.json` lists no runtime dependencies.

| Package | What it is (from its own package description) | Relation to hammerhead-debug |
|---|---|---|
| `@gotako/orca` | Intent-guided spec-driven design framework with TDD: intent, spec, plan, tests, verification | Reads hammerhead-debug sessions when a plan task is completed. Bundles a copy of hammerhead-debug (see below). |
| `seal-gate` | Standalone AI quality gate: deterministic core plus optional LLM overlay | No link. Orca runs it as a gate; hammerhead-debug does not import or call it. |
| `@gotako/pilotfish` | Provider-neutral bounded task runner for Orca `plan.json`, with a manual debugging handoff | Prints a `hammerhead-debug open` command when its retries run out. Does not run it. |
| `@gotako/hammerhead-debug` | This package | |

Package names were read from the packages' own `package.json` files; `seal-gate` is unscoped on npm.

## With Orca

[Orca handoff](orca-handoff.md) covers the whole path. In short: an Orca loop stops on a task whose test still fails and writes a `hammerhead-debug open` command. You run the debugging loop with `--dir` set to the Orca change directory. `orca plan-json complete --debug-session ...` reads the session file from there.

Orca 1.7.0-beta.0 lists `@gotako/hammerhead-debug` as a bundled dependency (a vendored 0.5.0-beta.2 tarball) and uses it only as a library, to read sessions. Installing Orca does not guarantee a `hammerhead-debug` command on your `PATH`. To run the handoff command, install this package yourself, globally or in the project. The bundled copy can be older than the version you install.

## With seal-gate

seal-gate is Orca's quality gate. Orca runs it between tasks and at the end of a loop. hammerhead-debug has nothing to do with it directly. A confirmed debugging session does not satisfy or bypass a gate; Orca still runs its own checks when you complete the task.

## With Pilotfish

Pilotfish asks a model to write the code for one Orca task, runs the task's test, and retries a bounded number of times. When the tries run out it prints a `hammerhead-debug open` command (per its README) instead of guessing, and does not run it. Pilotfish's README notes that the printed command does not escape quotes in some cases; see its troubleshooting page if the command breaks.

## Local and agent workflows

| | Local workflow | Agent and Orca workflow |
|---|---|---|
| Who runs it | You, in a terminal | An AI agent with the [skill](agent-skill.md), or you following an Orca handoff |
| Needs GitHub | No | hammerhead-debug: no. Orca's optional GitHub-issue and PR features are Orca's. |
| Needs agents or models | No | The agent or Pilotfish driver, if you use them |
| State | Plain JSON files | Same files, in an Orca change directory |
