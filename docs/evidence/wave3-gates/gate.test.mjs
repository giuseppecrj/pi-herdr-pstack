import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as h from './host/test/integration/harness.ts';
import { getProviderRequests, resetProviderRequests } from './host/test/integration/fake-provider.ts';

const root = import.meta.dirname;
const pack = join(root, 'pack');
const roles = '/home/g/Projects/pi-herdr-roles';
const promptPath = join(pack, 'skills/no-comments/references/comment-sicko.md');
const prompt = readFileSync(promptPath, 'utf8');
const persona = 'Yes... Ha ha ha... Yes!';
assert.ok(prompt.includes(persona), 'fixture precondition: persona line present in the delegate prompt');
assert.deepEqual(h.getAvailableBackends(), ['herdr'], 'real Herdr is required; no skip');

for (const fork of [false, true]) {
  test(`comment-sicko bare delegate, fork=${fork}`, { timeout: 110_000 }, async () => {
    resetProviderRequests();
    const env = h.createTestEnv('herdr');
    const evidence = join(root, 'logs', `gate-${fork}`);
    mkdirSync(evidence, { recursive: true });
    const parentSession = join(env.dir, 'parent.jsonl');
    try {
      const agentDir = join(env.dir, '.pi', 'agent');
      writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [roles, pack] }));
      const observer = join(agentDir, 'extensions', 'gate-observer.ts');
      writeFileSync(observer, `
import { appendFileSync, writeFileSync } from 'node:fs';
export default function(pi) {
  const id = (ctx) => ({ pid: process.pid, childId: process.env.PI_SUBAGENT_ID ?? null, role: process.env.PI_SUBAGENT_AGENT ?? null, sessionFile: ctx.sessionManager.getSessionFile() });
  pi.on('session_start', (_e, ctx) => writeFileSync(${JSON.stringify(evidence)} + '/' + process.pid + '.json', JSON.stringify({ ...id(ctx), commands: pi.getCommands().map(c => ({ name: c.name, path: c.sourceInfo?.path })) }, null, 2)));
  pi.on('before_agent_start', (e, ctx) => appendFileSync(${JSON.stringify(evidence)} + '/' + process.pid + '.events.jsonl', JSON.stringify({ ...id(ctx), prompt: e.prompt }) + '\\n'));
}
`);
      const fixture = join(env.dir, 'sample.py');
      writeFileSync(fixture, ['# narrating: step 1, add the cards', 'x = 1  # keep: why the offset is one-based', '# narrating: step 2', 'y = x + 1', ''].join('\n'));
      const marker = join(env.dir, 'gate-marker.txt');
      const token = `PSTACK_W3_GATE_${fork ? 'FORK' : 'FRESH'}`;
      const name = `w3gate-${h.uniqueId()}`;
      const task = [
        'Call the subagent tool with these EXACT parameters:',
        `  name: ${JSON.stringify(name)}`,
        `  systemPrompt: ${JSON.stringify(prompt)}`,
        '  tools: "read, bash, edit"',
        '  thinking: "medium"',
        '  model: "pi-integration/test"',
        `  fork: ${fork}`,
        `  task: ${JSON.stringify(`Run this bash command: echo '${token}' > '${marker}' && sed -i '/^# narrating:/d' '${fixture}'`)}`,
        'Do not do anything else. Just call the subagent tool once.',
        'After you receive the subagent result, say INTEGRATION_COMPLETE.',
      ].join('\n');
      const pane = h.createTrackedSurface(env, name);
      await h.waitForPaneReady(pane);
      h.startPi(pane, env.dir, task, { extraArgs: [
        `--session ${h.shellQuote(parentSession)}`,
        `-e ${h.shellQuote(join(roles, 'extensions/index.ts'))}`,
        `-e ${h.shellQuote(join(pack, 'pi-extension/pstack/index.ts'))}`,
        `-e ${h.shellQuote(observer)}`,
      ].join(' ') });
      assert.equal((await h.waitForFile(marker, 80_000, new RegExp(token))).trim(), token, 'task executed in the child');
      await h.waitForFile(parentSession, 80_000, /"customType"\s*:\s*"subagent_result"/);
      const after = readFileSync(fixture, 'utf8');
      assert.doesNotMatch(after, /# narrating:/, 'narrating comments removed');
      assert.match(after, /# keep: why the offset is one-based/, 'why-comment kept');
      assert.match(after, /y = x \+ 1/, 'code untouched');
      const rows = readdirSync(evidence).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(evidence, f), 'utf8')));
      const child = rows.find(r => r.childId);
      assert.ok(child, 'child observed');
      assert.equal(child.role, null, 'bare delegate: no PI_SUBAGENT_AGENT role');
      assert.ok(child.commands.some(c => c.name === 'skill:no-comments' && c.path === join(pack, 'skills/no-comments/SKILL.md')), 'pstack skills visible in child');
      const childRequests = getProviderRequests().filter(r => r.tools?.includes('caller_ping') && r.lastUser?.includes(token));
      writeFileSync(join(evidence, 'provider-requests.json'), JSON.stringify(getProviderRequests().map(r => ({ model: r.model, status: r.status, tools: r.tools, lastUser: r.lastUser?.slice(0, 160), systemLen: r.systemText?.length ?? null, systemHead: r.systemText?.slice(0, 300) ?? null, allHasPersona: r.allText?.includes(persona) ?? null, systemHasPersona: r.systemText?.includes(persona) ?? null })), null, 2));
      assert.ok(childRequests.length > 0, 'child task request reached the provider');
      // Host behavior (launch.ts): a bare spawn's systemPrompt is prepended as a role block to the
      // child's first message (artifact-backed when long); it is not appended to the system prompt,
      // and fork mode drops it entirely. So the delegate requires fork: false.
      const first = childRequests[0];
      if (!fork) {
        assert.ok(first.allText?.includes(persona), 'delegate prompt text reaches the child');
        assert.ok(first.lastUser?.includes(persona) || first.allText?.indexOf(persona) < first.allText?.indexOf(`echo '${token}'`), 'prompt arrives as the role block at the top of the first message, before the task');
        assert.equal(first.systemText?.includes(persona), false, 'host does not place a bare systemPrompt into the system prompt (characterization)');
      } else {
        const parentInstruction = `systemPrompt: ${JSON.stringify(prompt)}`;
        const stripped = (first.allText ?? '').split(parentInstruction).join('');
        assert.equal(stripped.includes(persona), false, 'fork mode: host does not deliver systemPrompt as the child identity (only the copied parent instruction mentions it)');
      }
      for (const r of childRequests) {
        assert.ok(r.tools.includes('bash') && r.tools.includes('edit') && r.tools.includes('read'), `child tools include read/bash/edit: ${r.tools.join(',')}`);
      }
      const fallback = getProviderRequests().filter(r => r.model && r.model !== 'test');
      assert.deepEqual(fallback, [], 'no fallback model requested');
      const events = readFileSync(join(evidence, `${child.pid}.events.jsonl`), 'utf8').trim().split('\n').map(JSON.parse);
      assert.equal(events.length, 1, 'single initial prompt in the child (no separate skill startup turn)');
      assert.ok(events[0].prompt.includes(`echo '${token}'`), 'the task is the first message');
      copyFileSync(parentSession, join(evidence, 'parent.jsonl'));
      if (child.sessionFile && existsSync(child.sessionFile)) copyFileSync(child.sessionFile, join(evidence, 'child.jsonl'));
      writeFileSync(join(evidence, 'summary.json'), JSON.stringify({ fork, child: { pid: child.pid, childId: child.childId }, childRequests: childRequests.length, promptDelivered: true, taskExecuted: true, resultDelivered: true, fallbackRequests: 0 }, null, 2));
    } finally {
      if (existsSync(parentSession)) copyFileSync(parentSession, join(evidence, 'parent.jsonl'));
      h.cleanupTestEnv(env);
    }
  });
}
