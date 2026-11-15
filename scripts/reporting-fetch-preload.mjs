/** Test-only process preload: deny external network; map only fixed Sandbox requests to loopback. */
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertLoopbackOrigin, localSandboxFetch } from './reporting-support.mjs';

const mode = process.env.COMMERCEKIT_REPORTING_MODE;
assert(['sandbox', 'provider-mock', 'deny'].includes(mode));
const origin = assertLoopbackOrigin(process.env.COMMERCEKIT_REPORTING_LOCAL_ORIGIN);
const counts = { attempted: 0, sandbox: 0, mockProvider: 0, blocked: 0 };
const save = () =>
  writeFileSync(join(process.cwd(), 'network.json'), JSON.stringify(counts), { mode: 0o600 });
save();
const blocked = () => {
  counts.attempted++;
  counts.blocked++;
  save();
  throw new Error('External network denied by reporting harness.');
};
http.request = blocked;
http.get = blocked;
https.request = blocked;
https.get = blocked;
syncBuiltinESMExports();
const localFetch = localSandboxFetch(
  origin,
  readFileSync(process.env.COMMERCEKIT_REPORTING_CA_FILE),
);
globalThis.fetch = async (url, options = {}) => {
  counts.attempted++;
  if (mode === 'provider-mock') {
    const target = new URL(typeof url === 'string' || url instanceof URL ? url : url.url);
    const slack =
      target.origin === 'https://' + 'hooks.slack.com' &&
      target.pathname === '/services/reporting/reporting/reporting';
    const teams = target.href === 'https://provider.example.test/reporting';
    if (
      !(slack || teams) ||
      options.method !== 'POST' ||
      target.username + target.password + target.search + target.hash !== ''
    ) {
      counts.blocked++;
      save();
      throw new Error('Provider destination denied by reporting harness.');
    }
    counts.mockProvider++;
    save();
    assert(typeof options.body === 'string' && Buffer.byteLength(options.body) <= 65536);
    writeFileSync(join(process.cwd(), 'payload.json'), options.body, { mode: 0o600 });
    const status = Number(process.env.COMMERCEKIT_REPORTING_MOCK_STATUS);
    assert([200, 400].includes(status));
    return new Response('', { status });
  }
  if (mode === 'sandbox') {
    try {
      const response = await localFetch(url, options);
      counts.sandbox++;
      save();
      return response;
    } catch {
      counts.blocked++;
      save();
      throw new Error('Local reporting request failed or was denied.');
    }
  }
  counts.blocked++;
  save();
  throw new Error('Network denied for offline reporting.');
};
