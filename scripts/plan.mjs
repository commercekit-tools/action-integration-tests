import * as core from '@actions/core';
import { makePlan } from './scenarios.mjs';

try {
  core.setOutput('matrix', JSON.stringify(makePlan(process.env.SUITE)));
} catch {
  core.setFailed('Integration suite is invalid.');
}
