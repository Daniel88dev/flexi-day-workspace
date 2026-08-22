#!/usr/bin/env node
/**
 * Verifies that every relative link in this repo's Markdown points at a file that exists.
 *
 * Links into the sub-repo directories are skipped deliberately: they are separate clones,
 * gitignored here, and absent on a CI runner — checking them would fail every run.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative, join } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const SUB_REPOS = ["flexi-day", "flexi-day-be", "flexi-day-emails", "todo"];

const markdownFiles = execFileSync("git", ["ls-files", "*.md", "**/*.md"], {
  cwd: ROOT,
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

// [text](target) — target stops at whitespace so `(path "title")` keeps only the path.
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

const failures = [];

for (const file of markdownFiles) {
  const body = readFileSync(join(ROOT, file), "utf8");

  for (const [, rawTarget] of body.matchAll(LINK)) {
    const target = rawTarget.split("#")[0];
    if (!target) continue; // pure anchor
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:, mailto:, etc.

    const resolved = target.startsWith("/")
      ? join(ROOT, target)
      : resolve(join(ROOT, dirname(file)), target);

    const rel = relative(ROOT, resolved);
    if (SUB_REPOS.some((dir) => rel === dir || rel.startsWith(`${dir}/`))) continue;
    if (rel.startsWith("..")) continue; // outside the repo; not ours to verify

    if (!existsSync(resolved)) failures.push(`${file} → ${rawTarget}`);
  }
}

if (failures.length) {
  console.error("Broken relative links:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`Checked ${markdownFiles.length} Markdown files — all relative links resolve.`);
