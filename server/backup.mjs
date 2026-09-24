import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const src = process.argv[2];
const dest = process.argv[3];
if (!src || !dest) { console.error('usage: node backup.mjs <src.db> <dest.db>'); process.exit(1); }
fs.mkdirSync(path.dirname(dest), { recursive: true });
const db = new DatabaseSync(src);
// Consistent snapshot without stopping the server (VACUUM INTO is atomic).
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
db.close();
console.log('backup ->', dest);
