import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXCLUDED = new Set(["frontend/src/lib/tauri.ts"]);

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

function walk(dir, base = dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath, base));
    } else if (entry.isFile()) {
      files.push(path.relative(base, fullPath).replaceAll(path.sep, "/"));
    }
  }
  return files;
}

function hashFile(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function copyFile(source, target) {
  writeFileSync(target, readFileSync(source));
}

const repoRoot = resolveRepoRoot();
const counterpartRoot = resolveCounterpart(repoRoot);
const writeMode = process.argv.includes("--write");

if (!existsSync(counterpartRoot)) {
  console.log(`Frontend parity check skipped: counterpart repo not found at ${counterpartRoot}`);
  process.exit(0);
}

const srcRoot = path.join(repoRoot, "frontend/src");
const counterpartSrcRoot = path.join(counterpartRoot, "frontend/src");

if (!existsSync(srcRoot) || !existsSync(counterpartSrcRoot)) {
  console.error("Frontend parity check failed: both repos must contain frontend/src.");
  process.exit(1);
}

const localFiles = walk(srcRoot).map((file) => `frontend/src/${file}`);
const counterpartFiles = new Set(walk(counterpartSrcRoot).map((file) => `frontend/src/${file}`));
const sharedFiles = localFiles
  .filter((file) => !EXCLUDED.has(file))
  .filter((file) => counterpartFiles.has(file))
  .sort();

const differences = [];
for (const file of sharedFiles) {
  const localPath = path.join(repoRoot, file);
  const counterpartPath = path.join(counterpartRoot, file);
  if (!statSync(localPath).isFile() || !statSync(counterpartPath).isFile()) continue;
  if (hashFile(localPath) === hashFile(counterpartPath)) continue;

  differences.push(file);
  if (writeMode) {
    copyFile(counterpartPath, localPath);
  }
}

if (differences.length === 0) {
  console.log(`Frontend parity OK: ${sharedFiles.length} shared files match.`);
  process.exit(0);
}

if (writeMode) {
  console.log(`Frontend parity fixed from counterpart repo: ${differences.length} files updated.`);
  process.exit(0);
}

console.error("Frontend parity check failed. Shared files differ:");
for (const file of differences) {
  console.error(`- ${file}`);
}
console.error("Run npm run check:parity -- --write from frontend/ to copy from the counterpart repo.");
process.exit(1);
