const { execSync } = require('child_process');
const fs = require('fs');
const cwd = 'D:/repos/karmaniverous/jeeves';

// Remove temp files
fs.unlinkSync(cwd + '/_commit.js');
fs.unlinkSync(cwd + '/_commit.cjs');

// Amend commit to remove temp files
execSync('git add -A', { cwd });
execSync('git commit --amend --no-edit', { cwd, encoding: 'utf8' });

// Push
const raw = fs.readFileSync('J:/config/credentials/github/jgs-jeeves.token');
const token = raw.toString('utf16le').replace(/^\uFEFF/, '').trim().replace(/\0/g, '');
execSync('git remote set-url origin https://jgs-jeeves@github.com/karmaniverous/jeeves.git', { cwd });
try {
  const out = execSync(`git -c credential.helper= -c url.https://jgs-jeeves:${token}@github.com/.insteadOf=https://github.com/ push`, { cwd, encoding: 'utf8' });
  console.log(out);
} finally {
  execSync('git remote set-url origin https://github.com/karmaniverous/jeeves.git', { cwd });
}
console.log('Push complete.');
