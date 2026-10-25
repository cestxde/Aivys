// Release notes for a tag, from the commits since the previous tag: `feat:`
// under "New", `fix:` under "Fixed"; other commits (docs, version bumps) are
// left out. Prints Markdown, which the release workflow puts on the GitHub
// release and the app shows in its update dialog.
//
//   node scripts/release-notes.js v0.7.0
import { execFileSync } from 'child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const tag = process.argv[2] || git('describe', '--tags', '--abbrev=0');
let previous = null;
try {
  previous = git('describe', '--tags', '--abbrev=0', `${tag}^`);
} catch {
  // The first tag: everything up to it.
}

const subjects = git('log', '--no-merges', '--format=%s', previous ? `${previous}..${tag}` : tag)
  .split('\n')
  .filter(Boolean);

const sections = [
  ['New', 'feat'],
  ['Fixed', 'fix'],
];
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const out = [];
for (const [title, type] of sections) {
  const items = subjects
    .map((subject) => subject.match(new RegExp(`^${type}(?:\\([^)]*\\))?!?:\\s*(.+)$`)))
    .filter(Boolean)
    .map((match) => `- ${capitalize(match[1])}`);
  if (items.length === 0) continue;
  if (out.length > 0) out.push('');
  out.push(`### ${title}`, ...items);
}

console.log(out.length > 0 ? out.join('\n') : 'Maintenance release.');
