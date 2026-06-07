import { getDb } from './sqlite';
import { scripts } from './shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { insertScriptSchema, updateScriptSchema } from './shared/schema';
import { shortDramaManager } from './shortDramaManager';

export class ScriptManager {
  private static saveQueue: Map<string, Promise<any>> = new Map();

  private serializeData(data: any): any {
    const result: any = { ...data };
    if (result.chapters !== undefined && result.chapters !== null && typeof result.chapters !== 'string') {
      result.chapters = JSON.stringify(result.chapters);
    }
    if (result.updatedAt instanceof Date) {
      result.updatedAt = result.updatedAt.toISOString();
    }
    return result;
  }

  private deserializeScript(script: any): any {
    if (!script) return script;
    const result = { ...script };
    if (result.chapters && typeof result.chapters === 'string') {
      try {
        result.chapters = JSON.parse(result.chapters);
      } catch {}
    }
    return result;
  }

  private deserializeScripts(scriptList: any[]): any[] {
    return scriptList.map(s => this.deserializeScript(s));
  }

  async createScript(data: { novelId: string; userId: string; status?: string; chapters?: any }) {
    const db = await getDb();
    const id = `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const validated = insertScriptSchema.parse({
      novelId: data.novelId,
      userId: data.userId,
      status: data.status || 'draft',
      chapters: data.chapters || null,
    });
    const serialized = this.serializeData({ ...validated, id });
    const result = await db.insert(scripts).values(serialized).returning();
    return this.deserializeScript(result[0]);
  }

  async getScriptById(id: string) {
    const db = await getDb();
    const result = await db.select().from(scripts).where(eq(scripts.id, id)).limit(1);
    return this.deserializeScript(result[0] || null);
  }

  async getScriptByNovelId(novelId: string, userId: string) {
    const db = await getDb();
    const result = await db.select().from(scripts)
      .where(and(eq(scripts.novelId, novelId), eq(scripts.userId, userId)))
      .orderBy(desc(scripts.createdAt))
      .limit(1);
    return this.deserializeScript(result[0] || null);
  }

  async getScriptsByUserId(userId: string) {
    const db = await getDb();
    const results = await db.select().from(scripts)
      .where(eq(scripts.userId, userId))
      .orderBy(desc(scripts.createdAt));
    return this.deserializeScripts(results);
  }

  async updateScript(id: string, data: { status?: string; chapters?: any }) {
    const db = await getDb();
    const validated = updateScriptSchema.parse(data);
    const serialized = this.serializeData({ ...validated, updatedAt: new Date().toISOString() });
    const result = await db.update(scripts)
      .set(serialized)
      .where(eq(scripts.id, id))
      .returning();
    return this.deserializeScript(result[0]);
  }

  async updateChapterField(id: string, chapterIndex: number, field: string, value: any) {
    const queueKey = `chapter_${id}`;

    const previousPromise = ScriptManager.saveQueue.get(queueKey) || Promise.resolve();
    const currentPromise = previousPromise.then(async () => {
      try {
        const script = await this.getScriptById(id);
        if (!script || !script.chapters) {
          console.warn(`[ScriptManager] updateChapterField: 剧本${id}不存在或无章节数据`);
          return null;
        }

        const chapters = Array.isArray(script.chapters) ? [...script.chapters] : [];
        if (chapterIndex < 0 || chapterIndex >= chapters.length) {
          console.warn(`[ScriptManager] updateChapterField: 章节索引${chapterIndex}越界，当前长度${chapters.length}`);
          return null;
        }

        chapters[chapterIndex] = {
          ...chapters[chapterIndex],
          [field]: value,
        };

        const result = await this.updateScript(id, { chapters });
        console.log(`[ScriptManager] updateChapterField: 剧本${id}第${chapterIndex}章${field}保存成功`);
        return result;
      } catch (error) {
        console.error(`[ScriptManager] updateChapterField: 剧本${id}第${chapterIndex}章${field}保存失败:`, error);
        throw error;
      }
    });

    ScriptManager.saveQueue.set(queueKey, currentPromise);

    currentPromise.finally(() => {
      if (ScriptManager.saveQueue.get(queueKey) === currentPromise) {
        ScriptManager.saveQueue.delete(queueKey);
      }
    });

    return currentPromise;
  }

  async getAllScripts(limit = 100, offset = 0) {
    const db = await getDb();
    const results = await db.select().from(scripts)
      .orderBy(desc(scripts.createdAt))
      .limit(limit)
      .offset(offset);
    return this.deserializeScripts(results);
  }

  async getScriptByNovelIdAdmin(novelId: string) {
    const db = await getDb();
    const results = await db.select().from(scripts)
      .where(eq(scripts.novelId, novelId))
      .orderBy(desc(scripts.createdAt));
    return this.deserializeScripts(results);
  }

  async deleteScript(id: string) {
    // 级联删除关联短剧（含分集/工作流）
    await shortDramaManager.deleteByScriptId(id).catch(e =>
      console.warn('[ScriptManager] Failed to cascade delete short dramas:', e)
    );
    const db = await getDb();
    await db.delete(scripts).where(eq(scripts.id, id));
  }

  async deleteByNovelId(novelId: string): Promise<void> {
    const db = await getDb();
    const list = await db.select({ id: scripts.id }).from(scripts).where(eq(scripts.novelId, novelId));
    for (const item of list) {
      await this.deleteScript(item.id);
    }
  }
}

export const scriptManager = new ScriptManager();
