import { eq, and, asc, desc, sql } from "drizzle-orm";
import { getDb } from "./sqlite";
import fs from "fs";
import path from "path";

/**
 * 删除本地物理媒体文件（如图片、视频、音频）
 */
function deletePhysicalFile(fileUrl: string | null | undefined) {
  if (!fileUrl) return;
  // 跳过 Base64 和非本地的外网资源
  if (fileUrl.startsWith('data:') || (fileUrl.startsWith('http') && !fileUrl.includes('localhost') && !fileUrl.includes('127.0.0.1'))) {
    return;
  }

  let relativePath = '';
  if (fileUrl.startsWith('/')) {
    relativePath = fileUrl;
  } else {
    try {
      const parsed = new URL(fileUrl);
      relativePath = parsed.pathname;
    } catch {
      relativePath = fileUrl;
    }
  }

  if (relativePath) {
    const localPath = path.join(process.cwd(), 'public', relativePath);
    try {
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        console.log(`[FileDelete] Deleted physical file: ${localPath}`);
      }
    } catch (err) {
      console.error(`[FileDelete] Failed to delete file ${localPath}:`, err);
    }
  }
}
import {
	dramaCharacters, dramaStoryboards, dramaAssets, dramaTasks,
	dramaScenes, dramaItems,
	type DramaCharacter, type InsertDramaCharacter, type UpdateDramaCharacter,
	type DramaStoryboard, type InsertDramaStoryboard, type UpdateDramaStoryboard,
	type DramaAsset, type InsertDramaAsset,
	type DramaTask, type InsertDramaTask,
	type DramaScene, type InsertDramaScene, type UpdateDramaScene,
	type DramaItem, type InsertDramaItem, type UpdateDramaItem,
} from "./shared/schema";

function genId(prefix: string) {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export class DramaWorkflowManager {

	// ======================== 角色 CRUD ========================

	async createCharacter(data: InsertDramaCharacter): Promise<DramaCharacter> {
		const db = await getDb();
		const id = genId('char');
		const [created] = await db.insert(dramaCharacters).values({ id, ...data }).returning();
		return created;
	}

	async getCharactersByDramaId(dramaId: string): Promise<DramaCharacter[]> {
		const db = await getDb();
		return db.select().from(dramaCharacters)
			.where(eq(dramaCharacters.dramaId, dramaId))
			.orderBy(asc(dramaCharacters.sortOrder));
	}

	async getCharacterById(id: string): Promise<DramaCharacter | null> {
		const db = await getDb();
		const rows = await db.select().from(dramaCharacters).where(eq(dramaCharacters.id, id)).limit(1);
		return rows[0] || null;
	}

	async updateCharacter(id: string, data: UpdateDramaCharacter): Promise<DramaCharacter | null> {
		const db = await getDb();
		const [updated] = await db.update(dramaCharacters)
			.set({ ...data, updatedAt: new Date().toISOString() })
			.where(eq(dramaCharacters.id, id))
			.returning();
		return updated || null;
	}

	async deleteCharacter(id: string): Promise<boolean> {
		const db = await getDb();
		const result = await db.delete(dramaCharacters).where(eq(dramaCharacters.id, id)).returning();
		return result.length > 0;
	}

	async deleteCharactersByDramaId(dramaId: string): Promise<void> {
		const db = await getDb();
		await db.delete(dramaCharacters).where(eq(dramaCharacters.dramaId, dramaId));
	}

	// ======================== 场景 CRUD ========================

	async createScene(data: InsertDramaScene): Promise<DramaScene> {
		const db = await getDb();
		const id = genId('scene');
		const [created] = await db.insert(dramaScenes).values({ id, ...data }).returning();
		return created;
	}

	async getScenesByDramaId(dramaId: string): Promise<DramaScene[]> {
		const db = await getDb();
		return db.select().from(dramaScenes)
			.where(eq(dramaScenes.dramaId, dramaId))
			.orderBy(asc(dramaScenes.sortOrder));
	}

	async getSceneById(id: string): Promise<DramaScene | null> {
		const db = await getDb();
		const rows = await db.select().from(dramaScenes).where(eq(dramaScenes.id, id)).limit(1);
		return rows[0] || null;
	}

	async updateScene(id: string, data: UpdateDramaScene): Promise<DramaScene | null> {
		const db = await getDb();
		const [updated] = await db.update(dramaScenes)
			.set({ ...data, updatedAt: new Date().toISOString() })
			.where(eq(dramaScenes.id, id))
			.returning();
		return updated || null;
	}

	async deleteScene(id: string): Promise<boolean> {
		const db = await getDb();
		const result = await db.delete(dramaScenes).where(eq(dramaScenes.id, id)).returning();
		return result.length > 0;
	}

	async deleteScenesByDramaId(dramaId: string): Promise<void> {
		const db = await getDb();
		await db.delete(dramaScenes).where(eq(dramaScenes.dramaId, dramaId));
	}

	// ======================== 物品 CRUD ========================

	async createItem(data: InsertDramaItem): Promise<DramaItem> {
		const db = await getDb();
		const id = genId('item');
		const [created] = await db.insert(dramaItems).values({ id, ...data }).returning();
		return created;
	}

	async getItemsByDramaId(dramaId: string): Promise<DramaItem[]> {
		const db = await getDb();
		return db.select().from(dramaItems)
			.where(eq(dramaItems.dramaId, dramaId))
			.orderBy(asc(dramaItems.sortOrder));
	}

	async getItemById(id: string): Promise<DramaItem | null> {
		const db = await getDb();
		const rows = await db.select().from(dramaItems).where(eq(dramaItems.id, id)).limit(1);
		return rows[0] || null;
	}

	async updateItem(id: string, data: UpdateDramaItem): Promise<DramaItem | null> {
		const db = await getDb();
		const [updated] = await db.update(dramaItems)
			.set({ ...data, updatedAt: new Date().toISOString() })
			.where(eq(dramaItems.id, id))
			.returning();
		return updated || null;
	}

	async deleteItem(id: string): Promise<boolean> {
		const db = await getDb();
		const result = await db.delete(dramaItems).where(eq(dramaItems.id, id)).returning();
		return result.length > 0;
	}

	async deleteItemsByDramaId(dramaId: string): Promise<void> {
		const db = await getDb();
		await db.delete(dramaItems).where(eq(dramaItems.dramaId, dramaId));
	}

	// ======================== 分镜 CRUD ========================

	async createShot(data: InsertDramaStoryboard): Promise<DramaStoryboard> {
		const db = await getDb();
		const id = genId('shot');
		const [created] = await db.insert(dramaStoryboards).values({ id, ...data }).returning();
		return created;
	}

	async bulkCreateShots(shots: InsertDramaStoryboard[]): Promise<DramaStoryboard[]> {
		const db = await getDb();
		const records = shots.map(s => ({ id: genId('shot'), ...s }));
		return db.insert(dramaStoryboards).values(records).returning();
	}

	async getShotsByEpisodeId(episodeId: string): Promise<DramaStoryboard[]> {
		const db = await getDb();
		return db.select().from(dramaStoryboards)
			.where(eq(dramaStoryboards.episodeId, episodeId))
			.orderBy(asc(dramaStoryboards.shotNumber));
	}

	async getShotsByDramaId(dramaId: string): Promise<DramaStoryboard[]> {
		const db = await getDb();
		return db.select().from(dramaStoryboards)
			.where(eq(dramaStoryboards.dramaId, dramaId))
			.orderBy(asc(dramaStoryboards.shotNumber));
	}

	async getShotById(id: string): Promise<DramaStoryboard | null> {
		const db = await getDb();
		const rows = await db.select().from(dramaStoryboards).where(eq(dramaStoryboards.id, id)).limit(1);
		return rows[0] || null;
	}

	async updateShot(id: string, data: UpdateDramaStoryboard): Promise<DramaStoryboard | null> {
		const db = await getDb();
		const [updated] = await db.update(dramaStoryboards)
			.set({ ...data, updatedAt: new Date().toISOString() })
			.where(eq(dramaStoryboards.id, id))
			.returning();
		return updated || null;
	}

	async deleteShot(id: string): Promise<boolean> {
		const db = await getDb();
		const [shot] = await db.select().from(dramaStoryboards).where(eq(dramaStoryboards.id, id)).limit(1);
		if (shot) {
			deletePhysicalFile(shot.imageUrl);
			deletePhysicalFile(shot.videoUrl);
			deletePhysicalFile(shot.audioUrl);
		}
		const result = await db.delete(dramaStoryboards).where(eq(dramaStoryboards.id, id)).returning();
		return result.length > 0;
	}

	async deleteShotsByEpisodeId(episodeId: string): Promise<void> {
		const db = await getDb();
		const shots = await db.select().from(dramaStoryboards).where(eq(dramaStoryboards.episodeId, episodeId));
		for (const shot of shots) {
			deletePhysicalFile(shot.imageUrl);
			deletePhysicalFile(shot.videoUrl);
			deletePhysicalFile(shot.audioUrl);
		}
		await db.delete(dramaStoryboards).where(eq(dramaStoryboards.episodeId, episodeId));
	}

	async deleteShotsByDramaId(dramaId: string): Promise<void> {
		const db = await getDb();
		const shots = await db.select().from(dramaStoryboards).where(eq(dramaStoryboards.dramaId, dramaId));
		for (const shot of shots) {
			deletePhysicalFile(shot.imageUrl);
			deletePhysicalFile(shot.videoUrl);
			deletePhysicalFile(shot.audioUrl);
		}
		await db.delete(dramaStoryboards).where(eq(dramaStoryboards.dramaId, dramaId));
	}

	async getShotStats(episodeId: string): Promise<{
		total: number; withImage: number; withVideo: number; withAudio: number;
	}> {
		const db = await getDb();
		const shots = await this.getShotsByEpisodeId(episodeId);
		return {
			total: shots.length,
			withImage: shots.filter(s => s.imageUrl).length,
			withVideo: shots.filter(s => s.videoUrl).length,
			withAudio: shots.filter(s => s.audioUrl).length,
		};
	}

	// ======================== 资产 CRUD ========================

	async createAsset(data: InsertDramaAsset): Promise<DramaAsset> {
		const db = await getDb();
		const id = genId('asset');
		const [created] = await db.insert(dramaAssets).values({ id, ...data }).returning();
		return created;
	}

	async getAssetsByDramaId(dramaId: string, type?: string): Promise<DramaAsset[]> {
		const db = await getDb();
		const conditions = [eq(dramaAssets.dramaId, dramaId)];
		if (type) conditions.push(eq(dramaAssets.type, type));
		return db.select().from(dramaAssets)
			.where(conditions.length === 1 ? conditions[0] : and(...conditions))
			.orderBy(desc(dramaAssets.createdAt));
	}

	async deleteAsset(id: string): Promise<boolean> {
		const db = await getDb();
		const [asset] = await db.select().from(dramaAssets).where(eq(dramaAssets.id, id)).limit(1);
		if (asset) {
			deletePhysicalFile(asset.url);
			deletePhysicalFile(asset.localPath);
		}
		const result = await db.delete(dramaAssets).where(eq(dramaAssets.id, id)).returning();
		return result.length > 0;
	}

	async deleteAssetsByDramaId(dramaId: string): Promise<void> {
		const db = await getDb();
		const assets = await db.select().from(dramaAssets).where(eq(dramaAssets.dramaId, dramaId));
		for (const asset of assets) {
			deletePhysicalFile(asset.url);
			deletePhysicalFile(asset.localPath);
		}
		await db.delete(dramaAssets).where(eq(dramaAssets.dramaId, dramaId));
	}

	async deleteAssetsByEpisodeId(episodeId: string): Promise<void> {
		const db = await getDb();
		const assets = await db.select().from(dramaAssets).where(eq(dramaAssets.relatedEpisodeId, episodeId));
		for (const asset of assets) {
			deletePhysicalFile(asset.url);
			deletePhysicalFile(asset.localPath);
		}
		await db.delete(dramaAssets).where(eq(dramaAssets.relatedEpisodeId, episodeId));
	}

	// ======================== 任务 CRUD ========================

	async createTask(data: InsertDramaTask): Promise<DramaTask> {
		const db = await getDb();
		const id = genId('task');
		const [created] = await db.insert(dramaTasks).values({ id, ...data }).returning();
		return created;
	}

	async getTasksByDramaId(dramaId: string, type?: string): Promise<DramaTask[]> {
		const db = await getDb();
		const conditions: any[] = [eq(dramaTasks.dramaId, dramaId)];
		if (type) conditions.push(eq(dramaTasks.type, type));
		return db.select().from(dramaTasks)
			.where(conditions.length === 1 ? conditions[0] : and(...conditions))
			.orderBy(desc(dramaTasks.createdAt));
	}

	async getTaskById(id: string): Promise<DramaTask | null> {
		const db = await getDb();
		const rows = await db.select().from(dramaTasks).where(eq(dramaTasks.id, id)).limit(1);
		return rows[0] || null;
	}

	async updateTask(id: string, data: Partial<{
		status: string; progress: number; output: string; error: string;
		startedAt: string; completedAt: string;
	}>): Promise<DramaTask | null> {
		const db = await getDb();
		const [updated] = await db.update(dramaTasks).set(data).where(eq(dramaTasks.id, id)).returning();
		return updated || null;
	}

	async getPendingTasks(limit?: number): Promise<DramaTask[]> {
		const db = await getDb();
		return db.select().from(dramaTasks)
			.where(eq(dramaTasks.status, 'pending'))
			.orderBy(asc(dramaTasks.createdAt))
			.limit(limit || 10);
	}

	// ======================== 级联删除 ========================

	async deleteAllByDramaId(dramaId: string): Promise<void> {
		await Promise.all([
			this.deleteCharactersByDramaId(dramaId),
			this.deleteShotsByDramaId(dramaId),
			this.deleteAssetsByDramaId(dramaId),
		]);
		const db = await getDb();
		await db.delete(dramaTasks).where(eq(dramaTasks.dramaId, dramaId));
	}
}

export const dramaWorkflowManager = new DramaWorkflowManager();
