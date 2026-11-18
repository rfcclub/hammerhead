import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { sha256String } from './sha256.js'
import type { DapProbeSpec, DebugObservation } from './types.js'
import { defaultDapCliRunner, runDapCli, type DapCliRunner } from './dap-cli.js'

function buildDebugArgs(spec: DapProbeSpec): string[] {
  const args = ['debug']
  if (spec.script) args.push(spec.script)
  for (const bp of spec.breakpoints) {
    const flag = bp.condition ? `${bp.path}:${bp.line}:${bp.condition}` : `${bp.path}:${bp.line}`
    args.push('--break', flag)
  }
  if (spec.attach) args.push('--attach', spec.attach)
  if (spec.pid) args.push('--pid', String(spec.pid))
  if (spec.backend) args.push('--backend', spec.backend)
  if (spec.stopOnEntry) args.push('--stop-on-entry')
  return args
}

function normalizePath(p: string): string {
  const slashed = p.replace(/\\/g, '/')
  return slashed.replace(/^(\.\/)+/, '')
}

function canonical(p: string): string {
  const abs = resolve(p)
  try {
    return realpathSync(abs)
  } catch {
    return abs
  }
}

/** True when the path the debugger reports and the path the probe asked for name the same file. */
function sameFile(stopped: string, requested: string): boolean {
  const a = normalizePath(stopped)
  const b = normalizePath(requested)
  if (a === b) return true
  if (canonical(a) === canonical(b)) return true
  // One side may be relative to a working directory the other side does not know about; accept
  // only a match on whole trailing path segments, never a partial file name.
  const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a]
  if (shorter.startsWith('../') || shorter.startsWith('/')) return false
  return longer.endsWith('/' + shorter)
}

function stoppedAtRequestedBreakpoint(
  spec: DapProbeSpec,
  stop: { reason: string; location: { file: string; line: number } },
): boolean {
  // A stop-on-entry stop is a location the caller explicitly asked for.
  if (spec.stopOnEntry && stop.reason === 'entry') return true
  return spec.breakpoints.some(bp => bp.line === stop.location.line && sameFile(stop.location.file, bp.path))
}

/**
 * Drives `debug-skill`'s `dap` CLI through one probe: start (blocks until stopped or
 * exited), evaluate the requested expression, stop. Replaces the earlier hand-rolled
 * `DapClient` (raw DAP wire protocol) — `dap` already does this properly (daemon-backed,
 * multi-backend auto-detection, conditional breakpoints) and re-implementing it was
 * duplicated engineering for a strictly worse result (owner, 2026-08-04, after reviewing
 * ~/repo/debug-skill as prior art).
 */
export async function runDapProbe(
  spec: DapProbeSpec,
  opts: { binPath?: string; runner?: DapCliRunner } = {},
): Promise<DebugObservation> {
  const run = opts.runner ?? defaultDapCliRunner(opts.binPath ?? 'dap')

  const debugResult = await runDapCli(run, buildDebugArgs(spec))

  try {
    if (debugResult.kind === 'error') {
      throw new Error(`dap debug failed: ${debugResult.message}`)
    }
    if (debugResult.kind === 'terminated') {
      // No stop means nothing was observed: fail like an error rather than record a non-observation.
      throw new Error(
        `dap probe recorded no observation: program terminated (exit ${debugResult.exitCode ?? 'unknown'}) before hitting a breakpoint`,
      )
    }
    if (debugResult.kind !== 'stopped') {
      throw new Error(`dap debug returned unexpected result kind: ${debugResult.kind}`)
    }

    const stop = debugResult.data
    const where = `${stop.location.file}:${stop.location.line}`
    if (!stoppedAtRequestedBreakpoint(spec, stop)) {
      const asked = spec.breakpoints.map(bp => `${bp.path}:${bp.line}`).join(', ') || '(none)'
      throw new Error(
        `dap probe recorded no observation: stopped at ${where}, which differs from the requested breakpoint(s) ${asked} (the debugger may have relocated the breakpoint)`,
      )
    }

    const evalResult = await runDapCli(run, ['eval', spec.evaluate])
    const evalData =
      evalResult.kind === 'ok' && typeof evalResult.data === 'object' && evalResult.data !== null
        ? (evalResult.data as { eval_result?: { value?: unknown; type?: string } })
        : undefined
    const rawValue = evalData?.eval_result?.value
    if (typeof rawValue !== 'string') {
      throw new Error(`dap probe recorded no observation: stopped at ${where} but eval "${spec.evaluate}" failed`)
    }
    const value = rawValue
    const captured = `stopped(${debugResult.data.reason}) at ${debugResult.data.location.file}:${debugResult.data.location.line}: ${spec.evaluate} = ${value}`
    return { captured, observation_sha256: sha256String(captured) }
  } finally {
    // Best-effort — the daemon may already have exited on its own (program ran to completion).
    try {
      await runDapCli(run, ['stop'])
    } catch {
      // ignore
    }
  }
}
