import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = '/tmp/pi-herdr-wave1-qa-y7ClZe';
const dir = `${base}/combined-lifecycle-observations`;
const since = fs.statSync(`${base}/combined-full-integration-isolated.log`).birthtimeMs;
assert.ok(since > 0);
const rows = fs.readdirSync(dir).filter(f => fs.statSync(`${dir}/${f}`).birthtimeMs >= since)
  .map(f => JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')));
const expected = ['/home/g/Projects/pi-herdr-roles/roles', '/home/g/.herdr/worktrees/pi-herdr-pstack/wave1-pstack-foundation/agents'].sort();
assert.ok(rows.length >= 10);
for (const row of rows) {
  assert.deepEqual(row.directories, expected);
  assert.equal(row.commands.filter(c => c.name === 'plan').length, 1);
  for (const retired of ['btw', 'btw-close', 'iterate']) assert.ok(!row.commands.some(c => c.name === retired));
  for (const skill of ['plan', 'orchestrate']) assert.ok(row.commands.some(c => c.name === `skill:${skill}` && c.path?.startsWith('/home/g/Projects/pi-herdr-roles/skills/')));
}
const children = rows.filter(r => r.childId !== null);
// Resume allocates a new child ID; the saved session path is the stable identity.
const sessions = Object.groupBy(children, r => r.sessionFile);
const resumed = Object.entries(sessions).filter(([, records]) => records.length > 1)
  .map(([sessionFile, records]) => ({ sessionFile, pids: records.map(r => r.pid), childIds: records.map(r => r.childId) }));
assert.ok(resumed.length > 0, 'real saved sessions observed in multiple child processes');
const worktreeChildren = children.filter(r => r.cwd.includes('/.herdr/worktrees/'));
assert.ok(worktreeChildren.length > 0);
const summary = {
  since: new Date(since).toISOString(), observations: rows.length,
  parents: rows.length - children.length, children: children.length,
  roles: [...new Set(children.map(r => r.role))], resumed,
  worktreeChildren: worktreeChildren.map(r => ({ cwd: r.cwd, pid: r.pid, childId: r.childId })),
  userWorktreeHandoffsObserved: rows.filter(r => r.childId === null && r.cwd.includes('/.herdr/worktrees/')).length,
  allHaveBothPacks: true,
  limitation: 'Startup observations do not prove model obedience. No new user-driven handoff session is required by these fixtures; its child-marker contract is covered by W0 probes and host launch-policy tests.',
};
console.log(JSON.stringify(summary, null, 2));
fs.writeFileSync(`${base}/combined-lifecycle-summary.json`, JSON.stringify(summary, null, 2));
