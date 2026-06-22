import { NextRequest } from 'next/server';
import { createLLMClient, getModelName, getTemperature, getRawAIConfig } from '@/lib/ai-config';
import { getPromptWithFallback } from '@/lib/prompt-helper';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idea, structure, tone, genderTarget, narrativePerspective, protagonistName, supportingCharacterName, chapterIndex, configId, previousChapterContent, nextChapterHook, allChapterHooks } = body;

    if (!idea || !structure || !chapterIndex) {
      return new Response(
        '主题创意、结构分析和章节索引不完整',
        { status: 400 }
      );
    }

    const client = await createLLMClient(configId);
    const modelName = await getModelName(configId);
    const temperature = await getTemperature(configId, 0.65);
    const { apiUrl, apiKey } = await getRawAIConfig(configId);

    // 直接 fetch 流式调用，明确设置 max_tokens=8192，避免 SDK 默认限制导致章节截断
    async function* streamWithMaxTokens(
      messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
      temp: number,
      maxTokens = 8192
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
- ✅ 正确做法：通过"我"的观察来推断他人——"他的眼神闪了闪，我猜他没说实话"`
      },
      'third-limited': {
        name: '第三人称限制',
        guide: '用"他/她"称呼主角，视角锁定主角',
        rules: `【第三人称限制叙事铁律】
- 用"他/她"称呼主角，视角始终锁定在主角身上
- ✅ 可以写主角的所见所闻所想
- ❌ 绝对禁止：切换到其他角色的心理活动`
      },
      'third-omniscient': {
        name: '第三人称全知',
        guide: '上帝视角，可自由切换任何角色视角',
        rules: `【第三人称全知叙事铁律】
- 可自由切换到任何角色的心理和视角
- ⚠️ 每次切换必须有明确的场景过渡，每个视角至少停留1-2段`
      },
      'second-person': {
        name: '第二人称',
        guide: '用"你"来叙述',
        rules: `【第二人称叙事铁律】
- 全文用"你"来叙述，让读者成为故事参与者
- ❌ 绝对禁止：突然切换到"他"或"我"的叙述视角`
      }
    };
    const perspectiveInfo = perspectiveMap[narrativePerspective || 'third-limited'] || perspectiveMap['third-limited'];
    const perspectiveGuide = `【叙事视角：${perspectiveInfo.name}】${perspectiveInfo.guide}`;

    const encoder = new TextEncoder();

    // 获取指定章节的钩子
    const chapterHook = structure.chapterHooks[chapterIndex - 1];

    // 从钩子中智能提炼标题（5-10字）：直接用钩子生成标题，不依赖AI
    const generateTitleFromHook = (chapterNum: number): string => {
      const hook = allChapterHooks?.[chapterNum - 1] || structure.chapterHooks?.[chapterNum - 1] || '';
      if (!hook) return '';

      // 策略1：提取"X的Y"结构，组合为"XY"（如"矿洞的血字"→"矿洞血字"）
      const dePatterns = [
        /([^\s，。！？、；：]{2,4})的([^\s，。！？、；：]{2,4})的/g,
        /([^\s，。！？、；：]{2,4})的([^\s，。！？、；：]{2,4})/g,
      ];
      for (const pattern of dePatterns) {
        const m = pattern.exec(hook);
        if (m) {
          const combined = m[1] + m[2];
          const len = [...combined].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0x7f ? 1 : 0.5), 0);
          if (len >= 5 && len <= 10) return combined;
          const part2Len = [...m[2]].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0x7f ? 1 : 0.5), 0);
          if (part2Len >= 3 && part2Len <= 8) return m[2];
        }
      }

      // 策略2：按标点分句提取核心动词+名词组合
      const clauses = hook.split(/[，。！？、；：\s]+/).filter((c: string) => c.length >= 2);
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

      // 策略3：兜底取钩子前8字
      const first8 = hook.replace(/\s/g, '').slice(0, 8);
      const first8Len = [...first8].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0x7f ? 1 : 0.5), 0);
      if (first8Len >= 5) return first8;

      return '';
    };
    // 创建 SSE 流
    const stream = new ReadableStream({
      async start(controller) {
        try {
                    // 构建全章节钩子概览（帮助AI理解当前章节在整体中的位置）
    const allHooks = allChapterHooks || structure.chapterHooks;
    const hooksOverview = allHooks.map((hook: string, idx: number) => {
      const num = idx + 1;
      if (num === chapterIndex) return `第${num}章 ★当前★：${hook}`;
      if (num === chapterIndex - 1) return `第${num}章 ↑上章↑：${hook}`;
      if (num === chapterIndex + 1) return `第${num}章 ↓下章↓：${hook}`;
      return `第${num}章：${hook}`;
    }).join('\n');

    const systemPrompt = await getPromptWithFallback('chapter-regenerate-system', `你是一位资深真人小说作家，有多年的创作经验。你的写作有温度、有烟火气，允许适度的"不完美感"——可加入轻微的情绪留白、碎片化心理描写、生活化细节。你拒绝AI式的"逻辑过度严密""语言过于规整""无多余情绪铺垫"，拒绝套话、空话和模板化句式。你的文字像真人伏案写作时的自然流露，而非机器的生硬拼接。

          【核心创作理念】

          1. **语言有温度**：用生活化的口语、有烟火气的细节，让文字有呼吸感
          2. **允许不完美**：可加入轻微的联想式表达、碎片化心理，不刻意追求"完美闭环"
          3. **拒绝AI痕迹**：不用"他的眼神充满了…""心中暗想…""时光荏苒…"等AI式表达
          4. **细节真实化**：用具体的视觉、听觉、触觉细节代替抽象描述
          5. **对话个性化**：人物有口头禅、有语气起伏，符合人物性格

          【章节结尾核心要求 - 最重要的部分】

          章节结尾必须彻底摆脱AI化的模式化表达，遵循真人作家的结尾逻辑。每章结尾必须独特，不能重复使用相同的模式。采用以下四种真人化收尾方式（可交替使用）：

          ① **场景留白式**：结尾停留在具体场景或细微动作上，无总结、无刻意悬念，只呈现画面感，留给读者联想空间
             - 例："她把那封皱巴巴的信塞进抽屉最深处，指尖蹭过木柜的纹路，窗外的雨还没停。"
             - 例："他站在空荡荡的站台上，看着列车消失在夜色里，手里的车票已经被攥得发皱。"

          ② **情绪余韵式**：结尾聚焦人物的细微情绪、心理波动，不直白点破，用细节传递情绪
             - 例："他握着那枚旧纽扣，指腹反复摩挲，直到掌心发潮，竟没发现眼眶已经发热。"
             - 例："她笑了笑，没再说话，转身走进厨房。锅里的汤还在咕嘟咕嘟地冒着热气。"

          ③ **戛然而止式**：在情节推进的关键节点自然收尾，不刻意强调"后续"，像真人写作时的"写到此处恰好留白"
             - 例："门被推开的瞬间，他看清了来人的脸，所有的话都堵在了喉咙里。"
             - 例："她举起手，犹豫了一下，最终还是敲响了那扇门。"

          ④ **细节呼应式**：结尾呼应本章前文的某个小细节（如物品、动作、一句话），形成细腻的闭环，不刻意升华
             - 例："她端起桌上的凉茶，抿了一口，还是和去年夏天一样的味道，只是身边再没人陪她吐槽茶太苦。"
             - 例："那张纸条还压在杯子底下，字迹已经被水渍晕开，但上面的每一个字她都记得。"

          【章节结尾禁忌 - 严格避免】
          ❌ 禁止总结本章内容（"本章主要讲述了…""综上所述…"）
          ❌ 禁止强行升华主题（"这让他明白了一个道理…"）
          ❌ 禁止刻意留下"明显悬念"（"他不知道的是，更大的危险正在逼近…"）
          ❌ 禁止"未完待续式生硬提示"（"欲知后事如何…""下一章更精彩…"）
          ❌ 禁止用固定句式收尾（"这一天结束了""他们回家了"）
          ❌ 禁止欧·亨利式刻意反转模仿
          ❌ 禁止每章都制造大悬念——真人作家的结尾更多是"情绪的沉淀"或"情节的自然停顿"

          【写作流程 - 严格按照以下步骤创作】

          ### 步骤一：列本章3句剧情大纲
          在写作前先明确以下三句话，确保本章有清晰主线：
          1. **本章发生啥**：本章核心事件是什么？
          2. **遇到啥**：主角遇到什么阻碍、冲突或转折？
          3. **结尾落在哪**：本章结尾用哪种收尾方式？落在什么情绪或画面上？

          ### 步骤二：按四段结构动笔
          将本章正文分为四个段落：
          - 第一段：开场快速承接上章，1-2句话带入场景，展开核心事件
          - 第二段：矛盾升级、冲突激化，主角遭遇阻碍
          - 第三段：转折变化、剧情推进，制造小高潮
          - 第四段：选一种真人化收尾方式，自然停笔

          ### 步骤三：结尾自然收束
          - 不拖剧情凑字数，在剧情自然节点果断收尾，**必须写完最后一句才停笔**
          - 选一种真人化收尾方式，情绪点到即止

          ### 步骤四：通读微调
          写完通读全章，确保：字数合规、语言自然、结尾不做作、段落简短易读

          输出格式（**必须严格遵守**）：
          第${chapterIndex}章
          （空一行后正文开始，正文1000-1500中文字符，按真人作家写作流程创作）

          【格式铁律 - 违反即废稿】
          - **必须**以"第${chapterIndex}章"开头（后面不要写标题，系统会自动从钩子生成）
          - 章节号后必须空一行再开始正文
          - 不要在章节号后加冒号、标题或其他任何文字
          - 标题示例：钩子"主角发现父亲留下的密信" → 标题"尘封的密信"✅
          - 标题示例：钩子"敌军夜袭城池" → 标题"城破之夜"✅ 或"烽火夜袭"✅
          - ❌ 绝对禁止标题出现正文内容（如"临安府城北""第二天一早"等正文开头词）
          - ❌ 绝对禁止标题是正文第一句话的截取
          - ❌ 禁止过短标题（少于5字）
          - ❌ 禁止过长标题（超过10字）
          - ❌ 禁止无意义泛化标题如"开始"、"转折"、"高潮"

          【人物命名铁律 - 绝对禁止使用以下AI烂大街名字】
          ❌ 禁止男性名：叶辰、林辰、楚辰、夜宸、江辰、墨渊、墨尘、墨寒、墨枭、墨辞、萧逸、萧珩、萧烬、萧玄、萧辰、顾言琛、顾夜寒、顾云深、顾临川、顾景琛、陆沉渊、陆知衍、陆廷川、陆星辞、陆泽言、沈寂、沈砚、沈聿、沈辞、沈亦臻、凌夜、凌骁、凌宸、凌烬、凌玄、厉霆骁、厉烬言、厉司寒、厉夜珩、厉泽渊、傅斯年、傅景深、傅夜辞、傅云宸、傅聿白、云澈、玄澈、苍珩、冥夜、君夜、陈默
          ❌ 禁止女性名：苏晚、苏清鸢、苏念、苏瑶、苏汐、温阮、温瑜、温舒然、温知夏、温晚卿、洛璃、洛汐、洛烟、洛清欢、洛知予、云舒、云绾、云瑶、云晚、云汐月、许念、许知意、许清禾、许绾宁、许悠然、白芷、白若溪、白灵汐、白慕颜、白清瑶、叶绾绾、叶知微、叶晚柠、叶灵萱、叶清寒、唐知予、唐慕晚、唐沁柔、唐云汐、唐舒颜、宁汐、宁晚、宁知鸢、宁清瑶、宁绾柔、夏晚晴、夏知柠、夏灵玥、慕晚、林语嫣
          ✅ 必须使用真实、生活化、有烟火气的名字，像你身边真实存在的人名

          ${perspectiveInfo.rules}

          ⚠️ 铁律：必须输出完整章节内容，在句子自然结束处收笔，严禁在句子或段落中间截断。
          正文1000-1500字，宁可略超字数也不能截断。
          结尾选一种真人化收尾方式（场景留白/情绪余韵/戛然而止/细节呼应），自然停笔，不总结、不升华、不刻意制造悬念。`);

          const userPrompt = `请根据以下信息重新创作第${chapterIndex}章，目标读者群体为${genderTargetName}：

${genderGuide}
${perspectiveGuide}
${protagonistName && protagonistName.trim() ? `主角名字：${protagonistName}（全文统一使用此名字）` : ''}
${supportingCharacterName && supportingCharacterName.trim() ? `配角名字：${supportingCharacterName}（如有多个用逗号分隔，在章节中合理安排这些配角出场）` : ''}

【主题创意框架】
小说主题：${idea.theme}
创意核心：${idea.concept}
主要人物：${idea.characters}
${idea.supportingCharacters ? `配角设定：${idea.supportingCharacters}` : ''}
${idea.characterRelationships ? `角色关系体系：${idea.characterRelationships}` : ''}
世界观设定：${idea.setting}

【结构分析框架】
主要情节：${structure.mainPlot}
情感曲线：${structure.emotionalCurve}
关键冲突：${structure.keyConflicts}
${structure.keyScenes ? `关键场景：${structure.keyScenes}` : ''}
${structure.keyItems ? `关键物品：${structure.keyItems}` : ''}

【全章节钩子概览 - 你正在写第${chapterIndex}章，请看清自己在整部小说中的位置】
${hooksOverview}

第${chapterIndex}章钩子：${chapterHook}

${previousChapterContent ? `【上一章内容参考】
上一章结尾内容如下，请确保本章开头自然承接：
${previousChapterContent.substring(previousChapterContent.length - 600)}

【完整连贯性要求】
1. 本章开头必须快速承接上一章结尾的具体场景和情绪，1-2句话自然带入当下，禁止突兀跳转
2. 保持人物性格、关系、世界观的一致性
3. 不能与上一章的情节矛盾或脱节
4. 情节要自然延续，不能跳跃或断裂` : `【开篇要求】
1. 作为开篇章节，要清晰设定起点和核心冲突
2. 为后续章节奠定基础
3. 建立世界观和人物关系`}

${nextChapterHook ? `【下一章衔接】
- 下一章钩子是："${nextChapterHook}"
- 本章结尾要为下一章做好自然铺垫
- 确保情节能平滑过渡到下一章` : chapterIndex < structure.chapterHooks.length ? `【下一章衔接】
- 第${chapterIndex + 1}章钩子是："${structure.chapterHooks[chapterIndex]}"
- 本章结尾要为下一章做好自然铺垫
- 确保情节能平滑过渡到下一章` : `【结局衔接】
- 作为接近结尾的章节，要逐步收束情节线
- 揭示关键伏笔
- 为最终结局做准备`}

【写作要求（严格遵循）】
1. **框架红线**：本章必须在整体框架内创作，紧扣主线剧情方向，不偏离不跑题
2. **连贯红线**：开头必须承接上一章结尾的具体场景和情绪，1-2句话自然带入，禁止突兀跳转
3. **钩子红线**：严格遵循章节钩子展开，钩子是本章的核心任务，不能偏移
4. **冲突递进红线**：每章必须推进至少一条关键冲突，不能让冲突"沉睡"多章后突然出现。冲突要像台阶一样逐级递进：疑虑→对峙→试探→摊牌→爆发，每章推进一步，不能原地踏步
5. **场景氛围红线**：当章节发生在关键场景（如矿洞、枯井、祭天台、地牢等）时，必须用3-5句环境描写渲染场景特有氛围（光线、气味、声音、温度），让读者身临其境，而非干巴巴叙述事件
6. **字数红线**：正文1000-1500中文字符，写完后立即核验
7. 剧情结构：开场承接→钩子核心事件推进→小转折→结尾留下一章伏笔
8. 精简多余心理碎碎念、重复景物描写、无用灌水对话
9. 结尾卡点利落，自然埋下与下一章钩子呼应的伏笔
10. 文风贴合网文阅读节奏，段落简短易读

请重新创作这一章节的内容。`;

          const messages = [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: userPrompt },
          ];

          const llmStream = streamWithMaxTokens(messages, temperature, 8192);

          let fullText = '';
          let titleSent = false;
          let fallbackTitle = '';
          let inThinking = false; // 追踪是否在<think标签内

          for await (const chunk of llmStream) {
            if (chunk.content) {
              let text = chunk.content.toString();

              // 过滤AI思考过程（<think...>...</think >标签内容）
              if (inThinking) {
                const endIdx = text.indexOf('</think');
                if (endIdx !== -1) {
                  const afterThink = text.substring(text.indexOf('>', endIdx) + 1);
                  text = afterThink;
                  inThinking = false;
                } else {
                  continue;
                }
              }

              const thinkStart = text.indexOf('<think');
              if (thinkStart !== -1) {
                const thinkEnd = text.indexOf('</think', thinkStart);
                if (thinkEnd !== -1) {
                  const afterThink = text.substring(text.indexOf('>', thinkEnd) + 1);
                  text = text.substring(0, thinkStart) + afterThink;
                } else {
                  text = text.substring(0, thinkStart);
                  inThinking = true;
                }
              }

              // 过滤 AI 模型内部标记（如 entity 引用）
              text = text.replace(/<entity[^>]*>[\s\S]*?<\/entity>/gi, '');
              text = text.replace(/<entity[^>]*>/gi, '');
              text = text.replace(/<\/entity>/gi, '');

              if (!text.trim()) continue;

              fullText += text;

              // 检测章节开始标记 - 第X章后换行即表示正文开始
              if (!titleSent) {
                // 新格式：第X章\n（标题由系统从钩子生成）
                const simpleRegex = /(?:###\s*)?第(\d+)章\s*\n/g;
                // 兼容旧格式：第X章：标题\n
                const titledRegex = /(?:###\s*)?第(\d+)章[：:]\s*([^\n#]+?)(?:\s*###)?\n/g;
                
                let match = simpleRegex.exec(fullText);
                let contentStart = 0;
                
                if (match && parseInt(match[1]) === chapterIndex) {
                  // 新格式：直接用钩子生成标题
                  const title = generateTitleFromHook(chapterIndex);
                  fallbackTitle = title;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: 'chapter_start',
                        chapter: chapterIndex,
                        title: title,
                      })}\n\n`
                    )
                  );
                  titleSent = true;
                  contentStart = match.index + match[0].length;
                } else {
                  // 兼容旧格式
                  match = titledRegex.exec(fullText);
                  if (match && parseInt(match[1]) === chapterIndex) {
                    const title = generateTitleFromHook(chapterIndex);
                    fallbackTitle = title;
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          type: 'chapter_start',
                          chapter: chapterIndex,
                          title: title,
                        })}\n\n`
                      )
                    );
                    titleSent = true;
                    contentStart = match.index + match[0].length;
                  }
                }

                if (titleSent && contentStart > 0) {
                  const afterTitle = fullText.substring(contentStart).trimStart();
                    if (afterTitle) {
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify({
                            type: 'content',
                            chapter: chapterIndex,
                            content: afterTitle,
                          })}\n\n`
                        )
                      );
                    }
                  }
                if (titleSent) continue;
                // 标题还没出来，先不发送内容
                continue;
              }

              // 标题已发送，直接发送正文内容
              // 发送内容事件
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'content',
                    chapter: chapterIndex,
                    content: text,
                  })}\n\n`
                )
              );
            }
          }

          // 如果标题始终未解析到，使用已提取的标题或钩子作为默认标题
          if (!titleSent) {
            const hookTitle = generateTitleFromHook(chapterIndex);
            const defaultTitle = hookTitle || `第${chapterIndex}章`;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'chapter_start',
                  chapter: chapterIndex,
                  title: defaultTitle,
                })}\n\n`
              )
            );
            // 发送所有已收集的内容
            if (fullText.trim()) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'content',
                    chapter: chapterIndex,
                    content: fullText,
                  })}\n\n`
                )
              );
            }
          }

          // 发送完成事件
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'complete' })}\n\n`)
          );
        } catch (error) {
          console.error('Error in stream:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in regenerate route:', error);
    return new Response(
      '重新生成章节失败',
      { status: 500 }
    );
  }
}
