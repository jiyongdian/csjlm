import { NextRequest, NextResponse } from 'next/server';
import { createLLMClient, getModelName, getTemperature } from '@/lib/ai-config';
import { getPromptWithFallback } from '@/lib/prompt-helper';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idea, structure, chapters, tone, configId } = body;

    if (!idea || !structure || !chapters) {
      return NextResponse.json(
        { error: '小说信息不完整' },
        { status: 400 }
      );
    }

    const client = await createLLMClient(configId);
    const modelName = await getModelName(configId);
    const temperature = await getTemperature(configId, 0.7);

    // 获取章节摘要（取前几章和后几章的钩子）
    const chapterSummary = structure.chapterHooks
      .map((hook: string, index: number) => `第${index + 1}章：${hook}`)
      .slice(0, 5)
      .join('\n');

    // 获取正文片段（从几章中提取部分内容）
    const sampleContent = chapters
      .slice(0, 3)
      .map((ch: any) => `第${ch.index}章：${ch.content.slice(0, 200)}`)
      .join('\n\n');

    const systemPrompt = await getPromptWithFallback('novel-title-system', `你是一位资深的文学编辑，擅长为小说创作能抓住读者眼球、令人过目不忘的标题。

【输出格式要求】
请严格按照以下格式输出，不要添加任何其他文字：

# 标题推荐
## 核心推荐（5个）
1. **《标题1》** - 解释说明，为什么这个标题好
2. **《标题2》** - 解释说明，为什么这个标题好
3. **《标题3》** - 解释说明，为什么这个标题好
4. **《标题4》** - 解释说明，为什么这个标题好
5. **《标题5》** - 解释说明，为什么这个标题好

---

## 备选推荐（5个）
6. **《标题6》**
7. **《标题7》**
8. **《标题8》**
9. **《标题9》**
10. **《标题10》**

---

## 最终推荐
**《推荐的最佳标题》** —— 简短说明理由

【标题创作原则】
1. **书名号包裹**：所有标题都要放在《》里面
2. **双关隐喻**：优先使用有双重含义的标题
3. **抓眼球**：标题要有悬念感、画面感或情感冲击力
4. **有故事感**：暗示故事的核心冲突或人物关系
5. **文学性**：可以使用比喻、象征等文学手法
6. **长度合适**：标题长度控制在4-10个字之间
7. **避免俗套**：不要用"时空"、"之旅"、"之路"等烂大街词汇`);

    const userPrompt = `请为以下小说创作标题推荐：

小说主题：${idea.theme}
创意核心：${idea.concept}
主要人物：${idea.characters}

主要情节：${structure.mainPlot}
情感曲线：${structure.emotionalCurve}

章节钩子（前5章）：
${chapterSummary}

正文片段（前3章部分内容）：
${sampleContent}

风格基调：${tone || '史诗宏大'}

请严格按照要求的格式输出！`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    console.log('[Title] Calling AI model:', modelName);
    const response = await client.invoke(messages, {
      model: modelName,
      thinking: 'disabled',
      temperature,
    });

    let rawContent = response.content?.trim() || '';

    // 过滤AI思考过程（<think...>...</think >标签内容）
    rawContent = rawContent.replace(/<think[\s\S]*?<\/think\s*>/g, '').trim();

    // 解析返回的内容，提取标题
    const parsedResult = parseTitleRecommendations(rawContent);

    return NextResponse.json(parsedResult);
  } catch (error) {
    console.error('Error generating title:', error);
    return NextResponse.json(
      { error: '生成标题失败' },
      { status: 500 }
    );
  }
}

// 解析标题推荐内容
function parseTitleRecommendations(content: string) {
  const result = {
    coreRecommendations: [] as string[],
    alternativeRecommendations: [] as string[],
    finalRecommendation: '',
    raw: content,
  };

  // 提取核心推荐
  const coreSection = content.match(/## 核心推荐[\s\S]*?(?=---|## 备选|## 最终)/);
  if (coreSection) {
    const coreMatches = coreSection[0].match(/\*\*《([^》]+)》\*\*/g);
    if (coreMatches) {
      result.coreRecommendations = coreMatches.map((m: string) => m.replace(/^\*\*《|》\*\*$/g, ''));
    }
  }

  // 提取备选推荐
  const altSection = content.match(/## 备选推荐[\s\S]*?(?=---|## 最终)/);
  if (altSection) {
    const altMatches = altSection[0].match(/\*\*《([^》]+)》\*\*/g);
    if (altMatches) {
      result.alternativeRecommendations = altMatches.map((m: string) => m.replace(/^\*\*《|》\*\*$/g, ''));
    }
  }

  // 提取最终推荐
  const finalMatch = content.match(/## 最终推荐[\s\S]*?\*\*《([^》]+)》\*\*/);
  if (finalMatch && finalMatch[1]) {
    result.finalRecommendation = finalMatch[1];
  }

  // 如果没有解析到，尝试简单提取
  if (result.coreRecommendations.length === 0) {
    const allMatches = content.match(/《([^》]+)》/g);
    if (allMatches) {
      const allTitles = allMatches.map((m: string) => m.replace(/^《|》$/g, ''));
      result.coreRecommendations = allTitles.slice(0, 5);
      result.alternativeRecommendations = allTitles.slice(5, 10);
      if (allTitles.length > 0) {
        result.finalRecommendation = allTitles[0];
      }
    }
  }

  // 确保至少有一个标题
  if (result.coreRecommendations.length === 0) {
    result.coreRecommendations = ['未命名小说'];
    result.finalRecommendation = '未命名小说';
  } else if (!result.finalRecommendation) {
    result.finalRecommendation = result.coreRecommendations[0];
  }

  return result;
}
