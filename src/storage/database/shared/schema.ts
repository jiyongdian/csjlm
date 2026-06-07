import { sqliteTable, index, text, integer, blob } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"
import { createSchemaFactory } from "drizzle-zod"
import { z } from "zod"

export const users = sqliteTable("users", {
	id: text("id").primaryKey().notNull(),
	username: text("username").notNull().unique(),
	email: text("email").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	nickname: text("nickname"),
	avatar: text("avatar"),
	memberLevelId: text("member_level_id"),
	memberExpireAt: text("member_expire_at"),
	memberStatus: text("member_status").default('inactive'),
	isActive: integer("is_active").default(1).notNull(),
	role: text("role").default('user').notNull(),
	chapterLimit: integer("chapter_limit"),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("users_email_idx").on(table.email),
	index("users_username_idx").on(table.username),
]);

export const memberLevels = sqliteTable("member_levels", {
	id: text("id").primaryKey().notNull(),
	code: text("code").notNull().unique(),
	name: text("name").notNull(),
	description: text("description"),
	price: integer("price").default(0).notNull(),
	duration: integer("duration").default(30).notNull(),
	features: text("features"),
	chapterLimit: integer("chapter_limit").default(10).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: integer("is_active").default(1).notNull(),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("member_levels_code_idx").on(table.code),
	index("member_levels_sort_idx").on(table.sortOrder),
]);

export const memberOrders = sqliteTable("member_orders", {
	id: text("id").primaryKey().notNull(),
	userId: text("user_id").notNull(),
	memberLevelId: text("member_level_id").notNull(),
	orderNo: text("order_no").notNull().unique(),
	amount: integer("amount").default(0).notNull(),
	paymentMethod: text("payment_method"),
	paymentStatus: text("payment_status").default('pending').notNull(),
	paymentTime: text("payment_time"),
	startTime: text("start_time"),
	endTime: text("end_time"),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("member_orders_user_idx").on(table.userId),
	index("member_orders_order_no_idx").on(table.orderNo),
]);

export const novels = sqliteTable("novels", {
	id: text("id").primaryKey().notNull(),
	userId: text("user_id").notNull(),
	title: text("title").notNull(),
	description: text("description"),
	category: text("category"),
	genderTarget: text("gender_target"),
	narrativePerspective: text("narrative_perspective"),
	tone: text("tone"),
	protagonist: text("protagonist"),
	supportingCharacterName: text("supporting_character_name"),
	totalChapters: integer("total_chapters").default(0).notNull(),
	currentChapters: integer("current_chapters").default(0).notNull(),
	status: text("status").default('draft'),
	idea: text("idea"),
	structure: text("structure"),
	chapters: text("chapters"),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("novels_user_id_idx").on(table.userId),
	index("novels_category_idx").on(table.category),
	index("novels_created_at_idx").on(table.createdAt),
	index("novels_status_idx").on(table.status),
]);

// ====== 小说结构化子表 ======

// 剧情表（主线剧情、情感曲线等）
export const novelPlots = sqliteTable("novel_plots", {
	id: text("id").primaryKey().notNull(),
	novelId: text("novel_id").notNull(),
	userId: text("user_id").notNull(),
	mainPlot: text("main_plot"),              // 主线剧情
	emotionalCurve: text("emotional_curve"),   // 情感曲线
	keyConflicts: text("key_conflicts"),        // 关键冲突
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("novel_plots_novel_id_idx").on(table.novelId),
	index("novel_plots_user_id_idx").on(table.userId),
]);

// 章节钩子表（每章一条记录）
export const novelChapterHooks = sqliteTable("novel_chapter_hooks", {
	id: text("id").primaryKey().notNull(),
	novelId: text("novel_id").notNull(),
	userId: text("user_id").notNull(),
	chapterNumber: integer("chapter_number").notNull(),   // 章节序号
	title: text("title"),                                  // 章节标题
	hook: text("hook"),                                    // 章节钩子/摘要
	status: text("status").default('pending'),             // pending / generated / edited
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("novel_chapter_hooks_novel_id_idx").on(table.novelId),
	index("novel_chapter_hooks_user_id_idx").on(table.userId),
	index("novel_chapter_hooks_chapter_num_idx").on(table.novelId, table.chapterNumber),
]);

// 角色表
export const novelCharacters = sqliteTable("novel_characters", {
	id: text("id").primaryKey().notNull(),
	novelId: text("novel_id").notNull(),
	userId: text("user_id").notNull(),
	name: text("name").notNull(),              // 角色名
	role: text("role").default('supporting'),  // protagonist / supporting / antagonist / minor
	description: text("description"),          // 角色描述
	personality: text("personality"),           // 性格特征
	appearance: text("appearance"),             // 外貌描述
	background: text("background"),            // 背景故事
	relationships: text("relationships"),       // 角色关系（JSON 字符串）
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("novel_characters_novel_id_idx").on(table.novelId),
	index("novel_characters_user_id_idx").on(table.userId),
	index("novel_characters_role_idx").on(table.role),
]);

// 场景表
export const novelScenes = sqliteTable("novel_scenes", {
	id: text("id").primaryKey().notNull(),
	novelId: text("novel_id").notNull(),
	userId: text("user_id").notNull(),
	name: text("name").notNull(),              // 场景名
	description: text("description"),          // 场景描述
	atmosphere: text("atmosphere"),             // 氛围/基调
	relatedChapters: text("related_chapters"), // 关联章节（JSON 数组）
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("novel_scenes_novel_id_idx").on(table.novelId),
	index("novel_scenes_user_id_idx").on(table.userId),
]);

// 物品表
export const novelItems = sqliteTable("novel_items", {
	id: text("id").primaryKey().notNull(),
	novelId: text("novel_id").notNull(),
	userId: text("user_id").notNull(),
	name: text("name").notNull(),              // 物品名
	description: text("description"),          // 物品描述
	significance: text("significance"),         // 重要性/象征意义
	relatedChapters: text("related_chapters"), // 关联章节（JSON 数组）
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("novel_items_novel_id_idx").on(table.novelId),
	index("novel_items_user_id_idx").on(table.userId),
]);

// 角色关系表
export const novelCharacterRelationships = sqliteTable("novel_character_relationships", {
	id: text("id").primaryKey().notNull(),
	novelId: text("novel_id").notNull(),
	userId: text("user_id").notNull(),
	fromCharacter: text("from_character").notNull(), // 关系来源角色名
	toCharacter: text("to_character").notNull(),     // 关系目标角色名
	relationship: text("relationship"),               // 关系描述
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("novel_character_relationships_novel_id_idx").on(table.novelId),
	index("novel_character_relationships_user_id_idx").on(table.userId),
]);

export const scripts = sqliteTable("scripts", {
	id: text("id").primaryKey().notNull(),
	novelId: text("novel_id").notNull(),
	userId: text("user_id").notNull(),
	status: text("status").default('draft'),
	chapters: text("chapters"),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("scripts_novel_id_idx").on(table.novelId),
	index("scripts_user_id_idx").on(table.userId),
]);

export const aiConfigs = sqliteTable("ai_configs", {
	id: text("id").primaryKey().notNull(),
	userId: text("user_id"),
	name: text("name").notNull(),
	provider: text("provider").notNull(),
	apiUrl: text("api_url").notNull(),
	apiKey: text("api_key").notNull(),
	model: text("model").notNull(),
	temperature: integer("temperature").default(85).notNull(),
	maxTokens: integer("max_tokens").default(8192),
	scope: text("scope").default('user').notNull(),
	isDefault: integer("is_default").default(0),
	isActive: integer("is_active").default(1),
	modelType: text("model_type").default('text').notNull(),
	extraConfig: text("extra_config"),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("ai_configs_user_id_idx").on(table.userId),
	index("ai_configs_provider_idx").on(table.provider),
	index("ai_configs_scope_idx").on(table.scope),
	index("ai_configs_model_type_idx").on(table.modelType),
]);

export const modelPrompts = sqliteTable("model_prompts", {
	id: text("id").primaryKey().notNull(),
	code: text("code").notNull().unique(),
	name: text("name").notNull(),
	description: text("description"),
	module: text("module").notNull(),
	systemPrompt: text("system_prompt").notNull(),
	userPrompt: text("user_prompt"),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: integer("is_active").default(1).notNull(),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("model_prompts_code_idx").on(table.code),
	index("model_prompts_module_idx").on(table.module),
]);

const { createInsertSchema } = createSchemaFactory({
	coerce: { date: true },
});

export const insertUserSchema = createInsertSchema(users).pick({
	username: true,
	email: true,
	passwordHash: true,
	nickname: true,
	avatar: true,
});

export const updateUserSchema = createInsertSchema(users)
	.pick({
		nickname: true,
		avatar: true,
		memberLevelId: true,
		memberExpireAt: true,
		memberStatus: true,
		chapterLimit: true,
		isActive: true,
	})
	.partial();

export const insertMemberLevelSchema = createInsertSchema(memberLevels).pick({
	code: true,
	name: true,
	description: true,
	price: true,
	duration: true,
	features: true,
	sortOrder: true,
	isActive: true,
	chapterLimit: true,
});

export const updateMemberLevelSchema = createInsertSchema(memberLevels)
	.pick({
		name: true,
		description: true,
		price: true,
		duration: true,
		features: true,
		sortOrder: true,
		isActive: true,
		chapterLimit: true,
	})
	.partial();

export const insertMemberOrderSchema = createInsertSchema(memberOrders).pick({
	userId: true,
	memberLevelId: true,
	orderNo: true,
	amount: true,
	paymentMethod: true,
});

export const updateMemberOrderSchema = createInsertSchema(memberOrders)
	.pick({
		paymentStatus: true,
		paymentTime: true,
		startTime: true,
		endTime: true,
	})
	.partial();

export const insertScriptSchema = createInsertSchema(scripts).pick({
	novelId: true,
	userId: true,
	status: true,
}).extend({
	chapters: z.any().optional(),
});

export const updateScriptSchema = createInsertSchema(scripts)
	.pick({
		status: true,
	})
	.extend({
		chapters: z.any().optional(),
	})
	.partial();

export const insertModelPromptSchema = createInsertSchema(modelPrompts).pick({
	code: true,
	name: true,
	description: true,
	module: true,
	systemPrompt: true,
	userPrompt: true,
	sortOrder: true,
	isActive: true,
});

export const updateModelPromptSchema = createInsertSchema(modelPrompts)
	.pick({
		name: true,
		description: true,
		module: true,
		systemPrompt: true,
		userPrompt: true,
		sortOrder: true,
		isActive: true,
	})
	.partial();

export const insertNovelSchema = createInsertSchema(novels).pick({
	userId: true,
	title: true,
	description: true,
	category: true,
	genderTarget: true,
	narrativePerspective: true,
	protagonist: true,
	supportingCharacterName: true,
	totalChapters: true,
	currentChapters: true,
	status: true,
}).extend({
	tone: z.any().optional(),
	idea: z.any().optional(),
	structure: z.any().optional(),
	chapters: z.any().optional(),
});

export const updateNovelSchema = createInsertSchema(novels)
	.pick({
		title: true,
		description: true,
		category: true,
		genderTarget: true,
		narrativePerspective: true,
		protagonist: true,
		supportingCharacterName: true,
		totalChapters: true,
		currentChapters: true,
		status: true,
	})
	.extend({
		tone: z.any().optional(),
		idea: z.any().optional(),
		structure: z.any().optional(),
		chapters: z.any().optional(),
	})
	.partial();

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;

export type MemberLevel = typeof memberLevels.$inferSelect;
export type InsertMemberLevel = z.infer<typeof insertMemberLevelSchema>;
export type UpdateMemberLevel = z.infer<typeof updateMemberLevelSchema>;

export type MemberOrder = typeof memberOrders.$inferSelect;
export type InsertMemberOrder = z.infer<typeof insertMemberOrderSchema>;
export type UpdateMemberOrder = z.infer<typeof updateMemberOrderSchema>;

export type Novel = typeof novels.$inferSelect;
export type InsertNovel = z.infer<typeof insertNovelSchema>;
export type UpdateNovel = z.infer<typeof updateNovelSchema>;

// ====== 小说子表 Schemas & Types ======

export const insertNovelPlotSchema = createInsertSchema(novelPlots).pick({
	novelId: true,
	userId: true,
	mainPlot: true,
	emotionalCurve: true,
	keyConflicts: true,
	sortOrder: true,
});
export const updateNovelPlotSchema = createInsertSchema(novelPlots)
	.pick({ mainPlot: true, emotionalCurve: true, keyConflicts: true, sortOrder: true })
	.partial();
export type NovelPlot = typeof novelPlots.$inferSelect;
export type InsertNovelPlot = z.infer<typeof insertNovelPlotSchema>;
export type UpdateNovelPlot = z.infer<typeof updateNovelPlotSchema>;

export const insertNovelChapterHookSchema = createInsertSchema(novelChapterHooks).pick({
	novelId: true,
	userId: true,
	chapterNumber: true,
	title: true,
	hook: true,
	status: true,
});
export const updateNovelChapterHookSchema = createInsertSchema(novelChapterHooks)
	.pick({ title: true, hook: true, status: true })
	.partial();
export type NovelChapterHook = typeof novelChapterHooks.$inferSelect;
export type InsertNovelChapterHook = z.infer<typeof insertNovelChapterHookSchema>;
export type UpdateNovelChapterHook = z.infer<typeof updateNovelChapterHookSchema>;

export const insertNovelCharacterSchema = createInsertSchema(novelCharacters).pick({
	novelId: true,
	userId: true,
	name: true,
	role: true,
	description: true,
	personality: true,
	appearance: true,
	background: true,
	relationships: true,
	sortOrder: true,
});
export const updateNovelCharacterSchema = createInsertSchema(novelCharacters)
	.pick({ name: true, role: true, description: true, personality: true, appearance: true, background: true, relationships: true, sortOrder: true })
	.partial();
export type NovelCharacter = typeof novelCharacters.$inferSelect;
export type InsertNovelCharacter = z.infer<typeof insertNovelCharacterSchema>;
export type UpdateNovelCharacter = z.infer<typeof updateNovelCharacterSchema>;

export const insertNovelSceneSchema = createInsertSchema(novelScenes).pick({
	novelId: true,
	userId: true,
	name: true,
	description: true,
	atmosphere: true,
	relatedChapters: true,
	sortOrder: true,
});
export const updateNovelSceneSchema = createInsertSchema(novelScenes)
	.pick({ name: true, description: true, atmosphere: true, relatedChapters: true, sortOrder: true })
	.partial();
export type NovelScene = typeof novelScenes.$inferSelect;
export type InsertNovelScene = z.infer<typeof insertNovelSceneSchema>;
export type UpdateNovelScene = z.infer<typeof updateNovelSceneSchema>;

export const insertNovelItemSchema = createInsertSchema(novelItems).pick({
	novelId: true,
	userId: true,
	name: true,
	description: true,
	significance: true,
	relatedChapters: true,
	sortOrder: true,
});
export const updateNovelItemSchema = createInsertSchema(novelItems)
	.pick({ name: true, description: true, significance: true, relatedChapters: true, sortOrder: true })
	.partial();
export type NovelItem = typeof novelItems.$inferSelect;
export type InsertNovelItem = z.infer<typeof insertNovelItemSchema>;
export type UpdateNovelItem = z.infer<typeof updateNovelItemSchema>;

export const insertNovelCharacterRelationshipSchema = createInsertSchema(novelCharacterRelationships).pick({
	novelId: true, userId: true, fromCharacter: true, toCharacter: true, relationship: true, sortOrder: true,
});
export const updateNovelCharacterRelationshipSchema = createInsertSchema(novelCharacterRelationships)
	.pick({ fromCharacter: true, toCharacter: true, relationship: true, sortOrder: true })
	.partial();
export type NovelCharacterRelationship = typeof novelCharacterRelationships.$inferSelect;
export type InsertNovelCharacterRelationship = z.infer<typeof insertNovelCharacterRelationshipSchema>;
export type UpdateNovelCharacterRelationship = z.infer<typeof updateNovelCharacterRelationshipSchema>;

export type Script = typeof scripts.$inferSelect;
export type InsertScript = z.infer<typeof insertScriptSchema>;
export type UpdateScript = z.infer<typeof updateScriptSchema>;

export const insertAiConfigSchema = createInsertSchema(aiConfigs).omit({ id: true });
export const updateAiConfigSchema = createInsertSchema(aiConfigs).partial();

export type AiConfig = typeof aiConfigs.$inferSelect;
export type InsertAiConfig = z.infer<typeof insertAiConfigSchema>;
export type UpdateAiConfig = z.infer<typeof updateAiConfigSchema>;

export const inviteCodes = sqliteTable("invite_codes", {
	id: text("id").primaryKey().notNull(),
	code: text("code").notNull().unique(),
	description: text("description"),
	levelType: text("level_type"),
	memberLevelId: text("member_level_id"),
	maxUses: integer("max_uses").default(1).notNull(),
	currentUses: integer("current_uses").default(0).notNull(),
	isUsedUp: integer("is_used_up").default(0).notNull(),
	isActive: integer("is_active").default(1).notNull(),
	expiresAt: text("expires_at"),
	createdBy: text("created_by"),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("invite_codes_code_idx").on(table.code),
	index("invite_codes_status_idx").on(table.isActive),
	index("invite_codes_level_type_idx").on(table.levelType),
]);

export const insertInviteCodeSchema = createInsertSchema(inviteCodes).pick({
	code: true,
	description: true,
	levelType: true,
	memberLevelId: true,
	maxUses: true,
	expiresAt: true,
}).partial().transform((data) => ({
	// code 为空时自动生成
	code: data.code || `INV${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
	description: data.description,
	levelType: data.levelType,
	memberLevelId: data.memberLevelId,
	maxUses: data.maxUses ?? 1,
	expiresAt: data.expiresAt,
}));

export const updateInviteCodeSchema = createInsertSchema(inviteCodes)
	.pick({
		description: true,
		maxUses: true,
		isActive: true,
		isUsedUp: true,
		expiresAt: true,
	})
	.partial();

export type InviteCode = typeof inviteCodes.$inferSelect;
export type InsertInviteCode = z.infer<typeof insertInviteCodeSchema>;
export type UpdateInviteCode = z.infer<typeof updateInviteCodeSchema>;

// ====== 短剧表 ======

export const shortDramas = sqliteTable("short_dramas", {
	id: text("id").primaryKey().notNull(),
	novelId: text("novel_id"),
	scriptId: text("script_id"),
	userId: text("user_id").notNull(),
	title: text("title").notNull(),
	description: text("description"),
	genre: text("genre"),
	targetAudience: text("target_audience"),
	totalEpisodes: integer("total_episodes").default(0).notNull(),
	currentEpisodes: integer("current_episodes").default(0).notNull(),
	episodeDuration: integer("episode_duration").default(60),
	status: text("status").default('draft'),
	coverImage: text("cover_image"),
	tags: text("tags"),
	style: text("style"),
	platform: text("platform"),
	characterStyle: text("character_style"),
	sceneStyle: text("scene_style"),
	itemStyle: text("item_style"),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("short_dramas_user_id_idx").on(table.userId),
	index("short_dramas_novel_id_idx").on(table.novelId),
	index("short_dramas_script_id_idx").on(table.scriptId),
	index("short_dramas_status_idx").on(table.status),
]);

export const shortDramaEpisodes = sqliteTable("short_drama_episodes", {
	id: text("id").primaryKey().notNull(),
	dramaId: text("drama_id").notNull(),
	userId: text("user_id").notNull(),
	episodeNumber: integer("episode_number").notNull(),
	title: text("title"),
	synopsis: text("synopsis"),
	screenplay: text("screenplay"),
	scenes: text("scenes"),
	dialogues: text("dialogues"),
	directions: text("directions"),
	imagePrompts: text("image_prompts"),
	videoPrompts: text("video_prompts"),
	duration: integer("duration"),
	status: text("status").default('draft'),
	sourceChapter: integer("source_chapter"),
	sourceScriptChapterIndex: integer("source_script_chapter_index"),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("short_drama_episodes_drama_id_idx").on(table.dramaId),
	index("short_drama_episodes_user_id_idx").on(table.userId),
	index("short_drama_episodes_number_idx").on(table.dramaId, table.episodeNumber),
]);

export const insertShortDramaSchema = createInsertSchema(shortDramas).pick({
	novelId: true,
	scriptId: true,
	userId: true,
	title: true,
	description: true,
	genre: true,
	targetAudience: true,
	totalEpisodes: true,
	episodeDuration: true,
	status: true,
	coverImage: true,
	tags: true,
	style: true,
	platform: true,
});
export const updateShortDramaSchema = createInsertSchema(shortDramas)
	.pick({ title: true, description: true, genre: true, targetAudience: true, totalEpisodes: true, episodeDuration: true, status: true, coverImage: true, tags: true, style: true, platform: true, scriptId: true, novelId: true, characterStyle: true, sceneStyle: true, itemStyle: true })
	.partial();
export type ShortDrama = typeof shortDramas.$inferSelect;
export type InsertShortDrama = z.infer<typeof insertShortDramaSchema>;
export type UpdateShortDrama = z.infer<typeof updateShortDramaSchema>;

export const insertShortDramaEpisodeSchema = createInsertSchema(shortDramaEpisodes).pick({
	dramaId: true,
	userId: true,
	episodeNumber: true,
	title: true,
	synopsis: true,
	screenplay: true,
	scenes: true,
	dialogues: true,
	directions: true,
	imagePrompts: true,
	videoPrompts: true,
	duration: true,
	status: true,
	sourceChapter: true,
	sourceScriptChapterIndex: true,
});
export const updateShortDramaEpisodeSchema = createInsertSchema(shortDramaEpisodes)
	.pick({ title: true, synopsis: true, screenplay: true, scenes: true, dialogues: true, directions: true, imagePrompts: true, videoPrompts: true, duration: true, status: true, sourceChapter: true, sourceScriptChapterIndex: true })
	.partial();
export type ShortDramaEpisode = typeof shortDramaEpisodes.$inferSelect;
export type InsertShortDramaEpisode = z.infer<typeof insertShortDramaEpisodeSchema>;
export type UpdateShortDramaEpisode = z.infer<typeof updateShortDramaEpisodeSchema>;

// ====== 短剧角色表 ======

export const dramaCharacters = sqliteTable("drama_characters", {
	id: text("id").primaryKey().notNull(),
	dramaId: text("drama_id").notNull(),
	userId: text("user_id").notNull(),
	name: text("name").notNull(),
	role: text("role").default('supporting'),
	gender: text("gender"),
	description: text("description"),
	personality: text("personality"),
	appearance: text("appearance"),
	voiceId: text("voice_id"),
	voiceProvider: text("voice_provider"),
	voiceConfig: text("voice_config"),
	imageUrl: text("image_url"),
	imagePrompt: text("image_prompt"),
	referenceImages: text("reference_images"),
	sortOrder: integer("sort_order").default(0),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("drama_characters_drama_id_idx").on(table.dramaId),
	index("drama_characters_user_id_idx").on(table.userId),
]);

export const insertDramaCharacterSchema = createInsertSchema(dramaCharacters).pick({
	dramaId: true, userId: true, name: true, role: true, gender: true, description: true,
	personality: true, appearance: true, voiceId: true, voiceProvider: true,
	voiceConfig: true, imageUrl: true, imagePrompt: true, referenceImages: true, sortOrder: true,
});
export const updateDramaCharacterSchema = createInsertSchema(dramaCharacters)
	.pick({ name: true, role: true, gender: true, description: true, personality: true, appearance: true,
		voiceId: true, voiceProvider: true, voiceConfig: true, imageUrl: true, imagePrompt: true,
		referenceImages: true, sortOrder: true })
	.partial();
export type DramaCharacter = typeof dramaCharacters.$inferSelect;
export type InsertDramaCharacter = z.infer<typeof insertDramaCharacterSchema>;
export type UpdateDramaCharacter = z.infer<typeof updateDramaCharacterSchema>;

// ====== 短剧场景表 ======

export const dramaScenes = sqliteTable("drama_scenes", {
	id: text("id").primaryKey().notNull(),
	dramaId: text("drama_id").notNull(),
	userId: text("user_id").notNull(),
	name: text("name").notNull(),
	description: text("description"),
	atmosphere: text("atmosphere"),
	imageUrl: text("image_url"),
	imagePrompt: text("image_prompt"),
	sortOrder: integer("sort_order").default(0),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("drama_scenes_drama_id_idx").on(table.dramaId),
	index("drama_scenes_user_id_idx").on(table.userId),
]);

export const insertDramaSceneSchema = createInsertSchema(dramaScenes).pick({
	dramaId: true, userId: true, name: true, description: true,
	atmosphere: true, imageUrl: true, imagePrompt: true, sortOrder: true,
});
export const updateDramaSceneSchema = createInsertSchema(dramaScenes)
	.pick({ name: true, description: true, atmosphere: true, imageUrl: true, imagePrompt: true, sortOrder: true })
	.partial();
export type DramaScene = typeof dramaScenes.$inferSelect;
export type InsertDramaScene = z.infer<typeof insertDramaSceneSchema>;
export type UpdateDramaScene = z.infer<typeof updateDramaSceneSchema>;

// ====== 短剧物品表 ======

export const dramaItems = sqliteTable("drama_items", {
	id: text("id").primaryKey().notNull(),
	dramaId: text("drama_id").notNull(),
	userId: text("user_id").notNull(),
	name: text("name").notNull(),
	description: text("description"),
	significance: text("significance"),
	imageUrl: text("image_url"),
	imagePrompt: text("image_prompt"),
	sortOrder: integer("sort_order").default(0),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("drama_items_drama_id_idx").on(table.dramaId),
	index("drama_items_user_id_idx").on(table.userId),
]);

export const insertDramaItemSchema = createInsertSchema(dramaItems).pick({
	dramaId: true, userId: true, name: true, description: true,
	significance: true, imageUrl: true, imagePrompt: true, sortOrder: true,
});
export const updateDramaItemSchema = createInsertSchema(dramaItems)
	.pick({ name: true, description: true, significance: true, imageUrl: true, imagePrompt: true, sortOrder: true })
	.partial();
export type DramaItem = typeof dramaItems.$inferSelect;
export type InsertDramaItem = z.infer<typeof insertDramaItemSchema>;
export type UpdateDramaItem = z.infer<typeof updateDramaItemSchema>;

// ====== 短剧分镜表 ======

export const dramaStoryboards = sqliteTable("drama_storyboards", {
	id: text("id").primaryKey().notNull(),
	dramaId: text("drama_id").notNull(),
	episodeId: text("episode_id").notNull(),
	userId: text("user_id").notNull(),
	shotNumber: integer("shot_number").notNull(),
	shotType: text("shot_type").default('storyboard'),
	sceneDescription: text("scene_description"),
	cameraAngle: text("camera_angle"),
	cameraMovement: text("camera_movement"),
	dialogue: text("dialogue"),
	voiceover: text("voiceover"),
	soundEffects: text("sound_effects"),
	characterIds: text("character_ids"),
	imagePrompt: text("image_prompt"),
	imageUrl: text("image_url"),
	videoPrompt: text("video_prompt"),
	videoUrl: text("video_url"),
	audioUrl: text("audio_url"),
	ttsText: text("tts_text"),
	ttsVoiceId: text("tts_voice_id"),
	subtitle: text("subtitle"),
	duration: integer("duration").default(3),
	status: text("status").default('draft'),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text("updated_at"),
}, (table) => [
	index("drama_storyboards_drama_id_idx").on(table.dramaId),
	index("drama_storyboards_episode_id_idx").on(table.episodeId),
	index("drama_storyboards_user_id_idx").on(table.userId),
	index("drama_storyboards_shot_idx").on(table.episodeId, table.shotNumber),
]);

export const insertDramaStoryboardSchema = createInsertSchema(dramaStoryboards).pick({
	dramaId: true, episodeId: true, userId: true, shotNumber: true, shotType: true,
	sceneDescription: true, cameraAngle: true, cameraMovement: true, dialogue: true,
	voiceover: true, soundEffects: true, characterIds: true, imagePrompt: true,
	imageUrl: true, videoPrompt: true, videoUrl: true, audioUrl: true, ttsText: true,
	ttsVoiceId: true, subtitle: true, duration: true, status: true,
});
export const updateDramaStoryboardSchema = createInsertSchema(dramaStoryboards)
	.pick({ shotNumber: true, shotType: true, sceneDescription: true, cameraAngle: true,
		cameraMovement: true, dialogue: true, voiceover: true, soundEffects: true,
		characterIds: true, imagePrompt: true, imageUrl: true, videoPrompt: true,
		videoUrl: true, audioUrl: true, ttsText: true, ttsVoiceId: true, subtitle: true,
		duration: true, status: true })
	.partial();
export type DramaStoryboard = typeof dramaStoryboards.$inferSelect;
export type InsertDramaStoryboard = z.infer<typeof insertDramaStoryboardSchema>;
export type UpdateDramaStoryboard = z.infer<typeof updateDramaStoryboardSchema>;

// ====== 短剧资产表 ======

export const dramaAssets = sqliteTable("drama_assets", {
	id: text("id").primaryKey().notNull(),
	dramaId: text("drama_id").notNull(),
	userId: text("user_id").notNull(),
	type: text("type").notNull(),
	name: text("name").notNull(),
	url: text("url"),
	localPath: text("local_path"),
	mimeType: text("mime_type"),
	fileSize: integer("file_size"),
	width: integer("width"),
	height: integer("height"),
	duration: integer("duration"),
	metadata: text("metadata"),
	relatedShotId: text("related_shot_id"),
	relatedEpisodeId: text("related_episode_id"),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("drama_assets_drama_id_idx").on(table.dramaId),
	index("drama_assets_user_id_idx").on(table.userId),
	index("drama_assets_type_idx").on(table.type),
]);

export const insertDramaAssetSchema = createInsertSchema(dramaAssets).pick({
	dramaId: true, userId: true, type: true, name: true, url: true, localPath: true,
	mimeType: true, fileSize: true, width: true, height: true, duration: true,
	metadata: true, relatedShotId: true, relatedEpisodeId: true,
});
export type DramaAsset = typeof dramaAssets.$inferSelect;
export type InsertDramaAsset = z.infer<typeof insertDramaAssetSchema>;

// ====== 短剧任务表 ======

export const dramaTasks = sqliteTable("drama_tasks", {
	id: text("id").primaryKey().notNull(),
	dramaId: text("drama_id").notNull(),
	userId: text("user_id").notNull(),
	type: text("type").notNull(),
	targetId: text("target_id"),
	provider: text("provider"),
	model: text("model"),
	status: text("status").default('pending').notNull(),
	progress: integer("progress").default(0),
	input: text("input"),
	output: text("output"),
	error: text("error"),
	startedAt: text("started_at"),
	completedAt: text("completed_at"),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("drama_tasks_drama_id_idx").on(table.dramaId),
	index("drama_tasks_user_id_idx").on(table.userId),
	index("drama_tasks_status_idx").on(table.status),
	index("drama_tasks_type_idx").on(table.type),
]);

export const insertDramaTaskSchema = createInsertSchema(dramaTasks).pick({
	dramaId: true, userId: true, type: true, targetId: true, provider: true,
	model: true, status: true, input: true,
});
export type DramaTask = typeof dramaTasks.$inferSelect;
export type InsertDramaTask = z.infer<typeof insertDramaTaskSchema>;

// ====== AI 图片/视频/TTS 提供商 ======

export const IMAGE_PROVIDERS = [
	{ id: "openai", name: "OpenAI DALL-E", baseUrl: "https://api.openai.com/v1", models: ["dall-e-3", "gpt-image-1", "dall-e-2"] },
	{ id: "gpt-image-2", name: "GPT Image 2", baseUrl: "https://api.openai.com/v1", models: ["gpt-image-2"] },
	{ id: "codex-gpt-image-2", name: "Codex GPT Image 2", baseUrl: "https://api.openai.com/v1", models: ["gpt-image-2"] },
	{ id: "siliconflow", name: "硅基流动 SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", models: ["black-forest-labs/FLUX.1-schnell", "black-forest-labs/FLUX.1-dev", "stabilityai/stable-diffusion-3-5-large", "stabilityai/stable-diffusion-xl-base-1.0", "Kwai-Kolors/Kolors", "Pro/black-forest-labs/FLUX.1-schnell"] },
	{ id: "stability-ai", name: "Stability AI", baseUrl: "https://api.stability.ai", models: ["stable-image-ultra", "stable-image-core", "sd3.5-large", "sd3.5-medium", "sd3.5-large-turbo"] },
	{ id: "cogview", name: "智谱 CogView", baseUrl: "https://open.bigmodel.cn/api/paas/v4", models: ["cogview-4-250304", "cogview-4-flash", "cogview-3-flash", "cogview-3"] },
	{ id: "minimax", name: "MiniMax", baseUrl: "https://api.minimax.chat/v1", models: ["image-01"] },
	{ id: "volcengine", name: "火山引擎", baseUrl: "https://visual.volcengineapi.com", models: ["high_aes_general_v21", "high_aes_general_v20", "high_aes_general_v14l"] },
	{ id: "qwen-image", name: "阿里通义万相", baseUrl: "https://dashscope.aliyuncs.com/api/v1", models: ["wanx2.1-t2i-turbo", "wanx2.1-t2i-plus", "wanx2.1-sketch-t2i-v1", "wanx-v1"] },
	{ id: "gemini-image", name: "Google Imagen", baseUrl: "https://generativelanguage.googleapis.com/v1beta", models: ["imagen-4.0-generate-preview-06-06", "imagen-4.0-ultra-generate-exp-05-20", "imagen-3.0-generate-002"] },
	{ id: "ideogram", name: "Ideogram", baseUrl: "https://api.ideogram.ai", models: ["V_3", "V_2_TURBO", "V_2"] },
	{ id: "chatfire", name: "Chatfire", baseUrl: "https://api.chatfire.cn/v1", models: ["chatfire-image-1"] },
	{ id: "gemini-banana", name: "Gemini香蕉生图(本地代理)", baseUrl: "http://127.0.0.1:8000", models: ["gemini-3.0-pro-image-landscape-2k", "gemini-3.0-pro-image-portrait-2k", "gemini-3.0-pro-image-landscape", "gemini-3.0-pro-image-portrait", "gemini-3.1-flash-image-landscape-2k", "gemini-3.1-flash-image-portrait-2k", "gemini-3.1-flash-image-landscape", "gemini-3.1-flash-image-portrait"] },
	{ id: "custom-image", name: "自定义图片API", baseUrl: "", models: [] },
] as const;

export const VIDEO_PROVIDERS = [
	{ id: "kling", name: "可灵 Kling AI", baseUrl: "https://api.klingai.com", models: ["kling-v2-master", "kling-v1-6", "kling-v1-5", "kling-v1"] },
	{ id: "minimax-video", name: "MiniMax Video", baseUrl: "https://api.minimax.chat/v1", models: ["video-01-director", "video-01", "T2V-01-Director"] },
	{ id: "volcengine-video", name: "火山引擎 Seedance", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", models: ["seedance-1-0-pro-250528", "seedance-1-0-lite-250528"] },
	{ id: "vidu", name: "Vidu", baseUrl: "https://api.vidu.cn/v1", models: ["vidu-2.0", "vidu-1.5", "vidu-1.0"] },
	{ id: "runway", name: "Runway ML", baseUrl: "https://api.dev.runwayml.com", models: ["gen4_turbo", "gen4", "gen3a_turbo"] },
	{ id: "luma", name: "Luma Dream Machine", baseUrl: "https://api.lumalabs.ai", models: ["ray-2", "ray-flash-2", "ray-2-720p"] },
	{ id: "qwen-video", name: "阿里通义万象", baseUrl: "https://dashscope.aliyuncs.com/api/v1", models: ["wanx2.1-i2v-turbo", "wanx2.1-i2v-plus", "wanx-v1-video"] },
	{ id: "grok-video", name: "Grok (xAI)", baseUrl: "https://api.x.ai/v1", models: ["grok-2-aurora"] },
	{ id: "seedance2", name: "Seedance 2.0", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", models: ["seedance-2-0-pro-250616", "seedance-2-0-lite-250616"] },
	{ id: "veo", name: "Google Veo", baseUrl: "https://generativelanguage.googleapis.com/v1beta", models: ["veo_3_1_i2v_fast_landscape", "veo_3_1_i2v_fast_portrait", "veo_3_1_i2v_lite_landscape", "veo_3_1_i2v_lite_portrait", "veo_3_1_t2v_fast_landscape", "veo_3_1_t2v_fast_portrait", "veo-3.0-generate-preview", "veo-2.0-generate-001"] },
	{ id: "custom-video", name: "自定义视频API", baseUrl: "", models: [] },
] as const;

export const TTS_PROVIDERS = [
	{ id: "minimax-tts", name: "MiniMax TTS", baseUrl: "https://api.minimax.chat/v1", models: ["speech-02-hd", "speech-02", "speech-01-turbo"] },
	{ id: "gpt-sovits", name: "GPT-SoVITS", baseUrl: "http://localhost:9880", models: ["default"] },
	{ id: "edge-tts", name: "EdgeTTS", baseUrl: "", models: ["zh-CN-XiaoxiaoNeural", "zh-CN-YunxiNeural", "zh-CN-YunjianNeural", "zh-CN-XiaoyiNeural"] },
	{ id: "index-tts", name: "IndexTTS", baseUrl: "http://localhost:8080", models: ["default"] },
	{ id: "custom-tts", name: "自定义TTS", baseUrl: "", models: [] },
] as const;

export const AI_PROVIDERS = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", models: [
    "gpt-4.5", "gpt-4.5-turbo", "gpt-4.5-preview",
    "gpt-4o", "gpt-4o-2024-11-20", "gpt-4o-mini", "gpt-4o-mini-2024-07-18",
    "gpt-4-turbo", "gpt-4-turbo-2024-04-09",
    "gpt-4", "gpt-4-32k",
    "gpt-3.5-turbo", "gpt-3.5-turbo-16k"
  ]},
  { id: "anthropic", name: "Anthropic Claude", baseUrl: "https://api.anthropic.com/v1", models: [
    "claude-sonnet-4-20250514", "claude-sonnet-4", 
    "claude-3-5-sonnet-latest", "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-latest", "claude-3-5-haiku-20241022",
    "claude-3-opus-latest", "claude-3-opus-20240229",
    "claude-3-sonnet-latest", "claude-3-sonnet-20240229",
    "claude-3-haiku-latest", "claude-3-haiku-20240307"
  ]},
  { id: "google", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/models", models: [
    "gemini-2.5-pro-preview-06-05", "gemini-2.5-flash-preview-05-20",
    "gemini-2.0-pro-exp", "gemini-2.0-flash-exp",
    "gemini-1.5-pro-latest", "gemini-1.5-pro-001", "gemini-1.5-pro-002", "gemini-1.5-pro-002",
    "gemini-1.5-flash-latest", "gemini-1.5-flash-001", "gemini-1.5-flash-002", "gemini-1.5-flash-002",
    "gemini-1.5-flash-8b-latest", "gemini-1.5-flash-8b-001"
  ]},
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", models: [
    "deepseek-v3-2-251201", "deepseek-v3", "deepseek-chat",
    "deepseek-r1-250528", "deepseek-r1", "deepseek-r1-distill-qwen-32b",
    "deepseek-coder", "deepseek-coder-lite"
  ]},
  { id: "qwen", name: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: [
    "qwen3-4-32b", "qwen3-1.7b", "qwen3-8b", "qwen3-32b", "qwen3-57b-a47b", "qwen3-140b-a47b",
    "qwen-plus", "qwen-plus-latest", "qwen-max", "qwen-max-latest",
    "qwen-turbo", "qwen-turbo-latest", "qwen-long",
    "qwq-32b", "qwen2.5-72b-instruct", "qwen2.5-7b-instruct"
  ]},
  { id: "kimi", name: "Kimi Moonshot", baseUrl: "https://api.moonshot.cn/v1", models: [
    "kimi-k2-260127",
    "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k",
    "moonshot-v1-auto"
  ]},
  { id: "zhipu", name: "智谱AI GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", models: [
    "glm-5.0-260211", "glm-5-turbo-260316",
    "glm-4-7-251222", "glm-4-plus", "glm-4-flash",
    "glm-4", "glm-4v", "glm-4-airx", "glm-4-air",
    "glm-3-turbo", "glm-3"
  ]},
  { id: "minimax", name: "MiniMax", baseUrl: "https://api.minimax.chat/v", models: [
    "MiniMax-Text-01", "MiniMax-Text-01-Turbo",
    "abab6.5s-chat", "abab6.5g-chat", "abab5.5-chat",
    "abab5.5s-chat"
  ]},
  { id: "step", name: "阶跃星辰 Step", baseUrl: "https://api.stepfun.com/v1", models: [
    "step-2-250528", "step-2-mini",
    "step-1v-8k", "step-1v-32k",
    "step-1o-mini"
  ]},
  { id: "yi", name: "零一万物 Yi", baseUrl: "https://api.lingyiwanwu.com/v1", models: [
    "yi-large", "yi-large-rag", "yi-medium", "yi-medium-200k",
    "yi-spark", "yi-34b-chat", "yi-9b-chat"
  ]},
  { id: "tiangong", name: "天工AI", baseUrl: "https://api.tiangong.cn/v1", models: [
    "Skywork-o1", "Skywork-o1-0414",
    "Skywork-13b-chat", "Skywork-13b"
  ]},
  { id: "xfyun", name: "讯飞星火", baseUrl: "https://spark-api.xf-yun.com/v1", models: [
    "generalv3.5", "generalv3",
    "generalv2.0", "general"
  ]},
  { id: "baidu", name: "百度文心", baseUrl: "https://qianfan.baidubce.com/v2", models: [
    "ernie-4.0-8k-latest", "ernie-4.0-8k", "ernie-4.0-turbo-8k",
    "ernie-3.5-8k", "ernie-3.5-8k-attention",
    "ernie-speed-128k", "ernie-speed-8k", "ernie-lite-8k"
  ]},
  { id: "doubao", name: "字节豆包", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", models: [
    "doubao-seed-2.0-pro-260215", "doubao-seed-2.0-lite-260215", "doubao-seed-2.0-mini-260215",
    "doubao-seed-1.8-251228",
    "doubao-pro-32k", "doubao-pro-4k"
  ]},
  { id: "custom", name: "自定义API", baseUrl: "", models: [] },
] as const;