const { execSync } = require('child_process');
const fs = require('fs');
const cwd = 'D:/repos/karmaniverous/jeeves';

// Clean up task file
if (fs.existsSync(cwd + '/.claude-task.md')) fs.unlinkSync(cwd + '/.claude-task.md');

// Stage, commit, push
execSync('git add -A', { cwd });
console.log(execSync('git status --short', { encoding: 'utf8', cwd }));
execSync('git commit -m "[V0-3] fix: remove dead code, replace Handlebars markers with HTML comments"', { encoding: 'utf8', cwd });
console.log('committed');

const token = fs.readFileSync('J:/config/credentials/github/jgs-jeeves.token', 'utf8').trim();
console.log(execSync('git push', { encoding: 'utf8', cwd, env: { ...process.env, GH_TOKEN: token } }));
console.log('pushed');
