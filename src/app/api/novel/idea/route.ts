import { NextRequest, NextResponse } from 'next/server';
import { createLLMClient, getModelName, getTemperature } from '@/lib/ai-config';
import { modelPromptManager } from '@/storage/database';
import { getUserFromToken } from '@/lib/auth';

const GENRE_MAP: Record<string, string> = {
  'fantasy': '奇幻',
  'sci-fi': '科幻',
  'romance': '言情',
  'mystery': '悬疑',
  'thriller': '惊悚',
  'horror': '恐怖',
  'historical': '历史',
  'urban': '都市',
  'adventure': '冒险',
  'wuxia': '武侠',
  'xianxia': '仙侠',
  'military': '军事',
  'post-apocalyptic': '末世',
  'cyberpunk': '赛博朋克',
  'time-travel': '穿越',
  'rebirth': '重生',
  'game': '游戏',
  'sports': '体育',
  'campus': '校园',
  'business': '商战',
};

const TONE_MAP: Record<string, string> = {
  'light': '轻松幽默',
  'serious': '严肃沉重',
  'epic': '史诗宏大',
  'romantic': '浪漫温馨',
  'dark': '黑暗压抑',
  'mysterious': '神秘诡异',
  'suspense': '紧张刺激',
  'philosophical': '哲学思辨',
  'satirical': '讽刺辛辣',
  'tragic': '悲剧催泪',
  'inspiring': '热血励志',
  'lyrical': '抒情唯美',
  'ironic': '荒诞讽刺',
  'warm': '温暖治愈',
  'cold': '冷峻理性',
};

// 每种类型的真人作者人设 — 短而有力
const AUTHOR_PERSONA: Record<string, string> = {
  'fantasy': '你是起点白金作家，写过十本奇幻，每本订阅破万。你的套路跟我吃西红柿一个路子：开局最惨，成长最燃，翻盘最爽。你从不写"他感受到了魔法的力量"，你写的是"他攥着那根烧焦的木棍，手心全是血泡，但他知道只要再撑三秒，对面那个混蛋就得跪"。你的读者从来不跳章，因为你每章结尾都让人睡不着。',
  'sci-fi': '你是科幻圈的老人，刘慈欣的同行。你的脑洞不是凭空来的，每个设定背后都有硬核逻辑。你写科幻的方式是先让人感到恐惧，再让人感到敬畏，最后让人沉默。',
  'romance': '你是晋江的顶流作者，你写的爱情从来不甜，却让读者磕得死去活来。你的秘诀是写爱情的笨拙，而不是爱情的完美。读者追你的文不是因为甜，是因为你笔下的感情真得让人心颤。',
  'mystery': '你是推理小说圈的硬核玩家，东野圭吾式的写法。你的悬念不是靠藏信息，而是靠把真相放在读者眼前，但他们就是看不见。你设计的诡计让读者拍大腿——明明线索都在那。',
  'thriller': '你是写惊悚的狠人，读者看你的书要开灯睡觉。你不用鬼吓人，你用人吓人。你擅长的是让读者信任一个角色，然后在关键时刻让这个角色做出最可怕的选择。',
  'horror': '你是民间怪谈的收藏者，你的恐怖来自日常生活的裂缝。你从不说"有一个鬼"，你说"那个房间总有人住，但从来没有人见过住客"。你擅长写那种读者关了书还在后怕的感觉。',
  'historical': '你是历史系的博士，但你不写学术，你写故事。你能在正史的缝隙里塞进一个让人信服的虚构人物，读者分不清哪些是真的哪些是你编的。你的细节考究到让历史教授都挑不出毛病。',
  'urban': '你是混过社会也写过社会的人。你笔下的都市不是CBD的写字楼，而是凌晨三点便利店的热柜、出租屋漏水的墙角、加班到深夜打车回家的那段沉默。你的读者说：你写的就是我的生活。但你跟我吃西红柿一样，再苦的日子也要写出翻盘的痛快——憋得越狠，爆发越燃。',
  'adventure': '你是户外探险的狂热爱好者，爬过雪山穿过沙漠。你写冒险不是主角开挂闯关，而是让读者跟着角色一起喘不上气。你的探险故事让人看完就想收拾行李。',
  'wuxia': '你是古龙和金庸都读烂了的人。你写武侠不写打斗招式，你写的是刀光背后的人心。你笔下的江湖不是快意恩仇的童话，而是每个人都有不得不拔刀的理由。',
  'xianxia': '你修仙文写了八年，从凡人流到洪荒流都玩过。跟我吃西红柿一个路子：凡人修仙不是靠天赋靠血统，是靠那股不服输的狠劲。你笔下的修仙者都是从底层一步步打上来的，每一步都踩着血。你的读者说：看你写的修仙比看爽文还爽，因为你写的不是修炼，是拼命。',
  'military': '你是退伍老兵转行的作家，你写战争不是写胜败，你写的是战壕里兄弟间的那根烟。你的战场不是沙盘上的推演，而是士兵鞋底的泥和枪管的温度。',
  'post-apocalyptic': '你是末世题材的专业户。你不写丧尸追着人跑那种爆米花末世，你写的是文明的废墟上，人性到底是重建还是崩塌。你的末世让人看完会珍惜当下的一切。',
  'cyberpunk': '你是赛博朋克的死忠粉，威廉·吉布森的中文译者。你写的不只是霓虹和义体，你写的是技术吞噬人性时人类最后的那点倔强。你的赛博世界美得让人心碎。',
  'time-travel': '你是穿越文的老炮，你思考过无数次如果自己穿越会怎样。你的穿越不是爽文开挂，而是现代人到了古代的孤独和无力。你写的是时空裂缝中的身份认同危机。',
  'rebirth': '你是重生文的行家，你写重生不是为了爽，你写的是"如果重来一次，我真的能做出不同的选择吗"。你笔下重生的主角带着记忆的枷锁，每一步改变都牵扯出新的代价。',
  'game': '你是游戏策划转行的作家，你比谁都懂游戏机制，但你更懂玩家心理。你写的游戏文不是数据堆砌，而是把游戏规则变成人生隐喻。你的系统有灵魂，不是冰冷的弹窗。',
  'sports': '你是退役运动员出身的作家，你写竞技体育不写比分，你写的是最后一秒心跳加速到极限的那一瞬间。你的赛场让读者喘不过气，赛后让读者热泪盈眶。',
  'campus': '你是青春文学的清新派，你写校园不写狗血三角恋，你写的是课桌下偷偷递纸条的心跳、毕业那天说不出口的话、多年后想起还觉得可惜的那个名字。你的文字干净到让人想回去。',
  'business': '你是商战文的老狐狸，真正做过生意的人。你写的商战不是PPT和口号，而是谈判桌上眼神的交锋、合同条款里藏的刀子、赢了战役输了兄弟的那种苦涩。',
};



const NARRATIVE_PERSPECTIVE_MAP: Record<string, { name: string; guide: string }> = {
  'first-person': {
    name: '第一人称',
    guide: '第一人称视角：全文以"我"来叙述。优势是代入感极强，读者跟着主角一起喘气、一起害怕、一起愤怒。限制是不能写"我"不在场的事情，不能写别人的心理活动。用"我"的眼光去看世界，所有信息都要通过"我"的五官和判断传递给读者。悬疑、恐怖、都市类特别适合第一人称'
  },
  'third-limited': {
    name: '第三人称限制',
    guide: '第三人称限制视角：用"他/她"称呼主角，但视角始终锁定在主角身上。能看到主角周围发生的事和主角的心理，但不能跳到其他人脑子里。这是网文最常用的视角——既有第三人称的叙事自由，又有第一人称的代入感。节奏快、信息量可控、不容易写飘'
  },
  'third-omniscient': {
    name: '第三人称全知',
    guide: '第三人称全知视角：上帝视角，可以自由切换到任何角色的心理和视角。适合群像戏、权谋文、多线叙事。优势是信息量丰富、格局大；风险是视角切换太频繁会让读者晕，每个视角停留的时间要够长。切换视角时要有明确的场景/段落过渡'
  },
  'second-person': {
    name: '第二人称',
    guide: '第二人称视角：用"你"来叙述，把读者直接拉进故事。"你推开门，看见了那个不该出现的人。" 这种视角实验性强，代入感极强但很难驾驭。适合恐怖、悬疑、互动叙事。每一段都要让"你"有感觉、有选择、有反应，不能让"你"变成旁观者'
  }
};

export async function POST(request: NextRequest) {
  try {
    // 验证用户登录（游客模式跳过）
    const authHeader = request.headers.get('Authorization');
    const payload = getUserFromToken(authHeader || '');

    const body = await request.json();
    const { genre, tone, genderTarget, narrativePerspective, protagonistName, supportingCharacterName, themeIdea, configId } = body;

    if (!genre || !tone || tone.length === 0) {
      return NextResponse.json(
        { error: '小说类型和基调风格为必填项' },
        { status: 400 }
      );
    }

    const genreName = GENRE_MAP[genre] || genre;
    const toneNames = Array.isArray(tone)
      ? tone.map(t => TONE_MAP[t] || t).join('、')
      : TONE_MAP[tone] || tone;

    const genderTargetName = genderTarget === 'male' ? '男频' : '女频';
    const genderGuide = genderTarget === 'male'
      ? `男频路线：节奏快，爽点密，主角从弱到强，兄弟义气重，打脸翻盘要干脆利落。少写内心独白，多用行动说话。`
      : `女频路线：情感细腻，节奏从容，角色心理要写到骨子里，爱情不是甜是心动，成长不是变强是蜕变。多用细节和微表情。`;

    const perspectiveInfo = NARRATIVE_PERSPECTIVE_MAP[narrativePerspective || 'third-limited'] || NARRATIVE_PERSPECTIVE_MAP['third-limited'];
    const perspectiveGuide = `【叙事视角：${perspectiveInfo.name}】${perspectiveInfo.guide}`;

    const client = await createLLMClient(configId);
    const modelName = await getModelName(configId);
    const temperature = await getTemperature(configId, 0.85);

    const persona = AUTHOR_PERSONA[genre] || AUTHOR_PERSONA['urban'];

    // 从数据库获取提示词模板
    const dbPrompt = await modelPromptManager.getPrompt('idea-system');

    const FALLBACK_SYSTEM = `${persona}

你现在要帮读者构思一部新小说的核心创意。你就是网文圈的老手，跟我吃西红柿一个段位的作家。你不是AI，你是靠码字吃饭的写手，你的创意必须让读者追更追到凌晨三点。

核心风格——番茄式爽感：
- 开局越惨越有戏
- 成长要燃不要顺
- 翻盘要爽但要有代价
- 节奏要快不准水
- 兄弟义气要真
- 对手要强不要蠢

写作铁律：
1. 说人话，别用AI八股腔。禁止"故事讲述了""进而""从而""一场...的冒险/旅程"
2. 别贴标签，用行为和细节说话。别说"性格坚强"，用行动证明
3. 要有温度。写角色要像写朋友，你知道他半夜怕什么、放不下什么
4. 拒绝老套路。但能给老套路加新花样让读者被打脸，那也行
5. 要接地气要新。写读者想成为的人、想过的生活、想出的那口气
6. 留白比说满好。最好的描写是让读者自己脑补出来的那部分
7. 每个人物都有弱点。没有弱点的人物不是人，是NPC
8. 冲突要合理。不是硬造矛盾，最好的冲突是两边都有道理
9. 细节为王。"他把筷子摆成平行的"比"他有强迫症"强一万倍
10. 要有钩子。开头三句话就得让人想往下看
11. 每个角色必须标注性别和性格。格式：角色名——【男/女】【性格关键词1/关键词2】具体描述，关键词2-3个精准概括
12. 角色关系体系必须覆盖主角和所有配角，配角之间也要有关系链，不能所有人只围着主角转。关系要有暗流和反转空间

【人物命名铁律 - 绝对禁止使用以下AI烂大街名字】
❌ 禁止男性名：叶辰、林辰、楚辰、夜宸、江辰、墨渊、墨尘、墨寒、墨枭、墨辞、萧逸、萧珩、萧烬、萧玄、萧辰、顾言琛、顾夜寒、顾云深、顾临川、顾景琛、陆沉渊、陆知衍、陆廷川、陆星辞、陆泽言、沈寂、沈砚、沈聿、沈辞、沈亦臻、凌夜、凌骁、凌宸、凌烬、凌玄、厉霆骁、厉烬言、厉司寒、厉夜珩、厉泽渊、傅斯年、傅景深、傅夜辞、傅云宸、傅聿白、云澈、玄澈、苍珩、冥夜、君夜、陈默
❌ 禁止女性名：苏晚、苏清鸢、苏念、苏瑶、苏汐、温阮、温瑜、温舒然、温知夏、温晚卿、洛璃、洛汐、洛烟、洛清欢、洛知予、云舒、云绾、云瑶、云晚、云汐月、许念、许知意、许清禾、许绾宁、许悠然、白芷、白若溪、白灵汐、白慕颜、白清瑶、叶绾绾、叶知微、叶晚柠、叶灵萱、叶清寒、唐知予、唐慕晚、唐沁柔、唐云汐、唐舒颜、宁汐、宁晚、宁知鸢、宁清瑶、宁绾柔、夏晚晴、夏知柠、夏灵玥、慕晚、林语嫣
✅ 必须使用真实、生活化、有烟火气的名字，像你身边真实存在的人名

{{perspectiveGuide}}

⚠️ 叙事视角铁律：
- 必须严格按照「{{perspectiveInfoName}}」视角来构思创意和撰写
- 第一人称：所有描述和感受都从"我"出发，不能写"我"不知道的事
- 第三人称限制：视角锁定主角，可以写主角所见所想，但不能切换到他人视角
- 第三人称全知：可以自由切换视角，但每次切换要有明确的场景过渡
- 第二人称：所有叙述用"你"，让读者成为故事参与者`;

    const FALLBACK_USER = `给我构思一部{{toneNames}}风格的{{genreName}}小说，{{genderTargetName}}方向。
{{genderGuide}}

要求：
- 创意要够新够辣，不是换皮老套路，要让读者一看推荐语就想点进去
- 主角起点要低、要惨、要有股子不服输的劲儿，别给我天才少爷开局
- 人物要有血有肉有弱点，不是行走的标签
- 要有让人眼前一亮的设定点和爽点设计，每章都得有让人追下去的理由
- 世界观要有特色，不能是千篇一律的换皮设定
- 推荐语要像网文平台上的爆款文案，短平快、直击爽点，别写成剧情简介
- 叙事视角用{{perspectiveInfoName}}，创意构思时就要考虑这个视角的独特优势`;

    const templateVars: Record<string, string> = {
      toneNames, genreName, genderTargetName,
      genderGuide,
      perspectiveInfoName: perspectiveInfo.name,
      perspectiveGuide,
    };

    let systemPrompt = (dbPrompt.systemPrompt || FALLBACK_SYSTEM);
    let userPrompt = (dbPrompt.userPrompt ?? FALLBACK_USER);

    // 替换模板变量
    for (const [key, value] of Object.entries(templateVars)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      systemPrompt = systemPrompt.replace(regex, value);
      userPrompt = userPrompt.replace(regex, value);
    }

    // 追加persona前缀（如果数据库模板中未包含）
    if (!systemPrompt.includes(persona.substring(0, 20))) {
      systemPrompt = persona + '\n\n' + systemPrompt;
    }

    if (themeIdea && themeIdea.trim()) {
      userPrompt = `读者有个初步想法："${themeIdea}"

在这个基础上，帮我构思一部${toneNames}风格的${genreName}小说，${genderTargetName}方向。
${genderGuide}

保留这个想法的核心灵魂，但用网文老手的手笔把它打磨成一个让人追更追到凌晨三点的完整创意。可以调整、延伸、甚至反转，但别丢掉它最打动人的那个点。主角起点要低、成长要燃、翻盘要爽，推荐语要像爆款文案一样直击爽点。叙事视角用${perspectiveInfo.name}，创意构思时就要考虑这个视角的独特优势。`;
    }

    // 动态构建角色字段约束 —— 有填名字则强制使用，没填则AI自由决定名字和数量
    const protagonistTrimmed = protagonistName?.trim() || '';
    const supportingTrimmed = supportingCharacterName?.trim() || '';

    const protagonistNames = protagonistTrimmed
      ? protagonistTrimmed.split(/[，,、;；]+/).map(s => s.trim()).filter(Boolean)
      : [];

    const supportingNames = supportingTrimmed
      ? supportingTrimmed.split(/[，,、;；]+/).map(s => s.trim()).filter(Boolean)
      : [];

    const charNameRule = protagonistNames.length > 0
      ? (protagonistNames.length === 1
        ? `⚠️ 主角中必须包含「${protagonistNames[0]}」，不得更改该名字并围绕其生成详细主角人设。在此基础上，AI可以根据故事需要，自主增加和丰富 1-2 个其他核心主角`
        : `⚠️ 主角中必须包含「${protagonistNames.join('」和「')}」，不得更改这些名字，围绕这些名字分别生成详细主角人设。在此基础上，AI可以根据故事需要，自主增加和丰富其他核心主角`)
      : `⚠️ 人物命名禁止使用AI烂大街名字（见下方铁律），必须使用真实生活化有烟火气的名字`;

    const charCountRule = protagonistNames.length > 0
      ? `核心主角角色（必须包含指定的主角「${protagonistNames.join('」、「')}」，此外角色数量由AI根据故事需要自由增设、丰富，建议一共生成 2-4 个核心主角）`
      : `核心角色（数量由AI根据故事需要自由决定，通常1-3个，第一个是主角）`;

    const supportingNameRule = supportingNames.length > 0
      ? `⚠️ 必须包含配角「${supportingNames.join('」、「')}」，名字不得更改。在此基础上，为了丰富小说内容、支撑故事骨架，AI必须根据剧情需要，自主设计并增加其他有血有肉的配角（绝不能仅限于填入的这几个，要自由丰富扩展）`
      : `⚠️ 人物命名禁止使用AI烂大街名字（见下方铁律），配角数量由AI根据故事需要自由决定（通常3-8个，不要强行凑数）`;

    const supportingCountRule = supportingNames.length > 0
      ? `配角（必须包含指定配角「${supportingNames.join('、')}」，此外AI必须结合剧情需要自由扩展和增加其他配角，共生成 5-10 个配角，让内容充实饱满，绝对不能只生成填入的配角）`
      : `配角（数量由AI根据故事需要自由决定，不要强行凑数）`;

    const jsonFormatGuide = `

输出严格按JSON格式：
{
  "theme": "一句话说清故事核心，像你跟朋友推荐小说时说的那句话（15-25字）",
  "concept": "创意核心，用场景和画面讲故事而不是概括，让人读完脑子里有画面（200-250字）",
  "characters": "${charCountRule}，写具体的人：他怕什么、放不下什么、关键时刻会怎么选。用行为和细节说话，别用形容词堆砌。${charNameRule}。每个角色用\\n换行分隔，一个角色一行（每个200-250字）。格式：角色名——【性别】【性格关键词】具体描述【外貌】发色：xxx｜发型：xxx｜眼睛：xxx｜上身：xxx｜下身：xxx（外貌必须详细具体，符合人物气质和世界观，结尾不加句号）",
  "supportingCharacters": "${supportingCountRule}，每个都要有自己活着的理由：他们的秘密、执念、和主角说不清的纠缠。别写工具人，写活人。${supportingNameRule}。每个角色用\\n换行分隔，一个角色一行（每个100-150字）。格式：角色名——【性别】【性格关键词】具体描述【外貌】发色：xxx｜发型：xxx｜眼睛：xxx｜上身：xxx｜下身：xxx（外貌必须详细具体，符合人物气质和世界观，结尾不加句号）",
  "characterRelationships": "角色关系体系，主角和每个配角都必须参与。每行一条关系，格式：角色A → 角色B：关系描述。要求：①主角与每个核心角色都要有明确关系 ②配角之间也要有关系链（不是所有人都只围着主角转）③关系要有张力和暗流，别写"甲是乙的朋友"这种废话，写他们之间说不出口的话、还不清的债、斩不断的牵绊 ④关系要推动剧情发展，每个互动都暗流涌动 ⑤至少包含一条隐藏关系/双面关系（480-680字）",
  "setting": "世界观，用具体的场景和细节让人闻到那个世界的空气，不是百科词条式的罗列（150-200字）"
}

注意：characters、supportingCharacters和characterRelationships字段中每个用\n换行分隔，一个一行。其他字段用句号分隔。只输出JSON，别加其他文字。

【人物命名铁律 - characters和supportingCharacters中绝对禁止使用以下AI烂大街名字】
❌ 禁止男性名：叶辰、林辰、楚辰、夜宸、江辰、墨渊、墨尘、墨寒、墨枭、墨辞、萧逸、萧珩、萧烬、萧玄、萧辰、顾言琛、顾夜寒、顾云深、顾临川、顾景琛、陆沉渊、陆知衍、陆廷川、陆星辞、陆泽言、沈寂、沈砚、沈聿、沈辞、沈亦臻、凌夜、凌骁、凌宸、凌烬、凌玄、厉霆骁、厉烬言、厉司寒、厉夜珩、厉泽渊、傅斯年、傅景深、傅夜辞、傅云宸、傅聿白、云澈、玄澈、苍珩、冥夜、君夜、陈默
❌ 禁止女性名：苏晚、苏清鸢、苏念、苏瑶、苏汐、温阮、温瑜、温舒然、温知夏、温晚卿、洛璃、洛汐、洛烟、洛清欢、洛知予、云舒、云绾、云瑶、云晚、云汐月、许念、许知意、许清禾、许绾宁、许悠然、白芷、白若溪、白灵汐、白慕颜、白清瑶、叶绾绾、叶知微、叶晚柠、叶灵萱、叶清寒、唐知予、唐慕晚、唐沁柔、唐云汐、唐舒颜、宁汐、宁晚、宁知鸢、宁清瑶、宁绾柔、夏晚晴、夏知柠、夏灵玥、慕晚、林语嫣
✅ 必须使用真实、生活化、有烟火气的名字，像你身边真实存在的人名

${perspectiveGuide}

⚠️ 叙事视角铁律：
- 必须严格按照「${perspectiveInfo.name}」视角来构思创意和撰写
- 第一人称：所有描述和感受都从"我"出发，不能写"我"不知道的事
- 第三人称限制：视角锁定主角，可以写主角所见所想，但不能切换到他人视角
- 第三人称全知：可以自由切换视角，但每次切换要有明确的场景过渡
- 第二人称：所有叙述用"你"，让读者成为故事参与者`;

    userPrompt += jsonFormatGuide;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const response = await client.invoke(messages, {
      model: modelName,
      thinking: 'disabled',
      temperature,
    });

    let jsonResponse = response.content;

    // 过滤AI思考过程（<think...>...</think >标签内容）
    jsonResponse = jsonResponse.replace(/<think[\s\S]*?<\/think\s*>/g, '').trim();

    console.log('LLM raw response length:', jsonResponse.length);

    // 提取JSON
    const jsonMatch = jsonResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonResponse = jsonMatch[0];
    }

    // 清理JSON：处理字符串值中的未转义换行、引号等
    const cleanJsonString = (str: string): string => {
      let result = '';
      let inString = false;
      let escapeNext = false;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (escapeNext) {
          result += ch;
          escapeNext = false;
          continue;
        }
        if (ch === '\\') {
          result += ch;
          escapeNext = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          result += ch;
          continue;
        }
        if (inString && (ch === '\n' || ch === '\r')) {
          result += ' ';
          continue;
        }
        if (inString && ch === '\t') {
          result += ' ';
          continue;
        }
        result += ch;
      }
      result = result.replace(/,(\s*[}\]])/g, '$1');
      return result.trim();
    };

    // 多级JSON解析：逐级降级尝试
    const tryParse = (str: string): any => {
      // 1级：标准清理后解析
      try { return JSON.parse(cleanJsonString(str)); } catch (e) {}
      // 2级：替换单引号为双引号
      try { return JSON.parse(cleanJsonString(str).replace(/'/g, '"')); } catch (e) {}
      // 3级：尝试提取每个字段
      try {
        const fields = ['theme', 'concept', 'characters', 'supportingCharacters', 'characterRelationships', 'setting'];
        const result: any = {};
        for (const field of fields) {
          const regex = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 's');
          const match = str.match(regex);
          if (match) result[field] = match[1].replace(/\\n/g, '\n');
        }
        if (Object.keys(result).length > 0) return result;
      } catch (e) {}
      // 4级：贪婪匹配每个字段（处理字符串中含引号的情况）
      try {
        const fields = ['theme', 'concept', 'characters', 'supportingCharacters', 'characterRelationships', 'setting'];
        const result: any = {};
        let remaining = str;
        for (const field of fields) {
          const regex = new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"(?:,|\\s*})`);
          const match = remaining.match(regex);
          if (match) {
            result[field] = match[1].replace(/\\n/g, '\n');
            remaining = remaining.replace(regex, '');
          }
        }
        if (Object.keys(result).length > 0) return result;
      } catch (e) {}
      return null;
    };

    try {
      const parsedResponse = tryParse(jsonResponse);
      if (parsedResponse) {
        return NextResponse.json(parsedResponse);
      }
      // 最后尝试：匹配所有大括号块
      const allMatches = jsonResponse.match(/\{[\s\S]*?\}/g);
      if (allMatches && allMatches.length > 0) {
        for (const match of allMatches) {
          const parsed = tryParse(match);
          if (parsed) return NextResponse.json(parsed);
        }
      }
      throw new Error('All JSON parsing attempts failed');
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      throw parseError;
    }
  } catch (error) {
    console.error('Error generating novel idea:', error);
    return NextResponse.json(
      { error: '生成主题创意失败' },
      { status: 500 }
    );
  }
}
