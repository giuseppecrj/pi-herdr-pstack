### Runtime forensics

**You own the diagnosis. Instrument the live process, don't theorize from source.** The deliverable is a cited diagnosis, not a fix.

1. Capture the live signal on the matching surface with the profiler, debugger or browser tooling the project or session provides: a CPU profile for a spinning process, a heap snapshot for a leak, a CDP trace for a visual glitch. A real artifact, not a guess. If no available tool can attach to the process, say so and stop rather than theorizing.
2. Reduce the artifact to the smoking gun: the function on the hot path, the retainer chain from the leaked object to a GC root, the loop firing without input. Parse large artifacts in a subagent (**principle-guard-the-context-window**, planned W3), keep the reduced finding in the main thread.
3. Prove the mechanism before believing it. Inject instrumentation into the running process, for example through CDP evaluation, or hotfix the live code without reloading, to confirm the hypothesis cheaply. Do this only on a local process you own, never on a shared or production service without explicit authorization.
4. Map the finding back to source: file, symbol, the line that allocates or schedules.
5. Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only forensics`.

**Reply:** the signal captured, the reduced finding, how you proved the mechanism, the source location, artifact paths. No fix unless asked. Hand back to Bug fix or Perf issue once the cause is known.
