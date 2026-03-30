const {execSync} = require('child_process');
const fs = require('fs');
const cwd = 'D:/repos/karmaniverous/jeeves';
fs.unlinkSync(cwd + '/commit.cjs');
fs.unlinkSync(cwd + '/create-pr.cjs');
execSync('git add -A', {cwd, stdio: 'inherit'});
execSync('git commit -m "chore: remove temp scripts"', {cwd, stdio: 'inherit'});
execSync('git push', {cwd, stdio: 'inherit'});
