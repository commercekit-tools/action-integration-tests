import * as core from '@actions/core';
import { runCommand } from './runtime.mjs';

const command = process.argv[2];
try {
  await runCommand(command, process.env, core);
} catch {
  core.setFailed(
    `Integration ${['prepare', 'prepare-approved-deploy', 'handoff-build', 'assert-approved-deployment', 'deploy-inputs', 'record', 'notify-inputs', 'record-notify', 'assert', 'cleanup', 'record-cleanup', 'assert-cleanup'].includes(command) ? command : 'command'} failed. No raw provider response or credential is logged.`,
  );
}
