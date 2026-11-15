import { createActionInputContext } from '@commercekit-tools/notification-contract';
import { actionInputNames } from '../scripts/reporting-inputs.mjs';

/** Fixture display context uses the actual shared display-context/redaction factory. */
export function fixtureInputs(name, run, values = {}) {
  const definitions = actionInputNames(name).map((input) => ({ name: input }));
  const raw = Object.fromEntries(definitions.map(({ name: input }) => [input, '']));
  Object.assign(
    raw,
    {
      'token-endpoint': run.credentials.tokenUrl,
      'client-id': run.credentials.clientId,
      'client-secret': run.credentials.clientSecret,
      resource: run.credentials.resource,
    },
    values,
  );
  return createActionInputContext(definitions, raw, {
    validated: true,
    effective: raw,
    secrets: Object.values(run.credentials),
  });
}
