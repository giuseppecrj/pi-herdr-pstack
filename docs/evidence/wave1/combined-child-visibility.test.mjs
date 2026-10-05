import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as h from '/home/g/.herdr/worktrees/pi-herdr-agents/wave1-pack-neutral-host/test/integration/harness.ts';

const roles = '/home/g/Projects/pi-herdr-roles';
const pstack = '/home/g/.herdr/worktrees/pi-herdr-pstack/wave1-pstack-foundation';
const evidence = '/tmp/pi-herdr-wave1-qa-y7ClZe';
const expectedDirectories = [join(roles, 'roles'), join(pstack, 'agents')].sort();
assert.deepEqual(h.getAvailableBackends(), ['herdr'], 'real Herdr is required; no skip');

for (const [agent, fork] of [['worker', false], ['poteto', true]]) {
  test(`installed packs visible in real ${agent} child (fork=${fork})`, { timeout: 100_000 }, async () => {
    const env = h.createTestEnv('herdr');
    const observerDir = join(evidence, `visibility-${agent}-${h.uniqueId()}`);
    mkdirSync(observerDir, { recursive: true });
    const parentSession = join(env.dir, 'parent.jsonl');
    try {
      const agentHome = join(env.dir, '.pi', 'agent');
      writeFileSync(join(agentHome, 'settings.json'), JSON.stringify({ packages: [roles, pstack] }));
      const observer = join(agentHome, 'extensions', 'visibility.ts');
      writeFileSync(observer, `
import { writeFileSync } from 'node:fs';
export default function(pi) {
  pi.on('session_start', (_event, ctx) => {
    const directories = [];
    pi.events.emit('pi-herdr-subagents:roles:discover:v1', {apiVersion: 1, register(path) { directories.push(path); }});
    writeFileSync(${JSON.stringify(observerDir)} + '/' + process.pid + '.json', JSON.stringify({
      pid: process.pid,
      childId: process.env.PI_SUBAGENT_ID ?? null,
      role: process.env.PI_SUBAGENT_AGENT ?? null,
      directories: directories.sort(),
      commands: pi.getCommands().map(c => ({name: c.name, path: c.sourceInfo?.path})),
      sessionFile: ctx.sessionManager.getSessionFile(),
    }, null, 2));
  });
}
`);
      const marker = join(env.dir, 'child-result.txt');
      const id = h.uniqueId();
      const name = `packqa-api-${id}`;
      const task = [
        'Call the subagent tool with these EXACT parameters:',
        `  name: ${JSON.stringify(name)}`,
        `  agent: ${JSON.stringify(agent)}`,
        '  model: "pi-integration/test"',
        ...(fork ? ['  fork: true'] : []),
        `  task: ${JSON.stringify(`Run this bash command: echo '${agent}_PASS' > '${marker}'`)}`,
        'Do not do anything else. Just call the subagent tool once.',
        'After you receive the subagent result, say INTEGRATION_COMPLETE.',
      ].join('\n');
      const surface = h.createTrackedSurface(env, name);
      await h.waitForPaneReady(surface);
      h.startPi(surface, env.dir, task, { extraArgs: [
        `--session ${h.shellQuote(parentSession)}`,
        `-e ${h.shellQuote(join(roles, 'extensions', 'index.ts'))}`,
        `-e ${h.shellQuote(join(pstack, 'pi-extension', 'pstack', 'index.ts'))}`,
        `-e ${h.shellQuote(observer)}`,
      ].join(' ') });
      const markerText = await h.waitForFile(marker, 75_000, new RegExp(`${agent}_PASS`));
      assert.equal(markerText.trim(), `${agent}_PASS`);
      await h.waitForFile(parentSession, 75_000, /"customType"\s*:\s*"subagent_result"/);
      const rows = readdirSync(observerDir).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(observerDir, f), 'utf8')));
      const parent = rows.find(r => r.childId === null);
      const child = rows.find(r => r.childId !== null && r.role === agent);
      assert.ok(parent, 'parent observation exists');
      assert.ok(child, 'real child observation exists with role and PI_SUBAGENT_ID');
      assert.deepEqual(parent.directories, expectedDirectories);
      assert.deepEqual(child.directories, expectedDirectories, 'both pack bridges load in child through isolated installed settings');
      for (const record of [parent, child]) {
        const names = record.commands.map(c => c.name);
        assert.equal(names.filter(n => n === 'plan').length, 1, 'one unsuffixed /plan');
        for (const removed of ['btw', 'btw-close', 'iterate']) assert.equal(names.includes(removed), false);
        for (const skill of ['plan', 'orchestrate']) {
          assert.ok(record.commands.some(c => c.name === `skill:${skill}` && c.path?.startsWith(roles + '/skills/')), `${skill} skill visible from installed roles pack`);
        }
      }
      copyFileSync(parentSession, join(evidence, `combined-${agent}-parent.jsonl`));
      if (child.sessionFile && existsSync(child.sessionFile)) copyFileSync(child.sessionFile, join(evidence, `combined-${agent}-child.jsonl`));
      writeFileSync(join(evidence, `combined-${agent}-summary.json`), JSON.stringify({ agent, fork, parent, child, delivered: true }, null, 2));
    } finally {
      if (existsSync(parentSession)) copyFileSync(parentSession, join(evidence, `combined-${agent}-parent.jsonl`));
      h.cleanupTestEnv(env);
    }
  });
}
