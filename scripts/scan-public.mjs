import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function scanText(text) {
  const forbidden = [
    /\bgh[pousr]_[A-Za-z0-9]{20,}/,
    /\bgithub_pat_[A-Za-z0-9_]{30,}/,
    /\bnpm_[A-Za-z0-9]{20,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /https:\/\/hooks\.slack(?:-gov)?\.com\/services\/[^\s"'<>]+/,
    /https:\/\/[^\s"'<>]+\.logic\.azure\.com\/[^\s"'<>]*\?[^\s"'<>]*sig=/,
    new RegExp('/Users/' + 'anil/'),
  ];
  if (forbidden.some((pattern) => pattern.test(text))) throw Error('Unsafe public content.');
  for (const line of text.split('\n')) {
    if (/^\s*\/\/[^\s]+\/:_authToken\s*=/.test(line)) {
      if (!line.trim().endsWith('=${NODE_AUTH_TOKEN}')) throw Error('Unsafe registry credential.');
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter(Boolean);
  for (const path of new Set(paths)) {
    try {
      scanText(readFileSync(path, 'utf8'));
    } catch {
      throw Error(`Public source scan failed: ${path}`);
    }
  }
  console.log('Public source scan passed.');
}
