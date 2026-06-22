import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

// Setup type safety for global caching in Next.js development and server processes
const globalForSqlite = globalThis as unknown as {
  sqlite: Database.Database | undefined;
  db: ReturnType<typeof drizzle> | undefined;
  dbInitialized: boolean | undefined;
};

export const sqlite = globalForSqlite.sqlite ?? (() => {
  const s = new Database('novel.db');
  // 并发写入支持：WAL 模式允许多读一写；busy_timeout 等待锁释放而不是立即抛 SQLITE_BUSY
  s.pragma('journal_mode = WAL');
  s.pragma('busy_timeout = 10000');
  globalForSqlite.sqlite = s;
  return s;
})();

export const db = globalForSqlite.db ?? (() => {
  const d = drizzle(sqlite);
  globalForSqlite.db = d;
  return d;
})();

export async function getDb() {
  return db;
}

if (!globalForSqlite.dbInitialized) {
  console.log('[Database] First-time initialization/migration of SQLite database in this process.');
  
  sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nickname TEXT,
    avatar TEXT,
    member_level_id TEXT,
    member_expire_at TEXT,
    member_status TEXT DEFAULT 'inactive',
    is_active INTEGER DEFAULT 1 NOT NULL,
    role TEXT DEFAULT 'user' NOT NULL,
    chapter_limit INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );
  
  CREATE TABLE IF NOT EXISTS member_levels (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    price INTEGER DEFAULT 0 NOT NULL,
    duration INTEGER DEFAULT 30 NOT NULL,
    features TEXT,
    chapter_limit INTEGER DEFAULT 10 NOT NULL,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    is_active INTEGER DEFAULT 1 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS member_orders (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    member_level_id TEXT NOT NULL,
    order_no TEXT NOT NULL UNIQUE,
    amount INTEGER DEFAULT 0 NOT NULL,
    payment_method TEXT,
    payment_status TEXT DEFAULT 'pending' NOT NULL,
    payment_time TEXT,
    start_time TEXT,
    end_time TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS novels (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    gender_target TEXT,
    narrative_perspective TEXT,
    tone TEXT,
    protagonist TEXT,
    supporting_character_name TEXT,
    total_chapters INTEGER DEFAULT 0 NOT NULL,
    current_chapters INTEGER DEFAULT 0 NOT NULL,
    status TEXT DEFAULT 'draft',
    idea TEXT,
    structure TEXT,
    chapters TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );
  
  CREATE TABLE IF NOT EXISTS novel_plots (
    id TEXT PRIMARY KEY NOT NULL,
    novel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    main_plot TEXT,
    emotional_curve TEXT,
    key_conflicts TEXT,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS novel_chapter_hooks (
    id TEXT PRIMARY KEY NOT NULL,
    novel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    title TEXT,
    hook TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS novel_characters (
    id TEXT PRIMARY KEY NOT NULL,
    novel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'supporting',
    gender TEXT,
    description TEXT,
    personality TEXT,
    appearance TEXT,
    background TEXT,
    relationships TEXT,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS novel_scenes (
    id TEXT PRIMARY KEY NOT NULL,
    novel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    atmosphere TEXT,
    related_chapters TEXT,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS novel_items (
    id TEXT PRIMARY KEY NOT NULL,
    novel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    significance TEXT,
    related_chapters TEXT,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS novel_character_relationships (
    id TEXT PRIMARY KEY NOT NULL,
    novel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    from_character TEXT NOT NULL,
    to_character TEXT NOT NULL,
    relationship TEXT,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scripts (
    id TEXT PRIMARY KEY NOT NULL,
    novel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    chapters TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );
  
  CREATE TABLE IF NOT EXISTS short_dramas (
    id TEXT PRIMARY KEY NOT NULL,
    novel_id TEXT,
    script_id TEXT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    target_audience TEXT,
    total_episodes INTEGER DEFAULT 0 NOT NULL,
    current_episodes INTEGER DEFAULT 0 NOT NULL,
    episode_duration INTEGER DEFAULT 60,
    status TEXT DEFAULT 'draft',
    cover_image TEXT,
    tags TEXT,
    style TEXT,
    platform TEXT,
    character_style TEXT,
    scene_style TEXT,
    item_style TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS short_drama_episodes (
    id TEXT PRIMARY KEY NOT NULL,
    drama_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    episode_number INTEGER NOT NULL,
    title TEXT,
    synopsis TEXT,
    screenplay TEXT,
    scenes TEXT,
    dialogues TEXT,
    directions TEXT,
    image_prompts TEXT,
    video_prompts TEXT,
    duration INTEGER,
    status TEXT DEFAULT 'draft',
    source_chapter INTEGER,
    source_script_chapter_index INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS drama_characters (
    id TEXT PRIMARY KEY NOT NULL,
    drama_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'supporting',
    description TEXT,
    personality TEXT,
    appearance TEXT,
    voice_id TEXT,
    voice_provider TEXT,
    voice_config TEXT,
    image_url TEXT,
    image_prompt TEXT,
    reference_images TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS drama_scenes (
    id TEXT PRIMARY KEY NOT NULL,
    drama_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    atmosphere TEXT,
    image_url TEXT,
    image_prompt TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS drama_items (
    id TEXT PRIMARY KEY NOT NULL,
    drama_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    significance TEXT,
    image_url TEXT,
    image_prompt TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS drama_storyboards (
    id TEXT PRIMARY KEY NOT NULL,
    drama_id TEXT NOT NULL,
    episode_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    shot_number INTEGER NOT NULL,
    shot_type TEXT DEFAULT 'storyboard',
    scene_description TEXT,
    camera_angle TEXT,
    camera_movement TEXT,
    dialogue TEXT,
    voiceover TEXT,
    sound_effects TEXT,
    character_ids TEXT,
    image_prompt TEXT,
    image_url TEXT,
    video_prompt TEXT,
    video_url TEXT,
    audio_url TEXT,
    tts_text TEXT,
    tts_voice_id TEXT,
    subtitle TEXT,
    duration INTEGER DEFAULT 3,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS drama_assets (
    id TEXT PRIMARY KEY NOT NULL,
    drama_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT,
    local_path TEXT,
    mime_type TEXT,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    duration INTEGER,
    metadata TEXT,
    related_shot_id TEXT,
    related_episode_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS drama_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    drama_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    target_id TEXT,
    provider TEXT,
    model TEXT,
    status TEXT DEFAULT 'pending' NOT NULL,
    progress INTEGER DEFAULT 0,
    input TEXT,
    output TEXT,
    error TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_configs (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    api_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT NOT NULL,
    temperature INTEGER DEFAULT 85 NOT NULL,
    max_tokens INTEGER DEFAULT 8192,
    scope TEXT DEFAULT 'user' NOT NULL,
    is_default INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    model_type TEXT DEFAULT 'text' NOT NULL,
    extra_config TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );
  
  CREATE TABLE IF NOT EXISTS model_prompts (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    module TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    user_prompt TEXT,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    is_active INTEGER DEFAULT 1 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );
  
  CREATE TABLE IF NOT EXISTS invite_codes (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    level_type TEXT,
    member_level_id TEXT,
    max_uses INTEGER DEFAULT 1 NOT NULL,
    current_uses INTEGER DEFAULT 0 NOT NULL,
    is_used_up INTEGER DEFAULT 0 NOT NULL,
    is_active INTEGER DEFAULT 1 NOT NULL,
    expires_at TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );
  
  CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
  CREATE INDEX IF NOT EXISTS users_username_idx ON users (username);
  CREATE INDEX IF NOT EXISTS member_levels_code_idx ON member_levels (code);
  CREATE INDEX IF NOT EXISTS member_levels_sort_idx ON member_levels (sort_order);
  CREATE INDEX IF NOT EXISTS member_orders_user_idx ON member_orders (user_id);
  CREATE INDEX IF NOT EXISTS member_orders_order_no_idx ON member_orders (order_no);
  CREATE INDEX IF NOT EXISTS novels_user_id_idx ON novels (user_id);
  CREATE INDEX IF NOT EXISTS novels_category_idx ON novels (category);
  CREATE INDEX IF NOT EXISTS novels_created_at_idx ON novels (created_at);
  CREATE INDEX IF NOT EXISTS novels_status_idx ON novels (status);
  CREATE INDEX IF NOT EXISTS novel_plots_novel_id_idx ON novel_plots (novel_id);
  CREATE INDEX IF NOT EXISTS novel_plots_user_id_idx ON novel_plots (user_id);
  CREATE INDEX IF NOT EXISTS novel_chapter_hooks_novel_id_idx ON novel_chapter_hooks (novel_id);
  CREATE INDEX IF NOT EXISTS novel_chapter_hooks_user_id_idx ON novel_chapter_hooks (user_id);
  CREATE INDEX IF NOT EXISTS novel_chapter_hooks_chapter_num_idx ON novel_chapter_hooks (novel_id, chapter_number);
  CREATE INDEX IF NOT EXISTS novel_characters_novel_id_idx ON novel_characters (novel_id);
  CREATE INDEX IF NOT EXISTS novel_characters_user_id_idx ON novel_characters (user_id);
  CREATE INDEX IF NOT EXISTS novel_characters_role_idx ON novel_characters (role);
  CREATE INDEX IF NOT EXISTS novel_scenes_novel_id_idx ON novel_scenes (novel_id);
  CREATE INDEX IF NOT EXISTS novel_scenes_user_id_idx ON novel_scenes (user_id);
  CREATE INDEX IF NOT EXISTS novel_items_novel_id_idx ON novel_items (novel_id);
  CREATE INDEX IF NOT EXISTS novel_items_user_id_idx ON novel_items (user_id);
  CREATE INDEX IF NOT EXISTS novel_character_relationships_novel_id_idx ON novel_character_relationships (novel_id);
  CREATE INDEX IF NOT EXISTS novel_character_relationships_user_id_idx ON novel_character_relationships (user_id);
  CREATE INDEX IF NOT EXISTS scripts_novel_id_idx ON scripts (novel_id);
  CREATE INDEX IF NOT EXISTS scripts_user_id_idx ON scripts (user_id);
  CREATE INDEX IF NOT EXISTS ai_configs_user_id_idx ON ai_configs (user_id);
  CREATE INDEX IF NOT EXISTS ai_configs_provider_idx ON ai_configs (provider);
  CREATE INDEX IF NOT EXISTS ai_configs_scope_idx ON ai_configs (scope);
  CREATE INDEX IF NOT EXISTS ai_configs_model_type_idx ON ai_configs (model_type);
  CREATE INDEX IF NOT EXISTS model_prompts_code_idx ON model_prompts (code);
  CREATE INDEX IF NOT EXISTS model_prompts_module_idx ON model_prompts (module);
  CREATE INDEX IF NOT EXISTS invite_codes_code_idx ON invite_codes (code);
  CREATE INDEX IF NOT EXISTS invite_codes_status_idx ON invite_codes (is_active);
  CREATE INDEX IF NOT EXISTS invite_codes_level_type_idx ON invite_codes (level_type);
  CREATE INDEX IF NOT EXISTS short_dramas_user_id_idx ON short_dramas (user_id);
  CREATE INDEX IF NOT EXISTS short_dramas_novel_id_idx ON short_dramas (novel_id);
  CREATE INDEX IF NOT EXISTS short_dramas_status_idx ON short_dramas (status);
  CREATE INDEX IF NOT EXISTS short_drama_episodes_drama_id_idx ON short_drama_episodes (drama_id);
  CREATE INDEX IF NOT EXISTS short_drama_episodes_user_id_idx ON short_drama_episodes (user_id);
  CREATE INDEX IF NOT EXISTS short_drama_episodes_number_idx ON short_drama_episodes (drama_id, episode_number);
  CREATE INDEX IF NOT EXISTS drama_characters_drama_id_idx ON drama_characters (drama_id);
  CREATE INDEX IF NOT EXISTS drama_characters_user_id_idx ON drama_characters (user_id);
  CREATE INDEX IF NOT EXISTS drama_scenes_drama_id_idx ON drama_scenes (drama_id);
  CREATE INDEX IF NOT EXISTS drama_scenes_user_id_idx ON drama_scenes (user_id);
  CREATE INDEX IF NOT EXISTS drama_items_drama_id_idx ON drama_items (drama_id);
  CREATE INDEX IF NOT EXISTS drama_items_user_id_idx ON drama_items (user_id);
  CREATE INDEX IF NOT EXISTS drama_storyboards_drama_id_idx ON drama_storyboards (drama_id);
  CREATE INDEX IF NOT EXISTS drama_storyboards_episode_id_idx ON drama_storyboards (episode_id);
  CREATE INDEX IF NOT EXISTS drama_storyboards_user_id_idx ON drama_storyboards (user_id);
  CREATE INDEX IF NOT EXISTS drama_storyboards_shot_idx ON drama_storyboards (episode_id, shot_number);
  CREATE INDEX IF NOT EXISTS drama_assets_drama_id_idx ON drama_assets (drama_id);
  CREATE INDEX IF NOT EXISTS drama_assets_user_id_idx ON drama_assets (user_id);
  CREATE INDEX IF NOT EXISTS drama_assets_type_idx ON drama_assets (type);
  CREATE INDEX IF NOT EXISTS drama_tasks_drama_id_idx ON drama_tasks (drama_id);
  CREATE INDEX IF NOT EXISTS drama_tasks_user_id_idx ON drama_tasks (user_id);
  CREATE INDEX IF NOT EXISTS drama_tasks_status_idx ON drama_tasks (status);
  CREATE INDEX IF NOT EXISTS drama_tasks_type_idx ON drama_tasks (type);
`);


// 迁移：为已有数据库添加缺失的列
function migrateColumns() {
  try {
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_configs'").all() as any[];
    if (tables.length === 0) return;

    const columns = sqlite.prepare("PRAGMA table_info(ai_configs)").all() as any[];
    const colNames = new Set(columns.map((c) => c.name));

    if (!colNames.has('model_type')) {
      sqlite.prepare("ALTER TABLE ai_configs ADD COLUMN model_type TEXT DEFAULT 'text' NOT NULL").run();
      console.log('[Migrate] Added ai_configs.model_type column');
    }
    if (!colNames.has('extra_config')) {
      sqlite.prepare("ALTER TABLE ai_configs ADD COLUMN extra_config TEXT").run();
      console.log('[Migrate] Added ai_configs.extra_config column');
    }
  } catch (e) {
    console.warn('[Migrate] ai_configs columns migration skipped:', e);
  }
}

migrateColumns();

// 迁移：空表直接 DROP 重建，确保 schema 完全一致
function rebuildEmptyTablesIfNeeded() {
  const tablesToCheck = ['short_dramas', 'short_drama_episodes', 'drama_characters', 'drama_scenes', 'drama_items', 'drama_storyboards', 'drama_assets', 'drama_tasks'];
  for (const tableName of tablesToCheck) {
    try {
      const exists = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`).all();
      if (exists.length === 0) continue;
      const count = sqlite.prepare(`SELECT count(*) as cnt FROM ${tableName}`).get() as any;
      if (count?.cnt > 0) continue;
      // 表存在但为空 → 无条件 DROP，后面的 CREATE TABLE 会用完整 schema 重建
      console.log(`[Migrate] 表 ${tableName} 为空，DROP 并重建以确保 schema 一致`);
      sqlite.prepare(`DROP TABLE IF EXISTS ${tableName}`).run();
    } catch (e) {
      console.warn(`[Migrate] rebuildEmptyTablesIfNeeded(${tableName}) skipped:`, e);
    }
  }
}

rebuildEmptyTablesIfNeeded();

// 重建后重新执行 CREATE TABLE（只会创建被DROP的表）
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS short_dramas (
    id TEXT PRIMARY KEY NOT NULL,
    novel_id TEXT,
    script_id TEXT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    target_audience TEXT,
    total_episodes INTEGER DEFAULT 0 NOT NULL,
    current_episodes INTEGER DEFAULT 0 NOT NULL,
    episode_duration INTEGER DEFAULT 60,
    status TEXT DEFAULT 'draft',
    cover_image TEXT,
    tags TEXT,
    style TEXT,
    platform TEXT,
    character_style TEXT,
    scene_style TEXT,
    item_style TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS short_drama_episodes (
    id TEXT PRIMARY KEY NOT NULL,
    drama_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    episode_number INTEGER NOT NULL,
    title TEXT,
    synopsis TEXT,
    screenplay TEXT,
    scenes TEXT,
    dialogues TEXT,
    directions TEXT,
    image_prompts TEXT,
    video_prompts TEXT,
    duration INTEGER,
    status TEXT DEFAULT 'draft',
    source_chapter INTEGER,
    source_script_chapter_index INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS drama_characters (
    id TEXT PRIMARY KEY NOT NULL,
    drama_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'supporting',
    description TEXT,
    personality TEXT,
    appearance TEXT,
    voice_id TEXT,
    voice_provider TEXT,
    voice_config TEXT,
    image_url TEXT,
    image_prompt TEXT,
    reference_images TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS drama_scenes (
    id TEXT PRIMARY KEY NOT NULL,
    drama_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    atmosphere TEXT,
    image_url TEXT,
    image_prompt TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS drama_items (
    id TEXT PRIMARY KEY NOT NULL,
    drama_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    significance TEXT,
    image_url TEXT,
    image_prompt TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS drama_storyboards (
    id TEXT PRIMARY KEY NOT NULL,
    drama_id TEXT NOT NULL,
    episode_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    shot_number INTEGER NOT NULL,
    shot_type TEXT DEFAULT 'storyboard',
    scene_description TEXT,
    camera_angle TEXT,
    camera_movement TEXT,
    dialogue TEXT,
    voiceover TEXT,
    sound_effects TEXT,
    character_ids TEXT,
    image_prompt TEXT,
    image_url TEXT,
    video_prompt TEXT,
    video_url TEXT,
    audio_url TEXT,
    tts_text TEXT,
    tts_voice_id TEXT,
    subtitle TEXT,
    duration INTEGER DEFAULT 3,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS drama_assets (
    id TEXT PRIMARY KEY NOT NULL,
    drama_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT,
    local_path TEXT,
    mime_type TEXT,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    duration INTEGER,
    metadata TEXT,
    related_shot_id TEXT,
    related_episode_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );
  CREATE TABLE IF NOT EXISTS drama_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    drama_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    target_id TEXT,
    provider TEXT,
    model TEXT,
    status TEXT DEFAULT 'pending' NOT NULL,
    progress INTEGER DEFAULT 0,
    input TEXT,
    output TEXT,
    error TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );
`);

// 迁移：短剧关联字段 + 所有可能缺失的列（兜底，处理有数据不能DROP的情况）
function migrateShortDramaColumns() {
  try {
    // short_dramas 表
    const dramaTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='short_dramas'").all() as any[];
    if (dramaTables.length > 0) {
      const cols = sqlite.prepare("PRAGMA table_info(short_dramas)").all() as any[];
      const colNames = new Set(cols.map((c: any) => c.name));

      const dramaColsToAdd: [string, string][] = [
        ['novel_id', 'TEXT'],
        ['script_id', 'TEXT'],
        ['description', 'TEXT'],
        ['genre', 'TEXT'],
        ['target_audience', 'TEXT'],
        ['total_episodes', 'INTEGER DEFAULT 0'],
        ['current_episodes', 'INTEGER DEFAULT 0'],
        ['episode_duration', 'INTEGER DEFAULT 60'],
        ['status', "TEXT DEFAULT 'draft'"],
        ['cover_image', 'TEXT'],
        ['tags', 'TEXT'],
        ['style', 'TEXT'],
        ['platform', 'TEXT'],
        ['character_style', 'TEXT'],
        ['scene_style', 'TEXT'],
        ['item_style', 'TEXT'],
        ['updated_at', 'TEXT'],
      ];
      for (const [col, type] of dramaColsToAdd) {
        if (!colNames.has(col)) {
          sqlite.prepare(`ALTER TABLE short_dramas ADD COLUMN ${col} ${type}`).run();
          console.log(`[Migrate] Added short_dramas.${col} column`);
        }
      }
    }

    // short_drama_episodes 表
    const epTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='short_drama_episodes'").all() as any[];
    if (epTables.length > 0) {
      const cols = sqlite.prepare("PRAGMA table_info(short_drama_episodes)").all() as any[];
      const colNames = new Set(cols.map((c: any) => c.name));

      const epColsToAdd: [string, string][] = [
        ['user_id', "TEXT DEFAULT ''"],
        ['title', 'TEXT'],
        ['synopsis', 'TEXT'],
        ['screenplay', 'TEXT'],
        ['scenes', 'TEXT'],
        ['dialogues', 'TEXT'],
        ['directions', 'TEXT'],
        ['image_prompts', 'TEXT'],
        ['video_prompts', 'TEXT'],
        ['duration', 'INTEGER'],
        ['status', "TEXT DEFAULT 'draft'"],
        ['source_chapter', 'INTEGER'],
        ['source_script_chapter_index', 'INTEGER'],
        ['updated_at', 'TEXT'],
      ];
      for (const [col, type] of epColsToAdd) {
        if (!colNames.has(col)) {
          sqlite.prepare(`ALTER TABLE short_drama_episodes ADD COLUMN ${col} ${type}`).run();
          console.log(`[Migrate] Added short_drama_episodes.${col} column`);
        }
      }
    }

    // drama_characters 表
    const charTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='drama_characters'").all() as any[];
    if (charTables.length > 0) {
      const cols = sqlite.prepare("PRAGMA table_info(drama_characters)").all() as any[];
      const colNames = new Set(cols.map((c: any) => c.name));

      const charColsToAdd: [string, string][] = [
        ['gender', 'TEXT'],
        ['personality', 'TEXT'],
        ['appearance', 'TEXT'],
        ['voice_id', 'TEXT'],
        ['voice_provider', 'TEXT'],
        ['voice_config', 'TEXT'],
        ['image_url', 'TEXT'],
        ['image_prompt', 'TEXT'],
        ['reference_images', 'TEXT'],
        ['sort_order', 'INTEGER DEFAULT 0'],
        ['updated_at', 'TEXT'],
      ];
      for (const [col, type] of charColsToAdd) {
        if (!colNames.has(col)) {
          sqlite.prepare(`ALTER TABLE drama_characters ADD COLUMN ${col} ${type}`).run();
          console.log(`[Migrate] Added drama_characters.${col} column`);
        }
      }
    }

    // novel_characters 表
    const novelCharTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='novel_characters'").all() as any[];
    if (novelCharTables.length > 0) {
      const cols = sqlite.prepare("PRAGMA table_info(novel_characters)").all() as any[];
      const colNames = new Set(cols.map((c: any) => c.name));
      if (!colNames.has('gender')) {
        sqlite.prepare("ALTER TABLE novel_characters ADD COLUMN gender TEXT").run();
        console.log("[Migrate] Added novel_characters.gender column");
      }
    }

    // drama_storyboards 表
    const shotTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='drama_storyboards'").all() as any[];
    if (shotTables.length > 0) {
      const cols = sqlite.prepare("PRAGMA table_info(drama_storyboards)").all() as any[];
      const colNames = new Set(cols.map((c: any) => c.name));

      const shotColsToAdd: [string, string][] = [
        ['camera_movement', 'TEXT'],
        ['voiceover', 'TEXT'],
        ['sound_effects', 'TEXT'],
        ['character_ids', 'TEXT'],
        ['video_prompt', 'TEXT'],
        ['video_url', 'TEXT'],
        ['audio_url', 'TEXT'],
        ['tts_text', 'TEXT'],
        ['tts_voice_id', 'TEXT'],
        ['subtitle', 'TEXT'],
        ['updated_at', 'TEXT'],
      ];
      for (const [col, type] of shotColsToAdd) {
        if (!colNames.has(col)) {
          sqlite.prepare(`ALTER TABLE drama_storyboards ADD COLUMN ${col} ${type}`).run();
          console.log(`[Migrate] Added drama_storyboards.${col} column`);
        }
      }
    }
  } catch (e) {
    console.warn('[Migrate] short drama columns migration skipped:', e);
  }
}

  migrateShortDramaColumns();
  
  globalForSqlite.dbInitialized = true;
  console.log('[Database] Database schema initialization and migrations finished successfully.');
} else {
  console.log('[Database] Schema already initialized for this process. Skipping migrations.');
}