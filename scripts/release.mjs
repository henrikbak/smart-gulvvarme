#!/usr/bin/env node
'use strict';

/**
 * Cut a release with one command.
 *
 * `npm run release` is the whole thing: it builds and checks the tagged tree,
 * validates the Homey app, confirms the tag matches app.json and the changelog,
 * then creates (or updates, so it is re-runnable) the GitHub release with the
 * changelog as its notes.
 *
 * The version comes from the pushed tag in CI (GITHUB_REF_NAME), or from the
 * tag on HEAD when run locally, or from a tag passed as the first argument.
 *
 * Usage: npm run release              (in CI, or with a tag on HEAD)
 *        npm run release -- v1.2.0
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const capture = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

let tag = process.env.GITHUB_REF_NAME || process.argv[2];
if (!tag) {
  try {
    tag = capture('git', ['describe', '--tags', '--exact-match', 'HEAD']);
  } catch {
    console.error('No version given and HEAD has no tag. Pass one: npm run release -- v1.2.0');
    process.exit(1);
  }
}

if (!/^v\d/.test(tag)) {
  console.error(`Expected a version tag like "v1.2.0", got "${tag}"`);
  process.exit(1);
}

console.log(`Releasing ${tag}\n`);

// A tag can sit on any commit, so the tagged tree is checked here rather than
// trusting whatever ran when the branch was pushed.
run('npm', ['run', 'build']); // typecheck
run('npm', ['run', 'lint']);
run('node', ['--test', '.homeybuild/test/**/*.test.js']);
run('npm', ['run', 'validate']); // homey app validate --level publish

// Stops a release that would name a different version than the published app,
// and catches a tag with no changelog behind it.
run('node', ['scripts/check-version.mjs', tag]);

// Same words the Homey App Store shows, so the two never drift.
const notesFile = join(tmpdir(), `release-notes-${tag}.md`);
writeFileSync(notesFile, `${capture('node', ['scripts/release-notes.mjs', tag])}\n`);

let exists = false;
try {
  execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' });
  exists = true;
} catch {
  // no release for this tag yet
}

run('gh', [
  'release',
  exists ? 'edit' : 'create',
  tag,
  ...(exists ? [] : ['--verify-tag']),
  '--title', tag,
  '--notes-file', notesFile,
]);

console.log(`\n${exists ? 'Updated' : 'Created'} GitHub release ${tag}`);
