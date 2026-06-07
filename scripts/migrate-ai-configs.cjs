const Database = require('better-sqlite3');
const db = new Database('novel.db');
const cols = db.prepare("PRAGMA table_info(ai_configs)").all().map(c => c.name);
console.log('Existing cols:', cols);
if (!cols.includes('model_type')) {
  db.prepare("ALTER TABLE ai_configs ADD COLUMN model_type TEXT DEFAULT 'text' NOT NULL").run();
  console.log('Added model_type');
}
if (!cols.includes('extra_config')) {
  db.prepare("ALTER TABLE ai_configs ADD COLUMN extra_config TEXT").run();
  console.log('Added extra_config');
}
console.log('Final cols:', db.prepare("PRAGMA table_info(ai_configs)").all().map(c => c.name));
