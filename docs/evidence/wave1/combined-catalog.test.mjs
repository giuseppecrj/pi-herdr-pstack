import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { IsolatedPi } from '/home/g/.herdr/worktrees/pi-herdr-pstack/wave1-pstack-foundation/test/helpers/rpc.ts';
const host = '/home/g/.herdr/worktrees/pi-herdr-agents/wave1-pack-neutral-host';
const roles = '/home/g/Projects/pi-herdr-roles';
const pstack = '/home/g/.herdr/worktrees/pi-herdr-pstack/wave1-pstack-foundation';
async function catalog(pi) {
  await pi.request({ type: 'prompt', message: '/test-arm-subagents-list' });
  const from = pi.records.length;
  await pi.request({ type: 'prompt', message: 'list roles' });
  const end = await pi.waitFor(r => r.type === 'tool_execution_end' && r.toolName === 'subagents_list', from);
  await pi.waitFor(r => r.type === 'agent_settled', from);
  return end.result.details;
}
test('real isolated host-only catalog is empty', async () => {
  const pi = new IsolatedPi({ packages: [host] });
  try { assert.deepEqual((await catalog(pi)).agents, []); }
  finally { await pi.close(); }
});
test('real combined catalog retains global then project override precedence', async () => {
  const pi = new IsolatedPi({ packages: [host, roles, pstack] });
  try {
    let result = await catalog(pi);
    assert.equal(result.agents.length, 7);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.agents.find(a => a.name === 'worker').provider, 'pi-herdr-roles');
    const global = join(pi.agentDir, 'agents');
    mkdirSync(global, { recursive: true });
    writeFileSync(join(global, 'worker.md'), '---\nname: worker\ndescription: Global test override\n---\nGlobal override.\n');
    result = await catalog(pi);
    assert.equal(result.agents.length, 7);
    assert.equal(result.agents.find(a => a.name === 'worker').source, 'global');
    assert.equal(result.agents.find(a => a.name === 'worker').description, 'Global test override');
    const project = join(pi.root, 'work', '.pi', 'agents');
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, 'worker.md'), '---\nname: worker\ndescription: Project test override\n---\nProject override.\n');
    result = await catalog(pi);
    assert.equal(result.agents.length, 7);
    assert.equal(result.agents.find(a => a.name === 'worker').source, 'project');
    assert.equal(result.agents.find(a => a.name === 'worker').description, 'Project test override');
  } finally { await pi.close(); }
});
