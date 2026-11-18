import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, '..');
const migrationsDir = path.join(backendDir, 'src', 'db', 'migrations');
const files = (await fs.readdir(migrationsDir))
  .filter((file) => file.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b, 'en'));

const prefixGroups = new Map();
const destructivePatterns = [
  /\bdrop\s+table\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
];
const reviewPatterns = [/\bdrop\s+column\b/i, /\bdrop\s+function\b/i];

for (const file of files) {
  const match = file.match(/^(\d+(?:[a-z])?)_/i);
  if (match) {
    const group = prefixGroups.get(match[1]) || [];
    group.push(file);
    prefixGroups.set(match[1], group);
  }
}

console.log(`Migration directory: ${migrationsDir}`);
console.log(`Ordered migrations (${files.length}):`);
files.forEach((file, index) => console.log(`${String(index + 1).padStart(2, '0')}. ${file}`));

const duplicatePrefixes = [...prefixGroups.entries()].filter(([, group]) => group.length > 1);
if (duplicatePrefixes.length) {
  console.warn('\nWARNING: duplicate migration prefixes require explicit ordering review:');
  duplicatePrefixes.forEach(([prefix, group]) => console.warn(`  ${prefix}: ${group.join(', ')}`));
}

const destructive = [];
const reviewRequired = [];
for (const file of files) {
  const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
  if (destructivePatterns.some((pattern) => pattern.test(sql))) destructive.push(file);
  if (reviewPatterns.some((pattern) => pattern.test(sql))) reviewRequired.push(file);
}

if (destructive.length) {
  console.warn('\nBLOCKED FOR AUTOMATIC STAGING EXECUTION: destructive SQL detected:');
  destructive.forEach((file) => console.warn(`  ${file}`));
}
if (reviewRequired.length) {
  console.warn('\nREVIEW REQUIRED: reversible/structural drop statements detected:');
  reviewRequired.forEach((file) => console.warn(`  ${file}`));
}

console.log('\nPreflight only: no database connection was opened and no SQL was executed.');
if (duplicatePrefixes.length || destructive.length) process.exitCode = 1;
