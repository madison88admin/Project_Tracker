const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'data', 'db.json');
const destinationDir = path.join(root, 'data', 'backups');
const keep = Math.max(1, Number(process.env.MDT_BACKUP_KEEP || 30));

if (!fs.existsSync(source)) {
  console.log('Backup skipped: data/db.json does not exist yet.');
  process.exit(0);
}

fs.mkdirSync(destinationDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const target = path.join(destinationDir, `db-${stamp}.json`);
fs.copyFileSync(source, target);

const backups = fs.readdirSync(destinationDir)
  .filter(name => /^db-.*\.json$/.test(name))
  .sort()
  .reverse();
for (const old of backups.slice(keep)) fs.rmSync(path.join(destinationDir, old), { force: true });
console.log(`Database backup created: ${path.relative(root, target)}`);
