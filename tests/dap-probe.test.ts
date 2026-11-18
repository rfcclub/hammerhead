import { describe, it, expect } from 'vitest'
import { runDapProbe } from '../src/dap-probe.ts'
import type { DapCliRunner } from '../src/dap-cli.ts'

const STOPPED_JSON = JSON.stringify({
  reason: 'breakpoint',
  location: { file: 'app.py', line: 2, function: 'add' },
  source: [{ line: 2, text: '    result = a + b', current: true }],
  stack: [{ frame: 0, function: 'add', file: 'app.py', line: 2 }],
})
const EVAL_JSON = JSON.stringify({ eval_result: { value: '5', type: 'int' } })
const TERMINATED_TEXT = 'Program terminated\nExit code: 0\n'
const ERROR_TEXT = 'Error: starting debug adapter: some failure\n'

function scriptedRunner(responses: string[]): { runner: DapCliRunner; calls: string[][] } {
  const calls: string[][] = []
  let i = 0
  const runner: DapCliRunner = async (args) => {
    calls.push(args)
    const stdout = responses[Math.min(i, responses.length - 1)]
    i++
    return { stdout, exitCode: 0 }
  }
  return { runner, calls }
}

describe('runDapProbe', () => {
  it('drives debug → eval → stop and returns a hashed observation on a real stop+eval', async () => {
    const { runner, calls } = scriptedRunner([STOPPED_JSON, EVAL_JSON, 'OK\n'])
    const observation = await runDapProbe(
      { script: 'app.py', breakpoints: [{ path: 'app.py', line: 2 }], evaluate: 'a + b' },
      { runner },
    )
    expect(observation.captured).toBe('stopped(breakpoint) at app.py:2: a + b = 5')
    expect(observation.observation_sha256).not.toBeNull()
    expect(calls[0]).toEqual(['debug', 'app.py', '--break', 'app.py:2', '--json'])
    expect(calls[1]).toEqual(['eval', 'a + b', '--json'])
    expect(calls[2]).toEqual(['stop', '--json'])
  })

  it('formats a conditional breakpoint as path:line:condition', async () => {
    const { runner, calls } = scriptedRunner([STOPPED_JSON, EVAL_JSON, 'OK\n'])
    await runDapProbe(
      { script: 'app.py', breakpoints: [{ path: 'app.py', line: 2, condition: 'x > 5' }], evaluate: 'x' },
      { runner },
    )
    expect(calls[0]).toContain('app.py:2:x > 5')
  })

  it('program exits before hitting a breakpoint → fails (no observation), still calls stop', async () => {
    const { runner, calls } = scriptedRunner([TERMINATED_TEXT, 'OK\n'])
    await expect(
      runDapProbe({ script: 'app.py', breakpoints: [{ path: 'app.py', line: 999 }], evaluate: 'x' }, { runner }),
    ).rejects.toThrow(/terminated.*before hitting a breakpoint/)
    expect(calls.at(-1)).toEqual(['stop', '--json'])
  })

  it('dap debug itself erroring throws, but still calls stop in finally', async () => {
    const { runner, calls } = scriptedRunner([ERROR_TEXT, 'OK\n'])
    await expect(
      runDapProbe({ script: 'app.py', breakpoints: [{ path: 'app.py', line: 1 }], evaluate: 'x' }, { runner }),
    ).rejects.toThrow('dap debug failed')
    expect(calls.at(-1)).toEqual(['stop', '--json'])
  })

  it('eval failing after a successful stop fails the probe (no observation), still calls stop', async () => {
    const { runner, calls } = scriptedRunner([STOPPED_JSON, ERROR_TEXT, 'OK\n'])
    await expect(
      runDapProbe({ script: 'app.py', breakpoints: [{ path: 'app.py', line: 2 }], evaluate: 'bogus_expr' }, { runner }),
    ).rejects.toThrow('eval "bogus_expr" failed')
    expect(calls.at(-1)).toEqual(['stop', '--json'])
  })

  it('stop at a different line than every requested breakpoint fails the probe, even when eval succeeds', async () => {
    const { runner, calls } = scriptedRunner([STOPPED_JSON, EVAL_JSON, 'OK\n'])
    await expect(
      runDapProbe({ script: 'app.py', breakpoints: [{ path: 'app.py', line: 99 }], evaluate: 'a + b' }, { runner }),
    ).rejects.toThrow(/app\.py:2.*(not|differs)/)
    expect(calls.at(-1)).toEqual(['stop', '--json'])
  })

  it('stop in a different file than every requested breakpoint fails the probe', async () => {
    const { runner } = scriptedRunner([STOPPED_JSON, EVAL_JSON, 'OK\n'])
    await expect(
      runDapProbe({ script: 'app.py', breakpoints: [{ path: 'other.py', line: 2 }], evaluate: 'a + b' }, { runner }),
    ).rejects.toThrow(/differs/)
  })

  it('relocated breakpoint with a failed eval (the reported case) fails the probe', async () => {
    const relocated = JSON.stringify({
      reason: 'breakpoint',
      location: { file: '/work/proj/checkout.py', line: 8, function: 'f' },
    })
    const { runner } = scriptedRunner([relocated, ERROR_TEXT, 'OK\n'])
    await expect(
      runDapProbe({ script: 'checkout.py', breakpoints: [{ path: 'checkout.py', line: 99 }], evaluate: 's' }, { runner }),
    ).rejects.toThrow()
  })

  it('accepts a stop reported with an absolute path when the breakpoint was given relative', async () => {
    const abs = JSON.stringify({ reason: 'breakpoint', location: { file: '/work/proj/src/app.py', line: 2, function: 'add' } })
    const { runner } = scriptedRunner([abs, EVAL_JSON, 'OK\n'])
    const observation = await runDapProbe(
      { script: 'src/app.py', breakpoints: [{ path: 'src/app.py', line: 2 }], evaluate: 'a + b' },
      { runner },
    )
    expect(observation.captured).toBe('stopped(breakpoint) at /work/proj/src/app.py:2: a + b = 5')
  })

  it('a path suffix that is not a whole path segment does not match', async () => {
    const abs = JSON.stringify({ reason: 'breakpoint', location: { file: '/work/proj/notapp.py', line: 2, function: 'add' } })
    const { runner } = scriptedRunner([abs, EVAL_JSON, 'OK\n'])
    await expect(
      runDapProbe({ script: 'app.py', breakpoints: [{ path: 'app.py', line: 2 }], evaluate: 'a + b' }, { runner }),
    ).rejects.toThrow(/differs/)
  })

  it('with several breakpoints, a stop at any one of them is accepted', async () => {
    const { runner } = scriptedRunner([STOPPED_JSON, EVAL_JSON, 'OK\n'])
    const observation = await runDapProbe(
      { script: 'app.py', breakpoints: [{ path: 'app.py', line: 7 }, { path: 'app.py', line: 2 }], evaluate: 'a + b' },
      { runner },
    )
    expect(observation.captured).toContain('a + b = 5')
  })

  it('an entry stop that was explicitly requested via stopOnEntry is accepted', async () => {
    const entry = JSON.stringify({ reason: 'entry', location: { file: 'app.py', line: 1, function: '<module>' } })
    const { runner } = scriptedRunner([entry, EVAL_JSON, 'OK\n'])
    const observation = await runDapProbe(
      { script: 'app.py', stopOnEntry: true, breakpoints: [{ path: 'app.py', line: 50 }], evaluate: 'a + b' },
      { runner },
    )
    expect(observation.captured).toBe('stopped(entry) at app.py:1: a + b = 5')
  })

  it('an entry-looking stop is NOT accepted when stopOnEntry was not requested', async () => {
    const entry = JSON.stringify({ reason: 'entry', location: { file: 'app.py', line: 1, function: '<module>' } })
    const { runner } = scriptedRunner([entry, EVAL_JSON, 'OK\n'])
    await expect(
      runDapProbe({ script: 'app.py', breakpoints: [{ path: 'app.py', line: 50 }], evaluate: 'a + b' }, { runner }),
    ).rejects.toThrow(/differs/)
  })

  it('eval succeeding with no value fails closed instead of recording "<no value>"', async () => {
    const { runner } = scriptedRunner([STOPPED_JSON, JSON.stringify({}), 'OK\n'])
    await expect(
      runDapProbe({ script: 'app.py', breakpoints: [{ path: 'app.py', line: 2 }], evaluate: 'a + b' }, { runner }),
    ).rejects.toThrow(/failed/)
  })

  it('stop failing (daemon already exited) is swallowed, does not mask the real result', async () => {
    const calls: string[][] = []
    let i = 0
    const runner: DapCliRunner = async (args) => {
      calls.push(args)
      if (args[0] === 'stop') throw new Error('daemon not running')
      const stdout = [STOPPED_JSON, EVAL_JSON][i++]
      return { stdout, exitCode: 0 }
    }
    const observation = await runDapProbe(
      { script: 'app.py', breakpoints: [{ path: 'app.py', line: 2 }], evaluate: 'a + b' },
      { runner },
    )
    expect(observation.captured).toContain('a + b = 5')
  })

  it('attach/pid/backend/stopOnEntry flags are passed through to the debug command', async () => {
    const { runner, calls } = scriptedRunner([STOPPED_JSON, EVAL_JSON, 'OK\n'])
    await runDapProbe(
      {
        attach: 'localhost:5678',
        backend: 'debugpy',
        stopOnEntry: true,
        breakpoints: [{ path: 'app.py', line: 2 }],
        evaluate: 'x',
      },
      { runner },
    )
    expect(calls[0]).toEqual(
      expect.arrayContaining(['--attach', 'localhost:5678', '--backend', 'debugpy', '--stop-on-entry']),
    )
  })
})

describe('runDapProbe exit status', () => {
  const spec = { script: 'app.py', breakpoints: [{ path: 'app.py', line: 2 }], evaluate: 'a + b' }
  const exitRunner = (responses: Array<[string, number]>): DapCliRunner => {
    let i = 0
    return async () => {
      const [stdout, exitCode] = responses[Math.min(i++, responses.length - 1)]
      return { stdout, exitCode }
    }
  }

  it('eval-nonzero: a nonzero eval exit fails the probe and records nothing', async () => {
    const error = await runDapProbe(spec, { runner: exitRunner([[STOPPED_JSON, 0], [EVAL_JSON, 42], ['OK\n', 0]]) }).then(
      () => null,
      (e: Error) => e,
    )
    expect(error?.message).toContain('failed')
    expect(error?.message).not.toContain('= 5')
  })

  it('debug-nonzero: throws when debug exits nonzero', async () => {
    const error = await runDapProbe(spec, { runner: exitRunner([[STOPPED_JSON, 42], ['OK\n', 0]]) }).then(() => null, (e: Error) => e)
    expect(error?.message).toContain('dap debug failed')
  })
})
