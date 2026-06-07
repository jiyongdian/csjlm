import { modelPromptManager } from '@/storage/database';

/**
 * 从数据库获取提示词，如果数据库无记录则使用fallback
 * 
 * 注意：数据库中的提示词是静态指令文本，不包含动态变量。
 * 动态内容（如章节索引、批次信息等）由各路由在获取提示词后自行附加。
 * 
 * @param code 提示词代码（如 'idea', 'chapter-stream', 'video-prompts' 等）
 * @param fallback 数据库无记录时的默认提示词
 */
export async function getPromptWithFallback(
  code: string,
  fallback: string,
): Promise<string> {
  try {
    const dbPrompt = await modelPromptManager.getPrompt(code);
    
    // 如果数据库有记录且有内容，使用数据库版本
    if (dbPrompt && dbPrompt.systemPrompt) {
      return dbPrompt.systemPrompt;
    }
  } catch (error) {
    console.warn(`[PromptHelper] Failed to get prompt "${code}" from DB, using fallback:`, error);
  }
  
  return fallback;
}

/**
 * 从数据库获取系统提示词和用户提示词
 * 
 * @param code 提示词代码
 * @param fallbackSystem 默认系统提示词
 * @param fallbackUser 默认用户提示词
 */
export async function getPromptsWithFallback(
  code: string,
  fallbackSystem: string,
  fallbackUser?: string,
): Promise<{ systemPrompt: string; userPrompt: string | undefined }> {
  try {
    const dbPrompt = await modelPromptManager.getPrompt(code);
    
    if (dbPrompt && dbPrompt.systemPrompt) {
      return {
        systemPrompt: dbPrompt.systemPrompt,
        userPrompt: dbPrompt.userPrompt || undefined,
      };
    }
  } catch (error) {
    console.warn(`[PromptHelper] Failed to get prompts "${code}" from DB, using fallback:`, error);
  }
  
  return {
    systemPrompt: fallbackSystem,
    userPrompt: fallbackUser,
  };
}
