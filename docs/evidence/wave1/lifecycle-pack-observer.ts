import { writeFileSync } from 'node:fs';
export default function(pi) {
  pi.on('session_start', (_event, ctx) => {
    const directories = [];
    pi.events.emit('pi-herdr-subagents:roles:discover:v1', {apiVersion: 1, register(path) { directories.push(path); }});
    writeFileSync('/tmp/pi-herdr-wave1-qa-y7ClZe/combined-lifecycle-observations/' + process.pid + '.json', JSON.stringify({
      pid: process.pid,
      cwd: ctx.cwd,
      childId: process.env.PI_SUBAGENT_ID ?? null,
      role: process.env.PI_SUBAGENT_AGENT ?? null,
      directories: directories.sort(),
      commands: pi.getCommands().map(c => ({name: c.name, path: c.sourceInfo?.path})),
      sessionFile: ctx.sessionManager.getSessionFile(),
    }, null, 2));
  });
}
