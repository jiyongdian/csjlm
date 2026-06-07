import { NextRequest } from 'next/server';
import { createLLMClient, getModelName, getTemperature, getRawAIConfig } from '@/lib/ai-config';
import { getUserFromToken } from '@/lib/auth';
import { novelManager } from '@/storage/database';
import { userManager } from '@/storage/database';
import { getPromptWithFallback } from '@/lib/prompt-helper';
import { getDb } from '@/storage/database/sqlite';
import { memberLevels } from '@/storage/database/shared/schema';
import { eq } from 'drizzle-orm';
import { extractJsonObject } from '@/lib/json-parser';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idea, structure, tone, genderTarget, narrativePerspective, protagonistName, supportingCharacterName, batchStart = 1, batchSize = 5, configId, previousChapterContent = '', previousChapterTitle = '', useCustomPrompt = false, customSystemPrompt = '' } = body;

    // 检查用户登录状态和章节限制（游客模式跳过）
    const authHeader = request.headers.get('Authorization');
    const payload = getUserFromToken(authHeader || '');
    
    if (payload) {
      // 登录用户，检查章节限制
      const user = await userManager.getUserById(payload.userId);
      if (user) {
        // 获取用户会员等级的章节上限
        // 优先级：用户单独设置 > 会员等级设置 > 免费用户默认11章
        let chapterLimit = user.chapterLimit !== null && user.chapterLimit !== undefined
          ? user.chapterLimit
          : null;
        if (chapterLimit === null && user.memberLevelId) {
          const db = await getDb();
          const levelsResult = await db.select().from(memberLevels).where(eq(memberLevels.id, user.memberLevelId)).limit(1);
          chapterLimit = levelsResult[0]?.chapterLimit ?? 11;
        } else if (chapterLimit === null) {
          chapterLimit = 11;
        }
        const currentChapters = await novelManager.getUserTotalChapters(payload.userId);
        const requestedChapters = batchSize || 1;
        
        // chapterLimit === 0 表示无限制，跳过检查
        if (chapterLimit > 0 && currentChapters + requestedChapters > chapterLimit) {
          const remaining = Math.max(0, chapterLimit - currentChapters);
          return new Response(
            JSON.stringify({
              error: `您的会员等级最多只能生成 ${chapterLimit} 章，当前已有 ${currentChapters} 章，剩余 ${remaining} 章可生成`
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }
    // 游客模式：不检查章节限制，直接生成

    if (!idea || !structure) {
      return new Response(
        '主题创意和结构分析信息不完整',
        { status: 400 }
      );
    }

    const client = await createLLMClient(configId);
    const modelName = await getModelName(configId);
    const temperature = await getTemperature(configId, 0.65);
    const { apiUrl, apiKey } = await getRawAIConfig(configId);

    // 直接 fetch 流式调用，明确设置 max_tokens=16384，避免 SDK 默认 4096 导致章节截断
    async function* streamWithMaxTokens(
      messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
      temp: number,
      maxTokens = 16384
    ) {
      const resp = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: modelName, messages, stream: true, temperature: temp, max_tokens: maxTokens }),
      });
      if (!resp.ok || !resp.body) throw new Error(`AI 接口错误: ${resp.status}`);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') return;
          try {
            const j = JSON.parse(raw);
            const c = j.choices?.[0]?.delta?.content;
            if (c) yield { content: c };
          } catch {}
        }
      }
    }
    
    // 性别方向说明
    const genderTargetName = genderTarget === 'male' ? '男频' : '女频';
    const genderGuide = genderTarget === 'male' 
      ? `【男频创作指南】
- 主角通常是男性，强调热血、成长、升级、打脸、兄弟情
- 情节节奏快，爽点密集，注重实力提升和对抗
- 配角多为兄弟、对手、美女角色
- 情感线相对简单，多是后宫或单一女主
- 强调"从弱变强"、"逆袭翻盘"、"征服挑战"等主题`
      : `【女频创作指南】
- 主角通常是女性，强调情感、细腻、成长、爱情
- 情节节奏相对较慢，注重情感描写和心理刻画
- 配角多为闺蜜、情敌、男主、男配
- 情感线复杂细腻，多重情感纠葛和内心戏
- 强调"情感救赎"、"自我成长"、"命中注定"等主题`;

    // 叙事视角说明
    const perspectiveMap: Record<string, { name: string; guide: string; rules: string }> = {
      'first-person': {
        name: '第一人称',
        guide: '以"我"来叙述',
        rules: `【第一人称叙事铁律】
- 全文只能用"我"作为叙述主体，所有信息和感受必须通过"我"的五官和判断传递
- ❌ 绝对禁止：写"我"不在场的事情、写他人的心理活动、写"我"不知道的信息
- ❌ 绝对禁止：使用"他心想""她暗自决定""他们不知道的是"等第三人称心理描写
- ✅ 正确做法：通过"我"的观察来推断他人——"他的眼神闪了闪，我猜他没说实话""她的手在发抖，看得出她很害怕"
- ✅ 正确做法：用"我"的感知替代上帝视角——"我听见隔壁传来争吵声""我注意到他的手指在发抖"
- 对话中可以借他人之口传递信息，但叙述视角必须始终锁定在"我"`
      },
      'third-limited': {
        name: '第三人称限制',
        guide: '用"他/她"称呼主角，视角锁定主角',
        rules: `【第三人称限制叙事铁律】
- 用"他/她"称呼主角，但视角始终锁定在主角身上
- ✅ 可以写：主角的所见所闻所想、主角观察到的他人行为
- ❌ 绝对禁止：切换到其他角色的心理活动——"李明心想""王芳暗自决定"都是违规
- ❌ 绝对禁止：写主角不知道的事情或不在场的事件
- ✅ 正确做法：通过主角的观察来呈现——"他看到她的手在发抖""从她躲闪的眼神中，他读出了什么"`
      },
      'third-omniscient': {
        name: '第三人称全知',
        guide: '上帝视角，可自由切换任何角色视角',
        rules: `【第三人称全知叙事铁律】
- 上帝视角，可以自由切换到任何角色的心理和视角
- ✅ 可以写：任何角色的心理活动、任何地点正在发生的事情
- ✅ 视角切换：可以在不同角色之间切换，展示多线叙事
- ⚠️ 切换规则：每次视角切换必须有明确的场景过渡（换段/换节），不能在同一段落内频繁切换
- ⚠️ 停留规则：每个视角至少停留1-2段，让读者"住进去"再切
- ✅ 适合：群像戏、权谋文、多线叙事、需要展示全局信息的故事`
      },
      'second-person': {
        name: '第二人称',
        guide: '用"你"来叙述，把读者拉进故事',
        rules: `【第二人称叙事铁律】
- 全文用"你"来叙述，让读者成为故事参与者
- ✅ 写法："你推开门，看见了那个不该出现的人""你的手心开始冒汗"
- ❌ 绝对禁止：突然切换到"他"或"我"的叙述视角，造成人称混乱
- ❌ 绝对禁止：让"你"变成旁观者——"你看着他做XX"，而应该是"你做了XX"
- ✅ 正确做法：每一段都要让"你"有感觉、有选择、有反应
- ✅ 适合：恐怖、悬疑、互动叙事等需要极强代入感的题材`
      }
    };
    const perspectiveInfo = perspectiveMap[narrativePerspective || 'third-limited'] || perspectiveMap['third-limited'];
    const perspectiveGuide = `【叙事视角：${perspectiveInfo.name}】${perspectiveInfo.guide}`;

    const encoder = new TextEncoder();

    // 计算批次范围
    const totalChapters = structure.chapterHooks.length;
    const startChapter = batchStart;
    const endChapter = Math.min(startChapter + batchSize - 1, totalChapters);

    // 获取当前批次的章节钩子
    const currentBatchHooks = structure.chapterHooks.slice(startChapter - 1, endChapter);

    // 从钩子中提炼标题的正则方法，作为 fallback
    const extractTitleFromHook = (hookText: string): string => {
      if (!hookText) return '';

      const dePatterns = [
        /([^\s，。！？、；：]{2,4})的([^\s，。！？、；：]{2,4})的/g,
        /([^\s，。！？、；：]{2,4})的([^\s，。！？、；：]{2,4})/g,
      ];
      for (const pattern of dePatterns) {
        const m = pattern.exec(hookText);
        if (m) {
          const combined = m[1] + m[2];
          const len = [...combined].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0x7f ? 1 : 0.5), 0);
          if (len >= 5 && len <= 10) return combined;
          const part2Len = [...m[2]].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0x7f ? 1 : 0.5), 0);
          if (part2Len >= 3 && part2Len <= 8) return m[2];
        }
      }

      const clauses = hookText.split(/[，。！？、；：\s]+/).filter(c => c.length >= 2);
      const coreWords: string[] = [];
      for (const clause of clauses) {
        const cleaned = clause
          .replace(/^(于是|然后|但是|可是|虽然|然而|因此|所以|他|她|它|他们)/, '')
          .replace(/(之后|以前|时候|地方|起来|出来|下去|起来)/, '');
        if (cleaned.length >= 2 && cleaned.length <= 6) {
          coreWords.push(cleaned);
        } else if (cleaned.length > 6) {
          coreWords.push(cleaned.slice(0, 2));
          coreWords.push(cleaned.slice(-2));
        }
      }

      if (coreWords.length >= 2) {
        const combined = coreWords.slice(0, 2).join('');
        const len = [...combined].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0x7f ? 1 : 0.5), 0);
        if (len >= 5 && len <= 10) return combined;
        if (len > 10) return combined.slice(0, 8);
      }
      if (coreWords.length >= 3) {
        const combined = coreWords[0] + coreWords[2];
        const len = [...combined].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0x7f ? 1 : 0.5), 0);
        if (len >= 5 && len <= 10) return combined;
      }
      if (coreWords.length >= 1) {
        const single = coreWords[0];
        if (single.length >= 5) return single.slice(0, 8);
      }

      const first8 = hookText.replace(/\s/g, '').slice(0, 8);
      const first8Len = [...first8].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0x7f ? 1 : 0.5), 0);
      if (first8Len >= 5) return first8;

      return '';
    };

    // AI 批量生成章节标题（在流开始前调用）
    const aiGeneratedTitles: Record<number, string> = {};
    try {
      const hooksForAI = currentBatchHooks.map((hook: string, index: number) => ({
        chapterNum: startChapter + index,
        hook: hook,
      }));

      const titleSystemPrompt = await getPromptWithFallback('chapter-title-system', `你是一位资深小说编辑，擅长为章节提炼富有文学性和吸引力的标题。
规则：
1. 根据章节钩子内容，为每章生成一个简短有力的标题
2. 标题长度4-10个中文字符
3. 标题要有画面感和文学性，能引发读者好奇
4. 不要使用引号、书名号等标点符号
5. 标题要体现该章的核心冲突、转折或意象
6. 避免空洞抽象（如"命运的转折""新的开始"），要具体有画面感
7. 输出严格JSON格式：{"titles": {"1": "标题1", "2": "标题2", ...}}，key是章节序号字符串`);

      const titleUserPrompt = `请为以下章节钩子生成标题：

${hooksForAI.map((h: { chapterNum: number; hook: string }) => `第${h.chapterNum}章钩子：${h.hook}`).join('\n')}

题材：${idea.genre || idea.theme || ''}
核心设定：${idea.setting || ''}

请输出JSON格式：{"titles": {"${startChapter}": "标题", "${startChapter + 1}": "标题", ...}}`;

      const titleMessages = [
        { role: 'system' as const, content: titleSystemPrompt },
        { role: 'user' as const, content: titleUserPrompt },
      ];

      const titleStream = streamWithMaxTokens(titleMessages, 0.5, 4096);

      let titleFullText = '';
      for await (const chunk of titleStream) {
        if (chunk.content) {
          titleFullText += chunk.content.toString();
        }
      }

      const titleResult = extractJsonObject<Record<string, Record<string, string>>>(titleFullText, ['titles']);
      if (titleResult?.titles) {
        for (const [numStr, title] of Object.entries(titleResult.titles)) {
          const num = parseInt(numStr);
          if (!isNaN(num) && num >= startChapter && num <= endChapter && typeof title === 'string' && title.trim()) {
            aiGeneratedTitles[num] = title.trim();
          }
        }
      }
      console.log(`[Stream] AI generated titles: ${JSON.stringify(aiGeneratedTitles)}`);
    } catch (error) {
      console.error('[Stream] AI title generation failed, using fallback:', error);
    }

    // 生成章节标题：优先使用AI生成的标题，回退到正则提取
    const generateTitleFromHook = (chapterNum: number): string => {
      if (aiGeneratedTitles[chapterNum]) {
        return aiGeneratedTitles[chapterNum];
      }
      const hook = structure.chapterHooks?.[chapterNum - 1] || '';
      if (!hook) return `第${chapterNum}章`;
      const title = extractTitleFromHook(hook);
      return title || `第${chapterNum}章`;
    };
    // 创建 SSE 流
    const stream = new ReadableStream({
      async start(controller) {
        // 控制器状态追踪
        let isControllerClosed = false;

        // 安全的enqueue函数，检查控制器状态并捕获所有错误
        const safeEnqueue = (data: Uint8Array): boolean => {
          if (isControllerClosed) {
            return false;
          }
          try {
            controller.enqueue(data);
            return true;
          } catch (error) {
            console.error('[Stream] Error in enqueue:', error);
            isControllerClosed = true;
            return false;
          }
        };

        // 发送错误消息并关闭流
        const sendErrorAndClose = (errorMessage: string) => {
          if (!isControllerClosed) {
            try {
              safeEnqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`
                )
              );
            } catch (e) {
              console.error('[Stream] Failed to send error message:', e);
            }
            isControllerClosed = true;
            try {
              controller.close();
            } catch (e) {
              console.error('[Stream] Failed to close controller:', e);
            }
          }
        };

        try {
          // 发送批次信息
          safeEnqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'batch_info',
                batchStart: startChapter,
                batchEnd: endChapter,
                totalChapters: totalChapters,
                batchSize: currentBatchHooks.length,
                isFirstBatch: startChapter === 1,
                isLastBatch: endChapter === totalChapters,
              })}\n\n`
            )
          );

          // 如果用户启用了自定义模板且提供了自定义提示词，使用自定义的；否则使用数据库中的系统提示词
          const systemPrompt = useCustomPrompt && customSystemPrompt
            ? customSystemPrompt
            : await getPromptWithFallback('chapter-stream-system', `你是一位浸淫创作多年、作品沉淀了烟火气的真人作家。你的写作逻辑不是"制造爽点"，而是"讲一个值得讲的故事"。你相信文字的力量在于真实——真实的情绪、真实的细节、真实的留白。

【核心创作理念——真人才有的写作直觉】

## 一、语言要有体温
- 句子不必"完美"，可以有轻微的口语化、联想式表达
- 允许适度的"不完美感"：碎片化心理描写、情绪留白、生活化细节
- 避免AI式的"逻辑过度严密""语言过于规整""无多余情绪铺垫"
- 拒绝套话、空话和模板化句式，像你伏案写作时的自然流露
- 贴合真人写作中偶尔的联想式表达，不刻意追求"完美闭环"

## 二、每章结尾——这是重中之重
**绝对禁止AI式结尾**：禁止总结本章内容、强行升华主题、刻意留下"明显悬念"、用固定句式收尾。遵循真人作家的结尾逻辑，采用以下方式（交替使用）：

① **场景留白式**：结尾停留在具体场景或细微动作上，无总结、无刻意悬念，只呈现画面感
  示例："她把那封皱巴巴的信塞进抽屉最深处，指尖蹭过木柜的纹路，窗外的雨还没停"

② **情绪余韵式**：结尾聚焦人物的细微情绪、心理波动，不直白点破
  示例："他握着那枚旧纽扣，指腹反复摩挲，直到掌心发潮，竟没发现眼眶已经发热"

③ **戛然而止式**：在情节推进的关键节点自然收尾，不刻意强调"后续"
  示例："门被推开的瞬间，他看清了来人的脸，所有的话都堵在了喉咙里"

④ **细节呼应式**：结尾呼应本章前文的某个小细节（物品、动作、一句话），形成细腻的闭环
  示例："她端起桌上的凉茶，抿了一口，还是和去年夏天一样的味道，只是身边再没人陪她吐槽茶太苦"

## 三、开篇要有画面感
- 开头300-500字要有画面感和情绪铺垫，拒绝生硬切入
- 用具体场景带读者进入故事，而不是干巴巴交代背景
- "阳光透过窗帘的缝隙落在她手背上，她盯着那道细长的光斑发呆"——这是真人写作
- 而非AI式的"李明是一个普通的上班族，每天早上8点起床"——这是机械填表

## 四、章节推进逻辑——真人作家"边构思边推进"
把每章分成3-5个中段节点，每个节点是"创作思路"而非"固定话术"：
- **第一段**：开篇快速承接上章，1-2句话带入场景，展开核心事件
- **第二段**：矛盾浮现或情绪堆积，主角面临选择或困境
- **第三段**：转折或剧变，剧情自然推进
- **第四段**：结尾收束，选一种真人化收尾方式，自然停笔

## 五、对话要像真人说话
- 对话符合人物性格，有口头禅、有语气起伏
- 拒绝AI式的"过于规整、无情绪波动"的对话
- 让人物的话里有潜台词，有没说出口的东西

## 六、情绪的表达方式
- 情绪靠细节传递，不靠直白描述
- "他眼眶红了"比"他很伤心"强一百倍
- "她攥紧拳头，指甲掐进肉里"比"她很愤怒"有画面感
- 允许轻微的"跑题式细节"——一个无关紧要的小动作、一句闲话，让人物更鲜活

## 七、风格基调融合
${Array.isArray(tone) && tone.length > 0 ? `当前基调：${tone.join('、')}` : ''}
- 语言风格贴合题材（现实题材用生活化口语，悬疑题材用克制的叙述，言情题材用细腻的情绪描写）
- 基调体现在情节和细节中，而不是空话

## 八、字数与完整性
- **每章正文中文字符控制在1000-1500字之间**
- ⚠️ **必须写到章节自然结束点，绝对不允许在句子中间或段落中间截断输出**
- 宁可略超1500字也不能截断——章节完整 > 字数精确
- 字数超标优先删减：多余心理描写 > 重复环境描写 > 多余对话
- 字数不足补充：人物小动作、微表情、简短互动

## 九、写作流程
### 步骤一：列本章3句剧情大纲
1. **本章发生啥**：本章核心事件是什么？
2. **遇到啥**：主角遇到什么阻碍或转折？
3. **结尾落在哪**：用哪种真人化方式收尾？

### 步骤二：按思路动笔
按四段结构自然书写，允许适量细节冗余（贴合真人写作习惯）

### 步骤三：结尾自然收束
选一种真人化结尾方式，不拖剧情凑字数，在自然节点果断收笔，**必须写完最后一句才停笔**

### 步骤四：通读微调
写完通读全章，确保：字数合规、语言自然、结尾不做作、没有AI痕迹

## 十、禁忌清单（必须遵守）
❌ 禁止以下行为：
- 结尾强行总结本章核心（如"本章主要讲述了…""综上所述…"）
- 结尾刻意引导（如"下一章更精彩""未完待续"）
- 语言过于华丽空洞
- 人物行为逻辑过于完美、缺乏人性瑕疵
- 细节缺乏生活化气息
- 套用固定模板句式
- 每句话都紧扣主线（允许适度游离的细节）

【人物命名铁律 - 绝对禁止使用以下AI烂大街名字】
❌ 禁止男性名：叶辰、林辰、楚辰、夜宸、江辰、墨渊、墨尘、墨寒、墨枭、墨辞、萧逸、萧珩、萧烬、萧玄、萧辰、顾言琛、顾夜寒、顾云深、顾临川、顾景琛、陆沉渊、陆知衍、陆廷川、陆星辞、陆泽言、沈寂、沈砚、沈聿、沈辞、沈亦臻、凌夜、凌骁、凌宸、凌烬、凌玄、厉霆骁、厉烬言、厉司寒、厉夜珩、厉泽渊、傅斯年、傅景深、傅夜辞、傅云宸、傅聿白、云澈、玄澈、苍珩、冥夜、君夜、陈默
❌ 禁止女性名：苏晚、苏清鸢、苏念、苏瑶、苏汐、温阮、温瑜、温舒然、温知夏、温晚卿、洛璃、洛汐、洛烟、洛清欢、洛知予、云舒、云绾、云瑶、云晚、云汐月、许念、许知意、许清禾、许绾宁、许悠然、白芷、白若溪、白灵汐、白慕颜、白清瑶、叶绾绾、叶知微、叶晚柠、叶灵萱、叶清寒、唐知予、唐慕晚、唐沁柔、唐云汐、唐舒颜、宁汐、宁晚、宁知鸢、宁清瑶、宁绾柔、夏晚晴、夏知柠、夏灵玥、慕晚、林语嫣
✅ 必须使用真实、生活化、有烟火气的名字，像你身边真实存在的人名

${perspectiveInfo.rules}

- 题材：${idea.genre}
- 核心设定：${idea.setting}
- 主要人物：${idea.characters}
${idea.supportingCharacters ? `- 配角设定：${idea.supportingCharacters}` : ''}
${idea.characterRelationships ? `- 角色关系体系：${idea.characterRelationships}` : ''}
- 剧情框架：${structure.mainPlot}
- 关键场景：${structure.keyScenes || "详见结构"}
- 关键物品：${structure.keyItems || "详见结构"}

【章节连贯性 - 最重要，违反即废稿】
- 每一章都必须在整体框架内创作，不能偏离主题创意和结构分析
- 开头必须承接上一章结尾的具体场景和情绪状态，1-2句话自然带入
- 结尾选一种真人化收尾方式，自然停笔
- 每章只聚焦一条核心剧情线
- 严格遵循章节钩子展开，钩子是每章的核心任务
- 人物行为必须符合角色关系体系和性格设定
- 剧情推进必须遵循mainPlot的总体框架方向
- 关键冲突、关键场景、关键物品要在对应章节中自然融入

## 十、冲突阶梯递进——让冲突不断升级
- 每个关键冲突不是"出现-消失"的，而是必须**贯穿多个章节、层层升级**
- 冲突的三个递进层次：①对立建立→②矛盾深化→③高潮爆发
- 当某个冲突不在本章"主场"时，也要用1-2句细节维持其存在感（如对手的阴影、内心的一闪念、旁人的提醒）
- ❌ 禁止冲突"断崖式消失"：第2章建立了冲突，第3-8章完全不提，第9章突然爆发——这叫断裂
- ✅ 正确做法：即使本章不聚焦此冲突，也要让读者感觉到这条暗线在涌动

## 十一、关键场景氛围渲染——场景要有画面感
- 每个关键场景必须有**独特氛围标签**：时辰、天气、光线、气味、声音
- 同一场景不同章节出现时，氛围要**随剧情推进而变化**（如矿洞：第1章阴森压抑→第10章血腥疯狂）
- 关键场景的5感描写至少覆盖3感（视觉+听觉+触觉/嗅觉/味觉之一）
- 场景氛围要为剧情服务：压抑场景配沉重氛围，爆发场景配炽烈氛围

【输出格式】
直接输出正文内容，不要写"第X章"标题行，不要任何开场白。正文1000-1500中文字符，必须写到章节自然结束点，严禁截断，宁可略超也不强行收尾。

⚠️ 铁律：直接开始正文，不写章节序号、不写标题、不写"好的"等任何开场白。`);

          const userPrompt = `【创作任务】
目标读者：${genderTargetName}
${genderGuide}
${perspectiveGuide}
${protagonistName && protagonistName.trim() ? `主角名字：${protagonistName}（全文统一使用此名字）` : ''}
${supportingCharacterName && supportingCharacterName.trim() ? `配角名字：${supportingCharacterName}（如有多个用逗号分隔，在章节中合理安排这些配角出场）` : ''}

【核心设定】
- 主题：${idea.theme}
- 创意：${idea.concept}
- 人物：${idea.characters}
${idea.supportingCharacters ? `- 配角：${idea.supportingCharacters}` : ''}
${idea.characterRelationships ? `- 角色关系：${idea.characterRelationships}` : ''}
- 世界观：${idea.setting}

【情节框架 - 必须严格遵循】
主线剧情：${structure.mainPlot}
${structure.keyConflicts ? `关键冲突：${structure.keyConflicts}` : ''}
${structure.keyScenes ? `关键场景：${structure.keyScenes}` : ''}
${structure.keyItems ? `关键物品：${structure.keyItems}` : ''}

【完整章节钩子序列 - 你必须清楚每一章在整个故事中的位置】
${structure.chapterHooks.map((hook: string, i: number) => {
  const num = i + 1;
  if (num >= startChapter && num <= endChapter) return `▶ 第${num}章：${hook}  ← 当前创作`;
  if (num < startChapter && num >= startChapter - 2) return `  第${num}章：${hook}  (已完成)`;
  if (num > endChapter && num <= endChapter + 2) return `  第${num}章：${hook}  (待创作)`;
  return '';
}).filter(Boolean).join('\n')}
${structure.chapterHooks.length > endChapter + 2 ? `  ...（共${structure.chapterHooks.length}章）` : ''}

${previousChapterContent ? `【上一章结尾内容 - 必须承接】
上一章标题：第${startChapter - 1}章 ${previousChapterTitle || ''}
上一章结尾：
${previousChapterContent.slice(-1000)}

→ 第${startChapter}章必须从上述结尾自然衔接，场景、情绪、人物状态都要连贯！` : `【开篇章节】第1章需建立世界观、引入主角、开启冲突，紧扣第1章钩子。`}

【章节任务】
创作第${startChapter}至${endChapter}章，共${currentBatchHooks.length}章：

${currentBatchHooks.map((hook: string, index: number) => {
  const chNum = startChapter + index;
  const prevHook = chNum > 1 ? structure.chapterHooks[chNum - 2] : null;
  const nextHook = chNum < structure.chapterHooks.length ? structure.chapterHooks[chNum] : null;
  return `【第${chNum}章】
钩子：${hook}${prevHook ? `\n上章钩子：${prevHook}` : ''}${nextHook ? `\n下章钩子：${nextHook}` : ''}
→ 严格按钩子展开剧情（标题由系统自动生成，你不需要写标题）`;
}).join('\n\n')}

${endChapter === structure.chapterHooks.length ? `【结局】这是最后几章，需解决冲突、完成人物成长、给故事圆满结局。` : ''}

【写作要求（严格遵循）】
1. **框架红线**：每章必须在整体框架内创作，紧扣主线剧情方向，不偏离不跑题
2. **连贯红线**：开头必须承接上一章结尾的具体场景和情绪，1-2句话自然带入，禁止突兀跳转
3. **钩子红线**：严格遵循章节钩子展开，钩子是每章的核心任务，不能偏移
4. **字数红线**：正文1000-1500中文字符，写完后立即核验
5. **冲突递进红线**：每章至少推进1条关键冲突（哪怕只用1-2句维持暗线存在感），禁止冲突"断崖式消失"
6. **场景氛围红线**：关键场景必须有独特氛围（时辰/天气/光线/气味），场景氛围要随剧情变化
7. 剧情结构：开场承接→钩子核心事件推进→冲突递进→小转折→结尾留下一章伏笔
8. 精简多余心理碎碎念、重复景物描写、无用灌水对话
9. 结尾卡点利落，自然埋下与下一章钩子呼应的伏笔
10. 文风贴合网文阅读节奏，段落简短易读

请开始创作：`;

          // 逐章顺序生成：每章独立调用AI，彻底解决截断和不连贯问题
          // - 每章有独立的 token 预算，不会被其他章节占用导致截断
          // - 每章拿到上一章的真实输出内容作为上下文，保证连贯
          let lastChapterActualContent = previousChapterContent;
          let lastChapterActualTitle = previousChapterTitle;

          for (let chNum = startChapter; chNum <= endChapter; chNum++) {
            if (isControllerClosed) break;

            const hook = structure.chapterHooks[chNum - 1];
            const prevHook = chNum > 1 ? structure.chapterHooks[chNum - 2] : null;
            const nextHook = chNum < structure.chapterHooks.length ? structure.chapterHooks[chNum] : null;
            const chTitle = generateTitleFromHook(chNum);

            // 发送章节开始事件
            if (!safeEnqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'chapter_start', chapter: chNum, title: chTitle })}\n\n`
            ))) break;

            // 构建单章 prompt：聚焦当前章，带入上章真实内容
            const perChapterUserPrompt = [
              `目标读者：${genderTargetName}`,
              genderGuide,
              perspectiveGuide,
              protagonistName?.trim() ? `主角名字：${protagonistName}（全文统一使用此名字）` : '',
              supportingCharacterName?.trim() ? `配角名字：${supportingCharacterName}（在章节中合理安排出场）` : '',
              '',
              '【小说核心设定】',
              `主题：${idea.theme}`,
              `创意：${idea.concept}`,
              `主线剧情：${structure.mainPlot}`,
              `人物：${idea.characters}`,
              idea.supportingCharacters ? `配角：${idea.supportingCharacters}` : '',
              idea.characterRelationships ? `角色关系：${idea.characterRelationships}` : '',
              `世界观：${idea.setting}`,
              structure.keyConflicts ? `关键冲突（持续推进，禁止断崖消失）：${structure.keyConflicts}` : '',
              structure.keyScenes ? `关键场景：${structure.keyScenes}` : '',
              structure.keyItems ? `关键物品：${structure.keyItems}` : '',
              '',
              lastChapterActualContent
                ? `【上一章实际结尾内容 - 必须从此处自然承接，禁止突兀跳转】\n第${chNum - 1}章《${lastChapterActualTitle || ''}》结尾原文：\n${lastChapterActualContent.slice(-800)}\n\n→ 第${chNum}章开头必须与上述场景、情绪、人物状态无缝衔接！`
                : '【第一章】建立世界观，引入主角，开启故事冲突，紧扣第1章钩子。',
              '',
              prevHook ? `上章钩子（已完成，承接参考）：${prevHook}` : '',
              '',
              `【第${chNum}章核心任务 - 必须严格执行】`,
              hook,
              '',
              nextHook
                ? `下章钩子（本章结尾需为此埋下伏笔）：${nextHook}`
                : chNum === structure.chapterHooks.length ? '【这是全书最后一章】解决核心冲突，完成人物成长弧，给出有力结局。' : '',
              '',
              '【写作要求】',
              '1. 开头1-2句自然承接上章结尾的具体场景和情绪，禁止突兀跳转',
              '2. 严格按本章钩子展开核心剧情，钩子是本章核心任务',
              '3. 正文1000-1500中文字符，宁可略超也不截断，必须写到自然结束点',
              '4. 结尾选一种真人化方式收束（场景留白/情绪余韵/戛然而止/细节呼应）',
              '5. 自然埋下与下章钩子呼应的伏笔',
              '6. 每章至少用1-2句维持一条关键冲突的暗线存在感，禁止冲突断崖消失',
              '',
              `直接输出第${chNum}章正文，不要写"第${chNum}章"标题行，不要任何开场白：`,
            ].filter(Boolean).join('\n');

            const chapterMessages = [
              { role: 'system' as const, content: systemPrompt },
              { role: 'user' as const, content: perChapterUserPrompt },
            ];

            // 单章 token 预算 4096 足够 1000-1500 字，不会截断
            const chapterStream = streamWithMaxTokens(chapterMessages, temperature, 4096);
            let chapterRawContent = '';
            let inThinkingCh = false;

            for await (const chunk of chapterStream) {
              if (isControllerClosed) break;
              if (!chunk.content) continue;

              let text = chunk.content.toString();

              // 过滤思考标签
              if (inThinkingCh) {
                const endIdx = text.indexOf('</think');
                if (endIdx !== -1) {
                  text = text.substring(text.indexOf('>', endIdx) + 1);
                  inThinkingCh = false;
                } else {
                  continue;
                }
              }
              const thinkStart = text.indexOf('<think');
              if (thinkStart !== -1) {
                const thinkEnd = text.indexOf('</think', thinkStart);
                if (thinkEnd !== -1) {
                  text = text.substring(0, thinkStart) + text.substring(text.indexOf('>', thinkEnd) + 1);
                } else {
                  text = text.substring(0, thinkStart);
                  inThinkingCh = true;
                }
              }

              if (!text.trim()) continue;
              chapterRawContent += text;

              if (!safeEnqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'content', chapter: chNum, content: text })}\n\n`
              ))) break;
            }

            // 章节结束
            if (!isControllerClosed) {
              safeEnqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'chapter_end', chapter: chNum })}\n\n`
              ));
              console.log(`[Stream] Chapter ${chNum} done, chars: ${chapterRawContent.length}`);
            }

            // 将本章实际生成内容传给下一章作为连贯上下文
            lastChapterActualContent = chapterRawContent;
            lastChapterActualTitle = chTitle;
          }

          // 发送完成事件
          if (!isControllerClosed) {
            safeEnqueue(encoder.encode(
              `data: ${JSON.stringify({
                type: 'complete',
                generatedCount: currentBatchHooks.length,
                expectedCount: currentBatchHooks.length,
                missingChapters: [],
              })}\n\n`
            ));
            console.log('[Stream] All chapters generated sequentially');
            isControllerClosed = true;
            controller.close();
          }
        } catch (error) {
          console.error('[Stream] Error in stream:', error);
          sendErrorAndClose(`生成章节时出错: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('Error generating chapters:', error);
    return new Response('生成章节失败', { status: 500 });
  }
}
