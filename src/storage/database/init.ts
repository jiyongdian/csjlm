import { db } from './sqlite';
import { users, memberLevels, memberOrders, novels, aiConfigs, inviteCodes } from './shared/schema';
import { hashPassword } from '@/lib/auth';
import { seedModelPrompts } from './shared/modelPromptsSeed';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function initDatabase() {
  try {
    console.log('初始化数据库...');
    
    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length > 0) {
      console.log('数据库已初始化，跳过');
      // 仍然同步提示词数据
      await seedModelPrompts();
      return;
    }
    
    const freeLevelId = generateUUID();
    const vipLevelId = generateUUID();
    const svipLevelId = generateUUID();
    
    await db.insert(memberLevels).values([
      {
        id: freeLevelId,
        code: 'free',
        name: '免费用户',
        description: '免费体验会员',
        price: 0,
        duration: 0,
        features: JSON.stringify(['基础小说生成', '最多11章']),
        chapterLimit: 11,
        sortOrder: 1,
        isActive: 1,
        createdAt: new Date().toISOString(),
      },
      {
        id: vipLevelId,
        code: 'vip',
        name: '创世纪VIP会员',
        description: '高级会员',
        price: 9900,
        duration: 30,
        features: JSON.stringify(['高级小说生成', '最多999章', '优先AI处理']),
        chapterLimit: 999,
        sortOrder: 2,
        isActive: 1,
        createdAt: new Date().toISOString(),
      },
      {
        id: svipLevelId,
        code: 'svip',
        name: '创世纪SVIP会员',
        description: '超级会员（年卡）',
        price: 29900,
        duration: 365,
        features: JSON.stringify(['顶级小说生成', '最多9999章', '优先AI处理', '专属客服']),
        chapterLimit: 9999,
        sortOrder: 3,
        isActive: 1,
        createdAt: new Date().toISOString(),
      },
    ]);
    
    const adminPasswordHash = await hashPassword('8683686');
    await db.insert(users).values({
      id: generateUUID(),
      username: 'admin',
      email: 'jiyongdian@gmail.com',
      passwordHash: adminPasswordHash,
      nickname: '系统管理员',
      avatar: null,
      memberLevelId: svipLevelId,
      memberExpireAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      memberStatus: 'active',
      isActive: 1,
      role: 'admin',
      chapterLimit: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    });
    
    await db.insert(aiConfigs).values({
      id: generateUUID(),
      userId: null,
      name: '创世纪联盟',
      provider: 'deepseek',
      apiUrl: 'https://api.deepseek.com/v1',
      apiKey: '',
      model: 'deepseek-chat',
      temperature: 85,
      maxTokens: 8192,
      scope: 'system',
      isDefault: 1,
      isActive: 1,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    });
    
    // 初始化提示词数据
    await seedModelPrompts();
    
    console.log('数据库初始化完成!');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
}