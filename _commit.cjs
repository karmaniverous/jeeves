const {execSync}=require('child_process');
const opts = {cwd:'D:/repos/karmaniverous/jeeves', encoding:'utf8', stdio:'inherit'};
execSync('git add -A', opts);
execSync('git commit -m "refactor: remove dead JeevesComponent types and extract shared test helper"', opts);
const token = require('fs').readFileSync('J:/config/credentials/github/jgs-jeeves.token','utf8').trim();
process.env.GH_TOKEN = token;
execSync('git push origin feature/v050-component-sdk', {...opts, env:{...process.env, GH_TOKEN: token}});
