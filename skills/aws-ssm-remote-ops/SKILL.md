---
name: aws-ssm-remote-ops
description: >
  Run commands on EC2 instances through AWS Systems Manager (SSM) safely: scripts without quoting failures, comparing secrets without printing them, approved Secrets Manager changes with rollback, minimal box edits, and stopping on AccessDenied. Use when operating or inspecting EC2 hosts via SSM.
---

# Remote Operations Through AWS SSM

Every change below needs the owner's explicit approval first. Reading is fine.

## Run scripts without quoting failures

- `AWS-RunShellScript` runs `sh`. Inline `commands=[...]` breaks on quotes, `$`, jq filters and nested JSON. Instead: write a local script, check it with `bash -n`, send `echo <base64> | base64 -d | bash`, and read the result with `get-command-invocation --query '[Status,StandardOutputContent,StandardErrorContent]'`.
- Label every `--comment` either `read-only: <purpose>` or with the approved change.
- If your shell tool moves the call to the background, poll it. Never send the command again.
- Run app-user commands with `sudo -u <user>`. For nvm or pm2, source `nvm.sh` inside `bash -c`.
- If the box has no database shell, write a temporary `.mjs` inside the app directory so it can use the app's own driver, then delete it.

## Compare secrets without printing them

- Compare values only by a short hash: `printf %s "$v" | sha256sum | cut -c1-12`, reporting the length and the hash.
- Strip surrounding quotes from `.env` values before hashing, or a quoting difference looks like a mismatch.
- Never print, log or paste a secret value, including into a chat or a PR.

## Change a Secrets Manager value (explicit approval only)

1. Record the current `AWSCURRENT` version id: it is the rollback target.
2. Build the new JSON with jq. Dry run: a diff of current against new, with the intended keys removed, must be empty.
3. `put-secret-value`, then re-read it and check it by hash.
4. Apps load secrets only at deploy or restart. Redeploy through the normal pipeline, then check the hash of the env file written on the box.
5. To roll back: `update-secret-version-stage --version-stage AWSCURRENT --move-to-version-id <previous>`.

## Edit a box

- Back up the file in the same script (`cp -p`, mode 600) and make the smallest change possible.
- Then print the diff, owner and mode, and line count, and check the health endpoints before reporting done.

## Permission blocks

On AccessDenied, stop. Don't work around it. Report what was tried and what was denied, and give the owner the exact commands to run, with the rollback.
