#!/usr/bin/env node
'use strict';

/**
 * The release notes are the changelog the Homey App Store shows.
 *
 * Written to stdout as Markdown so a GitHub release carries the same words a
 * user reads in the Homey app, rather than a second set that drifts.
 *
 * Usage: node scripts/release-notes.mjs 1.1.0 > notes.md
 */

import { readFileSync } from 'node:fs';

const version = (process.argv[2] ?? '').replace(/^v/, '');
if (version === '') {
  console.error('Usage: node scripts/release-notes.mjs <version>');
  process.exit(1);
}

const changelog = JSON.parse(
  readFileSync(new URL('../.homeychangelog.json', import.meta.url), 'utf8'),
);
const entry = changelog[version];
if (entry === undefined) {
  console.error(`.homeychangelog.json has no entry for ${version}`);
  process.exit(1);
}

const lines = [entry.en];
if (typeof entry.da === 'string' && entry.da.trim() !== '') {
  lines.push('', '### Dansk', '', entry.da);
}
lines.push(
  '',
  '---',
  '',
  `Published to the [Homey App Store](https://homey.app/a/dk.smartgulvvarme/) as version ${version}.`,
);

console.log(lines.join('\n'));
