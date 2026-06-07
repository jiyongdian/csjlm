import { LLMClient, Config } from 'coze-coding-dev-sdk';
import { aiConfigManager } from '@/storage/database/aiConfigManager';

/**
 * 根据 configId 创建 LLMClient
 * 如果 configId 为空或查找失败，使用默认 Config()
 */
export async function createLLMClient(configId?: string | null): Promise<LLMClient> {
  // 设置全局环境变量，确保SDK能读取到凭证
  if (process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  }
  if (process.env.OPENAI_BASE_URL) {
    process.env.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
  }

  if (!configId) {
    // 如果没有configId，使用默认配置或环境变量
    if (process.env.OPENAI_API_KEY) {
      const defaultConfig = new Config({
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
        modelBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
      });
      return new LLMClient(defaultConfig);
    }
    return new LLMClient(new Config());
  }

  try {
    const aiConfig = await aiConfigManager.getConfigById(configId);
    if (!aiConfig || !aiConfig.isActive) {
      console.warn(`[AIConfig] Config ${configId} not found or inactive, using default`);
      if (process.env.OPENAI_API_KEY) {
        const defaultConfig = new Config({
          baseUrl: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
          modelBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
          apiKey: process.env.OPENAI_API_KEY,
        });
        return new LLMClient(defaultConfig);
      }
      return new LLMClient(new Config());
    }

    // 使用自定义 API 配置创建 LLMClient
    // 注意：SDK 内部使用 modelBaseUrl 作为实际 API 调用地址，必须同步设置
    const customConfig = new Config({
      baseUrl: aiConfig.apiUrl,
      modelBaseUrl: aiConfig.apiUrl,
      apiKey: aiConfig.apiKey,
    });

    const client = new LLMClient(customConfig);
    return client;
  } catch (error) {
    console.error(`[AIConfig] Failed to create LLMClient for config ${configId}:`, error);
    if (process.env.OPENAI_API_KEY) {
      const defaultConfig = new Config({
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
        modelBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
      });
      return new LLMClient(defaultConfig);
    }
    return new LLMClient(new Config());
  }
}

/**
 * 获取 configId 对应的模型名称
 * 如果 configId 为空或查找失败，返回默认模型
 */
export async function getModelName(configId?: string | null, defaultModel: string = 'deepseek-v4-flash'): Promise<string> {
  if (!configId) {
    return defaultModel;
  }

  try {
    const aiConfig = await aiConfigManager.getConfigById(configId);
    if (aiConfig && aiConfig.model) {
      return aiConfig.model;
    }
    return defaultModel;
  } catch {
    return defaultModel;
  }
}

/**
 * 获取原始 AI 配置（apiUrl + apiKey），用于需要直接 fetch 的场景（如设置 max_tokens）
 */
export async function getRawAIConfig(configId?: string | null): Promise<{ apiUrl: string; apiKey: string }> {
  const defaultUrl = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';
  const defaultKey = process.env.OPENAI_API_KEY || '';

  if (!configId) {
    return { apiUrl: defaultUrl, apiKey: defaultKey };
  }

  try {
    const aiConfig = await aiConfigManager.getConfigById(configId);
    if (aiConfig && aiConfig.isActive) {
      return { apiUrl: aiConfig.apiUrl || defaultUrl, apiKey: aiConfig.apiKey || defaultKey };
    }
    return { apiUrl: defaultUrl, apiKey: defaultKey };
  } catch {
    return { apiUrl: defaultUrl, apiKey: defaultKey };
  }
}

/**
 * 获取 configId 对应的 temperature
 * 如果 configId 为空或查找失败，返回默认值
 */
export async function getTemperature(configId?: string | null, defaultTemp: number = 0.7): Promise<number> {
  if (!configId) {
    return defaultTemp;
  }

  try {
    const aiConfig = await aiConfigManager.getConfigById(configId);
    if (aiConfig && aiConfig.temperature !== null && aiConfig.temperature !== undefined) {
      // temperature 存储为 0-100 的整数，需要转换为 0-1 的小数
      return aiConfig.temperature / 100;
    }
    return defaultTemp;
  } catch {
    return defaultTemp;
  }
}