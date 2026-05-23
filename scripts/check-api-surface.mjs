import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function resolveRepoRoot() {
  const cwd = process.cwd();
  return path.basename(cwd) === "frontend" ? path.dirname(cwd) : cwd;
}

function resolveCounterpart(repoRoot) {
  const parent = path.dirname(repoRoot);
  const repoName = path.basename(repoRoot);
  const counterpartName =
    repoName === "DY_video_downloader" ? "douyin-downloader-rust" : "DY_video_downloader";
  return path.join(parent, counterpartName);
}

function exportedFunctions(source) {
  const names = new Set();
  const matcher = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g;
  let match = matcher.exec(source);
  while (match) {
    names.add(match[1]);
    match = matcher.exec(source);
  }
  return names;
}

function diffSets(left, right) {
  return [...left].filter((item) => !right.has(item)).sort();
}

const repoRoot = resolveRepoRoot();
const counterpartRoot = resolveCounterpart(repoRoot);

if (!existsSync(counterpartRoot)) {
  console.log(`API surface check skipped: counterpart repo not found at ${counterpartRoot}`);
  process.exit(0);
}

const localFile = path.join(repoRoot, "frontend/src/lib/tauri.ts");
const counterpartFile = path.join(counterpartRoot, "frontend/src/lib/tauri.ts");

const localExports = exportedFunctions(readFileSync(localFile, "utf-8"));
const counterpartExports = exportedFunctions(readFileSync(counterpartFile, "utf-8"));
const onlyLocal = diffSets(localExports, counterpartExports);
const onlyCounterpart = diffSets(counterpartExports, localExports);

if (onlyLocal.length === 0 && onlyCounterpart.length === 0) {
  console.log(`API surface OK: ${localExports.size} exported functions match.`);
  process.exit(0);
}

console.error("API surface check failed: frontend/src/lib/tauri.ts exports differ.");
if (onlyLocal.length > 0) {
  console.error("Only in this repo:");
  for (const item of onlyLocal) console.error(`- ${item}`);
}
if (onlyCounterpart.length > 0) {
  console.error("Only in counterpart repo:");
  for (const item of onlyCounterpart) console.error(`- ${item}`);
}
process.exit(1);
