import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isConfidentialInputName,
  redactJwtLikeTokens,
} from '@commercekit-tools/notification-contract';

/** Public input names extracted from the exact adopted Action metadata, not an event schema. */
export const actionInputMetadata = Object.freeze(
  Object.fromEntries(
    Object.entries(
      JSON.parse(readFileSync(new URL('../action-inputs.json', import.meta.url), 'utf8')),
    ).map(([name, value]) => [
      name,
      Object.freeze({ ref: value.ref, inputs: Object.freeze(value.inputs) }),
    ]),
  ),
);

export function actionInputNames(name) {
  const metadata = actionInputMetadata[`commercekit-tools/${name}`];
  assert(metadata, 'Unknown Action input metadata.');
  return metadata.inputs;
}

/** Current hosted scenarios provide valid short inputs; producer and event must agree exactly. */
export function assertReportedInputs(name, result, event) {
  const expected = actionInputNames(name);
  assert(result.inputs && event.data.inputs);
  assert.deepEqual(Object.keys(result.inputs).sort(), [...expected].sort());
  assert.deepEqual(event.data.inputs, result.inputs);
  assert.equal(result.inputsValidated, true);
  assert.equal(result.inputsTruncated, false);
  assert.equal(event.data.inputsValidated, result.inputsValidated);
  assert.equal(event.data.inputsTruncated, result.inputsTruncated);
  for (const input of expected)
    if (isConfidentialInputName(input)) assert.equal(result.inputs[input], '[REDACTED]');
  const serialized = JSON.stringify(result.inputs);
  assert.equal(redactJwtLikeTokens(serialized), serialized);
}
