#!/usr/bin/env node
/**
 * check-docs.mjs - repository documentation checker (pure Node, ESM, no third-party deps).
 *
 * What it verifies:
 *   1. Every relative Markdown link in every *.md file of the repository resolves
 *      to an existing file. Files under node_modules, dist, .git, output and
 *      tests/reports are excluded from the scan. Link targets starting with
 *      http:/https:/mailto: or being an in-page anchor (#...) are skipped; when a
 *      target carries a #anchor, only its path part is validated. The path is
 *      resolved against the directory of the containing .md file; on Windows the
 *      existence check is case-insensitive.
 *   2. docs/archive/*.md go through the same link check (they are included by the
 *      general scan; the script asserts that explicitly).
 *   3. The decision table in docs/DECISIONS.md (header containing
 *      编号|状态|决策|日期|负责人) must list its D-xxx ids in strictly descending
 *      numeric order (newest decision first).
 *
 * Exit code 0 when everything passes, 1 when any problem is found. Output is
 * plain ASCII (English) on purpose, so it renders correctly in any console.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

const EXCLUDED_SEGMENTS = new Set(['node_modules', 'dist', '.git', 'output']);

/** relPath is relative to ROOT and uses '/' separators. */
function isExcludedPath(relPath) {
  const parts = relPath.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    if (EXCLUDED_SEGMENTS.has(parts[i])) return true;
    // tests/reports is excluded as a pair; other tests/* directories stay scanned.
    if (parts[i] === 'tests' && parts[i + 1] === 'reports') return true;
  }
  return false;
}

/** Recursively collect every *.md file under dir (absolute paths, sorted). */
function collectMdFiles(dir) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = abs.slice(ROOT.length + 1).split(sep).join('/');
    if (isExcludedPath(rel)) continue;
    if (entry.isDirectory()) found.push(...collectMdFiles(abs));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) found.push(abs);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Link checking
// ---------------------------------------------------------------------------

const LINK_RE = /\]\(([^)]*)\)/g;

/** True when the target must not be resolved as a file. */
function isSkippedTarget(target) {
  if (target === '') return true;
  if (/^(https?|mailto):/i.test(target)) return true;
  if (target.startsWith('#')) return true; // in-page anchor only (incl. bare '#')
  return false;
}

/** Strip an optional Markdown link title: url "title" or url 'title'. */
function stripTitle(target) {
  const m = target.match(/^(\S+)\s+["'].*["']$/);
  return m ? m[1] : target;
}

/** Existence check; on Windows the filesystem lookup is case-insensitive. */
function pathExists(absPath) {
  if (existsSync(absPath)) return true;
  if (process.platform === 'win32') {
    // Explicit case-insensitive fallback (belt and braces for Windows).
    const dir = dirname(absPath);
    const base = basename(absPath).toLowerCase();
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      return false;
    }
    return names.some((name) => name.toLowerCase() === base);
  }
  return false;
}

/**
 * Check every relative link in one markdown file.
 * Returns { broken: Array<{file, line, target, resolved}>, linkCount: number }.
 */
function checkFileLinks(mdFile) {
  const relFile = mdFile.slice(ROOT.length + 1).split(sep).join('/');
  const broken = [];
  let linkCount = 0;
  let content;
  try {
    content = readFileSync(mdFile, 'utf8');
  } catch (err) {
    return {
      broken: [{ file: relFile, line: 0, target: '(unreadable)', resolved: String(err) }],
      linkCount: 0,
    };
  }

  LINK_RE.lastIndex = 0;
  let m;
  while ((m = LINK_RE.exec(content)) !== null) {
    const target = stripTitle(m[1].trim());
    if (isSkippedTarget(target)) continue;

    // Only the path part matters; the #anchor is ignored for existence checks.
    const hashIndex = target.indexOf('#');
    const pathPart = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
    if (pathPart === '') continue; // target was nothing but an anchor

    const normalized = pathPart.replace(/\\/g, '/');
    const resolved = resolve(dirname(mdFile), normalized);
    const line = content.slice(0, m.index).split('\n').length;
    linkCount += 1;
    if (!pathExists(resolved)) {
      broken.push({ file: relFile, line, target, resolved });
    }
  }
  return { broken, linkCount };
}

/** Check links across every markdown file. */
function checkLinks(mdFiles) {
  const broken = [];
  let linkCount = 0;
  for (const mdFile of mdFiles) {
    const result = checkFileLinks(mdFile);
    broken.push(...result.broken);
    linkCount += result.linkCount;
  }
  return { broken, linkCount };
}

// ---------------------------------------------------------------------------
// DECISIONS table ordering
// ---------------------------------------------------------------------------

const DECISIONS_PATH = join(ROOT, 'docs', 'DECISIONS.md');
const DECISION_RE = /D-(\d+)/;

/** Parse docs/DECISIONS.md and verify strictly descending D-xxx order. */
function checkDecisionsOrder() {
  let content;
  try {
    content = readFileSync(DECISIONS_PATH, 'utf8');
  } catch (err) {
    return {
      problems: [`DECISIONS: cannot read ${DECISIONS_PATH} (${err.code || err.message})`],
      rows: 0,
    };
  }

  const lines = content.split('\n');
  const headerIndex = lines.findIndex(
    (line) =>
      line.includes('编号') &&
      line.includes('状态') &&
      line.includes('决策') &&
      line.includes('日期') &&
      line.includes('负责人'),
  );
  if (headerIndex === -1) {
    return {
      problems: ['DECISIONS: decision table header (编号|状态|决策|日期|负责人) not found'],
      rows: 0,
    };
  }

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) continue;
    const m = line.match(DECISION_RE);
    if (!m) continue; // separator rows and non-decision lines have no D-xxx id
    rows.push({ num: Number(m[1]), id: `D-${m[1]}`, line: i + 1 });
  }

  const problems = [];
  for (let i = 0; i + 1 < rows.length; i += 1) {
    if (rows[i].num <= rows[i + 1].num) {
      problems.push(
        `DECISIONS: line ${rows[i].line} (${rows[i].id}, value ${rows[i].num}) is not strictly greater than line ${rows[i + 1].line} (${rows[i + 1].id}, value ${rows[i + 1].num}); expected strictly descending order`,
      );
    }
  }
  return { problems, rows: rows.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const mdFiles = collectMdFiles(ROOT);
  // docs/archive/*.md are part of the general scan; assert that explicitly.
  const archiveFiles = mdFiles.filter((f) => f.split(sep).join('/').includes('/docs/archive/'));

  const { broken, linkCount } = checkLinks(mdFiles);
  const { problems: decisionProblems, rows: decisionRows } = checkDecisionsOrder();

  const problems = [];
  for (const b of broken) {
    problems.push(`BROKEN LINK: ${b.file}:${b.line} -> ${b.target} (resolved: ${b.resolved})`);
  }
  problems.push(...decisionProblems);

  if (problems.length === 0) {
    console.log(
      `check-docs OK: ${mdFiles.length} markdown file(s) (${archiveFiles.length} in docs/archive), ` +
        `${linkCount} relative link(s) checked, DECISIONS table (${decisionRows} rows) strictly descending`,
    );
    process.exitCode = 0;
    return;
  }

  console.log('check-docs FAIL');
  for (const p of problems) console.log(`  ${p}`);
  console.log(`check-docs: ${problems.length} problem(s) found`);
  process.exitCode = 1;
}

main();
