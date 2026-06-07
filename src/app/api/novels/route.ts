import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { novelManager, userManager, memberLevelManager, scriptManager, shortDramaManager } from "@/storage/database";
import { getUserFromToken } from "@/lib/auth";
import { syncNovelDetails } from "@/lib/novel-detail-sync";
import { autoCreateDramaForNovel } from "@/lib/auto-drama";

/**
 * 获取当前用户的小说列表
 */
export async function GET(request: NextRequest) {
	try {
		const authHeader = request.headers.get("authorization");
		const payload = getUserFromToken(authHeader);

		if (!payload) {
			return NextResponse.json(
				{ error: "请先登录" },
				{ status: 401 }
			);
		}

		const { searchParams } = new URL(request.url);
		const status = searchParams.get("status") || undefined;
		const limit = parseInt(searchParams.get("limit") || "50");
		const offset = parseInt(searchParams.get("offset") || "0");

		const result = await novelManager.getUserNovels(payload.userId, {
			status,
			limit,
			offset,
		});

		// 附带每部小说的剧本/短剧关联状态
		const novelsWithLinks = await Promise.all(result.novels.map(async (novel) => {
			let scriptId: string | null = null;
			let dramaId: string | null = null;
			try {
				const script = await scriptManager.getScriptByNovelId(novel.id, payload.userId);
				if (script) scriptId = script.id;
				const dramas = await shortDramaManager.getDramasByNovelId(novel.id);
				if (dramas.length > 0) dramaId = dramas[0].id;
			} catch {}
			return {
				id: novel.id,
				title: novel.title,
				description: novel.description,
				category: novel.category,
				genderTarget: novel.genderTarget,
				narrativePerspective: novel.narrativePerspective,
				tone: novel.tone,
				protagonist: novel.protagonist,
				supportingCharacterName: novel.supportingCharacterName,
				totalChapters: novel.totalChapters,
				currentChapters: novel.currentChapters,
				status: novel.status,
				createdAt: novel.createdAt,
				updatedAt: novel.updatedAt,
				scriptId,
				dramaId,
			};
		}));

		return NextResponse.json({
			success: true,
			data: {
				novels: novelsWithLinks,
				total: result.total,
				limit,
				offset,
			},
		});
	} catch (error) {
		console.error("Get user novels error:", error);
		return NextResponse.json(
			{ error: "获取小说列表失败" },
			{ status: 500 }
		);
	}
}

/**
 * 创建新小说
 */
const createNovelSchema = z.object({
	title: z.string().min(1).max(255),
	description: z.string().optional(),
	category: z.string().optional(),
	genderTarget: z.string().optional(),
	narrativePerspective: z.string().optional(),
	tone: z.array(z.string()).optional(),
	protagonist: z.string().optional(),
	supportingCharacterName: z.string().optional(),
	totalChapters: z.number().min(1).max(100).optional(),
	currentChapters: z.number().optional(),
	status: z.string().optional(),
	idea: z.any().optional(),
	structure: z.any().optional(),
	chapters: z.any().optional(),
});

export async function POST(request: NextRequest) {
	try {
		const authHeader = request.headers.get("authorization");
		const payload = getUserFromToken(authHeader);

		if (!payload) {
			return NextResponse.json(
				{ error: "请先登录" },
				{ status: 401 }
			);
		}

		// 检查会员可创建的小说数量
		const membership = await userManager.checkMembership(payload.userId);
		let storageLimit = 50; // 默认免费用户限制

		// 管理员无存储限制
		if (payload.role === 'admin') {
			storageLimit = -1;
		} else if (membership.isValid && membership.levelId) {
			const level = await memberLevelManager.getById(membership.levelId);
			if (level?.features) {
				const features = typeof level.features === 'string'
					? JSON.parse(level.features)
					: level.features;
				storageLimit = features.storageLimit || 50;
			}
		}

		const currentCount = await novelManager.getUserNovelCount(payload.userId);
		if (currentCount >= storageLimit && storageLimit !== -1) {
			return NextResponse.json(
				{
					error: `存储空间已达上限（${storageLimit}部）`,
					code: "STORAGE_LIMIT",
				},
				{ status: 403 }
			);
		}

		const body = await request.json();
		const validated = createNovelSchema.parse(body);

		const novel = await novelManager.create({
			userId: payload.userId,
			title: validated.title,
			description: validated.description || null,
			category: validated.category || null,
			genderTarget: validated.genderTarget || null,
			narrativePerspective: validated.narrativePerspective || null,
			tone: validated.tone ? JSON.stringify(validated.tone) : null,
			protagonist: validated.protagonist || null,
			supportingCharacterName: validated.supportingCharacterName || null,
			totalChapters: validated.totalChapters || 10,
			currentChapters: validated.currentChapters || 0,
			status: validated.status || "draft",
			idea: validated.idea ? JSON.stringify(validated.idea) : null,
			structure: validated.structure ? JSON.stringify(validated.structure) : null,
			chapters: validated.chapters ? JSON.stringify(validated.chapters) : null,
		});

		// 异步同步到子表（不阻塞响应）
		syncNovelDetails(novel.id, payload.userId, body).catch((e: unknown) =>
			console.warn('[Novels POST] Detail sync failed:', e)
		);

		// 异步自动创建关联短剧
		autoCreateDramaForNovel(novel).catch((e: unknown) =>
			console.warn('[Novels POST] Auto drama creation failed:', e)
		);

		return NextResponse.json({
			success: true,
			message: "小说创建成功",
			data: {
				id: novel.id,
				title: novel.title,
				description: novel.description,
				category: novel.category,
				genderTarget: novel.genderTarget,
				narrativePerspective: novel.narrativePerspective,
				tone: novel.tone,
				protagonist: novel.protagonist,
				supportingCharacterName: novel.supportingCharacterName,
				totalChapters: novel.totalChapters,
				currentChapters: novel.currentChapters,
				status: novel.status,
				createdAt: novel.createdAt,
			},
		});
	} catch (error) {
		console.error("Create novel error:", error);
		if (error instanceof z.ZodError) {
			return NextResponse.json(
				{ error: "参数错误", details: error.issues },
				{ status: 400 }
			);
		}
		return NextResponse.json(
			{ error: "创建小说失败" },
			{ status: 500 }
		);
	}
}
