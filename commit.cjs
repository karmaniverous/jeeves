const {execSync} = require('child_process');
const cwd = 'D:/repos/karmaniverous/jeeves';
const opts = {cwd, encoding: 'utf8', stdio: 'inherit'};
execSync('git add -A', opts);
execSync('git commit -m "fix: replace spawn recursion with descriptor.run in start command\n\nFixes #51"', opts);
