#!/usr/bin/env node
// Turns CHANGELOG-USERS.md, the user-facing changelog, into the JSON that the
// "Novidades do isaCloud" plugin embeds in the bundle.
//
//   node scripts/generate-changelog-json.mjs           rewrite changelog.json
//   node scripts/generate-changelog-json.mjs --check   exit 1 if it is out of date
//
// The release build runs --check first (see isacloud/build.sh), so a release
// whose changelog wasn't regenerated never ships.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE = join(ROOT, 'CHANGELOG-USERS.md');
const OUTPUT = join(ROOT, 'src/plugins/isacloud-changelog/changelog.json');
const CONSTANTS = join(ROOT, 'src/headless/shared/constants.js');

// "### v15-38 — 23/11/2026", with an em dash, an en dash or a hyphen.
const HEADING = /^###\s+(.+?)\s*[—–-]\s*(\d{2}\/\d{2}\/\d{4})\s*$/;
// A leading bold title, optionally preceded by an emoji (any run without
// letters or digits). The title itself contains no asterisks.
const LEADING_TITLE = /^([^\p{L}\p{N}]*)\*\*([^*]+)\*\*\s*(.*)$/u;
const VERSION = /^v\d+(?:[.-]\d+)*$/;

/**
 * @typedef {object} ChangelogItem
 * @property {string} title The bold lead-in without its trailing colon, or "".
 * @property {string} text What follows the title.
 *
 * @typedef {object} ChangelogRelease
 * @property {string} version
 * @property {string} date In DD/MM/YYYY, as written in the Markdown.
 * @property {ChangelogItem[]} items
 */

/**
 * Splits a release bullet into its title and text.
 * @param {string} raw The bullet's content, continuation lines already joined.
 * @returns {ChangelogItem}
 */
function parseItem(raw) {
    const item = raw.replace(/`/g, '').replace(/\s+/g, ' ').trim();
    const match = item.match(LEADING_TITLE);
    if (!match) return { title: '', text: item };
    // Keep the leading emoji with the title, so the view shows it in front of
    // the bold lead-in, as in the Android app.
    const title = `${match[1]}${match[2]}`.replace(/:$/, '').trim();
    return { title, text: match[3].trim() };
}

/**
 * Reads every "### version — date" section and its bullets, newest first.
 * The document intro, the "##" heading and anything after the last release
 * (such as the closing note) are ignored.
 * @param {string} markdown
 * @returns {ChangelogRelease[]}
 */
function parse(markdown) {
    /** @type {ChangelogRelease[]} */
    const releases = [];
    /** @type {string[]|null} Raw lines of the item being collected. */
    let lines = null;
    /** @type {ChangelogRelease|null} */
    let release = null;

    const flush = () => {
        if (!lines) return;
        release.items.push(parseItem(lines.join(' ')));
        lines = null;
    };

    for (const line of markdown.split(/\r?\n/)) {
        const heading = line.match(HEADING);
        if (heading) {
            flush();
            release = { version: heading[1].trim(), date: heading[2], items: [] };
            releases.push(release);
        } else if (!release) {
            continue; // The intro and the "## 📅 Todas as releases" heading.
        } else if (line.startsWith('#')) {
            flush();
            release = null;
        } else if (/^-\s+/.test(line)) {
            flush();
            lines = [line.replace(/^-\s+/, '')];
        } else if (lines && /^\s+\S/.test(line)) {
            lines.push(line.trim()); // A wrapped continuation line.
        }
        // Blank lines and other blocks inside a release end nothing by
        // themselves: a new bullet or heading does.
    }
    flush();
    return releases;
}

/** @param {string} version */
function versionParts(version) {
    return version.replace(/^v/, '').split(/[.-]/).map(Number);
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean} Whether release a is newer than release b.
 */
function isNewer(a, b) {
    const [x, y] = [versionParts(a), versionParts(b)];
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const [left, right] = [x[i] ?? 0, y[i] ?? 0];
        if (left !== right) return left > right;
    }
    return false;
}

/**
 * Checks that the changelog is complete and ordered, and that it covers the
 * version currently being released.
 * @param {ChangelogRelease[]} releases
 * @returns {string} The newest version.
 */
function validate(releases) {
    if (!releases.length) {
        throw new Error(`${relative(ROOT, SOURCE)} has no release heading of the form "### v15-38 — 23/11/2026".`);
    }
    const seen = new Set();
    for (const [i, release] of releases.entries()) {
        if (!release.version) throw new Error(`A release heading has no version: ${JSON.stringify(release)}`);
        if (!VERSION.test(release.version)) {
            throw new Error(`Release "${release.version}" isn't a version like v15-38.`);
        }
        if (!release.date) throw new Error(`Release ${release.version} has no date.`);
        if (!release.items.length) throw new Error(`Release ${release.version} has no items.`);
        if (seen.has(release.version)) throw new Error(`Release ${release.version} appears more than once.`);
        seen.add(release.version);

        const previous = releases[i - 1];
        if (previous && !isNewer(previous.version, release.version)) {
            throw new Error(`Releases must be newest first, but ${release.version} comes after ${previous.version}.`);
        }
    }

    const newest = releases[0].version;
    const constants = readFileSync(CONSTANTS, 'utf8');
    const declared = constants.match(/export const VERSION_NAME\s*=\s*'([^']+)'/)?.[1];
    if (!declared) throw new Error(`Couldn't find VERSION_NAME in ${relative(ROOT, CONSTANTS)}.`);
    if (newest !== declared) {
        throw new Error(
            `The newest release is ${newest}, but VERSION_NAME in ${relative(ROOT, CONSTANTS)} is ${declared}. ` +
                `Add the ${declared} release to ${relative(ROOT, SOURCE)}.`,
        );
    }
    return newest;
}

/**
 * @returns {{ json: string, releases: ChangelogRelease[], newest: string }}
 */
function generate() {
    const releases = parse(readFileSync(SOURCE, 'utf8'));
    const newest = validate(releases);
    return { json: `${JSON.stringify({ releases }, null, 2)}\n`, releases, newest };
}

function main() {
    const { json, releases, newest } = generate();
    const shown = relative(ROOT, OUTPUT);

    if (process.argv.includes('--check')) {
        let committed;
        try {
            committed = readFileSync(OUTPUT, 'utf8');
        } catch {
            throw new Error(`${shown} is missing. Run \`node scripts/generate-changelog-json.mjs\` and commit it.`);
        }
        if (committed !== json) {
            throw new Error(`${shown} is out of date. Run \`node scripts/generate-changelog-json.mjs\` and commit it.`);
        }
        console.log(`${shown} is up to date: ${releases.length} releases, newest ${newest}.`);
        return;
    }

    writeFileSync(OUTPUT, json);
    console.log(`Wrote ${shown}: ${releases.length} releases, newest ${newest}.`);
}

try {
    main();
} catch (e) {
    console.error(e.message);
    process.exitCode = 1;
}
