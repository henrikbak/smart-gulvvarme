#!/usr/bin/env node
'use strict';

/**
 * Keep the four places a version lives from drifting apart.
 *
 * The Homey App Store reads `app.json`, the store listing reads
 * `.homeychangelog.json`, npm tooling reads `package.json`, and a release is
 * cut from a git tag. A mismatch between any of them means the GitHub release
 * says one thing and the published app another, so this fails loudly instead.
 *
 * Usage: node scripts/check-version.mjs [expected]   (e.g. the tag, "v1.1.0")
 */

import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

const sources = [
  ['app.json', read('app.json').version],
  ['.homeycompose/app.json', read('.homeycompose/app.json').version],
  ['package.json', read('package.json').version],
];

const expected = process.argv[2]?.replace(/^v/, '');
if (expected) sources.unshift(['tag', expected]);

const version = sources[0][1];
const problems = sources
  .filter(([, value]) => value !== version)
  .map(([name, value]) => `${name} says ${value}, expected ${version}`);

// English is the only language the store requires, so it is the only one asked
// for here; a missing Danish entry is the author's call, not an error.
const changelog = read('.homeychangelog.json')[version];
if (changelog === undefined) {
  problems.push(`.homeychangelog.json has no entry for ${version}`);
} else if (typeof changelog.en !== 'string' || changelog.en.trim() === '') {
  problems.push(`.homeychangelog.json entry for ${version} has no English text`);
}

if (problems.length > 0) {
  console.error(`Version mismatch:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

console.log(`Version ${version} is consistent across app.json, .homeycompose, package.json and the changelog.`);
