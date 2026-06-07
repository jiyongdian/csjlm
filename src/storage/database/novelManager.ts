import { eq, and, asc, desc, sql } from "drizzle-orm";
import { getDb } from "./sqlite";
import {
	novels,
	insertNovelSchema,
	updateNovelSchema,
	type Novel,
	type InsertNovel,
	type UpdateNovel,
} from "./shared/schema";
import { novelDetailManager } from "./novelDetailManager";
import { scriptManager } from "./scriptManager";
import { shortDramaManager } from "./shortDramaManager";

export class NovelManager {
	/**
	 * 序列化数据，处理 JSON 字段
	 */
	private serializeData(data: Partial<InsertNovel | UpdateNovel>): any {
		const result: any = { ...data };
		// 处理需要 JSON 序列化的字段
		if (result.tone && typeof result.tone !== 'string') {
			result.tone = JSON.stringify(result.tone);
		}
		if (result.idea && typeof result.idea !== 'string') {
			result.idea = JSON.stringify(result.idea);
		}
		if (result.structure && typeof result.structure !== 'string') {
			result.structure = JSON.stringify(result.structure);
		}
		if (result.chapters && typeof result.chapters !== 'string') {
			result.chapters = JSON.stringify(result.chapters);
		}
		// 处理日期字段
		if (result.updatedAt) {
			result.updatedAt = result.updatedAt instanceof Date 
				? result.updatedAt.toISOString() 
				: result.updatedAt;
		}
		return result;
	}

	/**
	 * 创建小说
	 */
	async create(data: InsertNovel): Promise<Novel> {
		const db = await getDb();
		const validated = insertNovelSchema.parse(data);
		// 自动生成id
		const id = (validated as any).id || `novel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
		// 序列化数据
		const serialized = this.serializeData({ ...validated, id } as any);
		const [novel] = await db.insert(novels).values(serialized).returning();
		return this.deserializeNovel(novel);
	}

	/**
	 * 反序列化小说数据，把 JSON 字符串解析成对象
	 */
	private deserializeNovel(novel: Novel): Novel {
		const result: any = { ...novel };
		// 解析 JSON 字段
		if (result.tone && typeof result.tone === 'string') {
			try { result.tone = JSON.parse(result.tone); } catch { /* 保持原样 */ }
		}
		if (result.idea && typeof result.idea === 'string') {
			try { result.idea = JSON.parse(result.idea); } catch { /* 保持原样 */ }
		}
		if (result.structure && typeof result.structure === 'string') {
			try { result.structure = JSON.parse(result.structure); } catch { /* 保持原样 */ }
		}
		if (result.chapters && typeof result.chapters === 'string') {
			try { result.chapters = JSON.parse(result.chapters); } catch { /* 保持原样 */ }
		}
		return result;
	}

	/**
	 * 根据ID获取小说
	 */
	async getById(id: string): Promise<Novel | null> {
		const db = await getDb();
		const result = await db.select().from(novels).where(eq(novels.id, id)).limit(1);
		if (!result[0]) return null;
		return this.deserializeNovel(result[0]);
	}

	/**
	 * 获取用户的小说列表
	 */
	async getUserNovels(
		userId: string,
		options: { status?: string; limit?: number; offset?: number } = {}
	): Promise<{ novels: Novel[]; total: number }> {
		const db = await getDb();
		const conditions: any[] = [eq(novels.userId, userId)];
		if (options.status) {
			conditions.push(eq(novels.status, options.status));
		}

		const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

		// 获取总数
		const countResult = await db
			.select({ count: sql<number>`count(*)` })
			.from(novels)
			.where(whereClause);

		// 获取列表
		const limit = options.limit || 20;
		const offset = options.offset || 0;
		const novelList = await db
			.select()
			.from(novels)
			.where(whereClause)
			.orderBy(desc(novels.updatedAt))
			.limit(limit)
			.offset(offset);

		return {
			novels: novelList.map(novel => this.deserializeNovel(novel)),
			total: Number(countResult[0]?.count) || 0,
		};
	}

	/**
	 * 获取用户已生成章节总数
	 */
	async getUserTotalChapters(userId: string): Promise<number> {
		const db = await getDb();
		const result = await db
			.select({ total: novels.currentChapters })
			.from(novels)
			.where(eq(novels.userId, userId));
		return result.reduce((sum, r) => sum + (r.total || 0), 0);
	}

	/**
	 * 获取用户的小说数量
	 */
	async getUserNovelCount(userId: string): Promise<number> {
		const db = await getDb();
		const result = await db
			.select({ count: sql<number>`count(*)` })
			.from(novels)
			.where(eq(novels.userId, userId));
		return Number(result[0]?.count) || 0;
	}

	/**
	 * 更新小说
	 */
	async update(id: string, userId: string, data: UpdateNovel): Promise<Novel | null> {
		const db = await getDb();
		const validated = updateNovelSchema.parse(data);
		// 序列化数据
		const serialized = this.serializeData({ ...validated, updatedAt: new Date().toISOString() } as any);
		const [novel] = await db
			.update(novels)
			.set(serialized)
			.where(and(eq(novels.id, id), eq(novels.userId, userId)))
			.returning();
		return novel ? this.deserializeNovel(novel) : null;
	}

	/**
	 * 更新小说章节
	 */
	async updateChapters(
		id: string,
		userId: string,
		chapters: unknown
	): Promise<Novel | null> {
		const db = await getDb();
		// 序列化章节数据
		const serializedChapters = typeof chapters !== 'string' ? JSON.stringify(chapters) : chapters;
		const [novel] = await db
			.update(novels)
			.set({
				chapters: serializedChapters,
				updatedAt: new Date().toISOString(),
			})
			.where(and(eq(novels.id, id), eq(novels.userId, userId)))
			.returning();
		return novel ? this.deserializeNovel(novel) : null;
	}

	/**
	 * 更新生成进度
	 */
	async updateProgress(
		id: string,
		userId: string,
		currentChapters: number
	): Promise<Novel | null> {
		const db = await getDb();
		const [novel] = await db
			.update(novels)
			.set({
				currentChapters,
				updatedAt: new Date().toISOString(),
			})
			.where(and(eq(novels.id, id), eq(novels.userId, userId)))
			.returning();
		return novel ? this.deserializeNovel(novel) : null;
	}

	/**
	 * 获取所有小说（管理员用）
	 */
	async getAllNovels(
		options: { search?: string; status?: string; limit?: number; offset?: number } = {}
	): Promise<{ novels: Novel[]; total: number }> {
		const db = await getDb();
		const conditions: any[] = [];
		if (options.search) {
			conditions.push(
				sql`(novels.title LIKE ${'%' + options.search + '%'} OR novels.description LIKE ${'%' + options.search + '%'})`
			);
		}
		if (options.status) {
			conditions.push(eq(novels.status, options.status));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const countResult = await db
			.select({ count: sql<number>`count(*)` })
			.from(novels)
			.where(whereClause);

		const limit = options.limit || 20;
		const offset = options.offset || 0;
		const novelList = await db
			.select()
			.from(novels)
			.where(whereClause)
			.orderBy(desc(novels.updatedAt))
			.limit(limit)
			.offset(offset);

		return {
			novels: novelList.map(novel => this.deserializeNovel(novel)),
			total: Number(countResult[0]?.count) || 0,
		};
	}

	/**
	 * 管理员更新小说（不校验 userId）
	 */
	async adminUpdate(id: string, data: UpdateNovel): Promise<Novel | null> {
		const db = await getDb();
		const validated = updateNovelSchema.parse(data);
		// 序列化数据
		const serialized = this.serializeData({ ...validated, updatedAt: new Date().toISOString() } as any);
		const [novel] = await db
			.update(novels)
			.set(serialized)
			.where(eq(novels.id, id))
			.returning();
		return novel ? this.deserializeNovel(novel) : null;
	}

	/**
	 * 删除小说
	 */
	async delete(id: string, userId: string): Promise<boolean> {
		const db = await getDb();
		const result = await db
			.delete(novels)
			.where(and(eq(novels.id, id), eq(novels.userId, userId)))
			.returning();
		if (result.length > 0) {
			// 级联删除子表详情数据
			await novelDetailManager.deleteAllByNovelId(id).catch(e =>
				console.warn('[NovelManager] Failed to cascade delete details:', e)
			);
			// 级联删除剧本（每个剧本内部会再级联删除关联短剧）
			await scriptManager.deleteByNovelId(id).catch(e =>
				console.warn('[NovelManager] Failed to cascade delete scripts:', e)
			);
			// 级联删除直接关联的短剧（novelId 直接指向此小说，但 scriptId 可能为空）
			await shortDramaManager.deleteByNovelId(id).catch(e =>
				console.warn('[NovelManager] Failed to cascade delete short dramas:', e)
			);
		}
		return result.length > 0;
	}
}

export const novelManager = new NovelManager();
