'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import JSZip from 'jszip';
import { novelApi, adminNovelApi } from '@/lib/api/client';
import AIConfigModal from '@/components/AIConfigModal';
import { getToken } from '@/lib/get-token';
import { broadcastDataChange, onDataChange } from "@/lib/data-sync";

// 禁用服务端渲染，避免 hydration 错误
export const dynamic = 'force-dynamic';
export const dynamicParams = false;

function MatrixStream({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = text.split('\n');
  const displayLines = lines.slice(-50);
  const getFadeStyle = (lineIndex: number, totalLines: number) => {
    const age = totalLines - lineIndex - 1;
    if (age <= 0) return { color: '#fff', textShadow: '0 0 8px #4ade80, 0 0 20px #22c55e40', opacity: 1 };
    if (age <= 2) return { color: '#86efac', textShadow: '0 0 6px #4ade80', opacity: 0.95 };
    if (age <= 5) return { color: '#4ade80', textShadow: '0 0 3px #22c55e', opacity: 0.8 };
    if (age <= 10) return { color: '#22c55e', opacity: 0.6 };
    if (age <= 20) return { color: '#16a34a', opacity: 0.4 };
    return { color: '#166534', opacity: 0.2 };
  };

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: '#000', border: '1px solid rgba(0,255,65,0.15)', borderRadius: '12px', fontFamily: '"Courier New", monospace', fontSize: '13px', lineHeight: '1.7' }}>
      {/* 扫描线效果 */}
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.03) 2px, rgba(0,255,65,0.03) 4px)', pointerEvents: 'none', zIndex: 2 }} />
      <div ref={containerRef} style={{ padding: '14px 18px', maxHeight: '320px', overflowY: 'auto', position: 'relative', zIndex: 1 }}>
        {displayLines.map((line, i) => (
          <div key={i} style={{ ...getFadeStyle(i, displayLines.length), whiteSpace: 'pre-wrap', wordBreak: 'break-all', transition: 'opacity 0.3s' }}>
            {i === displayLines.length - 1 ? (
              <>{line}<span style={{ display: 'inline-block', width: '8px', height: '16px', background: '#4ade80', marginLeft: '2px', animation: 'pulse 1s infinite', boxShadow: '0 0 8px #4ade80' }} /></>
            ) : (line || '\u00a0')}
          </div>
        ))}
      </div>
      {/* 顶部渐变 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '30px', background: 'linear-gradient(rgba(0,0,0,0.8), transparent)', pointerEvents: 'none', zIndex: 3 }} />
      {/* 底部渐变 */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30px', background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', pointerEvents: 'none', zIndex: 3 }} />
    </div>
  );
}

interface NovelConfig {
  genre: string;
  chapterCount: number;
  tone: string[];
  genderTarget: 'male' | 'female'; // 男频/女频
  narrativePerspective: 'first-person' | 'third-limited' | 'third-omniscient' | 'second-person'; // 叙事视角
  protagonistName?: string;
  supportingCharacterName?: string;
  themeIdea?: string;
}

interface NovelIdea {
  theme: string;
  concept: string;
  characters: string;
  supportingCharacters: string;
  characterRelationships: string;
  conflictRelationships?: string;
  setting: string;
  trialRead?: string; // 试读段落
}

interface NovelStructure {
  mainPlot: string;
  emotionalCurve: string;
  keyConflicts: string;
  keyScenes?: string;
  keyItems?: string;
  chapterHooks: string[];
}

interface Chapter {
  index: number;
  title: string;
  content: string;
}

interface ChapterWarning {
  chapter: number;
  message: string;
  wordCount: number;
  targetMin: number;
}

// 小说类型分类
const GENRE_CATEGORIES = [
  {
    id: 'fantasy',
    name: '奇幻玄幻',
    icon: '🐉',
    color: 'from-purple-500 to-indigo-600',
    genres: [
      { value: 'fantasy', label: '奇幻' },
      { value: 'xianxia', label: '仙侠' },
      { value: 'wuxia', label: '武侠' },
      { value: 'eastern-fantasy', label: '东方玄幻' },
      { value: 'western-fantasy', label: '西方奇幻' },
      { value: 'high-fantasy', label: '史诗奇幻' },
    ]
  },
  {
    id: 'urban',
    name: '都市现实',
    icon: '🏙️',
    color: 'from-blue-500 to-cyan-600',
    genres: [
      { value: 'urban', label: '都市' },
      { value: 'historical', label: '历史' },
      { value: 'campus', label: '校园' },
      { value: 'business', label: '商战' },
      { value: 'sports', label: '体育' },
      { value: 'slice-of-life', label: '日常' },
      { value: 'social-issues', label: '社会问题' },
    ]
  },
  {
    id: 'scifi-suspense',
    name: '科幻悬疑',
    icon: '🚀',
    color: 'from-cyan-500 to-teal-600',
    genres: [
      { value: 'sci-fi', label: '科幻' },
      { value: 'cyberpunk', label: '赛博朋克' },
      { value: 'space-opera', label: '太空歌剧' },
      { value: 'mystery', label: '悬疑' },
      { value: 'thriller', label: '惊悚' },
      { value: 'horror', label: '恐怖' },
      { value: 'post-apocalyptic', label: '末世' },
    ]
  },
  {
    id: 'adventure',
    name: '冒险异能',
    icon: '⚔️',
    color: 'from-orange-500 to-red-600',
    genres: [
      { value: 'adventure', label: '冒险' },
      { value: 'time-travel', label: '穿越' },
      { value: 'rebirth', label: '重生' },
      { value: 'transmigration', label: '异界穿越' },
      { value: 'system', label: '系统流' },
      { value: 'game', label: '游戏' },
      { value: 'apocalyptic', label: '末世求生' },
    ]
  },
  {
    id: 'romance',
    name: '情感言情',
    icon: '💕',
    color: 'from-pink-500 to-rose-600',
    genres: [
      { value: 'romance', label: '言情' },
      { value: 'sweet-romance', label: '甜宠' },
      { value: 'drama', label: '虐恋' },
      { value: 'ancient-romance', label: '古言' },
      { value: 'modern-romance', label: '现言' },
      { value: 'love-triangle', label: '多角恋' },
    ]
  },
  {
    id: 'military',
    name: '军事战争',
    icon: '🎖️',
    color: 'from-emerald-500 to-green-600',
    genres: [
      { value: 'military', label: '军事' },
      { value: 'war', label: '战争' },
      { value: 'special-forces', label: '特种兵' },
      { value: 'anti-espionage', label: '谍战' },
      { value: 'survival', label: '生存' },
    ]
  },
];

const GENRE_OPTIONS = GENRE_CATEGORIES.flatMap(cat => cat.genres);

// 叙事视角选项
const NARRATIVE_PERSPECTIVE_OPTIONS = [
  { value: 'first-person', label: '第一人称', icon: '👤', description: '以"我"为视角，代入感极强，读者仿佛亲历故事', example: '我推开那扇门，看见了……' },
  { value: 'third-limited', label: '第三人称限制', icon: '🔍', description: '跟随一个角色的视角，知道他/她的内心，但看不到其他人的想法', example: '他攥紧了拳头，指甲掐进肉里。' },
  { value: 'third-omniscient', label: '第三人称全知', icon: '👁️', description: '上帝视角，可以看透所有角色的内心和事件的来龙去脉', example: '他不知道，就在隔壁，她正默默流泪。' },
  { value: 'second-person', label: '第二人称', icon: '🪞', description: '以"你"为叙事对象，沉浸式体验，适合悬疑和惊悚', example: '你推开门，一股血腥味扑面而来。' },
];

const GENDER_PERSPECTIVE_MAP: Record<string, string> = {
  'first-person': '第一人称（我）',
  'third-limited': '第三人称限制视角（他/她）',
  'third-omniscient': '第三人称全知视角',
  'second-person': '第二人称（你）',
};

const GENDER_TARGET_OPTIONS = [
  { value: 'male', label: '男频', description: '面向男性读者，强调热血、升级、爽文' },
  { value: 'female', label: '女频', description: '面向女性读者，强调情感、细腻、浪漫' },
];

const TONE_OPTIONS = [
  // 基础情感基调
  { value: 'light', label: '轻松幽默', description: '诙谐有趣，轻松愉快' },
  { value: 'serious', label: '严肃沉重', description: '庄重深沉，引人思考' },
  { value: 'epic', label: '史诗宏大', description: '气势磅礴，格局宏伟' },
  { value: 'romantic', label: '浪漫温馨', description: '温柔细腻，情感浓郁' },
  { value: 'dark', label: '黑暗压抑', description: '阴郁沉重，挑战极限' },
  { value: 'mysterious', label: '神秘诡异', description: '扑朔迷离，引人探究' },
  
  // 冲突强度
  { value: 'suspense', label: '紧张刺激', description: '惊心动魄，扣人心弦' },
  { value: 'thriller', label: '惊悚恐怖', description: '毛骨悚然，战栗不已' },
  { value: 'intense', label: '激烈冲突', description: '剑拔弩张，生死对决' },
  
  // 情感深度
  { value: 'philosophical', label: '哲学思辨', description: '深入思考，探索本质' },
  { value: 'satirical', label: '讽刺辛辣', description: '针砭时弊，深刻犀利' },
  { value: 'tragic', label: '悲剧催泪', description: '感人肺腑，催人泪下' },
  { value: 'inspiring', label: '热血励志', description: '激情澎湃，催人奋进' },
  { value: 'lyrical', label: '抒情唯美', description: '诗意盎然，意境优美' },
  { value: 'ironic', label: '荒诞讽刺', description: '离奇古怪，发人深省' },
  
  // 温度基调
  { value: 'warm', label: '温暖治愈', description: '温馨感人，抚慰心灵' },
  { value: 'cold', label: '冷峻理性', description: '冷静客观，理性分析' },
  
  // 特殊风格
  { value: 'witty', label: '机智诙谐', description: '妙语连珠，幽默风趣' },
  { value: 'melancholy', label: '忧郁唯美', description: '伤感凄美，意境深沉' },
  { value: 'heroic', label: '英雄主义', description: '英勇无畏，正气凛然' },
  { value: 'realistic', label: '写实主义', description: '真实贴切，贴近生活' },
  { value: 'surreal', label: '超现实', description: '奇幻超然，打破常规' },
  { value: 'cynical', label: '冷峻批判', description: '犀利批判，一针见血' },
  { value: 'sentimental', label: '感性抒情', description: '情真意切，感人至深' },
  { value: 'mystic', label: '神秘主义', description: '玄妙莫测，充满灵性' },
  { value: 'dystopian', label: '反乌托邦', description: '绝望沉重，反思社会' },
];

const CHAPTER_COUNT_OPTIONS = [5, 10, 20, 30, 50, 80, 100];

function CharacterList({ 
  text, 
  collapsed, 
  variant = 'character',
  onEditCharacter,
  onEditRelationship
}: { 
  text: string; 
  collapsed: boolean; 
  variant?: 'character' | 'relationship';
  onEditCharacter?: (index: number, name: string) => void;
  onEditRelationship?: (index: number, item: { name1: string; name2: string; relation: string }) => void;
}) {
  const safeText = text || '';
  const lines = safeText.split('\n').filter(line => line.trim());

  // 生成名字首字符对应的彩色头像背景色
  const avatarColors = [
    'bg-gradient-to-br from-blue-500 to-blue-600',
    'bg-gradient-to-br from-emerald-500 to-teal-600',
    'bg-gradient-to-br from-violet-500 to-purple-600',
    'bg-gradient-to-br from-amber-500 to-orange-600',
    'bg-gradient-to-br from-rose-500 to-pink-600',
    'bg-gradient-to-br from-cyan-500 to-sky-600',
    'bg-gradient-to-br from-lime-500 to-green-600',
    'bg-gradient-to-br from-fuchsia-500 to-pink-600',
    'bg-gradient-to-br from-indigo-500 to-blue-600',
    'bg-gradient-to-br from-red-500 to-rose-600',
  ];
  
  // 关系图标颜色
  const relationshipColors = [
    'border-l-blue-500',
    'border-l-emerald-500',
    'border-l-violet-500',
    'border-l-amber-500',
    'border-l-rose-500',
    'border-l-cyan-500',
    'border-l-fuchsia-500',
    'border-l-orange-500',
  ];

  return (
    <div className={`${collapsed ? 'line-clamp-3 overflow-hidden' : ''}`}>
      {lines.length === 0 ? (
        <p className="text-gray-400 text-sm italic">暂无数据</p>
      ) : variant === 'relationship' ? (
        <div className="grid gap-2.5">
          {lines.map((line, i) => {
            // 尝试解析关系：A——B，描述 或 A ↔ B：描述 或 A→B：描述
            const arrowMatch = line.match(/^(.+?)(?:[→↔———]|(?:<[-]{2}|—{2,}))(.+?)(?::|：|\s{2,})(.+)$/);
            const dashMatch = line.match(/^(.+?)(?:——|—|：)(.+?)(?::|：)(.+)$/);
            const simpleMatch = line.match(/^(.+?)(?:——|—)(.+)$/);
            
            let name1 = '', name2 = '', relation = '';
            if (arrowMatch) {
              name1 = arrowMatch[1].trim();
              name2 = arrowMatch[2].trim();
              relation = arrowMatch[3].trim();
            } else if (dashMatch) {
              name1 = dashMatch[1].trim();
              name2 = dashMatch[2].trim();
              relation = dashMatch[3].trim();
            } else if (simpleMatch) {
              name1 = simpleMatch[1].trim();
              relation = simpleMatch[2].trim();
            } else {
              return (
                <div key={i} className="bg-white/5 rounded-xl border border-white/10 shadow-sm px-4 py-3">
                  <p className="text-sm leading-relaxed text-gray-400">{line}</p>
                </div>
              );
            }

            const colorIdx = i % relationshipColors.length;
            return (
              <div
                key={i}
                className={`group relative bg-white/5 rounded-xl border border-white/10 shadow-sm hover:shadow-md hover:border-indigo-500/40 transition-all duration-200 pl-4 ${relationshipColors[colorIdx]} border-l-4`}
              >
                <div className="py-3 pr-4">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {name1 && (
                      <span className="text-base font-bold text-indigo-400">{name1}</span>
                    )}
                    <span className="text-gray-400">
                      <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </span>
                    {name2 && (
                      <span className="text-base font-bold text-violet-400">{name2}</span>
                    )}
                    {!name2 && name1 && (
                      <span className="text-sm text-gray-400">→</span>
                    )}
                  </div>
                  {relation && (
                    <p className="text-sm leading-relaxed text-gray-400">{relation}</p>
                  )}
                  {!relation && (
                    <p className="text-sm leading-relaxed text-gray-400">{simpleMatch ? simpleMatch[2].trim() : line}</p>
                  )}
                </div>
                {onEditRelationship && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditRelationship(i, { name1, name2: name2 || name1, relation: relation || (simpleMatch ? simpleMatch[2].trim() : line) });
                    }}
                    className="absolute top-3 right-3 p-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/20 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100"
                    title="编辑此项"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3">
          {lines.map((line, i) => {
            const nameMatch = line.match(/^(.+?)(?:——|—|：|:|\s[—\-])/);
            const name = nameMatch ? nameMatch[1].trim() : '';
            const rest = nameMatch ? line.slice(nameMatch[0].length).trim() : line;
            const avatarChar = name ? name.charAt(0) : '?';
            const colorIdx = i % avatarColors.length;
            // 提取性格标签
            const tags: string[] = [];
            const tagMatch = rest.match(/^【(.+?)】/);
            if (tagMatch) tags.push(...tagMatch[1].split(/[\/\/]/).map(t => t.trim()).filter(Boolean));
            // 提取外貌数据（【外貌】发色：xxx｜发型：xxx｜眼睛：xxx｜上身：xxx｜下身：xxx）
            const appearanceMatch = rest.match(/【外貌】([^【]*)/);
            const appearancePairs: { label: string; value: string }[] = [];
            if (appearanceMatch) {
              appearanceMatch[1].split(/[｜|]/).forEach(part => {
                const kv = part.match(/^(.+?)[:：](.+)$/);
                if (kv) appearancePairs.push({ label: kv[1].trim(), value: kv[2].trim() });
              });
            }
            // 描述：去掉外貌部分
            const descText = rest.replace(/【外貌】[^【]*/g, '').trim();
            const appearanceLabelColors: Record<string, string> = {
              '发色': 'bg-amber-500/15 text-amber-300 border-amber-500/20',
              '发型': 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20',
              '眼睛': 'bg-sky-500/15 text-sky-300 border-sky-500/20',
              '上身': 'bg-violet-500/15 text-violet-300 border-violet-500/20',
              '下身': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
            };
            return (
              <div
                key={i}
                className="group relative bg-white/5 rounded-xl border border-white/10 shadow-sm hover:shadow-md hover:border-white/20 transition-all duration-200 p-4"
              >
                {/* 顶部装饰色条 */}
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl ${avatarColors[colorIdx]}`} />
                {variant === 'character' && onEditCharacter && name && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditCharacter(i, name);
                    }}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer z-10"
                    title="编辑角色"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
                <div className="flex items-start gap-4 pt-1">
                  {/* 头像 */}
                  <div className={`flex-shrink-0 w-10 h-10 ${avatarColors[colorIdx]} rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm`}>
                    {avatarChar}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* 姓名行 */}
                    {name && (
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-base font-bold text-white tracking-wide">{name}</span>
                        {tags.map((tag, ti) => (
                          <span key={ti} className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-white/8 text-gray-300 rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* 描述文字 */}
                    <p className="text-sm leading-relaxed text-gray-400 mb-2">
                      {descText || (!name ? line : '')}
                    </p>
                    {/* 外貌描述 */}
                    {appearancePairs.length > 0 && (
                      <div className="mt-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                        <div className="text-[10px] text-gray-500 font-medium mb-2 tracking-wider uppercase">外貌特征</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {appearancePairs.map((ap, ai) => (
                            <div key={ai} className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 ${appearanceLabelColors[ap.label] || 'bg-white/5 text-gray-300 border-white/10'}`}>
                              <span className="text-[10px] font-bold shrink-0 opacity-70">{ap.label}</span>
                              <span className="text-xs leading-snug">{ap.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function NovelGenerator() {
  const [mounted, setMounted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAiConfigModal, setShowAiConfigModal] = useState(false);
  const router = useRouter();
  const [userInfo, setUserInfo] = useState<{ username: string; nickname?: string; role?: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  
  // 检查登录状态（游客模式允许未登录访问）
  useEffect(() => {
    const token = getToken();
    const userStr = localStorage.getItem('user');
    setIsLoggedIn(!!token);
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserInfo(user);
      } catch (e) {}
    }
    setAuthChecked(true);
  }, [router]);
  
  const [config, setConfig] = useState<NovelConfig>({
    genre: '',
    chapterCount: 8,
    tone: [],
    genderTarget: 'male',
    narrativePerspective: 'third-limited',
    protagonistName: '',
    supportingCharacterName: '',
  });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [step, setStep] = useState<'config' | 'idea' | 'structure' | 'generating' | 'result'>('config');
  const [isGeneratingMinimized, setIsGeneratingMinimized] = useState(false);
  const [isProgressModalMinimized, setIsProgressModalMinimized] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const generatedChapterIndicesRef = useRef<Set<number>>(new Set()); // 追踪已生成的章节索引
  const isGeneratingStructureRef = useRef(false); // 防止重复调用结构生成
  
  // Textarea refs for auto-resize
  const protagonistNameRef = useRef<HTMLTextAreaElement>(null);
  const themeIdeaRef = useRef<HTMLTextAreaElement>(null);
  
  // Auto-resize function
  const autoResizeTextarea = (ref: React.RefObject<HTMLTextAreaElement | null>) => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  };
  
  const [loading, setLoading] = useState(false);
  const [novelIdea, setNovelIdea] = useState<NovelIdea | null>(null);
  const [novelStructure, setNovelStructure] = useState<NovelStructure | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentGeneratingChapter, setCurrentGeneratingChapter] = useState(0);
  const [generatingExpandedChapter, setGeneratingExpandedChapter] = useState<number | null>(null);
  const [warning, setWarning] = useState<ChapterWarning | null>(null);
  const [regeneratingChapter, setRegeneratingChapter] = useState<number | null>(null);
  const [novelTitle, setNovelTitle] = useState<string | null>(null);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [titleCandidates, setTitleCandidates] = useState<string[] | null>(null);
  const [titleRecommended, setTitleRecommended] = useState<string>('');
  const [generatingIdea, setGeneratingIdea] = useState(false);
  const [editingIdea, setEditingIdea] = useState(false);
  const [editingIdeaContent, setEditingIdeaContent] = useState<NovelIdea | null>(null);
  const [editingStructure, setEditingStructure] = useState(false);
  const [editingStructureContent, setEditingStructureContent] = useState<NovelStructure | null>(null);
  const [editingChapterIndex, setEditingChapterIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [editingIdeaField, setEditingIdeaField] = useState<keyof NovelIdea | null>(null);
  const [editingIdeaFieldContent, setEditingIdeaFieldContent] = useState<string>('');
  
  // 角色单独编辑状态
  interface DbCharacter {
    id: string;
    name: string;
    role: string | null;
    description: string | null;
    personality: string | null;
    appearance: string | null;
  }
  const [dbCharacters, setDbCharacters] = useState<DbCharacter[]>([]);
  const [editingCharacterInfo, setEditingCharacterInfo] = useState<{
    index: number;
    role: 'protagonist' | 'supporting';
    id: string | null;
    oldName: string;
    name: string;
    gender: string;
    personality: string;
    description: string;
    appearance: string;
    appearanceHairColor: string;
    appearanceHairstyle: string;
    appearanceEyes: string;
    appearanceUpper: string;
    appearanceLower: string;
  } | null>(null);
  const [savingCharacterInfo, setSavingCharacterInfo] = useState(false);

  const [generatingStructureBatches, setGeneratingStructureBatches] = useState(false);
  const [structureGenerationProgress, setStructureGenerationProgress] = useState({ current: 0, total: 0 });
  const [accumulatedStructure, setAccumulatedStructure] = useState<Partial<NovelStructure> | null>(null);
  const [accumulatedHooks, setAccumulatedHooks] = useState<string[]>([]);
  
  // 章节限制状态
  const [chapterLimit, setChapterLimit] = useState<number>(10);
  const [totalChaptersUsed, setTotalChaptersUsed] = useState<number>(0);
  const [remainingChapters, setRemainingChapters] = useState<number>(10);
  const [refreshingLimit, setRefreshingLimit] = useState(false);
  
  // 自定义模型模板
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');
  const [showCustomPromptModal, setShowCustomPromptModal] = useState(false);

  // 章节限制弹窗
  const [limitModal, setLimitModal] = useState<{ visible: boolean; message: string; type: 'limit' | 'error'; remaining?: number }>({
    visible: false,
    message: '',
    type: 'error'
  });

  // 编辑小说 - 从URL参数加载小说ID
  const [editingNovelId, setEditingNovelId] = useState<string | null>(null);

  // API配置选择
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [availableConfigs, setAvailableConfigs] = useState<Array<{ id: string; name: string; provider: string; model: string; scope: string }>>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  
  // 显示Toast提示
  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 加载已保存的小说
  const loadNovel = async (novelId: string) => {
    try {
      // 从 localStorage 直接读取用户角色，避免 userInfo 状态尚未更新的问题
      const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      let userRole: string | undefined;
      if (userStr) {
        try { userRole = JSON.parse(userStr).role; } catch (e) {}
      }
      const isAdmin = userRole === 'admin';
      const novel = isAdmin
        ? await adminNovelApi.getById(novelId)
        : await novelApi.getById(novelId);
      if (novel) {
        setSavedNovelId(novelId);  // 设置保存ID，这样保存时会更新而非创建
        setNovelTitle(novel.title);
        setNovelIdea(novel.idea);
        
        // 修复：确保 structure 数据完整，避免后续解析错误
        let structure = novel.structure;
        if (structure) {
          // 确保 keyConflicts 是字符串
          if (!structure.keyConflicts || typeof structure.keyConflicts !== 'string') {
            structure = { ...structure, keyConflicts: '核心冲突' };
          }
          // 确保 keyScenes 是字符串
          if (!structure.keyScenes || typeof structure.keyScenes !== 'string') {
            structure = { ...structure, keyScenes: '关键场景' };
          }
          // 确保 keyItems 是字符串
          if (!structure.keyItems || typeof structure.keyItems !== 'string') {
            structure = { ...structure, keyItems: '重要物品' };
          }
          // 确保 chapterHooks 是数组
          if (!structure.chapterHooks || !Array.isArray(structure.chapterHooks)) {
            structure = { ...structure, chapterHooks: [] };
          }
        }
        setNovelStructure(structure);
        if (novel.chapters && novel.chapters.length > 0) {
          setChapters(novel.chapters);
        }
        // 加载小说配置参数
        setConfig({
          genre: novel.category || '',
          chapterCount: novel.totalChapters || 8,
          tone: Array.isArray(novel.tone) ? novel.tone : [],
          genderTarget: (novel.genderTarget as 'male' | 'female') || 'male',
          narrativePerspective: (novel.narrativePerspective as 'first-person' | 'third-limited' | 'third-omniscient' | 'second-person') || 'third-limited',
          protagonistName: novel.protagonist || '',
          supportingCharacterName: novel.supportingCharacterName || '',
        });
        // 根据小说状态设置当前步骤
        if (novel.status === 'completed' || (novel.chapters && novel.chapters.length > 0)) {
          setStep('result'); // 已完成，跳到结果页面
        } else if (novel.idea && !novel.structure) {
          setStep('idea'); // 创意已生成，跳到结构分析
        } else if (novel.structure) {
          setStep('structure'); // 结构已生成，跳到章节生成
        }
        showToast('已加载小说：' + novel.title, 'success');
      }
    } catch (error) {
      console.error('加载小说失败:', error);
      showToast('加载小说失败', 'error');
    }
  };
  
  // 监听URL参数变化
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const novelId = urlParams.get('novelId');
    if (novelId) {
      loadNovel(novelId);
    }
  }, []);

  const [memberLevelName, setMemberLevelName] = useState<string>('免费用户');
  const [memberLevelCode, setMemberLevelCode] = useState<string>('');
  
  // 加载用户章节限制
  const loadChapterLimit = async () => {
    const token = getToken();
    if (!token) return;
    
    try {
      const response = await fetch('/api/member/limits', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setChapterLimit(data.data.chapterLimit);
        setTotalChaptersUsed(data.data.totalChaptersUsed || 0);
        setRemainingChapters(data.data.remainingChapters ?? data.data.chapterLimit);
        setMemberLevelName(data.data.memberLevelName);
        setMemberLevelCode(data.data.memberLevelCode || '');
      }
    } catch (error) {
      console.error('获取章节限制失败:', error);
    }
  };
  
  useEffect(() => {
    if (isLoggedIn) {
      loadChapterLimit();
    }
  }, [isLoggedIn]);

  // 加载可用的API配置
  const loadAvailableConfigs = async () => {
    const token = getToken();
    if (!token) return;
    
    setLoadingConfigs(true);
    try {
      const response = await fetch('/api/ai/configs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        const allConfigs = [
          ...(result.data.systemConfigs || []).map((c: any) => ({ ...c, scope: 'system' })),
          ...(result.data.configs || []).map((c: any) => ({ ...c, scope: 'user' })),
        ];
        setAvailableConfigs(allConfigs);
        // 默认选中默认配置或第一个
        if (result.data.defaultConfigId) {
          setSelectedConfigId(result.data.defaultConfigId);
        } else if (allConfigs.length > 0) {
          setSelectedConfigId(allConfigs[0].id);
        }
      }
    } catch (error) {
      console.error('获取API配置失败:', error);
    } finally {
      setLoadingConfigs(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      loadAvailableConfigs();
    }
  }, [isLoggedIn]);
  
  // 进度弹窗状态
  const [progressModal, setProgressModal] = useState<{
    visible: boolean;
    stage: string;
    current: number;
    total: number;
    message: string;
  }>({
    visible: false,
    stage: '',
    current: 0,
    total: 0,
    message: ''
  });
  
  // 平滑进度百分比状态
  const [displayPercentage, setDisplayPercentage] = useState(0);
  const animationRef = useRef<number | null>(null);
  
  // 实时字数进度状态（用于章节生成）
  const [realTimeProgress, setRealTimeProgress] = useState(0);
  // 流式文本（用于弹窗显示）
  const [streamText, setStreamText] = useState('');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const typingSoundIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playTypingSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const bufferSize = ctx.sampleRate * 0.06;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 800 + Math.random() * 400;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(ctx.currentTime);
      source.stop(ctx.currentTime + 0.06);
    } catch {}
  }, []);

  useEffect(() => {
    if (streamText && progressModal.visible) {
      if (typingSoundIntervalRef.current) clearInterval(typingSoundIntervalRef.current);
      typingSoundIntervalRef.current = setInterval(playTypingSound, 150);
    } else {
      if (typingSoundIntervalRef.current) {
        clearInterval(typingSoundIntervalRef.current);
        typingSoundIntervalRef.current = null;
      }
    }
    return () => {
      if (typingSoundIntervalRef.current) {
        clearInterval(typingSoundIntervalRef.current);
        typingSoundIntervalRef.current = null;
      }
    };
  }, [streamText, progressModal.visible, playTypingSound]);

  // 已保存的小说 ID
  const [savedNovelId, setSavedNovelId] = useState<string | null>(null);
  const [isSavedForDownload, setIsSavedForDownload] = useState(false);

  // 结构分析单独字段编辑状态
  const [editingStructureField, setEditingStructureField] = useState<keyof NovelStructure | null>(null);
  const [editingStructureFieldContent, setEditingStructureFieldContent] = useState<string>('');

  // 结构条目单独编辑状态
  interface StructureItemEdit {
    field: keyof NovelStructure;
    index: number;
    title: string;
    content: string;
    name?: string;
    description?: string;
    atmosphere?: string;
  }
  const [editingStructureItem, setEditingStructureItem] = useState<StructureItemEdit | null>(null);

  // 角色关系单独编辑状态
  interface RelationshipItemEdit {
    index: number;
    name1: string;
    name2: string;
    relation: string;
  }
  const [editingRelationshipItem, setEditingRelationshipItem] = useState<RelationshipItemEdit | null>(null);

  // 章节内容编辑状态
  const [editingChapterContentIndex, setEditingChapterContentIndex] = useState<number | null>(null);
  const [editingChapterContent, setEditingChapterContent] = useState<string>('');

  // 主题创意选项状态
  const [ideaOptions, setIdeaOptions] = useState<Array<{ id: number; title: string; idea: string; concept?: string; protagonist?: string; uniquePoint?: string }>>([]);
  const [showIdeaOptions, setShowIdeaOptions] = useState(false);
  const [loadingIdeaOptions, setLoadingIdeaOptions] = useState(false);

  // 只在客户端挂载后渲染
  useEffect(() => {
    setMounted(true);
    
    // 初始化时自动调整高度
    setTimeout(() => {
      autoResizeTextarea(protagonistNameRef);
      autoResizeTextarea(themeIdeaRef);
    }, 100);
    
    // 加载保存的小说数据
    const loadNovel = localStorage.getItem('loadNovel');
    if (loadNovel) {
      try {
        const novel = JSON.parse(loadNovel);
        setConfig({
          genre: novel.category || '',
          chapterCount: novel.totalChapters || 8,
          tone: novel.tone || [],
          genderTarget: novel.genderTarget || 'male',
          narrativePerspective: novel.narrativePerspective || 'third-limited',
          protagonistName: novel.protagonist || '',
          supportingCharacterName: novel.supportingCharacterName || '',
          themeIdea: novel.themeIdea || '',
        });
        setNovelTitle(novel.title);
        setNovelIdea(novel.idea);
        setNovelStructure(novel.structure);
        setChapters(novel.chapters || []);
        setSavedNovelId(novel.id);
        
        // 初始化已生成章节索引追踪
        if (novel.chapters && novel.chapters.length > 0) {
          const indices = novel.chapters.map((ch: Chapter) => ch.index);
          generatedChapterIndicesRef.current = new Set(indices);
          console.log(`加载小说，已有章节: ${indices.sort((a: number, b: number) => a - b).join(',')}`);
        }
        
        // 根据当前状态设置合适的步骤
        if (novel.chapters && novel.chapters.length > 0) {
          setStep('result');
        } else if (novel.structure) {
          setStep('structure');
        } else if (novel.idea) {
          setStep('idea');
        }
        
        // 清除 localStorage
        localStorage.removeItem('loadNovel');
        
        // 加载后自动调整高度
        setTimeout(() => {
          autoResizeTextarea(protagonistNameRef);
          autoResizeTextarea(themeIdeaRef);
        }, 100);
      } catch (error) {
        console.error('加载小说失败:', error);
      }
    }
  }, []);
  
  // 自动调整高度：当mounted为true或内容变化时
  useEffect(() => {
    if (mounted) {
      setTimeout(() => {
        autoResizeTextarea(protagonistNameRef);
        autoResizeTextarea(themeIdeaRef);
      }, 0);
    }
  }, [mounted, config.protagonistName, config.themeIdea]);

  // 当 savedNovelId 变化时，从数据库获取角色子表数据，用于编辑角色时匹配 ID
  useEffect(() => {
    if (!savedNovelId) {
      setDbCharacters([]);
      return;
    }
    const fetchDetails = async () => {
      try {
        const token = getToken();
        const res = await fetch(`/api/novels/${savedNovelId}/details`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const result = await res.json();
        if (result.success && result.data?.characters) {
          setDbCharacters(result.data.characters);
        }
      } catch (e) {
        console.error('加载角色详情失败:', e);
      }
    };
    fetchDetails();
  }, [savedNovelId]);
  
  // 平滑进度百分比动画
  useEffect(() => {
    if (!mounted) return;
    
    // 如果是章节生成阶段，直接使用realTimeProgress
    let targetPercentage: number;
    if (progressModal.stage === 'chapters') {
      targetPercentage = realTimeProgress;
    } else {
      // 其他阶段使用传统的计算方式
      targetPercentage = progressModal.total > 0 
        ? Math.round((progressModal.current / progressModal.total) * 100) 
        : 0;
    }
    
    // 如果进度弹窗关闭，重置为0
    if (!progressModal.visible) {
      setDisplayPercentage(0);
      setRealTimeProgress(0);
      return;
    }
    
    // 如果目标值和当前值相同，不需要动画
    if (targetPercentage === displayPercentage) {
      return;
    }
    
    // 取消之前的动画
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }
    
    const startValue = displayPercentage;
    const diff = targetPercentage - startValue;
    const duration = 300; // 动画时长300ms
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // 使用easeOutCubic缓动函数
      const easeOutCubic = (t: number) => {
        return 1 - Math.pow(1 - t, 3);
      };
      
      const currentValue = Math.round(startValue + diff * easeOutCubic(progress));
      setDisplayPercentage(currentValue);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [progressModal.current, progressModal.total, progressModal.visible, progressModal.stage, realTimeProgress, displayPercentage, mounted]);

  // 未登录时显示加载中（实际会跳转）
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">正在验证登录状态...</p>
        </div>
      </div>
    );
  }

  // 服务端渲染时不显示内容，避免 hydration 错误
  if (!mounted) {
    return null;
  }

  // 逐字输出文字到 streamText（模拟终端打字效果）
  const typeToStream = (text: string, delay = 15): Promise<void> => {
    return new Promise((resolve) => {
      let i = 0;
      const interval = setInterval(() => {
        if (i < text.length) {
          const chunk = text.slice(i, i + Math.ceil(Math.random() * 3 + 1));
          setStreamText(prev => prev + chunk);
          i += chunk.length;
        } else {
          clearInterval(interval);
          resolve();
        }
      }, delay);
    });
  };

  const handleGenerateIdea = async () => {
    if (!config.genre || config.tone.length === 0) {
      alert('请选择小说类型和基调风格');
      return;
    }

    setStreamText('');
    setProgressModal({
      visible: true,
      stage: 'idea',
      current: 0,
      total: 4,
      message: '正在连接AI引擎...'
    });
    setIsProgressModalMinimized(false);

    try {
      // 阶段1: 发起请求
      setStreamText('> [IDEA_MATRIX] 正在连接AI创意引擎...\n');
      setProgressModal(p => ({ ...p, current: 1, message: '正在生成主题创意...' }));

      const response = await fetch('/api/novel/idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, configId: selectedConfigId }),
      });

      const data = await response.json();

      // 阶段2: 展示生成结果
      setProgressModal(p => ({ ...p, current: 2, message: '主题创意已生成，解析中...' }));
      setStreamText('> [IDEA_MATRIX] AI引擎响应成功\n\n');
      await typeToStream(`📖 主题：${data.theme || '...'}\n\n`);
      await typeToStream(`💡 核心概念：${data.concept || '...'}\n\n`);
      await typeToStream(`👤 主角设定：${(data.characters || '...').slice(0, 200)}\n\n`);
      await typeToStream(`🌍 世界观：${(data.setting || '...').slice(0, 200)}\n`);

      // 阶段3: 生成试读
      setProgressModal(p => ({ ...p, current: 3, message: '正在生成开篇试读...' }));
      setStreamText(prev => prev + '\n> [TRIAL_READ] 正在生成开篇试读段落...\n');

      try {
        const trialReadResponse = await fetch('/api/novel/trial-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            theme: data.theme,
            concept: data.concept,
            characters: data.characters,
            setting: data.setting,
            tone: config.tone,
            genderTarget: config.genderTarget,
            narrativePerspective: config.narrativePerspective,
            configId: selectedConfigId,
          }),
        });

        const trialReadData = await trialReadResponse.json();
        data.trialRead = trialReadData.trialRead || '';
        if (data.trialRead) {
          await typeToStream(`\n${data.trialRead.slice(0, 300)}...\n`);
        }
      } catch (error) {
        console.error('Error generating trial read:', error);
        data.trialRead = '';
        setStreamText(prev => prev + '> [TRIAL_READ] 试读生成跳过\n');
      }

      setNovelIdea(data);
      setEditingIdeaContent(data);
      
      setChapters([]);
      setNovelStructure(null);
      setSavedNovelId(null);
      
      // 阶段4: 完成
      setProgressModal(p => ({ ...p, current: 4, message: '主题创意生成完成！' }));
      setStreamText(prev => prev + '\n> [COMPLETE] 主题创意生成完成 ✓\n');
      
      try {
        await handleAutoSaveNovel(false, undefined, undefined, data);
      } catch (saveError) {
        console.error('自动保存失败（不影响已生成的内容）:', saveError);
      }
      
      loadChapterLimit();
      
      setTimeout(() => {
        setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' });
        setStreamText('');
        setStep('idea');
      }, 1200);
    } catch (error) {
      console.error('Error generating idea:', error);
      setStreamText(prev => prev + '\n> [ERROR] 生成失败: ' + (error instanceof Error ? error.message : '未知错误') + '\n');
      setToast({ message: '生成主题创意失败', type: 'error' });
      setTimeout(() => {
        setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' });
        setStreamText('');
      }, 2000);
    }
  };

  // 生成主题创意选项
  const handleGenerateIdeaOptions = async () => {
    if (!config.genre || config.tone.length === 0) {
      alert('请先选择小说类型和基调风格');
      return;
    }

    setLoadingIdeaOptions(true);
    setShowIdeaOptions(true);

    try {
      const response = await fetch('/api/novel/idea-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genre: config.genre,
          tone: config.tone,
          genderTarget: config.genderTarget,
          narrativePerspective: config.narrativePerspective,
          protagonistName: config.protagonistName,
          supportingCharacterName: config.supportingCharacterName,
          themeIdea: config.themeIdea,
          configId: selectedConfigId,
        }),
      });

      const data = await response.json();

      if (data.success && data.options) {
        setIdeaOptions(data.options);
        setShowIdeaOptions(true);
      } else {
        alert('生成主题创意选项失败');
      }
    } catch (error) {
      console.error('Error generating idea options:', error);
      alert('生成主题创意选项失败');
    } finally {
      setLoadingIdeaOptions(false);
    }
  };

  // 选择主题创意选项
  const handleSelectIdeaOption = (option: { id: number; title: string; idea: string; concept?: string; protagonist?: string; uniquePoint?: string }) => {
    // 用标题+hook+概念组合成完整的主题创意
    const fullIdea = option.concept
      ? `${option.title}：${option.idea}。${option.concept}`
      : option.idea;
    setConfig({ ...config, themeIdea: fullIdea });
    setShowIdeaOptions(false);
    setIdeaOptions([]);
  };

  // 重新生成主题创意
  const handleRegenerateIdea = async () => {
    setStreamText('');
    setProgressModal({
      visible: true,
      stage: 'idea',
      current: 0,
      total: 2,
      message: '正在重新生成主题创意...'
    });
    setIsProgressModalMinimized(false);

    try {
      setStreamText('> [REGEN_MATRIX] 重新生成主题创意...\n');
      setProgressModal(p => ({ ...p, current: 1, message: '正在调用AI引擎...' }));

      const response = await fetch('/api/novel/idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, configId: selectedConfigId }),
      });

      const data = await response.json();
      setNovelIdea(data);
      setEditingIdeaContent(data);
      
      setProgressModal(p => ({ ...p, current: 2, message: '主题创意已重新生成！' }));
      setStreamText('> [REGEN_MATRIX] AI引擎响应成功\n\n');
      await typeToStream(`📖 主题：${data.theme || '...'}\n\n`);
      await typeToStream(`💡 概念：${data.concept || '...'}\n\n`);
      await typeToStream(`👤 主角：${(data.characters || '...').slice(0, 150)}\n`);
      setStreamText(prev => prev + '\n> [COMPLETE] 重新生成完成 ✓\n');
      
      showToast('主题创意已重新生成！', 'success');
      
      setTimeout(() => {
        setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' });
        setStreamText('');
      }, 1200);
    } catch (error) {
      console.error('Error regenerating idea:', error);
      setStreamText(prev => prev + '\n> [ERROR] 重新生成失败\n');
      showToast('重新生成失败', 'error');
      setTimeout(() => {
        setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' });
        setStreamText('');
      }, 2000);
    }
  };

  // 复制内容到剪贴板
  const handleCopyToClipboard = async (content: string, label: string) => {
    try {
      await navigator.clipboard.writeText(content);
      showToast(`${label}已复制到剪贴板`, 'success');
    } catch (error) {
      showToast('复制失败，请手动复制', 'error');
    }
  };

  // 切换展开/折叠状态
  const toggleCollapse = (sectionId: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  // 开始编辑主题创意
  const handleStartEditIdea = () => {
    if (!novelIdea) return;
    setEditingIdeaContent({ ...novelIdea });
    setEditingIdea(true);
  };

  // 保存主题创意修改
  const handleSaveIdea = () => {
    if (!editingIdeaContent) return;

    // 验证必填字段
    if (!editingIdeaContent.theme || !editingIdeaContent.concept) {
      showToast('主题和创意核心不能为空', 'error');
      return;
    }

    setNovelIdea(editingIdeaContent);
    setEditingIdea(false);
    showToast('主题创意已保存', 'success');
    // 同步到数据库（含 novel_characters 子表）
    handleAutoSaveNovel(undefined, undefined, undefined, editingIdeaContent).catch(() => {});
  };

  // 取消编辑
  const handleCancelEditIdea = () => {
    if (!novelIdea) return;
    setEditingIdeaContent({ ...novelIdea });
    setEditingIdea(false);
  };

  // 开始编辑主题创意的单个字段
  const handleStartEditIdeaField = (field: keyof NovelIdea) => {
    if (!novelIdea) return;
    setEditingIdeaField(field);
    setEditingIdeaFieldContent(novelIdea[field] || '');
  };

  // 保存主题创意的单个字段
  const handleSaveIdeaField = () => {
    if (!novelIdea || !editingIdeaField) return;

    // 验证必填字段
    if ((editingIdeaField === 'theme' || editingIdeaField === 'concept') && !editingIdeaFieldContent.trim()) {
      showToast(`${editingIdeaField === 'theme' ? '主题' : '创意核心'}不能为空`, 'error');
      return;
    }

    const updatedIdea = { ...novelIdea, [editingIdeaField]: editingIdeaFieldContent };
    setNovelIdea(updatedIdea);
    setEditingIdeaField(null);
    setEditingIdeaFieldContent('');
    showToast('已保存', 'success');
    // 同步到数据库
    handleAutoSaveNovel(undefined, undefined, undefined, updatedIdea).catch(() => {});
  };

  // 取消编辑主题创意的单个字段
  const handleCancelEditIdeaField = () => {
    setEditingIdeaField(null);
    setEditingIdeaFieldContent('');
    setGeneratingStructureBatches(false);
    setStructureGenerationProgress({ current: 0, total: 0 });
    setAccumulatedStructure(null);
    setAccumulatedHooks([]);
  };

  // 开始编辑结构分析
  const handleStartEditStructure = () => {
    if (!novelStructure) return;
    setEditingStructureContent({ ...novelStructure });
    setEditingStructure(true);
  };

  // 保存结构分析修改
  const handleSaveStructure = () => {
    if (!editingStructureContent) return;

    // 验证必填字段
    if (!editingStructureContent.mainPlot || !editingStructureContent.chapterHooks?.length) {
      alert('主要情节和章节钩子不能为空');
      return;
    }

    setNovelStructure(editingStructureContent);
    setEditingStructure(false);
    alert('结构分析已保存');
  };

  // 取消编辑结构分析
  const handleCancelEditStructure = () => {
    if (!novelStructure) return;
    setEditingStructureContent({ ...novelStructure });
    setEditingStructure(false);
    setEditingChapterIndex(null);
  };

  // 解析场景列表，提取地点名称、描述、氛围
  const parseKeyScenes = (text: string): { name: string; description: string; atmosphere: string }[] => {
    if (!text || typeof text !== 'string') return [];
    const results: { name: string; description: string; atmosphere: string }[] = [];
    const blocks = text.split(/(?=\d+\.\s)/);
    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      const withoutNumber = trimmed.replace(/^\d+\.\s*/, '');
      const lines = withoutNumber.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;
      const name = lines[0];
      let atmosphere = '';
      const descLines: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const m = lines[i].match(/^氛围[：:]\s*(.+)/);
        if (m) { atmosphere = m[1].trim(); }
        else { descLines.push(lines[i]); }
      }
      if (name) results.push({ name, description: descLines.join(' '), atmosphere });
    }
    return results.length > 0 ? results : [{ name: text.slice(0, 30), description: text.slice(30), atmosphere: '' }];
  };

  // 解析结构分析中的编号列表，支持同行多项目和换行分隔
  const parseNumberedItems = (text: string): { title: string; content: string; num: number }[] => {
    if (!text || typeof text !== 'string') return [];
    const items: { title: string; content: string; num: number }[] = [];
    // 匹配 "数字. " 开头的条目，支持有冒号（标题：内容）和无冒号（整段内容）两种格式
    const regex = /(\d+)\.\s+/g;
    const splits: { index: number; num: number; end: number }[] = [];
    let m;
    while ((m = regex.exec(text)) !== null) {
      splits.push({ index: m.index, num: parseInt(m[1]), end: m.index + m[0].length });
    }
    for (let i = 0; i < splits.length; i++) {
      const contentStart = splits[i].end;
      const contentEnd = i + 1 < splits.length ? splits[i + 1].index : text.length;
      const raw = text.slice(contentStart, contentEnd).trim();
      
      let title = '';
      let content = raw;
      
      // 优先尝试按冒号拆分（标题：内容）
      const colonIdx = raw.search(/[：:]/);
      if (colonIdx > 0 && colonIdx < 30) {
        title = raw.slice(0, colonIdx).trim();
        content = raw.slice(colonIdx + 1).trim();
      } 
      // 如果没有冒号，检查是否有换行分隔标题和内容
      else if (raw.includes('\n')) {
        const firstNewline = raw.indexOf('\n');
        const firstLine = raw.slice(0, firstNewline).trim();
        const rest = raw.slice(firstNewline + 1).trim();
        // 如果第一行较短（<=30字符）且有后续内容，视为标题
        if (firstLine.length > 0 && firstLine.length <= 30 && rest.length > 0) {
          title = firstLine;
          content = rest;
        } else {
          // 否则按原有逻辑尝试逗号或句号
          const commaIdx = firstLine.search(/[，,]/);
          if (commaIdx > 0 && commaIdx < 25) {
            title = firstLine.slice(0, commaIdx).trim();
            content = firstLine.slice(commaIdx + 1).trim() + (rest ? '\n' + rest : '');
          } else {
            const periodIdx = firstLine.search(/[。！？]/);
            if (periodIdx > 0 && periodIdx < 40) {
              title = firstLine.slice(0, periodIdx + 1).trim();
              content = firstLine.slice(periodIdx + 1).trim() + (rest ? '\n' + rest : '');
            } else {
              content = raw;
            }
          }
        }
      } 
      // 没有换行，尝试逗号或句号
      else {
        const commaIdx = raw.search(/[，,]/);
        if (commaIdx > 0 && commaIdx < 25) {
          title = raw.slice(0, commaIdx).trim();
          content = raw.slice(commaIdx + 1).trim();
        } else {
          const periodIdx = raw.search(/[。！？]/);
          if (periodIdx > 0 && periodIdx < 40) {
            title = raw.slice(0, periodIdx + 1).trim();
            content = raw.slice(periodIdx + 1).trim();
          }
        }
      }
      items.push({ title, content, num: splits[i].num });
    }
    if (items.length === 0) {
      return text.split(/\n/).filter((line: string) => line.trim()).map((line: string) => ({
        title: '',
        content: line.replace(/^\d+\.\s*/, '').trim(),
        num: 0
      }));
    }
    return items;
  };

  // 开始编辑结构分析的单个字段
  const handleStartEditStructureField = (field: keyof NovelStructure) => {
    if (!novelStructure) return;
    setEditingStructureField(field);
    setEditingStructureFieldContent(novelStructure[field] as string || '');
  };

  // 保存结构分析的单个字段
  const handleSaveStructureField = async () => {
    if (!novelStructure || !editingStructureField) return;

    // 验证必填字段
    if (editingStructureField === 'mainPlot' && !editingStructureFieldContent.trim()) {
      showToast('主要情节不能为空', 'error');
      return;
    }

    const updatedStructure = {
      ...novelStructure,
      [editingStructureField]: editingStructureFieldContent
    };
    
    setNovelStructure(updatedStructure);
    setEditingStructureField(null);
    setEditingStructureFieldContent('');
    showToast('已保存', 'success');

    // 同步保存到数据库
    try {
      await saveNovelToDatabase(undefined, undefined, updatedStructure);
    } catch (error) {
      console.error('保存结构字段失败:', error);
    }
  };

  // 取消编辑结构分析的单个字段
  const handleCancelEditStructureField = () => {
    setEditingStructureField(null);
    setEditingStructureFieldContent('');
  };

  // 开始编辑结构分析的单个条目
  const handleStartEditStructureItem = (field: keyof NovelStructure, index: number, item: { title?: string; content?: string; name?: string; description?: string; atmosphere?: string }) => {
    if (!novelStructure) return;
    const fieldText = novelStructure[field] as string || '';
    setEditingStructureItem({
      field,
      index,
      title: item.title || '',
      content: item.content || '',
      name: item.name || '',
      description: item.description || '',
      atmosphere: item.atmosphere || ''
    });
  };

  // 保存结构分析的单个条目
  const handleSaveStructureItem = async () => {
    if (!novelStructure || !editingStructureItem) return;

    const field = editingStructureItem.field;
    const index = editingStructureItem.index;
    const fieldText = novelStructure[field] as string || '';

    // 解析当前字段的所有条目
    const items = field === 'keyScenes' 
      ? parseKeyScenes(fieldText)
      : parseNumberedItems(fieldText);

    if (index >= items.length) return;

    // 重建该条目的文本
    let newItemLine: string;
    if (field === 'keyScenes') {
      const name = editingStructureItem.name || items[index].name || `场景${index + 1}`;
      const description = editingStructureItem.description || '';
      const atmosphere = editingStructureItem.atmosphere || '';
      newItemLine = `${name}\n${description}${atmosphere ? `\n氛围：${atmosphere}` : ''}`;
    } else {
      const title = editingStructureItem.title || '';
      const content = editingStructureItem.content || '';
      // 如果有标题，用换行分隔；否则直接用内容
      newItemLine = title ? `${title}\n${content}` : content;
    }

    // 按条目分割原文本
    const rawItems = fieldText.split(/(?=\d+\.\s)/);

    // 过滤空条目并重建
    const filteredItems = rawItems.map(s => s.trim()).filter(Boolean);
    
    // 找到对应的条目并替换
    let itemIndex = 0;
    const newItems = filteredItems.map(line => {
      if (line.match(/^\d+\./)) {
        if (itemIndex === index) {
          itemIndex++;
          return `${index + 1}. ${newItemLine}`;
        }
        itemIndex++;
      }
      return line;
    });

    const newText = newItems.join('\n\n');
    const updatedStructure = { ...novelStructure, [field]: newText };
    setNovelStructure(updatedStructure);
    setEditingStructureItem(null);

    showToast('已保存', 'success');

    // 同步保存到数据库
    try {
      await saveNovelToDatabase(undefined, undefined, updatedStructure);
    } catch (error) {
      console.error('保存结构条目失败:', error);
    }
  };

  // 取消编辑结构分析的单个条目
  const handleCancelEditStructureItem = () => {
    setEditingStructureItem(null);
  };

  // 开始编辑角色关系条目
  const handleStartEditRelationshipItem = (index: number, item: { name1: string; name2: string; relation: string }) => {
    setEditingRelationshipItem({ index, name1: item.name1, name2: item.name2, relation: item.relation });
  };

  // 保存角色关系条目
  const handleSaveRelationshipItem = async () => {
    if (!novelIdea || !editingRelationshipItem) return;

    const text = novelIdea.characterRelationships || '';
    const blocks = text.split(/\n(?=[^\n]+[→>\-]{1,2}[^\n]+)/);
    const filteredBlocks = blocks.map(b => b.trim()).filter(Boolean);
    
    if (editingRelationshipItem.index >= filteredBlocks.length) return;

    // 重建该条目的文本
    const { name1, name2, relation } = editingRelationshipItem;
    const newName2 = name2 !== name1 ? name2 : '';
    let newBlock: string;
    if (newName2) {
      newBlock = `${name1} → ${newName2}\n${relation}`;
    } else {
      newBlock = `${name1} → ${relation}`;
    }

    filteredBlocks[editingRelationshipItem.index] = newBlock;
    const newText = filteredBlocks.join('\n\n');
    
    const updatedIdea = { ...novelIdea, characterRelationships: newText };
    setNovelIdea(updatedIdea);
    setEditingRelationshipItem(null);

    showToast('已保存', 'success');

    // 同步保存到数据库
    try {
      await saveNovelToDatabase();
    } catch (error) {
      console.error('保存角色关系失败:', error);
    }
  };

  // 取消编辑角色关系条目
  const handleCancelEditRelationshipItem = () => {
    setEditingRelationshipItem(null);
  };

  // 开始编辑单个章节钩子
  const handleStartEditChapter = (index: number) => {
    setEditingChapterIndex(index);
  };

  // 保存单个章节钩子
  const handleSaveChapter = async (index: number, newHook: string) => {
    if (!novelStructure) return;

    const newHooks = [...novelStructure.chapterHooks];
    newHooks[index] = newHook;

    const updatedStructure = { ...novelStructure, chapterHooks: newHooks };
    setNovelStructure(updatedStructure);
    setEditingChapterIndex(null);

    showToast('已保存', 'success');

    // 同步保存到数据库
    try {
      await saveNovelToDatabase(undefined, undefined, updatedStructure);
    } catch (error) {
      console.error('保存章节钩子失败:', error);
    }
  };

  // 取消编辑单个章节钩子
  const handleCancelEditChapter = () => {
    setEditingChapterIndex(null);
  };

  // 删除单个章节钩子
  const handleDeleteChapter = (index: number) => {
    if (!novelStructure) return;

    const hookContent = novelStructure.chapterHooks[index];
    const preview = hookContent.length > 30 ? hookContent.substring(0, 30) + '...' : hookContent;

    if (confirm(`确定要删除第${index + 1}章的钩子吗？\n\n内容预览：${preview}`)) {
      const newHooks = novelStructure.chapterHooks.filter((_, i) => i !== index);
      setNovelStructure({ ...novelStructure, chapterHooks: newHooks });
      alert(`第${index + 1}章钩子已删除`);
    }
  };

  // 开始编辑章节内容
  const handleStartEditChapterContent = (index: number) => {
    const chapter = chapters.find(c => c.index === index);
    if (!chapter) return;

    setEditingChapterContentIndex(index);
    setEditingChapterContent(chapter.content);
  };

  // 保存章节内容
  const handleSaveChapterContent = () => {
    if (editingChapterContentIndex === null) return;

    const newChapters = chapters.map(chapter => {
      if (chapter.index === editingChapterContentIndex) {
        return {
          ...chapter,
          content: editingChapterContent
        };
      }
      return chapter;
    });

    setChapters(newChapters);
    setEditingChapterContentIndex(null);
    setEditingChapterContent('');
    showToast(`第${editingChapterContentIndex}章内容已保存`, 'success');
  };

  // 取消编辑章节内容
  const handleCancelEditChapterContent = () => {
    setEditingChapterContentIndex(null);
    setEditingChapterContent('');
  };

  const handleGenerateStructure = async () => {
    if (!novelIdea) {
      console.error('[Structure] novelIdea is null, cannot generate structure');
      return;
    }

    // 防止重复调用（React Strict Mode 可能触发两次）
    if (generatingStructureBatches || isGeneratingStructureRef.current) {
      return;
    }

    isGeneratingStructureRef.current = true;
    setGeneratingStructureBatches(true);
    setAccumulatedStructure(null);
    setAccumulatedHooks([]);
    setStreamText('');

    // 显示进度弹窗
    setProgressModal({
      visible: true,
      stage: 'structure',
      current: 0,
      total: config.chapterCount,
      message: '正在生成结构分析...'
    });
    setIsProgressModalMinimized(false);

    setStreamText('> [STRUCTURE_ANALYSIS] 初始化结构分析引擎...\n> 总章节数: ' + config.chapterCount + '\n');

    const batchSize = 5; // 每批生成5个章节钩子
    const totalBatches = Math.ceil(config.chapterCount / batchSize);
    let allHooks: string[] = [];
    let mainPlot = '';
    let emotionalCurve = '';
    let keyConflicts = '';
    let keyScenes = '';
    let keyItems = '';

    // 单批次生成函数（支持重试）
    const generateBatchWithRetry = async (batch: number, maxRetries: number = 3): Promise<any> => {
      const startChapter = batch * batchSize + 1;
      const endChapter = Math.min(startChapter + batchSize - 1, config.chapterCount);
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // 更新进度弹窗
          const retryMsg = attempt > 1 ? `（重试第${attempt}次）` : '';
          setProgressModal({
            visible: true,
            stage: 'structure',
            current: endChapter,
            total: config.chapterCount,
            message: `正在生成第 ${startChapter}-${endChapter} 章的钩子${retryMsg}...`
          });

          const requestBody = {
              ...novelIdea,
              chapterCount: config.chapterCount,
              tone: config.tone,
              genderTarget: config.genderTarget,
              narrativePerspective: config.narrativePerspective,
              startChapter,
              batchSize,
              previousHooks: allHooks,
              configId: selectedConfigId,
            };

          const response = await fetch('/api/novel/structure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });

          const data = await response.json();

          // 检查是否有错误
          if (!response.ok || data.error) {
            if (attempt < maxRetries) {
              console.warn(`[Structure] Batch ${batch + 1} attempt ${attempt} failed: ${data.error}, retrying...`);
              await new Promise(resolve => setTimeout(resolve, 1500));
              continue;
            }
            throw new Error(data.error || '生成结构分析失败');
          }

          // 检查钩子质量：如果超过一半是占位内容，视为低质量需重试
          if (Array.isArray(data.chapterHooks)) {
            const placeholderCount = data.chapterHooks.filter((h: string) =>
              !h || h.length < 12 || /^第\d+章$/.test(h.trim()) || /^第\d+章[：:]?\s*(剧情发展|故事继续|待续|略)/.test(h.trim())
            ).length;
            if (placeholderCount > data.chapterHooks.length / 2 && attempt < maxRetries) {
              console.warn(`[Structure] Batch ${batch + 1} attempt ${attempt}: ${placeholderCount}/${data.chapterHooks.length} hooks are placeholders, retrying...`);
              setStreamText(prev => prev + `> [WARN] 批次${batch + 1}质量不足(${placeholderCount}/${data.chapterHooks.length}为占位)，重试中...\n`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }
          }

          return data;
        } catch (err) {
          if (attempt < maxRetries) {
            console.warn(`[Structure] Batch ${batch + 1} attempt ${attempt} error: ${err}, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1500));
          } else {
            throw err;
          }
        }
      }
    };

    try {
      for (let batch = 0; batch < totalBatches; batch++) {
        // 更新进度
        setStructureGenerationProgress({ current: batch + 1, total: totalBatches });

        const data = await generateBatchWithRetry(batch);

        // 保存第一批的结构分析（主要情节、情感曲线、关键冲突、关键场景、关键物品）
        if (batch === 0) {
          mainPlot = data.mainPlot;
          emotionalCurve = data.emotionalCurve;
          keyConflicts = data.keyConflicts;
          keyScenes = data.keyScenes || '';
          keyItems = data.keyItems || '';
          setAccumulatedStructure({
            mainPlot,
            emotionalCurve,
            keyConflicts,
            keyScenes,
            keyItems,
            chapterHooks: []
          });
          // 输出结构概要到终端
          setStreamText(prev => prev + `\n> [PLOT] 主线剧情：${mainPlot.slice(0, 120)}...\n`);
          setStreamText(prev => prev + `> [EMOTION] 情感曲线：${emotionalCurve.slice(0, 100)}...\n`);
          setStreamText(prev => prev + `> [CONFLICT] 关键冲突：${keyConflicts.slice(0, 100)}...\n\n`);
        }

        // 累积章节钩子
        if (Array.isArray(data.chapterHooks)) {
          allHooks = [...allHooks, ...data.chapterHooks];
          // 输出新生成的钩子到终端
          const startIdx = allHooks.length - data.chapterHooks.length;
          data.chapterHooks.forEach((hook: string, idx: number) => {
            setStreamText(prev => prev + `> 第${startIdx + idx + 1}章：${hook.slice(0, 80)}${hook.length > 80 ? '...' : ''}\n`);
          });
        } else {
          console.error('chapterHooks is not an array:', data);
          throw new Error('章节钩子格式错误');
        }
        setAccumulatedHooks(allHooks);

        // 短暂延迟，避免请求过快
        if (batch < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // 完成生成，设置最终的结构分析
      const finalStructure: NovelStructure = {
        mainPlot,
        emotionalCurve,
        keyConflicts,
        keyScenes,
        keyItems,
        chapterHooks: allHooks
      };

      setNovelStructure(finalStructure);
      setStep('structure');
      setStreamText(prev => prev + `\n> [COMPLETE] 结构分析完成，共 ${allHooks.length} 章钩子 ✓\n`);
      
      // 自动保存结构分析（传入 finalStructure 避免异步 state 问题）
      await handleAutoSaveNovel(false, undefined, finalStructure);
    } catch (error) {
      // 忽略因页面卸载/取消导致的错误
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('[Structure] Request aborted');
        return;
      }
      console.error('Error generating structure:', error);
      // 如果部分成功，仍然保存已生成的钩子
      if (allHooks.length > 0 && mainPlot) {
        const partialStructure: NovelStructure = {
          mainPlot,
          emotionalCurve,
          keyConflicts,
          keyScenes,
          keyItems,
          chapterHooks: allHooks
        };
        setNovelStructure(partialStructure);
        setStep('structure');
        showToast(`结构分析部分生成成功（${allHooks.length}/${config.chapterCount}章），可重新生成补全`, 'warning');
      } else {
        showToast('生成结构分析失败', 'error');
      }
    } finally {
      isGeneratingStructureRef.current = false;
      setGeneratingStructureBatches(false);
      setAccumulatedStructure(null);
      setAccumulatedHooks([]);
      setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' });
    }
  };

  // 生成单个批次的章节
  const generateBatch = async (batchStart: number, batchSize: number = 5, signal?: AbortSignal): Promise<number> => {
    const token = getToken();
    const response = await fetch('/api/novel/chapters/stream', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        idea: novelIdea,
        structure: novelStructure,
        tone: config.tone,
        genderTarget: config.genderTarget,
        narrativePerspective: config.narrativePerspective,
        batchStart,
        batchSize,
        configId: selectedConfigId,
        previousChapterContent: chapters.length > 0 ? chapters[chapters.length - 1].content.slice(-1500) : '',
        previousChapterTitle: chapters.length > 0 ? chapters[chapters.length - 1].title : '',
        useCustomPrompt,
        customSystemPrompt: useCustomPrompt ? customSystemPrompt : undefined,
      }),
    });

    // 检查响应状态，处理错误（如章节数超限）
    if (!response.ok) {
      let errorMsg = '生成章节失败';
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMsg = errorData.error;
        }
      } catch {}
      throw new Error(errorMsg);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('无法读取响应流');
    }

    let buffer = '';
    let generatedCount = 0;
    
    // 计算总目标字数（每章2100字）
    const targetWordsPerChapter = 2100;
    const batchTotalWords = batchSize * targetWordsPerChapter;
    let batchGeneratedWords = 0; // 当前批次已生成的字数
    
    // 计算已完成的章节数（batchStart之前）
    const completedChapters = batchStart - 1;
    const totalChapters = novelStructure?.chapterHooks?.length || 0;
    const completedWords = completedChapters * targetWordsPerChapter;
    const totalWords = totalChapters * targetWordsPerChapter;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            if (event.type === 'batch_info') {
              console.log('批次信息:', event);
            } else if (event.type === 'chapter_start') {
              const newChapter: Chapter = {
                index: event.chapter,
                title: event.title,
                content: '',
              };
              // 记录已生成的章节索引
              generatedChapterIndicesRef.current.add(event.chapter);
              setChapters(prev => {
                // 检查章节是否已存在，避免重复添加
                const exists = prev.some(ch => ch.index === event.chapter);
                if (exists) {
                  console.log(`Chapter ${event.chapter} already exists, skipping`);
                  return prev;
                }
                console.log(`Adding new chapter ${event.chapter}: ${event.title}`);
                return [...prev, newChapter];
              });
              setCurrentGeneratingChapter(event.chapter);
              setStreamText(`--- 第 ${event.chapter} 章：${event.title || ''} ---\n`);
            } else if (event.type === 'content') {
              const chapterIndex = event.chapter;
              const content = event.content;
              setStreamText(prev => prev + content);
              const contentLength = content.length;
              
              setChapters(prev =>
                prev.map(ch =>
                  ch.index === chapterIndex
                    ? { ...ch, content: ch.content + content }
                    : ch
                )
              );
              
              // 实时更新进度
              batchGeneratedWords += contentLength;
              const totalGeneratedWords = completedWords + batchGeneratedWords;
              const percentage = Math.round((totalGeneratedWords / totalWords) * 100);
              
              // 限制在0-100之间
              const clampedPercentage = Math.min(100, Math.max(0, percentage));
              
              // 更新实时进度
              setRealTimeProgress(clampedPercentage);
              
              // 更新进度弹窗的current值
              setProgressModal(prev => ({
                ...prev,
                current: clampedPercentage,
                total: 100,
                message: `正在创作第 ${chapterIndex} 章... ${clampedPercentage}%`
              }));
            } else if (event.type === 'content_truncate') {
              // 处理截断事件：截断对应章节的内容
              const chapterIndex = event.chapter;
              const newLength = event.newLength;
              setChapters(prev =>
                prev.map(ch =>
                  ch.index === chapterIndex
                    ? { ...ch, content: ch.content.substring(0, newLength) }
                    : ch
                )
              );
              console.log(`Truncated chapter ${chapterIndex} to ${newLength} words`);
            } else if (event.type === 'chapter_warning') {
              // 处理字数警告事件
              console.warn(`Chapter ${event.chapter} warning:`, event.message);
              // 可以在这里显示警告信息给用户
              // 例如使用 Toast 或在界面上显示警告标识
              setWarning({
                chapter: event.chapter,
                message: event.message,
                wordCount: event.wordCount,
                targetMin: event.targetMin,
              });
            } else if (event.type === 'batch_warning') {
              // 处理批次警告事件（缺少章节）
              console.warn(`Batch warning:`, event.message);
              console.warn(`Missing chapters:`, event.missingChapters);
              showToast(`警告：${event.message}`, 'error');
            } else if (event.type === 'chapter_end') {
              generatedCount++;
              console.log(`Chapter ${event.chapter} ended, total generated: ${generatedCount}`);
            } else if (event.type === 'complete') {
              // 使用后端返回的实际生成数量
              const actualGeneratedCount = event.generatedCount || generatedCount;
              console.log(`Stream complete. Generated: ${actualGeneratedCount}, Expected: ${event.expectedCount}`);
              if (event.missingChapters && event.missingChapters.length > 0) {
                console.warn(`Missing chapters from backend:`, event.missingChapters);
              }
              return actualGeneratedCount;
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    }

    console.log(`generateBatch returning: ${generatedCount}`);
    return generatedCount;
  };

  const handleGenerateChapters = async () => {
    if (!novelStructure) return;

    // 检查章节数是否超限
    const existingChapters = chapters.length;
    const totalRequested = existingChapters + novelStructure.chapterHooks.length;
    if (chapterLimit > 0 && novelStructure.chapterHooks.length > remainingChapters) {
      setLimitModal({
        visible: true,
        message: `您的会员等级剩余可生成 ${remainingChapters} 章，当前需要生成 ${novelStructure.chapterHooks.length} 章，超出 ${novelStructure.chapterHooks.length - remainingChapters} 章。请减少章节钩子数量或升级会员。`,
        type: 'limit',
        remaining: Math.max(0, remainingChapters)
      });
      return;
    }

    setStep('generating');
    setStreamText('');
    
    // 不清空已生成的章节（支持断点续传）
    setCurrentGeneratingChapter(existingChapters + 1);
    setWarning(null);
    setRealTimeProgress(0); // 重置实时进度
    setIsGeneratingMinimized(false); // 重置缩小状态

    // 创建 AbortController
    abortControllerRef.current = new AbortController();

    // 显示进度弹窗
    setProgressModal({
      visible: true,
      stage: 'chapters',
      current: 0,
      total: 100,
      message: existingChapters > 0 ? `继续生成第 ${existingChapters + 1} 章...` : '开始生成章节内容...'
    });
    setIsProgressModalMinimized(false);

    try {
      const totalChapters = novelStructure.chapterHooks.length;
      const batchSize = 2; // 每批生成2章
      
      // 从下一章开始生成（支持断点续传）
      let currentBatchStart = existingChapters + 1;
      let totalGeneratedCount = existingChapters; // 追踪已生成的章节数
      let retryCount = 0;
      const maxRetries = 3; // 每批最多重试3次

      while (currentBatchStart <= totalChapters) {
        // 检查是否已被取消
        if (abortControllerRef.current?.signal.aborted) {
          console.log('Generation aborted');
          return;
        }

        console.log(`开始生成第 ${currentBatchStart} 批次...`);
        
        const endChapter = Math.min(currentBatchStart + batchSize - 1, totalChapters);
        const expectedCount = endChapter - currentBatchStart + 1;
        
        setProgressModal(prev => ({
          ...prev,
          message: `正在创作第 ${currentBatchStart}-${endChapter} 章...`
        }));

        const generatedCount = await generateBatch(currentBatchStart, batchSize, abortControllerRef.current.signal);
        console.log(`第 ${currentBatchStart} 批次完成，预期 ${expectedCount} 章，实际生成 ${generatedCount} 章`);
        
        // 检查是否生成完整
        if (generatedCount < expectedCount && retryCount < maxRetries) {
          retryCount++;
          console.warn(`批次生成不完整（预期${expectedCount}章，实际${generatedCount}章），重试第 ${retryCount} 次...`);
          // 只重试缺失的章节，而不是整个批次
          if (generatedCount > 0) {
            // 已有部分章节生成成功，只继续生成剩余的
            const generatedIndices = Array.from(generatedChapterIndicesRef.current);
            const currentMaxChapter = generatedIndices.length > 0 ? Math.max(...generatedIndices) : currentBatchStart;
            currentBatchStart = currentMaxChapter + 1;
            totalGeneratedCount += generatedCount;
            retryCount = 0; // 重置重试计数，因为这不是完全失败
            console.log(`已有${generatedCount}章生成成功，继续从第${currentBatchStart}章生成`);
            await handleAutoSaveNovel(false);
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
          showToast(`第 ${currentBatchStart}-${endChapter} 章生成不完整，正在重试...`, 'error');
          // 完全没生成成功，重试同一批
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        
        // 重置重试计数
        retryCount = 0;
        
        // 根据实际生成的章节数更新计数
        totalGeneratedCount += generatedCount;
        
        // 使用 ref 追踪的章节索引来确定下一批的起始位置
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 获取已生成的最大章节号
        const generatedIndices = Array.from(generatedChapterIndicesRef.current);
        const currentMaxChapter = generatedIndices.length > 0 ? Math.max(...generatedIndices) : currentBatchStart + generatedCount - 1;
        currentBatchStart = currentMaxChapter + 1;
        
        console.log(`已生成章节: ${generatedIndices.sort((a,b) => a-b).join(',')}`);
        console.log(`下一批从第 ${currentBatchStart} 章开始`);

        // 每批生成完成后自动保存进度（生成中状态）
        console.log('自动保存生成进度...');
        await handleAutoSaveNovel(false);

        // 短暂延迟，避免请求过快
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 最终验证：检查是否所有章节都已生成
      await new Promise(resolve => setTimeout(resolve, 500));
      const generatedIndices = Array.from(generatedChapterIndicesRef.current);
      const finalChapterCount = generatedIndices.length;
      const missingChapters: number[] = [];
      for (let i = 1; i <= totalChapters; i++) {
        if (!generatedIndices.includes(i)) {
          missingChapters.push(i);
        }
      }
      
      console.log(`章节生成完成：总章节数 ${totalChapters}，实际生成 ${finalChapterCount} 章`);
      console.log(`已生成章节: ${generatedIndices.sort((a,b) => a-b).join(',')}`);
      
      if (missingChapters.length > 0) {
        console.warn(`缺失章节: ${missingChapters.join(',')}`);
        showToast(`警告：缺失章节 ${missingChapters.join(',')}，请检查或重新生成`, 'error');
      }
      
      // 更新进度弹窗为完成状态
      setRealTimeProgress(100); // 设置实时进度为100%
      setProgressModal({
        visible: true,
        stage: 'chapters',
        current: 100,
        total: 100,
        message: '章节生成完成！正在保存到小说库...'
      });

      // 自动保存小说到数据库，明确指定已完成
      console.log(`保存小说，状态: completed，章节数: ${finalChapterCount}/${totalChapters}`);
      await handleAutoSaveNovel(true);

      // 刷新会员剩余章节数（实时同步）
      loadChapterLimit();

      setTimeout(() => {
        setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' });
      }, 1000);

      setStep('result');
    } catch (error) {
      console.error('Error generating chapters:', error);
      
      // 检查是否是取消导致的错误
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Generation cancelled');
        return;
      }
      
      // 显示友好的错误弹窗
      const errorMsg = error instanceof Error ? error.message : '生成章节失败';
      setLimitModal({
        visible: true,
        message: errorMsg,
        type: errorMsg.includes('最多只能生成') || errorMsg.includes('剩余') ? 'limit' : 'error'
      });
      setStep('structure');
      setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' });
    } finally {
      // 清理 AbortController
      abortControllerRef.current = null;
    }
  };

  const handleReset = () => {
    // 取消正在进行的生成
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // 清空已生成章节索引追踪
    generatedChapterIndicesRef.current = new Set();
    
    setStep('config');
    setNovelIdea(null);
    setNovelStructure(null);
    setChapters([]);
    setCurrentGeneratingChapter(0);
    setWarning(null);
    setNovelTitle(null);
    setRegeneratingChapter(null);
    setGeneratingTitle(false);
    setEditingIdea(false);
    setEditingIdeaContent(null);
    setEditingStructure(false);
    setEditingStructureContent(null);
    setEditingIdeaField(null);
    setEditingIdeaFieldContent('');
    setGeneratingStructureBatches(false);
    setStructureGenerationProgress({ current: 0, total: 0 });
    setAccumulatedStructure(null);
    setAccumulatedHooks([]);
    setIsGeneratingMinimized(false);
  };

  // 取消章节生成
  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setStep('structure');
    setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' });
    setIsProgressModalMinimized(false);
    showToast('已取消章节生成', 'info');
  };

  // 复制章节内容
  const handleCopyChapter = (chapter: Chapter) => {
    const content = `第${chapter.index}章：${chapter.title}\n\n${chapter.content}`;
    navigator.clipboard.writeText(content).then(() => {
      alert('章节已复制到剪贴板');
    }).catch(() => {
      alert('复制失败，请手动复制');
    });
  };

  // 生成完整小说内容（包含主题创意和结构分析）
  const generateFullNovelContent = () => {
    const displayTitle = novelTitle || novelIdea?.theme || '小说';

    const header = `${displayTitle}
${'='.repeat(50)}

【主题创意】
主题：${novelIdea?.theme}
创意核心：${novelIdea?.concept}
主要人物：${novelIdea?.characters}
配角设定：${novelIdea?.supportingCharacters}
角色关系体系：${novelIdea?.characterRelationships}
世界观设定：${novelIdea?.setting}

【结构分析】
主要情节：${novelStructure?.mainPlot}
情感曲线：${novelStructure?.emotionalCurve}
关键冲突：${novelStructure?.keyConflicts}

【章节钩子】
${novelStructure?.chapterHooks?.map((hook, index) => `第${index + 1}章：${hook}`).join('\n')}

【小说正文】
${'='.repeat(50)}
`;

    const chaptersContent = chapters
      .map((ch) => `第${ch.index}章：${ch.title}\n\n${ch.content}`)
      .join('\n\n' + '---'.repeat(30) + '\n\n');

    return header + chaptersContent;
  };

  // 生成小说设定内容（不含正文）
  const generateNovelSettings = () => {
    const displayTitle = novelTitle || novelIdea?.theme || '小说';

    return `${displayTitle}
${'='.repeat(50)}

【主题创意】
主题：${novelIdea?.theme}
创意核心：${novelIdea?.concept}
主要人物：${novelIdea?.characters}
配角设定：${novelIdea?.supportingCharacters}
角色关系体系：${novelIdea?.characterRelationships}
世界观设定：${novelIdea?.setting}

【结构分析】
主要情节：${novelStructure?.mainPlot}
情感曲线：${novelStructure?.emotionalCurve}
关键冲突：${novelStructure?.keyConflicts}

【章节钩子】
${novelStructure?.chapterHooks?.map((hook, index) => `第${index + 1}章：${hook}`).join('\n')}
`;
  };

  // 下载所有章节的ZIP文件
  const handleDownloadChaptersZIP = async () => {
    try {
      showToast('正在打包章节...', 'info');
      
      const zip = new JSZip();
      const displayTitle = novelTitle || novelIdea?.theme || '小说';
      
      // 创建以小说名称命名的文件夹
      // 清理文件夹名称，移除不能用于文件名的特殊字符
      const safeFolderName = displayTitle.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || '小说';
      const novelFolder = zip.folder(safeFolderName);
      
      // 在小说文件夹内创建章节子文件夹
      const chaptersFolder = novelFolder?.folder('chapters');
      
      // 为每一章创建单独的TXT文件
      chapters.forEach((chapter) => {
        const chapterContent = `${displayTitle}\n${'='.repeat(50)}\n\n第${chapter.index}章：${chapter.title}\n\n${chapter.content}`;
        const safeChapterTitle = chapter.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
        const fileName = `第${String(chapter.index).padStart(2, '0')}章_${safeChapterTitle}.txt`;
        chaptersFolder?.file(fileName, chapterContent);
      });
      
      // 添加完整的小说文件到小说文件夹内
      const fullNovelContent = generateFullNovelContent();
      novelFolder?.file('完整小说.txt', fullNovelContent);
      
      // 添加README文件到小说文件夹内
      const readmeContent = `${displayTitle}\n\n【小说信息】\n- 主题：${novelIdea?.theme}\n- 章节数：${chapters.length}章\n- 总字数：${chapters.reduce((sum, ch) => sum + ch.content.length, 0).toLocaleString()}字\n- 基调风格：${config.tone.join('、')}\n\n【文件说明】\n- 完整小说.txt：包含主题创意、结构分析和所有章节的完整小说\n- chapters/：单独的章节文件，每章一个TXT文件\n\n【使用说明】\n1. 完整小说.txt 包含了小说的所有内容，适合整体阅读\n2. chapters/ 文件夹中的文件适合单独阅读某一章\n3. 所有文件均为UTF-8编码，使用任意文本编辑器即可打开\n\n生成时间：${new Date().toLocaleString('zh-CN')}\n`;
      novelFolder?.file('README.txt', readmeContent);
      
      // 生成ZIP文件
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeFolderName}_全本.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('打包下载成功！', 'success');
    } catch (error) {
      console.error('下载ZIP失败:', error);
      showToast('打包下载失败', 'error');
    }
  };

  // 开始编辑单个角色
  const handleStartEditSingleCharacter = (index: number, role: 'protagonist' | 'supporting') => {
    const text = role === 'protagonist' ? novelIdea?.characters : novelIdea?.supportingCharacters;
    if (!text) return;
    const lines = text.split('\n').filter(line => line.trim());
    const line = lines[index];
    if (!line) return;

    // 解析名字、标签、描述、外貌
    const nameMatch = line.match(/^(.+?)(?:——|—|：|:|\s[—\-])/);
    const name = nameMatch ? nameMatch[1].trim() : '';
    const rest = nameMatch ? line.slice(nameMatch[0].length).trim() : line;

    // 性格
    let personality = '';
    let gender = '';
    const tagMatch = rest.match(/^【(.+?)】/);
    if (tagMatch) {
      const rawPersonality = tagMatch[1].split(/[\/\/]/).map(t => t.trim()).filter(Boolean).join(', ');
      // 如果性格只有"男"或"女"，说明性别被错误存到了这里
      if (rawPersonality === '男' || rawPersonality === '女') {
        gender = rawPersonality;
        personality = '';
      } else {
        personality = rawPersonality;
      }
    }

    // 外貌
    const appearanceMatch = rest.match(/【外貌】([^【]*)/);
    const appearance = appearanceMatch ? appearanceMatch[1].trim() : '';

    // 解析外貌各子字段
    const parseAppearanceField = (label: string): string => {
      const regex = new RegExp(`${label}[：:]\\s*([^｜|]*)`);
      const match = appearance.match(regex);
      return match ? match[1].trim() : '';
    };

    const appearanceHairColor = parseAppearanceField('发色');
    const appearanceHairstyle = parseAppearanceField('发型');
    const appearanceEyes = parseAppearanceField('眼睛');
    const appearanceUpper = parseAppearanceField('上身');
    const appearanceLower = parseAppearanceField('下身');

    // 描述 (去除性格和外貌部分)
    const description = rest.replace(/^【.+?】\s*/, '').replace(/【外貌】[^【]*/g, '').trim();

    // 匹配数据库中的 ID
    const dbChar = dbCharacters.find(c => {
      const cleanDbName = c.name ? c.name.replace(/\s*[—–\-]+\s*【.*$/, '').replace(/\s*【.*$/, '').trim() : '';
      return cleanDbName === name;
    });

    setEditingCharacterInfo({
      index,
      role,
      id: dbChar?.id || null,
      oldName: name,
      name,
      gender,
      personality,
      description,
      appearance,
      appearanceHairColor,
      appearanceHairstyle,
      appearanceEyes,
      appearanceUpper,
      appearanceLower,
    });
  };

  // 保存编辑后的单个角色
  const handleSaveSingleCharacter = async () => {
    if (!editingCharacterInfo || !novelIdea) return;
    setSavingCharacterInfo(true);
    try {
      const { index, role, id, name, gender, personality, description, appearanceHairColor, appearanceHairstyle, appearanceEyes, appearanceUpper, appearanceLower } = editingCharacterInfo;

      // 组装外观字符串
      const appearanceParts: string[] = [];
      if (appearanceHairColor) appearanceParts.push(`发色：${appearanceHairColor}`);
      if (appearanceHairstyle) appearanceParts.push(`发型：${appearanceHairstyle}`);
      if (appearanceEyes) appearanceParts.push(`眼睛：${appearanceEyes}`);
      if (appearanceUpper) appearanceParts.push(`上身：${appearanceUpper}`);
      if (appearanceLower) appearanceParts.push(`下身：${appearanceLower}`);
      const appearance = appearanceParts.join('｜');

      // 1. 组装行文本格式
      const tagStr = personality ? `【${personality.split(/[,，]\s*/).map(t => t.trim()).filter(Boolean).join('/')}】` : '';
      const appearanceStr = appearance ? ` 【外貌】${appearance}` : '';
      const newLine = `${name}——${tagStr}${description}${appearanceStr}`;

      // 2. 更新父级小说创意状态里的 characters 或 supportingCharacters
      const field = role === 'protagonist' ? 'characters' : 'supportingCharacters';
      const text = novelIdea[field] || '';
      const lines = text.split('\n').filter(line => line.trim());
      lines[index] = newLine;
      const updatedText = lines.join('\n');

      const updatedIdea = {
        ...novelIdea,
        [field]: updatedText
      };

      if (savedNovelId) {
        const token = getToken();
        const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
        let isAdmin = false;
        if (userStr) {
          try { isAdmin = JSON.parse(userStr).role === 'admin'; } catch (e) {}
        }

        // 先更新详情表中的角色记录以防与 parent 保存的后台同步产生竞态
        if (id) {
          const detailUrl = isAdmin ? `/api/admin/novels/${savedNovelId}/details` : `/api/novels/${savedNovelId}/details`;
          await fetch(detailUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              type: 'character',
              entityId: id,
              data: {
                name,
                role: role === 'protagonist' ? 'protagonist' : 'supporting',
                gender: gender || null,
                description: description || null,
                personality: personality || null,
                appearance: appearance || null
              }
            })
          });
        }

        // 更新父级小说
        const novelData = {
          title: novelTitle || novelIdea?.theme || '未命名小说',
          description: novelIdea?.concept || '',
          category: config.genre,
          genderTarget: config.genderTarget,
          narrativePerspective: config.narrativePerspective,
          tone: config.tone,
          protagonist: config.protagonistName || '',
          supportingCharacterName: config.supportingCharacterName || '',
          totalChapters: config.chapterCount,
          currentChapters: chapters.length,
          status: chapters.length === config.chapterCount ? 'completed' : 'generating',
          idea: updatedIdea,
          structure: novelStructure,
          chapters,
        };

        const updateUrl = isAdmin ? `/api/admin/novels/${savedNovelId}` : `/api/novels/${savedNovelId}`;
        await fetch(updateUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(novelData),
        });
      }

      // 4. 更新前端状态
      setNovelIdea(updatedIdea);

      // 5. 重新获取数据库角色详情
      if (savedNovelId) {
        const token = getToken();
        const res = await fetch(`/api/novels/${savedNovelId}/details`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const result = await res.json();
        if (result.success && result.data?.characters) {
          setDbCharacters(result.data.characters);
        }
      }

      showToast('角色保存成功', 'success');
      setEditingCharacterInfo(null);
    } catch (e: unknown) {
      console.error('保存角色失败:', e);
      const err = e as Error;
      showToast(err.message || '保存角色失败', 'error');
    } finally {
      setSavingCharacterInfo(false);
    }
  };

  // 保存小说到数据库
  const handleSaveNovel = async () => {
    try {
      showToast('正在保存...', 'info');
      
      // 如果当前在 result 页面，说明生成已完成，保存为 completed 状态
      // 否则根据章节数判断状态
      const isCompleted = step === 'result' || chapters.length === config.chapterCount;
      
      await saveNovelToDatabase(isCompleted);
      
      setIsSavedForDownload(true);
      showToast(savedNovelId ? '小说已更新' : '小说已保存', 'success');
    } catch (error) {
      console.error('保存小说失败:', error);
      const message = error instanceof Error ? error.message : '保存失败，请重试';
      showToast(message, 'error');
    }
  };

  // 自动保存小说到数据库（不显示"正在保存"提示）
  const handleAutoSaveNovel = async (isCompleted?: boolean, latestChapters?: Chapter[], overrideStructure?: NovelStructure, overrideIdea?: any) => {
    try {
      await saveNovelToDatabase(isCompleted, latestChapters, overrideStructure, overrideIdea);
      console.log('小说已自动保存到数据库');
    } catch (error) {
      console.error('自动保存小说失败:', error);
      // 不显示错误提示，因为这是自动操作
    }
  };

  // 保存小说到数据库的核心逻辑
  const saveNovelToDatabase = async (isCompleted?: boolean, latestChapters?: Chapter[], overrideStructure?: NovelStructure, overrideIdea?: any) => {
    // 使用传入的最新章节数据，否则使用 state 中的数据
    const chaptersToSave = latestChapters || chapters;
    const actualChapterCount = chaptersToSave.length;
    
    // 如果明确指定了完成状态，使用指定的值；否则根据章节数判断
    const finalStatus = isCompleted !== undefined 
      ? (isCompleted ? 'completed' : 'generating')
      : (actualChapterCount === config.chapterCount ? 'completed' : 'generating');
    
    console.log(`保存小说状态: ${finalStatus}, 当前章节: ${actualChapterCount}/${config.chapterCount}`);
    
    // 准备保存的数据
    const novelData = {
      title: novelTitle || novelIdea?.theme || '未命名小说',
      description: novelIdea?.concept || '',
      category: config.genre,
      genderTarget: config.genderTarget,
      narrativePerspective: config.narrativePerspective,
      tone: config.tone,
      protagonist: config.protagonistName || '',
      supportingCharacterName: config.supportingCharacterName || '',
      totalChapters: config.chapterCount,
      currentChapters: actualChapterCount,
      status: finalStatus,
      idea: overrideIdea !== undefined ? overrideIdea : novelIdea,
      structure: overrideStructure !== undefined ? overrideStructure : novelStructure,
      chapters: chaptersToSave,
    };

    // 如果已经有保存的 ID，则更新；否则创建新小说
    const token = getToken();
    // 从 localStorage 直接读取用户角色
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    let isAdmin = false;
    if (userStr) {
      try { isAdmin = JSON.parse(userStr).role === 'admin'; } catch (e) {}
    }
    let response;
    if (savedNovelId) {
      // 管理员使用admin路由，普通用户使用普通路由
      const updateUrl = isAdmin ? `/api/admin/novels/${savedNovelId}` : `/api/novels/${savedNovelId}`;
      response = await fetch(updateUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(novelData),
      });
    } else {
      response = await fetch('/api/novels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(novelData),
      });
    }

    const result = await response.json();

    if (result.success) {
      setSavedNovelId(result.data.id);
      // 广播数据变更，通知后台管理页面刷新
      broadcastDataChange({ type: 'novel', action: savedNovelId ? 'update' : 'create', id: result.data.id });
    } else {
      // 处理存储上限错误，给出明确提示
      if (result.code === 'STORAGE_LIMIT') {
        throw new Error(result.error || '存储空间已达上限');
      }
      throw new Error(result.error || '保存失败');
    }
  };

  // 重新生成单章
  const handleRegenerateChapter = async (chapterIndex: number) => {
    if (!novelIdea || !novelStructure || !chapters.length) return;

    setRegeneratingChapter(chapterIndex);
    setStreamText('');
    setProgressModal({
      visible: true,
      stage: 'chapters',
      current: 0,
      total: 100,
      message: `正在重新生成第 ${chapterIndex} 章...`
    });
    setIsProgressModalMinimized(false);

    // 先清空当前章节的内容
    setChapters(prev =>
      prev.map(ch =>
        ch.index === chapterIndex
          ? { ...ch, content: '' }
          : ch
      )
    );

    // 获取上一章内容（取末尾500字用于连贯性参考）
    const prevChapter = chapters.find(ch => ch.index === chapterIndex - 1);
    const previousChapterContent = prevChapter?.content || '';

    // 获取下一章钩子
    const nextChapterHook = novelStructure.chapterHooks[chapterIndex] || '';

    try {
      const response = await fetch('/api/novel/chapters/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea: novelIdea,
          structure: novelStructure,
          tone: config.tone,
          genderTarget: config.genderTarget,
          narrativePerspective: config.narrativePerspective,
          chapterIndex,
          configId: selectedConfigId,
          previousChapterContent,
          nextChapterHook,
          allChapterHooks: novelStructure.chapterHooks,
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);

              if (event.type === 'chapter_start') {
                setChapters(prev =>
                  prev.map(ch =>
                    ch.index === chapterIndex
                      ? { ...ch, title: event.title || ch.title }
                      : ch
                  )
                );
                setStreamText(`--- 第 ${chapterIndex} 章：${event.title || ''} ---
`);
              } else if (event.type === 'content') {
                setChapters(prev =>
                  prev.map(ch =>
                    ch.index === chapterIndex
                      ? { ...ch, content: ch.content + event.content }
                      : ch
                  )
                );
                setStreamText(prev => prev + event.content);
                setRealTimeProgress(prev => Math.min(prev + 1, 98));
              } else if (event.type === 'complete') {
                setRealTimeProgress(100);
                setTimeout(() => {
                  setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' });
                  setStreamText('');
                  setRegeneratingChapter(null);
                }, 800);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error regenerating chapter:', error);
      alert('重新生成章节失败');
      setRegeneratingChapter(null);
      setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' });
      setStreamText('');
    }
  };

  // 生成小说标题
  const handleGenerateTitle = async () => {
    if (!novelIdea || !novelStructure || !chapters.length) {
      alert('小说信息不完整，无法生成标题');
      return;
    }

    setGeneratingTitle(true);
    setTitleCandidates(null);
    setStreamText('');
    setProgressModal({ visible: true, stage: 'idea', current: 0, total: 2, message: 'AI 正在为小说生成标题...' });
    setIsProgressModalMinimized(false);

    try {
      setStreamText('> [TITLE_GEN] 正在分析小说内容生成标题...\n');
      setProgressModal(p => ({ ...p, current: 1, message: '正在调用AI引擎...' }));

      const response = await fetch('/api/novel/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea: novelIdea,
          structure: novelStructure,
          chapters: chapters,
          tone: config.tone,
          configId: selectedConfigId,
        }),
      });

      const data = await response.json();
      const wrap = (s: string) => {
        const t = s.trim().replace(/^《|》$/g, '');
        return t ? `《${t}》` : '';
      };
      const core: string[] = Array.isArray(data.coreRecommendations) ? data.coreRecommendations : [];
      const alt: string[] = Array.isArray(data.alternativeRecommendations) ? data.alternativeRecommendations : [];
      const finalRec: string = data.finalRecommendation || data.title || '';
      const all = Array.from(new Set([finalRec, ...core, ...alt].map(wrap).filter(Boolean)));
      if (all.length > 0) {
        setTitleCandidates(all);
        const recommended = finalRec ? wrap(finalRec) : all[0];
        setTitleRecommended(recommended);
        setNovelTitle(recommended.replace(/^《|》$/g, ''));
        setProgressModal(p => ({ ...p, current: 2, message: '标题生成完成！' }));
        setStreamText(prev => prev + '> [TITLE_GEN] AI响应成功\n\n');
        for (const t of all) {
          setStreamText(prev => prev + `  📕 ${t}\n`);
        }
        setStreamText(prev => prev + `\n> [RECOMMEND] 推荐标题：${recommended}\n`);
        setStreamText(prev => prev + '> [COMPLETE] 标题生成完成 ✓\n');
        setTimeout(() => { setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' }); setStreamText(''); }, 1500);
      } else {
        setStreamText(prev => prev + '> [ERROR] 生成标题失败\n');
        alert(data.error || '生成标题失败');
        setTimeout(() => { setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' }); setStreamText(''); }, 2000);
      }
    } catch (error) {
      console.error('Error generating title:', error);
      setStreamText(prev => prev + '> [ERROR] 生成标题失败\n');
      alert('生成标题失败');
      setTimeout(() => { setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' }); setStreamText(''); }, 2000);
    } finally {
      setGeneratingTitle(false);
    }
  };

  // 未登录时显示加载中（实际会跳转）
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">正在验证登录状态...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes progressSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .progress-spinner {
            animation: progressSpin 1s linear infinite;
          }
        `
      }} />
      {/* ===== 深色宇宙背景 ===== */}
      <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #0d1b2a 100%)' }}>
      {/* 背景光晕装饰 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-0 w-64 h-64 bg-violet-600/6 rounded-full blur-3xl" />
      </div>

      {/* ===== 顶部导航栏 ===== */}
      <header className="relative z-20 border-b border-white/5 backdrop-blur-xl sticky top-0" style={{ background: 'rgba(15,12,41,0.85)' }}>
        {/* 第一行：导航 */}
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/my-novels" className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/15 border border-purple-500/25 text-purple-400 rounded-lg hover:bg-purple-500/25 transition-colors text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              我的小说
            </Link>
            <Link href="/scripts" className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 border border-amber-500/25 text-amber-400 rounded-lg hover:bg-amber-500/25 transition-colors text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
              我的剧本
            </Link>
            <Link href="/short-dramas" className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/15 border border-violet-500/25 text-violet-400 rounded-lg hover:bg-violet-500/25 transition-colors text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              短剧制作
            </Link>
            {isLoggedIn && memberLevelName && (
              <span className="text-xs px-2.5 py-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/25 rounded-lg text-amber-300 font-medium">
                {memberLevelName}
              </span>
            )}
            {isLoggedIn && userInfo?.role === 'admin' && (
              <Link href="/admin/members" className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 border border-red-500/25 text-red-400 rounded-lg hover:bg-red-500/25 transition-colors text-xs font-medium">
                管理后台
              </Link>
            )}
          </div>
          <div className="flex items-center gap-1 px-4 py-2 rounded-xl border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-white font-bold text-sm">创世纪联盟</span>
          </div>
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <>
                <Link href="/member" className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 transition-colors text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  会员中心
                </Link>
                <button onClick={() => setShowAiConfigModal(true)} className="flex items-center gap-1.5 text-gray-400 hover:text-purple-400 transition-colors text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  API设置
                </button>
                <button onClick={() => { localStorage.removeItem('accessToken'); localStorage.removeItem('token'); localStorage.removeItem('refreshToken'); localStorage.removeItem('user'); localStorage.removeItem('auth-storage'); window.location.href = '/'; }} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 border border-red-500/25 text-red-400 rounded-lg hover:bg-red-500/25 transition-colors text-xs font-medium">
                  退出
                </button>
              </>
            ) : (
              <Link href="/auth/login" className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors text-xs font-medium">
                登录
              </Link>
            )}
          </div>
        </div>
        {/* 第二行：步骤指示器 */}
        <div className="border-t border-white/5" style={{ background: 'rgba(15,12,41,0.5)' }}>
          <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-center gap-2 md:gap-4">
            {[
              { key: 'config', label: '配置', icon: '⚙️', activeColor: 'from-blue-500 to-indigo-500' },
              { key: 'idea', label: '创意', icon: '💡', activeColor: 'from-amber-500 to-orange-500' },
              { key: 'structure', label: '结构', icon: '📊', activeColor: 'from-emerald-500 to-teal-500' },
              { key: 'result', label: '完成', icon: '✨', activeColor: 'from-pink-500 to-rose-500' },
            ].map((s, idx) => (
              <div key={s.key} className="flex items-center">
                <div className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all duration-300 ${
                  step === s.key
                    ? `bg-gradient-to-r ${s.activeColor} text-white shadow-lg`
                    : step === 'generating' && s.key === 'result'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg animate-pulse'
                    : 'text-gray-500 hover:text-gray-300'
                }`}>
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                </div>
                {idx < 3 && <div className="w-6 md:w-10 h-px bg-white/10 mx-1" />}
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ===== 主内容区 ===== */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 py-8">

        {/* 配置步骤 */}
        {step === 'config' && (
          <div className="backdrop-blur-xl rounded-2xl p-6 md:p-10 border border-white/8 shadow-2xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {/* 性别方向 */}
            <div className="mb-6 md:mb-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-3 md:mb-5">
                <label className="text-base md:text-lg font-bold text-white flex items-center gap-2 md:gap-3">
                  <span className="text-xl md:text-2xl">🎯</span>
                  性别方向
                </label>
                <span className={`text-xs md:text-sm font-bold px-3 md:px-4 py-1.5 md:py-2 rounded-full w-fit ${
                  config.genderTarget === 'male' 
                    ? 'text-blue-400 bg-blue-500/10 border-2 border-blue-500/30'
                    : 'text-pink-400 bg-pink-500/10 border-2 border-pink-500/30'
                }`}>
                  {config.genderTarget === 'male' ? '👨 男频' : '👩 女频'}
                </span>
              </div>
              <p className="text-xs md:text-sm text-gray-400 mb-3 md:mb-4 ml-1">
                选择目标读者群体，AI 将根据性别偏好调整创作方向和叙事风格
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {GENDER_TARGET_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setConfig({ ...config, genderTarget: option.value as 'male' | 'female' })}
                    className={`p-3 md:p-3.5 rounded-lg md:rounded-xl border-2 transition-all duration-300 font-bold text-xs md:text-sm transform hover:scale-105 ${
                      config.genderTarget === option.value
                        ? option.value === 'male'
                          ? 'border-blue-600 bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg scale-105'
                          : 'border-pink-600 bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-lg scale-105'
                        : 'border-white/10 hover:border-blue-400 hover:bg-blue-500/10 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1 md:mb-1.5">
                      <span className="text-base md:text-xl">{option.value === 'male' ? '👨' : '👩'}</span>
                      <span className="text-sm">{option.label}</span>
                    </div>
                    <div className="text-xs font-normal opacity-80 text-left">
                      {option.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 叙事视角 */}
            <div className="mb-6 md:mb-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-3 md:mb-4">
                <label className="text-base md:text-lg font-bold text-white flex items-center gap-2 md:gap-3">
                  <span className="text-xl md:text-2xl">🎬</span>
                  叙事视角
                </label>
                <span className={`text-xs md:text-sm font-bold px-3 md:px-4 py-1.5 md:py-2 rounded-full border ${
                  config.narrativePerspective === 'first-person'
                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                    : config.narrativePerspective === 'third-limited'
                    ? 'text-violet-400 bg-violet-500/10 border-violet-500/30'
                    : config.narrativePerspective === 'third-omniscient'
                    ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
                    : 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                }`}>
                  {NARRATIVE_PERSPECTIVE_OPTIONS.find(o => o.value === config.narrativePerspective)?.icon} {NARRATIVE_PERSPECTIVE_OPTIONS.find(o => o.value === config.narrativePerspective)?.label}
                </span>
              </div>
              <p className="text-xs md:text-sm text-gray-400 mb-3 md:mb-4 ml-1">
                选择叙事视角，决定读者以何种角度进入故事
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                {NARRATIVE_PERSPECTIVE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setConfig({ ...config, narrativePerspective: option.value as 'first-person' | 'third-limited' | 'third-omniscient' | 'second-person' })}
                    className={`p-3 md:p-3.5 rounded-lg md:rounded-xl border-2 transition-all duration-300 text-left transform hover:scale-105 ${
                      config.narrativePerspective === option.value
                        ? option.value === 'first-person'
                          ? 'border-amber-500 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg scale-105'
                          : option.value === 'third-limited'
                          ? 'border-violet-500 bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg scale-105'
                          : option.value === 'third-omniscient'
                          ? 'border-cyan-500 bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-lg scale-105'
                          : 'border-rose-500 bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg scale-105'
                        : 'border-white/10 hover:border-violet-400 hover:bg-white/8 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1 md:mb-1.5">
                      <span className="text-base md:text-xl">{option.icon}</span>
                      <span className="text-sm font-bold">{option.label}</span>
                    </div>
                    <div className="text-xs font-normal opacity-80 mb-1">
                      {option.description}
                    </div>
                    <div className={`text-xs font-mono italic ${config.narrativePerspective === option.value ? 'text-white/70' : 'text-gray-400'}`}>
                      "{option.example}"
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 小说类型 */}
            <div className="mb-6 md:mb-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-4 md:mb-5">
                <label className="text-base md:text-lg font-bold text-white flex items-center gap-2 md:gap-3">
                  <span className="text-xl md:text-2xl">📚</span>
                  小说类型
                </label>
                {config.genre && (
                  <span className="text-xs md:text-sm font-bold text-blue-400 bg-blue-500/15 border border-blue-500/30 px-3 md:px-4 py-1.5 md:py-2 rounded-full">
                    ✓ 已选择
                  </span>
                )}
              </div>

              {/* 分类选择 */}
              {!config.genre && (
                <div className="flex flex-wrap gap-2 md:gap-3 mb-4 md:mb-6 justify-center">
                  {GENRE_CATEGORIES.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`px-3 md:px-4 py-2 md:py-3 rounded-lg md:rounded-xl border-2 transition-all duration-300 font-bold text-xs md:text-sm transform hover:scale-105 ${
                        selectedCategory === category.id
                          ? `border-transparent bg-gradient-to-br ${category.color} text-white shadow-lg scale-105`
                          : 'border-white/10 hover:border-gray-400 hover:bg-white/8 text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-1 md:gap-1.5">
                        <span className="text-base md:text-xl">{category.icon}</span>
                        <span className="text-xs md:text-sm">{category.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* 具体类型选择 */}
              {selectedCategory && !config.genre && (
                <div className="mb-3 md:mb-4">
                  <p className="text-xs md:text-sm text-gray-400 mb-3 md:mb-4 ml-1">
                    请选择 {GENRE_CATEGORIES.find(c => c.id === selectedCategory)?.name} 的具体类型
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-2.5">
                    {GENRE_CATEGORIES.find(c => c.id === selectedCategory)?.genres.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setConfig({ ...config, genre: option.value });
                          setSelectedCategory(null);
                        }}
                        className={`px-2.5 md:px-3 py-2 rounded-lg md:rounded-xl border-2 transition-all duration-300 font-bold text-xs md:text-sm transform hover:scale-105 ${
                          config.genre === option.value
                            ? 'border-blue-600 bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg scale-105'
                            : 'border-white/10 hover:border-blue-400 hover:bg-blue-500/10 text-gray-300'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="mt-3 md:mt-4 text-xs md:text-sm text-gray-400 hover:text-gray-300 flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    返回分类选择
                  </button>
                </div>
              )}

              {/* 已选类型显示 */}
              {config.genre && (
                <div>
                  <div className="inline-flex items-center gap-2 md:gap-2.5 px-3 md:px-4 py-2 md:py-2.5 bg-blue-500/15 rounded-lg md:rounded-xl border border-blue-500/30">
                    <span className="text-lg md:text-xl">✓</span>
                    <span className="font-bold text-xs md:text-sm text-white">
                      {GENRE_OPTIONS.find(g => g.value === config.genre)?.label}
                    </span>
                    <button
                      onClick={() => {
                        setConfig({ ...config, genre: '' });
                        setSelectedCategory(null);
                      }}
                      className="ml-1 p-0.5 md:p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="mt-4 text-sm text-blue-400 hover:text-blue-300 font-medium"
                  >
                    重新选择类型
                  </button>
                </div>
              )}
            </div>

            {/* 基调风格 */}
            <div className="mb-6 md:mb-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-4 md:mb-5">
                <label className="text-base md:text-lg font-bold text-white flex items-center gap-2 md:gap-3">
                  <span className="text-xl md:text-2xl">🎨</span>
                  基调风格
                  <span className="text-xs md:text-sm font-normal text-gray-400 ml-1 md:ml-2">(可多选)</span>
                </label>
                {config.tone.length > 0 && (
                  <span className="text-[10px] md:text-xs font-bold text-blue-400 bg-blue-500/15 border border-blue-500/30 px-2.5 md:px-3 py-1 md:py-1.5 rounded-full">
                    ✓ 已选择 {config.tone.length} 项
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
                {TONE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      const isSelected = config.tone.includes(option.value);
                      const newTone = isSelected
                        ? config.tone.filter(t => t !== option.value)
                        : [...config.tone, option.value];
                      setConfig({ ...config, tone: newTone });
                    }}
                    className={`px-3 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl border-2 transition-all duration-300 font-bold text-xs md:text-sm transform hover:scale-105 ${
                      config.tone.includes(option.value)
                        ? 'border-blue-600 bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg scale-105'
                        : 'border-white/10 hover:border-blue-400 hover:bg-blue-500/10 text-gray-300'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {/* 自定义基调风格 */}
              <div className="mt-4 md:mt-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold text-gray-300">✏️ 自定义风格</span>
                  <span className="text-xs text-gray-400">输入后按回车添加</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="如：赛博朋克、古风仙侠、末世废土..."
                    className="flex-1 px-4 py-2.5 border-2 border-dashed border-white/15 rounded-xl focus:outline-none focus:border-blue-500 bg-white/5 text-white transition-all duration-300 text-sm placeholder:text-gray-400 placeholder:text-gray-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const value = (e.target as HTMLInputElement).value.trim();
                        if (value && !config.tone.includes(value)) {
                          setConfig({ ...config, tone: [...config.tone, value] });
                          (e.target as HTMLInputElement).value = '';
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                      const value = input.value.trim();
                      if (value && !config.tone.includes(value)) {
                        setConfig({ ...config, tone: [...config.tone, value] });
                        input.value = '';
                      }
                    }}
                    className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl text-sm font-bold hover:from-blue-600 hover:to-indigo-700 transition-all duration-300 shadow-md hover:shadow-lg whitespace-nowrap"
                  >
                    + 添加
                  </button>
                </div>
                {/* 已添加的自定义风格标签 */}
                {config.tone.filter(t => !TONE_OPTIONS.some(o => o.value === t)).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {config.tone.filter(t => !TONE_OPTIONS.some(o => o.value === t)).map((customTone) => (
                      <span
                        key={customTone}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full text-xs font-bold shadow-md"
                      >
                        {customTone}
                        <button
                          type="button"
                          onClick={() => {
                            setConfig({ ...config, tone: config.tone.filter(t => t !== customTone) });
                          }}
                          className="hover:bg-white/30 rounded-full p-0.5 transition-colors duration-200"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 主角名称（可选）和 主题创意（可选） */}
            <div className="mb-10 flex flex-col md:flex-row gap-4 md:gap-6">
              {/* 主角名称 */}
              <div className="w-full md:w-1/3">
                <label className="block text-lg font-bold text-white flex items-center gap-3 mb-5">
                  <span className="text-2xl">👤</span>
                  主角名称
                  <span className="text-sm font-normal text-gray-400 ml-2">（可选）</span>
                </label>
                <div className="relative group">
                  <textarea
                    ref={protagonistNameRef}
                    value={config.protagonistName}
                    onChange={(e) => {
                      setConfig({ ...config, protagonistName: e.target.value });
                      autoResizeTextarea(protagonistNameRef);
                    }}
                    placeholder="留空则由 AI 自动生成，多个主角用逗号分隔"
                    rows={1}
                    className="w-full px-6 py-5 border-2 border-white/10 rounded-2xl focus:outline-none focus:border-blue-500 bg-white/5 text-white transition-all duration-300 text-base resize-none min-h-[60px] group-hover:border-blue-500 shadow-sm"
                  />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-blue-500 transition-colors duration-300">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                </div>
                <p className="text-sm text-gray-400 mt-3 ml-1">
                  💡 可填写多个主角（如双主角），AI 会自动安排其人设与关系
                </p>

                {/* 配角名称 */}
                <div className="mt-5">
                  <label className="block text-base font-bold text-white flex items-center gap-2 mb-3">
                    <span className="text-xl">🎭</span>
                    配角名称
                    <span className="text-sm font-normal text-gray-400 ml-2">（可选）</span>
                  </label>
                  <div className="relative group">
                    <textarea
                      value={config.supportingCharacterName}
                      onChange={(e) => setConfig({ ...config, supportingCharacterName: e.target.value })}
                      placeholder="留空则由 AI 自动生成，多个配角用逗号分隔"
                      rows={1}
                      className="w-full px-5 py-4 border-2 border-white/10 rounded-xl focus:outline-none focus:border-blue-500 bg-white/5 text-white transition-all duration-300 text-sm resize-none min-h-[48px] group-hover:border-blue-500 shadow-sm"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-blue-500 transition-colors duration-300">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 ml-1">
                    💡 可填写多个配角，AI 会自动安排角色关系
                  </p>
                </div>
              </div>

              {/* 主题创意 */}
              <div className="w-full md:w-2/3">
                <label className="block text-lg font-bold text-white flex items-center gap-3 mb-5">
                  <span className="text-2xl">✨</span>
                  主题创意
                  <span className="text-sm font-normal text-gray-400 ml-2">（可选）</span>
                </label>
                <div className="relative group">
                  <textarea
                    ref={themeIdeaRef}
                    value={config.themeIdea}
                    onChange={(e) => {
                      setConfig({ ...config, themeIdea: e.target.value });
                      autoResizeTextarea(themeIdeaRef);
                    }}
                    placeholder="例如：一个拥有时间控制能力的少女，在末日世界中寻找拯救人类的方法..."
                    rows={4}
                    className="w-full px-6 py-5 border-2 border-white/10 rounded-2xl focus:outline-none focus:border-blue-500 bg-white/5 text-white transition-all duration-300 text-base resize-none min-h-[120px] group-hover:border-blue-500 shadow-sm"
                  />
                  <div className="absolute right-4 bottom-4 text-gray-400 group-hover:text-blue-500 transition-colors duration-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                </div>
                <p className="text-sm text-gray-400 mt-3 ml-1">
                  💡 填写此项可以提供创作方向，AI 将在此基础上进行扩展
                </p>
                <button
                  onClick={handleGenerateIdeaOptions}
                  disabled={loadingIdeaOptions || !config.genre || config.tone.length === 0 || (chapterLimit > 0 && config.chapterCount > remainingChapters)}
                  className="mt-3 w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold rounded-xl transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  {loadingIdeaOptions ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      生成中...
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      生成主题创意选项
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 章节数量 */}
            <div className="mb-6 md:mb-10">
              <label className="block text-base md:text-lg font-bold text-white flex items-center gap-2 md:gap-3 mb-4 md:mb-5">
                <span className="text-xl md:text-2xl">📖</span>
                章节数量
                {chapterLimit > 0 && (
                  <span className="text-sm font-normal text-blue-400 bg-blue-500/15 border border-blue-500/30 px-2 py-1 rounded">
                    当前会员最多可生成 {chapterLimit} 章
                    {totalChaptersUsed > 0 && (
                      <span className="ml-1">
                        · 已用 <strong>{totalChaptersUsed}</strong> 章，剩余 <strong className="text-green-400">{remainingChapters}</strong> 章
                      </span>
                    )}
                  </span>
                )}
              </label>
              <div className="rounded-lg md:rounded-xl p-4 md:p-5 border border-white/10" style={{ background: 'rgba(59,130,246,0.08)' }}>
                <div className="flex items-center justify-center mb-3 md:mb-4">
                  <span className="text-3xl md:text-4xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    {config.chapterCount}
                  </span>
                  <span className="text-lg md:text-xl text-gray-400 ml-2 font-bold">章</span>
                </div>
                
                {/* 数字输入框 */}
                <div className="mb-3 md:mb-4">
                  <div className="flex items-center justify-center gap-2 md:gap-3">
                    <input
                      type="number"
                      min="1"
                      value={config.chapterCount}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (!isNaN(value) && value >= 1) {
                          setConfig({ ...config, chapterCount: value });
                        }
                      }}
                      className="w-24 px-3 py-2 text-center text-lg font-bold bg-white/5 border-2 border-blue-500/30 rounded-lg focus:outline-none focus:border-blue-500 text-white transition-all duration-200"
                      placeholder="章节数"
                    />
                    <span className="text-xs text-gray-400">
                      或使用滑块调整
                    </span>
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="range"
                    min="1"
                    max="200"
                    value={Math.min(config.chapterCount, 200)}
                    onChange={(e) => setConfig({ ...config, chapterCount: parseInt(e.target.value) })}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer bg-white/10 transition-all duration-300"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #6366f1 ${((Math.min(config.chapterCount, 200) - 1) / 199) * 100}%, #e5e7eb ${((Math.min(config.chapterCount, 200) - 1) / 199) * 100}%, #e5e7eb 100%)`,
                    }}
                  />
                  <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full shadow-lg transform transition-all duration-200 pointer-events-none" style={{ left: `calc(${((Math.min(config.chapterCount, 200) - 1) / 199) * 100}% - 10px)` }} />
                </div>
                <div className="flex justify-between mt-4 text-xs text-gray-400 font-medium">
                  <span>1章</span>
                  <span className="text-blue-500">直接输入框可写任意章数</span>
                  <span>200章</span>
                </div>
                {chapterLimit > 0 && config.chapterCount > remainingChapters && (
                  <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-sm text-red-400 font-medium flex items-center gap-2">
                      <span>⚠️</span>
                      <span>您的会员等级剩余可生成 {remainingChapters} 章，当前设置 {config.chapterCount} 章已超限</span>
                    </p>
                    <p className="text-xs text-red-400 mt-1 ml-6">
                      请减少章节数量，或<Link href="/member" className="underline font-medium hover:text-red-700">升级会员</Link>获取更多章节额度
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* API配置选择 */}
            <div className="mb-6 md:mb-8 bg-slate-900/40 border border-white/[0.04] rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <style>{`
                @keyframes rainbow-flow {
                  0% { background-position: 0% 50%; }
                  50% { background-position: 100% 50%; }
                  100% { background-position: 0% 50%; }
                }
                .animate-rainbow {
                  background-image: linear-gradient(to right, #ff2e93, #ff8a00, #ff0055, #00f0ff, #7000ff, #ff00c8, #ff2e93);
                  background-size: 200% auto;
                  background-clip: text;
                  -webkit-background-clip: text;
                  color: transparent;
                  -webkit-text-fill-color: transparent;
                  animation: rainbow-flow 4s linear infinite;
                }
              `}</style>
              <div className="flex items-center gap-4 text-xs sm:text-sm">
                <span className="font-medium flex items-center gap-1.5 select-none">
                  <span className="animate-rainbow font-black text-sm flex items-center gap-1">🤖 AI 核心模型：</span>
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedConfigId || ''}
                    onChange={(e) => setSelectedConfigId(e.target.value || null)}
                    className="bg-slate-950/60 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-blue-400 font-bold focus:outline-none focus:border-blue-500/50 cursor-pointer"
                  >
                    <option value="" className="bg-[#111827] text-slate-100 font-normal">默认内置模型</option>
                    {availableConfigs.map(cfg => (
                      <option key={cfg.id} value={cfg.id} className="bg-[#111827] text-slate-100 font-normal">
                        {cfg.name} ({cfg.provider} · {cfg.model})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowAiConfigModal(true)}
                    className="p-1.5 text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5"
                    title="管理API配置"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerateIdea}
              disabled={!config.genre || config.tone.length === 0 || loading || (chapterLimit > 0 && config.chapterCount > remainingChapters)}
              className="w-full py-3.5 md:py-4 px-6 bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-700 hover:via-purple-700 hover:to-indigo-700 text-white font-bold text-base md:text-lg rounded-xl md:rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>正在生成...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>生成主题创意</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* 主题创意步骤 */}
        {step === 'idea' && novelIdea && (
          <div className="space-y-4 md:space-y-6">
            <div className="backdrop-blur-xl rounded-2xl p-5 md:p-8 lg:p-10 border border-white/8 shadow-2xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-5 md:mb-8">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl md:rounded-2xl flex-shrink-0">
                    <span className="text-white text-xl md:text-2xl">💡</span>
                  </div>
                  <div>
                    <h2 className="text-lg md:text-2xl font-bold text-white">
                      主题创意
                    </h2>
                    <p className="text-xs md:text-sm text-gray-400">
                      您的小说核心创意与世界观
                    </p>
                  </div>
                </div>
                {!editingIdea && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleStartEditIdea}
                      className="px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 rounded-lg md:rounded-xl transition-all duration-200 flex items-center gap-1.5 md:gap-2"
                    >
                      <svg
                        className="w-3.5 h-3.5 md:w-4 md:h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                      编辑
                    </button>
                    <button
                      onClick={handleRegenerateIdea}
                      disabled={progressModal.visible && progressModal.stage === 'idea'}
                      className="px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded-lg md:rounded-xl transition-all duration-200 flex items-center gap-1.5 md:gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {progressModal.visible && progressModal.stage === 'idea' ? (
                        <>
                          <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                          生成中...
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                          重新生成
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {editingIdea && editingIdeaContent ? (
                <div className="space-y-6">
                  <div>
                    <label className="block text-base font-semibold text-white flex items-center gap-2 mb-4">
                      <span className="text-lg">🎯</span>
                      主题 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={editingIdeaContent.theme}
                      onChange={(e) => setEditingIdeaContent({ ...editingIdeaContent, theme: e.target.value })}
                      rows={2}
                      className="w-full px-5 py-4 border-2 border-violet-500/30 rounded-2xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                      placeholder="请输入小说主题"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-white flex items-center gap-2 mb-4">
                      <span className="text-lg">💎</span>
                      创意核心 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={editingIdeaContent.concept}
                      onChange={(e) => setEditingIdeaContent({ ...editingIdeaContent, concept: e.target.value })}
                      rows={4}
                      className="w-full px-5 py-4 border-2 border-violet-500/30 rounded-2xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                      placeholder="请输入创意核心"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-white flex items-center gap-2 mb-4">
                      <span className="text-lg">👥</span>
                      主要人物
                    </label>
                    <textarea
                      value={editingIdeaContent.characters}
                      onChange={(e) => setEditingIdeaContent({ ...editingIdeaContent, characters: e.target.value })}
                      rows={3}
                      className="w-full px-5 py-4 border-2 border-violet-500/30 rounded-2xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                      placeholder="请输入主要人物设定"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-white flex items-center gap-2 mb-4">
                      <span className="text-lg">🎭</span>
                      配角设定
                    </label>
                    <textarea
                      value={editingIdeaContent.supportingCharacters}
                      onChange={(e) => setEditingIdeaContent({ ...editingIdeaContent, supportingCharacters: e.target.value })}
                      rows={3}
                      className="w-full px-5 py-4 border-2 border-violet-500/30 rounded-2xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                      placeholder="请输入配角设定"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-white flex items-center gap-2 mb-4">
                      <span className="text-lg">🔗</span>
                      角色关系体系
                    </label>
                    <textarea
                      value={editingIdeaContent.characterRelationships}
                      onChange={(e) => setEditingIdeaContent({ ...editingIdeaContent, characterRelationships: e.target.value })}
                      rows={3}
                      className="w-full px-5 py-4 border-2 border-violet-500/30 rounded-2xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                      placeholder="请输入角色关系体系"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-white flex items-center gap-2 mb-4">
                      <span className="text-lg">🌍</span>
                      世界观设定
                    </label>
                    <textarea
                      value={editingIdeaContent.setting}
                      onChange={(e) => setEditingIdeaContent({ ...editingIdeaContent, setting: e.target.value })}
                      rows={3}
                      className="w-full px-5 py-4 border-2 border-violet-500/30 rounded-2xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                      placeholder="请输入世界观设定"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={handleCancelEditIdea}
                      className="flex-1 py-4 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-2xl transition-all duration-200"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveIdea}
                      className="flex-1 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg"
                    >
                      保存修改
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="bg-violet-500/8 border border-violet-500/20 rounded-2xl p-6">
                    {editingIdeaField === 'theme' ? (
                      <div className="space-y-3">
                        <label className="block text-base font-semibold text-white flex items-center gap-2">
                          <span className="text-xl">🎯</span>
                          主题 <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={editingIdeaFieldContent}
                          onChange={(e) => setEditingIdeaFieldContent(e.target.value)}
                          rows={3}
                          className="w-full px-5 py-4 border-2 border-violet-500/30 rounded-2xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                          placeholder="请输入主题"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelEditIdeaField}
                            className="flex-1 py-3 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleSaveIdeaField}
                            className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="text-xl">🎯</span>
                            主题
                          </h3>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleCollapse('theme')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="展开/折叠"
                            >
                              {collapsedSections.has('theme') ? '展开' : '折叠'}
                            </button>
                            <button
                              onClick={() => handleStartEditIdeaField('theme')}
                              className="px-3 py-1.5 text-sm bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="编辑"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleCopyToClipboard(novelIdea.theme, '主题')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="复制"
                            >
                              复制
                            </button>
                          </div>
                        </div>
                        <p className={`text-gray-200 text-base leading-7 whitespace-pre-wrap ${collapsedSections.has('theme') ? 'line-clamp-3' : ''}`}>{novelIdea.theme}</p>
                      </>
                    )}
                  </div>

                  <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-6">
                    {editingIdeaField === 'concept' ? (
                      <div className="space-y-3">
                        <label className="block text-base font-semibold text-white flex items-center gap-2">
                          <span className="text-xl">💎</span>
                          创意核心 <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={editingIdeaFieldContent}
                          onChange={(e) => setEditingIdeaFieldContent(e.target.value)}
                          rows={4}
                          className="w-full px-5 py-4 border-2 border-amber-500/30 rounded-2xl focus:outline-none focus:border-amber-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                          placeholder="请输入创意核心"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelEditIdeaField}
                            className="flex-1 py-3 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleSaveIdeaField}
                            className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="text-xl">💎</span>
                            创意核心
                          </h3>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleCollapse('concept')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="展开/折叠"
                            >
                              {collapsedSections.has('concept') ? '展开' : '折叠'}
                            </button>
                            <button
                              onClick={() => handleStartEditIdeaField('concept')}
                              className="px-3 py-1.5 text-sm bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="编辑"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleCopyToClipboard(novelIdea.concept, '创意核心')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="复制"
                            >
                              复制
                            </button>
                          </div>
                        </div>
                        <p className={`text-gray-200 text-base leading-7 whitespace-pre-wrap ${collapsedSections.has('concept') ? 'line-clamp-3' : ''}`}>{novelIdea.concept}</p>
                      </>
                    )}
                  </div>

                  <div className="bg-blue-500/8 border border-blue-500/20 rounded-2xl p-6">
                    {editingIdeaField === 'characters' ? (
                      <div className="space-y-3">
                        <label className="block text-base font-semibold text-white flex items-center gap-2">
                          <span className="text-xl">👥</span>
                          主要人物
                        </label>
                        <textarea
                          value={editingIdeaFieldContent}
                          onChange={(e) => setEditingIdeaFieldContent(e.target.value)}
                          rows={4}
                          className="w-full px-5 py-4 border-2 border-blue-500/30 rounded-2xl focus:outline-none focus:border-blue-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                          placeholder="请输入主要人物设定"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelEditIdeaField}
                            className="flex-1 py-3 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleSaveIdeaField}
                            className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="text-xl">👥</span>
                            主要人物
                          </h3>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleCollapse('characters')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="展开/折叠"
                            >
                              {collapsedSections.has('characters') ? '展开' : '折叠'}
                            </button>
                            <button
                              onClick={() => handleStartEditIdeaField('characters')}
                              className="px-3 py-1.5 text-sm bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="编辑"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleCopyToClipboard(novelIdea.characters, '主要人物')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="复制"
                            >
                              复制
                            </button>
                          </div>
                        </div>
                        <CharacterList 
                          text={novelIdea.characters} 
                          collapsed={collapsedSections.has('characters')} 
                          onEditCharacter={(idx) => handleStartEditSingleCharacter(idx, 'protagonist')}
                        />
                      </>
                    )}
                  </div>

                  <div className="bg-pink-500/8 border border-pink-500/20 rounded-2xl p-6">
                    {editingIdeaField === 'supportingCharacters' ? (
                      <div className="space-y-3">
                        <label className="block text-base font-semibold text-white flex items-center gap-2">
                          <span className="text-xl">🎭</span>
                          配角设定
                        </label>
                        <textarea
                          value={editingIdeaFieldContent}
                          onChange={(e) => setEditingIdeaFieldContent(e.target.value)}
                          rows={4}
                          className="w-full px-5 py-4 border-2 border-pink-500/30 rounded-2xl focus:outline-none focus:border-pink-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                          placeholder="请输入配角设定"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelEditIdeaField}
                            className="flex-1 py-3 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleSaveIdeaField}
                            className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="text-xl">🎭</span>
                            配角设定
                          </h3>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleCollapse('supportingCharacters')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="展开/折叠"
                            >
                              {collapsedSections.has('supportingCharacters') ? '展开' : '折叠'}
                            </button>
                            <button
                              onClick={() => handleStartEditIdeaField('supportingCharacters')}
                              className="px-3 py-1.5 text-sm bg-pink-500/15 hover:bg-pink-500/25 text-pink-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="编辑"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleCopyToClipboard(novelIdea.supportingCharacters, '配角设定')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="复制"
                            >
                              复制
                            </button>
                          </div>
                        </div>
                        <CharacterList 
                          text={novelIdea.supportingCharacters} 
                          collapsed={collapsedSections.has('supportingCharacters')} 
                          onEditCharacter={(idx) => handleStartEditSingleCharacter(idx, 'supporting')}
                        />
                      </>
                    )}
                  </div>

                  <div className="bg-indigo-500/8 border border-indigo-500/20 rounded-2xl p-6">
                    {editingIdeaField === 'characterRelationships' ? (
                      <div className="space-y-3">
                        <label className="block text-base font-semibold text-white flex items-center gap-2">
                          <span className="text-xl">🔗</span>
                          角色关系体系
                        </label>
                        <textarea
                          value={editingIdeaFieldContent}
                          onChange={(e) => setEditingIdeaFieldContent(e.target.value)}
                          rows={4}
                          className="w-full px-5 py-4 border-2 border-indigo-500/30 rounded-2xl focus:outline-none focus:border-indigo-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                          placeholder="请输入角色关系体系"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelEditIdeaField}
                            className="flex-1 py-3 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleSaveIdeaField}
                            className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="text-xl">🔗</span>
                            角色关系体系
                          </h3>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleCollapse('characterRelationships')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="展开/折叠"
                            >
                              {collapsedSections.has('characterRelationships') ? '展开' : '折叠'}
                            </button>
                            <button
                              onClick={() => handleStartEditIdeaField('characterRelationships')}
                              className="px-3 py-1.5 text-sm bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="编辑"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleCopyToClipboard(novelIdea.characterRelationships, '角色关系体系')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="复制"
                            >
                              复制
                            </button>
                          </div>
                        </div>
                        <CharacterList 
                          text={novelIdea.characterRelationships} 
                          variant="relationship" 
                          collapsed={collapsedSections.has('characterRelationships')}
                          onEditRelationship={handleStartEditRelationshipItem}
                        />
                      </>
                    )}
                  </div>

                  <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-2xl p-6">
                    {editingIdeaField === 'setting' ? (
                      <div className="space-y-3">
                        <label className="block text-base font-semibold text-white flex items-center gap-2">
                          <span className="text-xl">🌍</span>
                          世界观设定
                        </label>
                        <textarea
                          value={editingIdeaFieldContent}
                          onChange={(e) => setEditingIdeaFieldContent(e.target.value)}
                          rows={3}
                          className="w-full px-5 py-4 border-2 border-emerald-500/30 rounded-2xl focus:outline-none focus:border-emerald-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                          placeholder="请输入世界观设定"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelEditIdeaField}
                            className="flex-1 py-3 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleSaveIdeaField}
                            className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="text-xl">🌍</span>
                            世界观设定
                          </h3>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleCollapse('setting')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="展开/折叠"
                            >
                              {collapsedSections.has('setting') ? '展开' : '折叠'}
                            </button>
                            <button
                              onClick={() => handleStartEditIdeaField('setting')}
                              className="px-3 py-1.5 text-sm bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="编辑"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleCopyToClipboard(novelIdea.setting, '世界观设定')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="复制"
                            >
                              复制
                            </button>
                          </div>
                        </div>
                        <p className={`text-gray-200 text-base leading-7 whitespace-pre-wrap ${collapsedSections.has('setting') ? 'line-clamp-3' : ''}`}>{novelIdea.setting}</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => chapters.length > 0 ? setStep('result') : setStep('config')}
                disabled={editingIdea}
                className="flex-1 py-4 bg-white/8 hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 font-semibold rounded-2xl transition-all duration-200 border-2 border-white/10 hover:border-violet-400"
              >
                ← {chapters.length > 0 ? '返回完成页' : '返回修改'}
              </button>
              <button
                onClick={handleGenerateStructure}
                disabled={progressModal.visible || editingIdea || generatingStructureBatches}
                className="flex-1 py-4 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-semibold text-base rounded-2xl transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
              >
                {progressModal.visible ? (
                  <>
                    <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                    {progressModal.stage === 'structure' ? (
                      <span>生成结构分析中 ({progressModal.current}/{progressModal.total})</span>
                    ) : (
                      <span>生成中...</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-xl">📊</span>
                    生成结构分析
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* 结构分析步骤 */}
        {step === 'structure' && novelStructure && (
          <div className="space-y-6">
            <div className="backdrop-blur-xl rounded-2xl p-6 md:p-10 border border-white/8 shadow-2xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-2xl">
                    <span className="text-white text-2xl">📊</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">
                      结构分析
                    </h2>
                    <p className="text-sm text-gray-400">
                      构建完整的故事框架与章节规划
                    </p>
                  </div>
                </div>
                {!editingStructure && (
                  <button
                    onClick={handleStartEditStructure}
                    className="px-4 py-2.5 text-sm font-medium bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 rounded-xl transition-all duration-200 flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    编辑
                  </button>
                )}
              </div>

              {editingStructure && editingStructureContent ? (
                <div className="space-y-6">
                  <div>
                    <label className="block text-base font-semibold text-white flex items-center gap-2 mb-4">
                      <span className="text-lg">📖</span>
                      主要情节 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={editingStructureContent.mainPlot}
                      onChange={(e) => setEditingStructureContent({ ...editingStructureContent, mainPlot: e.target.value })}
                      rows={4}
                      className="w-full px-5 py-4 border-2 border-violet-500/30 rounded-2xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                      placeholder="请输入主要情节"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-white flex items-center gap-2 mb-4">
                      <span className="text-lg">📈</span>
                      情感曲线
                    </label>
                    <textarea
                      value={editingStructureContent.emotionalCurve}
                      onChange={(e) => setEditingStructureContent({ ...editingStructureContent, emotionalCurve: e.target.value })}
                      rows={3}
                      className="w-full px-5 py-4 border-2 border-violet-500/30 rounded-2xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                      placeholder="请输入情感曲线"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-white flex items-center gap-2 mb-4">
                      <span className="text-lg">⚔️</span>
                      关键冲突
                    </label>
                    <textarea
                      value={editingStructureContent.keyConflicts}
                      onChange={(e) => setEditingStructureContent({ ...editingStructureContent, keyConflicts: e.target.value })}
                      rows={3}
                      className="w-full px-5 py-4 border-2 border-violet-500/30 rounded-2xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                      placeholder="请输入关键冲突"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-white flex items-center gap-2 mb-4">
                      <span className="text-lg">🏰</span>
                      关键场景设定
                    </label>
                    <textarea
                      value={editingStructureContent.keyScenes || ''}
                      onChange={(e) => setEditingStructureContent({ ...editingStructureContent, keyScenes: e.target.value })}
                      rows={4}
                      className="w-full px-5 py-4 border-2 border-violet-500/30 rounded-2xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                      placeholder="请输入关键场景设定，包括地理位置、建筑特征、氛围特点等"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-white flex items-center gap-2 mb-4">
                      <span className="text-lg">🗝️</span>
                      关键物品设定
                    </label>
                    <textarea
                      value={editingStructureContent.keyItems || ''}
                      onChange={(e) => setEditingStructureContent({ ...editingStructureContent, keyItems: e.target.value })}
                      rows={3}
                      className="w-full px-5 py-4 border-2 border-violet-500/30 rounded-2xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                      placeholder="请输入关键物品设定，包括名称、外观、功能、来历等"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-semibold text-white flex items-center gap-2 mb-4">
                      <span className="text-lg">📝</span>
                      章节钩子（共{config.chapterCount}章）
                    </label>
                    <div className="space-y-4">
                      {editingStructureContent.chapterHooks?.map((hook, index) => (
                        <div
                          key={index}
                          className="bg-white/5 rounded-2xl p-5 border border-white/10"
                        >
                          <label className="block text-base font-semibold text-violet-400 mb-4 flex items-center gap-2">
                            <span className="flex items-center justify-center w-8 h-8 bg-violet-500/15 rounded-lg text-sm">
                              {index + 1}
                            </span>
                            第{index + 1}章：
                          </label>
                          <textarea
                            value={hook}
                            onChange={(e) => {
                              const newHooks = [...(editingStructureContent.chapterHooks || [])];
                              newHooks[index] = e.target.value;
                              setEditingStructureContent({ ...editingStructureContent, chapterHooks: newHooks });
                            }}
                            rows={2}
                            className="w-full px-4 py-3 border-2 border-violet-500/30 rounded-xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 resize-none text-base"
                            placeholder={`请输入第${index + 1}章的钩子`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={handleCancelEditStructure}
                      className="flex-1 py-4 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-2xl transition-all duration-200"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveStructure}
                      className="flex-1 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg"
                    >
                      保存修改
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* 主要情节 */}
                  <div className="bg-violet-500/8 border border-violet-500/20 rounded-2xl p-6">
                    {editingStructureField === 'mainPlot' ? (
                      <div className="space-y-3">
                        <label className="block text-base font-semibold text-white flex items-center gap-2">
                          <span className="text-2xl">📖</span>
                          主要情节 <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={editingStructureFieldContent}
                          onChange={(e) => setEditingStructureFieldContent(e.target.value)}
                          rows={4}
                          className="w-full px-5 py-4 border-2 border-violet-500/30 rounded-2xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                          placeholder="请输入主要情节"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelEditStructureField}
                            className="flex-1 py-3 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleSaveStructureField}
                            className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="text-2xl">📖</span>
                            主要情节
                          </h3>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleStartEditStructureField('mainPlot')}
                              className="px-3 py-1.5 text-sm bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="编辑"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              编辑
                            </button>
                            <button
                              onClick={() => handleCopyToClipboard(novelStructure.mainPlot, '主要情节')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="复制"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              复制
                            </button>
                          </div>
                        </div>
                        <p className="text-gray-200 text-base leading-7 whitespace-pre-wrap">
                          {novelStructure.mainPlot}
                        </p>
                      </>
                    )}
                  </div>

                  {/* 情感曲线 */}
                  <div className="bg-pink-500/8 border border-pink-500/20 rounded-2xl p-6">
                    {editingStructureField === 'emotionalCurve' ? (
                      <div className="space-y-3">
                        <label className="block text-base font-semibold text-white flex items-center gap-2">
                          <span className="text-2xl">📈</span>
                          情感曲线
                        </label>
                        <textarea
                          value={editingStructureFieldContent}
                          onChange={(e) => setEditingStructureFieldContent(e.target.value)}
                          rows={3}
                          className="w-full px-5 py-4 border-2 border-pink-500/30 rounded-2xl focus:outline-none focus:border-pink-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                          placeholder="请输入情感曲线"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelEditStructureField}
                            className="flex-1 py-3 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleSaveStructureField}
                            className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="text-2xl">📈</span>
                            情感曲线
                          </h3>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleStartEditStructureField('emotionalCurve')}
                              className="px-3 py-1.5 text-sm bg-pink-500/15 hover:bg-pink-500/25 text-pink-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="编辑"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              编辑
                            </button>
                            <button
                              onClick={() => handleCopyToClipboard(novelStructure.emotionalCurve, '情感曲线')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="复制"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              复制
                            </button>
                          </div>
                        </div>
                        <p className="text-gray-200 text-base leading-7 whitespace-pre-wrap">
                          {novelStructure.emotionalCurve}
                        </p>
                      </>
                    )}
                  </div>

                  {/* 关键冲突 */}
                  <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-6">
                    {editingStructureField === 'keyConflicts' ? (
                      <div className="space-y-3">
                        <label className="block text-base font-semibold text-white flex items-center gap-2">
                          <span className="text-2xl">⚔️</span>
                          关键冲突
                        </label>
                        <textarea
                          value={editingStructureFieldContent}
                          onChange={(e) => setEditingStructureFieldContent(e.target.value)}
                          rows={3}
                          className="w-full px-5 py-4 border-2 border-amber-500/30 rounded-2xl focus:outline-none focus:border-amber-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                          placeholder="请输入关键冲突"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelEditStructureField}
                            className="flex-1 py-3 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleSaveStructureField}
                            className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="text-2xl">⚔️</span>
                            关键冲突
                          </h3>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleStartEditStructureField('keyConflicts')}
                              className="px-3 py-1.5 text-sm bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="编辑"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              编辑
                            </button>
                            <button
                              onClick={() => handleCopyToClipboard(novelStructure.keyConflicts, '关键冲突')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="复制"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              复制
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2.5">
                          {parseNumberedItems(novelStructure.keyConflicts || '').map((item, idx) => (
                            <div key={idx} className="bg-amber-500/8 rounded-xl p-3.5 border border-amber-500/20 flex gap-3 items-start hover:bg-amber-500/15 transition-colors">
                              <span className="flex-shrink-0 w-7 h-7 bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm">{item.num || idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                {item.title && <p className="font-bold text-amber-300 text-sm mb-1">{item.title}</p>}
                                <p className="text-gray-300 text-sm leading-6">{item.content}</p>
                              </div>
                              <button
                                onClick={() => handleStartEditStructureItem('keyConflicts', idx, item)}
                                className="flex-shrink-0 p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/20 rounded-lg transition-all duration-200"
                                title="编辑此项"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 关键场景设定 */}
                  <div className="bg-cyan-500/8 border border-cyan-500/20 rounded-2xl p-6">
                    {editingStructureField === 'keyScenes' ? (
                      <div className="space-y-3">
                        <label className="block text-base font-semibold text-white flex items-center gap-2">
                          <span className="text-2xl">🏰</span>
                          关键场景设定
                        </label>
                        <textarea
                          value={editingStructureFieldContent}
                          onChange={(e) => setEditingStructureFieldContent(e.target.value)}
                          rows={4}
                          className="w-full px-5 py-4 border-2 border-cyan-500/30 rounded-2xl focus:outline-none focus:border-cyan-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                          placeholder="请输入关键场景设定，包括地理位置、建筑特征、氛围特点等"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelEditStructureField}
                            className="flex-1 py-3 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleSaveStructureField}
                            className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="text-2xl">🏰</span>
                            关键场景设定
                          </h3>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleStartEditStructureField('keyScenes')}
                              className="px-3 py-1.5 text-sm bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="编辑"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              编辑
                            </button>
                            <button
                              onClick={() => handleCopyToClipboard(novelStructure.keyScenes || '', '关键场景设定')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="复制"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              复制
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {parseKeyScenes(novelStructure.keyScenes || '').map((item, idx) => (
                            <div key={idx} className="bg-sky-500/8 rounded-xl p-3.5 border border-sky-500/20 hover:bg-sky-500/15 transition-colors">
                              <div className="flex gap-3 items-start">
                                <span className="flex-shrink-0 w-7 h-7 bg-gradient-to-br from-sky-500 to-sky-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm">{idx + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="font-bold text-sky-300 text-sm">{item.name}</p>
                                    {item.atmosphere && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/20">{item.atmosphere}</span>}
                                  </div>
                                  {item.description && <p className="text-gray-300 text-sm leading-6">{item.description}</p>}
                                </div>
                                <button
                                  onClick={() => handleStartEditStructureItem('keyScenes', idx, item)}
                                  className="flex-shrink-0 p-1.5 text-sky-400 hover:text-sky-300 hover:bg-sky-500/20 rounded-lg transition-all duration-200"
                                  title="编辑此项"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 关键物品设定 */}
                  <div className="bg-emerald-500/8 rounded-2xl p-6 border border-emerald-500/20">
                    {editingStructureField === 'keyItems' ? (
                      <div className="space-y-3">
                        <label className="block text-base font-semibold text-white flex items-center gap-2">
                          <span className="text-2xl">🗝️</span>
                          关键物品设定
                        </label>
                        <textarea
                          value={editingStructureFieldContent}
                          onChange={(e) => setEditingStructureFieldContent(e.target.value)}
                          rows={3}
                          className="w-full px-5 py-4 border-2 border-emerald-500/30 rounded-2xl focus:outline-none focus:border-emerald-500 bg-white/5 text-white transition-all duration-200 text-base resize-none"
                          placeholder="请输入关键物品设定，包括名称、外观、功能、来历等"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelEditStructureField}
                            className="flex-1 py-3 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleSaveStructureField}
                            className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="text-2xl">🗝️</span>
                            关键物品设定
                          </h3>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleStartEditStructureField('keyItems')}
                              className="px-3 py-1.5 text-sm bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="编辑"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              编辑
                            </button>
                            <button
                              onClick={() => handleCopyToClipboard(novelStructure.keyItems || '', '关键物品设定')}
                              className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                              title="复制"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              复制
                            </button>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {parseNumberedItems(novelStructure.keyItems || '').map((item, idx) => (
                            <div key={idx} className="bg-emerald-500/8 rounded-xl p-3.5 border border-emerald-500/20 flex gap-3 items-start hover:bg-emerald-500/15 transition-colors">
                              <span className="flex-shrink-0 w-7 h-7 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm">{item.num || idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                {item.title && <p className="font-bold text-emerald-300 text-sm mb-1">{item.title}</p>}
                                <p className="text-gray-300 text-sm leading-6">{item.content}</p>
                              </div>
                              <button
                                onClick={() => handleStartEditStructureItem('keyItems', idx, item)}
                                className="flex-shrink-0 p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 rounded-lg transition-all duration-200"
                                title="编辑此项"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 章节钩子 */}
                  <div className="bg-indigo-500/8 rounded-2xl p-6 border border-indigo-500/20">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="text-2xl">📝</span>
                        章节钩子（共{novelStructure.chapterHooks?.length || 0}章）
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (!novelStructure) return;
                            const newIndex = novelStructure.chapterHooks.length;
                            setNovelStructure({
                              ...novelStructure,
                              chapterHooks: [...novelStructure.chapterHooks, `第${newIndex + 1}章的新钩子`]
                            });
                            setEditingChapterIndex(newIndex);
                          }}
                          className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          添加新章节
                        </button>
                        <button
                          onClick={() => {
                            const hooksText = novelStructure.chapterHooks?.map((h, i) => `${i + 1}. ${h}`).join('\n');
                            handleCopyToClipboard(hooksText || '', '章节钩子');
                          }}
                          className="px-3 py-1.5 text-sm bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1"
                          title="复制所有钩子"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          复制全部
                        </button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {novelStructure.chapterHooks?.map((hook, index) => (
                        <div
                          key={index}
                          className="bg-white/5 rounded-xl p-4 border border-white/10 transition-all duration-200 hover:border-indigo-400"
                        >
                          {editingChapterIndex === index ? (
                            // 编辑模式
                            <div className="space-y-3">
                              <div className="flex items-center gap-3 mb-4">
                                <span className="flex items-center justify-center w-8 h-8 bg-violet-500/15 rounded-lg text-sm font-bold text-violet-400">
                                  {index + 1}
                                </span>
                                <span className="text-base font-semibold text-white">
                                  正在编辑第{index + 1}章
                                </span>
                              </div>
                              <textarea
                                value={hook}
                                onChange={(e) => {
                                  const newHooks = [...novelStructure.chapterHooks];
                                  newHooks[index] = e.target.value;
                                  setNovelStructure({ ...novelStructure, chapterHooks: newHooks });
                                }}
                                rows={3}
                                className="w-full px-4 py-3 border-2 border-violet-500/30 rounded-xl focus:outline-none focus:border-violet-500 bg-white/5 text-white transition-all duration-200 resize-none text-base"
                                placeholder={`请输入第${index + 1}章的钩子`}
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSaveChapter(index, hook)}
                                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  保存
                                </button>
                                <button
                                  onClick={handleCancelEditChapter}
                                  className="flex-1 py-2.5 px-4 bg-white/8 hover:bg-white/15 text-gray-300 font-medium rounded-lg transition-all duration-200"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            // 查看模式
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="flex items-center justify-center w-8 h-8 bg-indigo-500/15 rounded-lg text-sm font-bold text-indigo-400">
                                    {index + 1}
                                  </span>
                                  <span className="text-base font-semibold text-white">
                                    第{index + 1}章
                                  </span>
                                </div>
                                <p className="text-gray-200 text-base leading-7 whitespace-pre-wrap pl-11">
                                  {hook.replace(/\\n/g, '\n')}
                                </p>
                              </div>
                              <div className="flex gap-2 flex-shrink-0">
                                <button
                                  onClick={() => handleCopyToClipboard(hook, `第${index + 1}章钩子`)}
                                  className="px-3 py-2 bg-white/8 hover:bg-white/15 text-gray-400 rounded-lg transition-all duration-200 flex items-center gap-1.5"
                                  title="复制"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                  <span className="text-sm font-medium">复制</span>
                                </button>
                                <button
                                  onClick={() => handleStartEditChapter(index)}
                                  className="px-3 py-2 bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 rounded-lg transition-all duration-200 flex items-center gap-1.5"
                                  title="编辑"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  <span className="text-sm font-medium">编辑</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteChapter(index)}
                                  className="px-3 py-2 bg-red-500/15 text-red-400 hover:bg-red-500/25 rounded-lg transition-all duration-200 flex items-center gap-1.5"
                                  title="删除"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  <span className="text-sm font-medium">删除</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 自定义模型模板选项 */}
            <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-2xl p-6 border border-amber-500/20">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎨</span>
                  <h3 className="text-lg font-bold text-white">自定义模型模板</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomPromptModal(true)}
                  className="flex items-center gap-2 cursor-pointer bg-transparent border-none p-0"
                >
                  <div className="relative">
                    <div className={`w-12 h-6 rounded-full transition-colors duration-200 ${useCustomPrompt ? 'bg-amber-500' : 'bg-gray-600'}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${useCustomPrompt ? 'left-7' : 'left-1'}`} />
                    </div>
                  </div>
                  <span className="text-sm text-gray-300">{useCustomPrompt ? '已启用' : '已禁用'}</span>
                </button>
              </div>
              {useCustomPrompt && (
                <p className="text-sm text-gray-400">
                  已启用自定义模板，点击开关可编辑
                </p>
              )}
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => chapters.length > 0 ? setStep('result') : setStep('idea')}
                disabled={editingStructure}
                className="flex-1 py-4 bg-white/8 hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 font-semibold rounded-2xl transition-all duration-200 border-2 border-white/10 hover:border-violet-400"
              >
                ← {chapters.length > 0 ? '返回完成页' : '返回上一步'}
              </button>
              <div className="flex-1">
                <button
                  onClick={handleGenerateChapters}
                  disabled={progressModal.visible || editingStructure || !novelStructure?.chapterHooks?.length}
                  className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-semibold text-base rounded-2xl transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
                >
                  {progressModal.visible ? (
                    <>
                      <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                      <span>生成章节中 ({progressModal.current}/{progressModal.total})</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xl">✍️</span>
                      开始生成章节 ({novelStructure?.chapterHooks?.length || 0}章)
                    </>
                  )}
                </button>
                {!novelStructure?.chapterHooks?.length && (
                  <p className="text-xs text-gray-400 text-center mt-2">
                    请先添加章节钩子
                  </p>
                )}
                {chapterLimit > 0 && novelStructure?.chapterHooks && novelStructure.chapterHooks.length > remainingChapters && (
                  <p className="text-xs text-red-400 text-center mt-2 flex items-center justify-center gap-1">
                    <span>⚠️</span>
                    <span>章节钩子数 ({novelStructure.chapterHooks.length}) 超过剩余可生成数 ({remainingChapters}章)，请减少钩子或</span>
                    <Link href="/member" className="underline font-medium hover:text-red-700">升级会员</Link>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 生成中步骤 */}
        {step === 'generating' && (
          <div className="backdrop-blur-xl rounded-2xl border border-white/8 shadow-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {/* 顶部渐变横幅 */}
            <div className="relative bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-8 py-6 overflow-hidden">
              {/* 背景装饰 */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-0 left-1/4 w-32 h-32 bg-white rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-24 h-24 bg-white rounded-full blur-2xl" />
              </div>
              
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-5">
                  {/* 章节编号圆环 */}
                  <div className="relative flex-shrink-0">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
                      <circle cx="32" cy="32" r="28" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"
                        strokeDasharray={`${(currentGeneratingChapter / config.chapterCount) * 175.9} 175.9`}
                        className="transition-all duration-500"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-white text-xl font-bold">
                      {currentGeneratingChapter}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">
                      正在创作章节
                    </h2>
                    <p className="text-violet-200 text-sm mt-1">
                      第 {currentGeneratingChapter} / {config.chapterCount} 章 · {chapters.length} 章已完成
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsGeneratingMinimized(!isGeneratingMinimized)}
                    className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 flex items-center gap-1 backdrop-blur-sm"
                    title={isGeneratingMinimized ? '展开' : '缩小'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {isGeneratingMinimized ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      )}
                    </svg>
                    {isGeneratingMinimized ? '展开' : '缩小'}
                  </button>
                  <button
                    onClick={handleCancelGeneration}
                    className="px-3 py-1.5 text-sm bg-white/10 hover:bg-red-500/80 text-white rounded-lg transition-all duration-200 flex items-center gap-1 backdrop-blur-sm"
                    title="取消生成"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    取消
                  </button>
                </div>
              </div>
              
              {/* 进度条嵌入横幅底部 */}
              <div className="mt-4 -mx-8 px-8">
                <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-white/80 h-1.5 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.round((chapters.length / config.chapterCount) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {!isGeneratingMinimized ? (
              <div className="p-6 md:p-8">
                {/* 状态提示 */}
                <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-500/10 rounded-xl border border-violet-500/20 mb-6">
                  <div className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
                  <span className="text-sm text-violet-300 font-medium">AI 正在根据结构分析为您创作精彩内容</span>
                </div>

                {/* 章节列表 */}
                {chapters.length > 0 && (
                  <div className="space-y-3">
                    {chapters.map((chapter) => {
                      const isExpanded = generatingExpandedChapter === chapter.index;
                      const isCurrentGenerating = chapter.index === currentGeneratingChapter;
                      return (
                        <div
                          key={chapter.index}
                          className={`rounded-xl border transition-all duration-300 overflow-hidden ${
                            isCurrentGenerating 
                              ? 'border-violet-500/50 bg-violet-500/10 shadow-md shadow-violet-900/30' 
                              : 'border-white/10 bg-white/5 hover:shadow-sm'
                          }`}
                        >
                          <div
                            className="flex items-center gap-3 p-4 cursor-pointer group"
                            onClick={() => setGeneratingExpandedChapter(isExpanded ? null : chapter.index)}
                          >
                            {/* 章节编号徽章 */}
                            <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${
                              isCurrentGenerating 
                                ? 'bg-violet-500 text-white' 
                                : 'bg-white/8 text-gray-300 group-hover:bg-violet-500/20 group-hover:text-violet-400'
                            }`}>
                              {chapter.index}
                            </span>
                            
                            {/* 章节标题 */}
                            <h3 className="flex-1 font-semibold text-white truncate text-[15px]">
                              第{chapter.index}章：{chapter.title}
                            </h3>
                            
                            {/* 状态标签 */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isCurrentGenerating && (
                                <span className="flex items-center gap-1 text-xs text-violet-400 bg-violet-500/15 px-2 py-0.5 rounded-full font-medium">
                                  <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse" />
                                  生成中
                                </span>
                              )}
                              {regeneratingChapter === chapter.index && (
                                <span className="flex items-center gap-1 text-xs text-indigo-400 bg-indigo-500/15 px-2 py-0.5 rounded-full font-medium">
                                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                                  重新生成
                                </span>
                              )}
                              <span className="text-xs text-gray-400 tabular-nums">
                                {chapter.content.length} 字
                              </span>
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                          
                          {/* 展开内容 */}
                          <div
                            className={`transition-all duration-300 ease-in-out overflow-hidden ${
                              isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                            }`}
                          >
                            <div className="px-4 pb-4 border-t border-white/8">
                              <p className="text-gray-300 text-sm leading-7 whitespace-pre-wrap mt-3">
                                {chapter.content || '正在生成...'}
                              </p>
                            </div>
                          </div>
                          
                          {/* 折叠预览 */}
                          {!isExpanded && (
                            <div className="px-4 pb-3 pt-0">
                              <p className="text-gray-400 text-xs line-clamp-2 leading-5">
                                {chapter.content || '正在生成...'}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/10 rounded-full text-violet-400 text-sm font-medium">
                  <div className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
                  正在创作第 {currentGeneratingChapter} / {config.chapterCount} 章 · {chapters.length} 章已完成
                </div>
              </div>
            )}
          </div>
        )}

        {/* 完成步骤 */}
        {step === 'result' && (
          <div className="space-y-6">
            <div className="backdrop-blur-xl rounded-2xl p-6 md:p-10 border border-white/8 shadow-2xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full mb-6 shadow-xl">
                  <svg
                    className="w-10 h-10 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold text-white mb-4">
                  🎉 小说生成完成！
                </h2>
                <p className="text-lg text-gray-400">
                  共 <span className="font-bold text-violet-400">{chapters.length}</span> 章，总计 <span className="font-bold text-violet-400">{chapters.reduce((sum, ch) => sum + ch.content.length, 0).toLocaleString()}</span> 字
                </p>
              </div>

              {/* 小说标题 */}
              <div className="mb-6 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-400">小说标题</h3>
                  <button
                    onClick={handleGenerateTitle}
                    disabled={generatingTitle}
                    className="px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed text-white rounded-md transition-colors flex items-center gap-1"
                  >
                    {generatingTitle ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        生成中...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          {novelTitle ? (
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          ) : (
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          )}
                        </svg>
                        {novelTitle ? '重新生成' : '生成标题'}
                      </>
                    )}
                  </button>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white">
                  {novelTitle ? `《${novelTitle}》` : (novelIdea?.theme || '未命名小说')}
                </h2>
                {novelTitle && (
                  <p className="text-sm text-purple-400 mt-1">
                    ✨ AI 生成的精简标题（可多次重新生成）
                  </p>
                )}
                {titleCandidates && titleCandidates.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-400 mb-2">点击选择标题：</p>
                    <div className="flex flex-wrap gap-2">
                      {titleCandidates.map((candidate, idx) => {
                        const raw = candidate.replace(/^《|》$/g, '');
                        const isSelected = novelTitle === raw;
                        return (
                          <button
                            key={idx}
                            onClick={() => setNovelTitle(raw)}
                            className={`px-3 py-1.5 text-sm rounded-lg border transition-all duration-150 ${
                              isSelected
                                ? 'bg-purple-600 border-purple-600 text-white font-semibold shadow'
                                : 'bg-white/5 border-purple-500/30 text-purple-300 hover:bg-purple-500/15'
                            }`}
                          >
                            {candidate}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 小说概览 */}
              <div className="mb-4 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                <h3 className="font-semibold text-white mb-2">
                  {novelIdea?.theme}
                </h3>
                <p className="text-gray-300 text-sm">
                  {novelIdea?.concept}
                </p>
              </div>

              {/* 快捷编辑入口 */}
              <div className="mb-6 flex gap-3">
                <button
                  onClick={() => setStep('idea')}
                  className="flex-1 py-3 px-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-amber-400 font-medium"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  编辑主题创意
                </button>
                <button
                  onClick={() => setStep('structure')}
                  className="flex-1 py-3 px-4 bg-cyan-500/8 border border-cyan-500/20 hover:bg-cyan-500/15 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-cyan-400 font-medium"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  编辑结构分析
                </button>
              </div>

              {/* 章节列表 */}
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {chapters.map((chapter) => (
                  <details
                    key={chapter.index}
                    className="bg-white/5 rounded-lg overflow-hidden group border border-white/8"
                  >
                    <summary className="cursor-pointer px-4 py-3 font-semibold text-white hover:bg-white/10 transition-colors flex items-center justify-between">
                      <div className="flex-1 flex items-center gap-2 flex-wrap">
                        <span>第{chapter.index}章：{chapter.title}</span>
                        <span className="text-sm text-gray-400 font-normal">
                          ({chapter.content.length} 字)
                        </span>
                        {/* 显示字数警告 */}
                        {warning && warning.chapter === chapter.index && (
                          <span className="text-xs px-2 py-1 bg-amber-500/15 text-amber-400 rounded-lg flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            字数不足
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {regeneratingChapter === chapter.index ? (
                          <div className="flex items-center gap-1 text-sm text-indigo-400">
                            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                            <span>生成中...</span>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRegenerateChapter(chapter.index);
                              }}
                              className="px-3 py-1 bg-amber-500/15 text-amber-400 text-sm rounded-md hover:bg-amber-500/25 transition-colors opacity-0 group-hover:opacity-100"
                              title="重新生成"
                            >
                              重新生成
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleCopyChapter(chapter);
                              }}
                              className="px-3 py-1 bg-indigo-500/15 text-indigo-400 text-sm rounded-md hover:bg-indigo-500/25 transition-colors opacity-0 group-hover:opacity-100"
                              title="复制章节"
                            >
                              复制
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleStartEditChapterContent(chapter.index);
                              }}
                              className="px-3 py-1 bg-emerald-500/15 text-emerald-400 text-sm rounded-md hover:bg-emerald-500/25 transition-colors opacity-0 group-hover:opacity-100"
                              title="编辑章节"
                            >
                              编辑
                            </button>
                          </>
                        )}
                      </div>
                    </summary>
                    <div className="px-4 py-3 text-gray-300 leading-relaxed border-t border-white/8">
                      {editingChapterContentIndex === chapter.index ? (
                        // 编辑模式
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium text-gray-400">
                              正在编辑第{chapter.index}章内容
                            </span>
                            <span className="text-sm text-gray-500">
                              ({editingChapterContent.length} 字)
                            </span>
                          </div>
                          <textarea
                            value={editingChapterContent}
                            onChange={(e) => setEditingChapterContent(e.target.value)}
                            rows={10}
                            className="w-full px-4 py-3 border-2 border-emerald-500/30 rounded-xl focus:outline-none focus:border-emerald-500 bg-white/5 text-white transition-all duration-200 resize-none text-base leading-7 whitespace-pre-wrap"
                            placeholder={`请输入第${chapter.index}章的内容`}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleSaveChapterContent}
                              className="flex-1 py-2.5 px-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              保存
                            </button>
                            <button
                              onClick={handleCancelEditChapterContent}
                              className="flex-1 py-2.5 px-4 bg-white/8 hover:bg-white/15 text-gray-300 font-medium rounded-lg transition-all duration-200"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        // 查看模式
                        <div className="whitespace-pre-wrap">
                          {chapter.content}
                        </div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="flex-1 py-3 bg-white/8 hover:bg-white/15 text-gray-300 font-medium rounded-xl transition-all"
                >
                  创建新小说
                </button>
                <button
                  onClick={() => {
                    const content = generateNovelSettings();
                    navigator.clipboard.writeText(content).then(() => {
                      showToast('小说设定已复制到剪贴板', 'success');
                    }).catch(() => {
                      showToast('复制失败，请手动复制', 'error');
                    });
                  }}
                  disabled={!isSavedForDownload}
                  className={`flex-1 py-3 font-medium rounded-xl transition-all ${
                    isSavedForDownload
                      ? 'bg-amber-500 hover:bg-amber-600 text-white'
                      : 'bg-white/20 text-gray-400 cursor-not-allowed'
                  }`}
                  title={isSavedForDownload ? '复制小说设定' : '请先保存小说后再复制设定'}
                >
                  复制设定
                </button>
                <button
                  onClick={() => {
                    const content = generateFullNovelContent();
                    navigator.clipboard.writeText(content).then(() => {
                      showToast('整部小说已复制到剪贴板', 'success');
                    }).catch(() => {
                      showToast('复制失败，请手动复制', 'error');
                    });
                  }}
                  disabled={!isSavedForDownload}
                  className={`flex-1 py-3 font-medium rounded-xl transition-all ${
                    isSavedForDownload
                      ? 'bg-indigo-500 hover:bg-indigo-600 text-white'
                      : 'bg-white/20 text-gray-400 cursor-not-allowed'
                  }`}
                  title={isSavedForDownload ? '复制整部小说' : '请先保存小说后再复制'}
                >
                  复制整部小说
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const content = generateFullNovelContent();
                    const blob = new Blob([content], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${novelTitle || novelIdea?.theme || '小说'}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  disabled={!isSavedForDownload}
                  className={`flex-1 py-3 font-medium rounded-xl transition-all ${
                    isSavedForDownload
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      : 'bg-white/20 text-gray-400 cursor-not-allowed'
                  }`}
                  title={isSavedForDownload ? '下载小说TXT' : '请先保存小说后再下载'}
                >
                  下载小说(TXT)
                </button>
                <button
                  onClick={handleDownloadChaptersZIP}
                  disabled={!isSavedForDownload}
                  className={`flex-1 py-3 font-medium rounded-xl transition-all flex items-center justify-center gap-2 ${
                    isSavedForDownload
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-white/20 text-gray-400 cursor-not-allowed'
                  }`}
                  title={isSavedForDownload ? '下载所有章节ZIP' : '请先保存小说后再下载'}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  下载所有章节(ZIP)
                </button>
                <button
                  onClick={handleSaveNovel}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  {savedNovelId ? '更新保存' : '保存到数据库'}
                </button>
              </div>

              {/* 一站式打通：小说→剧本→短剧 */}
              {savedNovelId && (
                <div className="mt-4 p-4 rounded-xl border border-violet-500/20" style={{ background: 'rgba(139,92,246,0.06)' }}>
                  <div className="text-xs text-gray-400 mb-2">一站式打通 · 小说ID: <span className="text-violet-400 font-mono">{savedNovelId}</span></div>
                  <div className="flex items-center gap-2 text-[10px] mb-3">
                    <span className="px-2 py-1 rounded-full bg-purple-500/20 text-purple-400">小说 ✓</span>
                    <span className="text-gray-600">→</span>
                    <span className="px-2 py-1 rounded-full bg-amber-500/20 text-amber-400">剧本</span>
                    <span className="text-gray-600">→</span>
                    <span className="px-2 py-1 rounded-full bg-violet-500/20 text-violet-400">短剧</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Link href={`/script?novelId=${savedNovelId}`}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium text-amber-400 border border-amber-500/20 hover:bg-amber-500/15 transition-all"
                      style={{ background: 'rgba(245,158,11,0.06)' }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.361a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      生成剧本
                    </Link>
                    <Link href={`/short-dramas`}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium text-violet-400 border border-violet-500/20 hover:bg-violet-500/15 transition-all"
                      style={{ background: 'rgba(139,92,246,0.06)' }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
                      进入短剧
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Toast 提示 */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 animate-bounce-in">
          <div
            className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-xl border-2 ${
              toast.type === 'success'
                ? 'bg-green-500/90 border-green-400'
                : toast.type === 'error'
                ? 'bg-red-500/90 border-red-400'
                : toast.type === 'warning'
                ? 'bg-amber-500/90 border-amber-400'
                : 'bg-blue-500/90 border-blue-400'
            }`}
          >
            {toast.type === 'success' && (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {toast.type === 'error' && (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {toast.type === 'warning' && (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            )}
            {toast.type === 'info' && (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className="text-white font-medium">{toast.message}</span>
          </div>
        </div>
      )}
      {/* 进度弹窗 */}
      {progressModal.visible && (
        <>
          {/* 展开模式：全屏居中弹窗（黑客帝国风格） */}
          {!isProgressModalMinimized && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}>
              <div className="w-full max-w-2xl mx-4 overflow-hidden rounded-2xl" style={{ background: '#000', border: '1px solid rgba(0,255,65,0.2)', boxShadow: '0 0 40px rgba(0,255,65,0.08), inset 0 0 60px rgba(0,255,65,0.02)' }}>
                {/* 顶部标题栏 */}
                <div className="px-6 py-4" style={{ background: 'rgba(0,255,65,0.03)', borderBottom: '1px solid rgba(0,255,65,0.1)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,255,65,0.08)', border: '1px solid rgba(0,255,65,0.15)' }}>
                          <span style={{ color: '#4ade80', fontSize: '18px', textShadow: '0 0 10px #4ade80' }}>⟩</span>
                        </div>
                        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse" style={{ background: '#4ade80', boxShadow: '0 0 8px #4ade80' }} />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm" style={{ color: '#4ade80', textShadow: '0 0 6px rgba(0,255,65,0.3)', fontFamily: 'monospace' }}>
                          {progressModal.stage === 'idea' ? (generatingTitle ? '> TITLE_GENERATOR.exe' : '> IDEA_MATRIX.exe') : progressModal.stage === 'structure' ? '> STRUCTURE_ANALYSIS.exe' : progressModal.stage === 'regenerate' ? '> CHAPTER_REGEN.exe' : '> 创世纪联盟智能小说创作中...'}
                        </h3>
                        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(0,255,65,0.4)', fontFamily: 'monospace' }}>{progressModal.message}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setIsProgressModalMinimized(true)} className="p-2 rounded-lg transition-colors" style={{ color: 'rgba(0,255,65,0.4)' }} onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,255,65,0.1)')} onMouseOut={e => (e.currentTarget.style.background = 'transparent')} title="缩小">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      <button onClick={() => { if (progressModal.stage === 'chapters' && abortControllerRef.current) { abortControllerRef.current.abort(); } setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' }); showToast('已取消', 'info'); }} className="p-2 rounded-lg transition-colors" style={{ color: 'rgba(255,60,60,0.5)' }} onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,60,60,0.1)')} onMouseOut={e => (e.currentTarget.style.background = 'transparent')} title="取消">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                  {/* 进度条 - 绿色发光 */}
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,255,65,0.06)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${displayPercentage}%`,
                          background: displayPercentage >= 100
                            ? 'linear-gradient(90deg, #4ade80, #86efac)'
                            : 'linear-gradient(90deg, #166534, #22c55e, #4ade80)',
                          boxShadow: `0 0 12px ${displayPercentage >= 100 ? '#4ade80' : '#22c55e80'}, 0 0 4px ${displayPercentage >= 100 ? '#4ade80' : '#22c55e'}`
                        }}
                      />
                    </div>
                    <span className="text-xs font-bold font-mono min-w-[3rem] text-right" style={{ color: displayPercentage >= 100 ? '#86efac' : '#4ade80', textShadow: `0 0 6px ${displayPercentage >= 100 ? '#86efac' : '#4ade80'}` }}>
                      {displayPercentage}%
                    </span>
                  </div>
                </div>
                {/* 流式内容区 */}
                <div className="p-4">
                  <div className="min-h-[120px]">
                    {streamText ? (
                      <MatrixStream text={streamText.slice(-3000)} />
                    ) : (
                      <div style={{ position: 'relative', overflow: 'hidden', background: '#000', border: '1px solid rgba(0,255,65,0.12)', borderRadius: '12px', padding: '18px', fontFamily: '"Courier New", monospace', fontSize: '13px', minHeight: '140px' }}>
                        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.03) 2px, rgba(0,255,65,0.03) 4px)', pointerEvents: 'none' }} />
                        <div className="mb-2" style={{ color: '#4ade80', textShadow: '0 0 6px #4ade80', opacity: 0.8 }}>{'> NEURAL_NETWORK.init()'}</div>
                        <div className="mb-2" style={{ color: '#22c55e', opacity: 0.5 }}>{'> loading creative_matrix.dat ...'}</div>
                        <div className="mb-2" style={{ color: '#22c55e', opacity: 0.4 }}>{'> calibrating language_model ...'}</div>
                        <div className="mb-3" style={{ color: '#16a34a', opacity: 0.3 }}>{'> preparing output_stream ...'}</div>
                        <div className="flex items-center gap-1">
                          <span style={{ color: '#4ade80', textShadow: '0 0 8px #4ade80' }}>{'>'}</span>
                          <span style={{ display: 'inline-block', width: '8px', height: '16px', background: '#4ade80', animation: 'pulse 1s infinite', boxShadow: '0 0 8px #4ade80, 0 0 16px #4ade8060' }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {/* 底部状态栏 */}
                <div className="px-6 py-3 flex items-center justify-between" style={{ borderTop: '1px solid rgba(0,255,65,0.08)', background: 'rgba(0,255,65,0.02)' }}>
                  <span className="text-[11px] flex items-center gap-1.5" style={{ color: 'rgba(0,255,65,0.5)', fontFamily: 'monospace' }}>
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
                    {displayPercentage >= 100 ? 'PROCESS COMPLETE' : 'STREAMING DATA...'}
                  </span>
                  <span className="text-[11px] font-mono" style={{ color: 'rgba(0,255,65,0.4)' }}>OUTPUT: {streamText.length} chars</span>
                </div>
              </div>
            </div>
          )}
          {/* 缩小模式：底部悬浮条（黑客帝国风格） */}
          {isProgressModalMinimized && (
            <div
              className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl cursor-pointer transition-all"
              style={{ background: 'rgba(0,0,0,0.95)', border: '1px solid rgba(0,255,65,0.2)', boxShadow: '0 0 20px rgba(0,255,65,0.1)' }}
              onClick={() => setIsProgressModalMinimized(false)}
            >
              <div className="relative">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,255,65,0.08)', border: '1px solid rgba(0,255,65,0.15)' }}>
                  <span style={{ color: '#4ade80', fontSize: '14px', textShadow: '0 0 8px #4ade80', fontFamily: 'monospace' }}>⟩</span>
                </div>
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-pulse" style={{ background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold" style={{ color: '#4ade80', fontFamily: 'monospace', textShadow: '0 0 4px rgba(0,255,65,0.3)' }}>
                  {progressModal.stage === 'idea' ? (generatingTitle ? 'TITLE_GEN' : 'IDEA_GEN') : progressModal.stage === 'structure' ? 'STRUCT_GEN' : progressModal.stage === 'regenerate' ? 'CH_REGEN' : 'CH_WRITE'}...
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,255,65,0.06)' }}>
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${displayPercentage}%`, background: 'linear-gradient(90deg, #166534, #4ade80)', boxShadow: '0 0 8px #22c55e60' }} />
                  </div>
                  <span className="text-[10px] font-bold font-mono" style={{ color: '#4ade80', textShadow: '0 0 4px #4ade80' }}>{displayPercentage}%</span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); if (progressModal.stage === 'chapters' && abortControllerRef.current) { abortControllerRef.current.abort(); } setProgressModal({ visible: false, stage: '', current: 0, total: 0, message: '' }); setIsProgressModalMinimized(false); showToast('已取消', 'info'); }}
                className="ml-1 p-1.5 rounded-lg transition-colors"
                style={{ color: 'rgba(255,60,60,0.4)' }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,60,60,0.1)')}
                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                title="取消"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}
        </>
      )}

      {/* 章节限制/错误弹窗（黑客帝国风格） */}
      {limitModal.visible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.85)" }}>
          <div className="rounded-2xl p-6 md:p-8 max-w-md w-full mx-4 transition-all duration-300" style={{ background: '#000', border: '1px solid rgba(0,255,65,0.2)', boxShadow: '0 0 30px rgba(0,255,65,0.06)' }}>
            {/* 图标 */}
            <div className="mx-auto mb-4 w-16 h-16 flex items-center justify-center">
              {limitModal.type === 'limit' ? (
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.2)' }}>
                  <span style={{ fontSize: '28px', fontFamily: 'monospace', color: '#fbbf24', textShadow: '0 0 10px #fbbf2480' }}>!</span>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,60,60,0.2)' }}>
                  <span style={{ fontSize: '28px', fontFamily: 'monospace', color: '#f87171', textShadow: '0 0 10px #f8717180' }}>X</span>
                </div>
              )}
            </div>
            
            {/* 标题 */}
            <h3 className="text-xl font-bold text-center mb-3" style={{ color: limitModal.type === 'limit' ? '#fbbf24' : '#f87171', fontFamily: 'monospace', textShadow: `0 0 8px ${limitModal.type === 'limit' ? 'rgba(255,180,0,0.3)' : 'rgba(255,60,60,0.3)'}` }}>
              {limitModal.type === 'limit' ? '> ACCESS_DENIED: LIMIT_REACHED' : '> ERROR: GENERATION_FAILED'}
            </h3>
            
            {/* 错误消息 */}
            <p className="text-center mb-6 text-base leading-relaxed" style={{ color: 'rgba(0,255,65,0.5)', fontFamily: 'monospace' }}>
              {limitModal.message}
            </p>
            
            {/* 如果是章节限制，显示升级提示 */}
            {limitModal.type === 'limit' && (
              <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(0,255,65,0.03)', border: '1px solid rgba(0,255,65,0.1)' }}>
                <p className="text-sm" style={{ color: 'rgba(0,255,65,0.5)', fontFamily: 'monospace' }}>
                  {'> '} 升级会员可解锁更多章节 → <Link href="/member" className="font-semibold underline" style={{ color: '#4ade80' }}>会员中心</Link>
                </p>
              </div>
            )}
            
            {/* 按钮 */}
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setLimitModal({ visible: false, message: '', type: 'error' })}
                className="px-6 py-2.5 rounded-xl font-medium transition-all duration-200"
                style={{ background: 'rgba(0,255,65,0.06)', border: '1px solid rgba(0,255,65,0.15)', color: '#4ade80', fontFamily: 'monospace' }}
              >
                [确认]
              </button>
              {limitModal.type === 'limit' && (
                <Link
                  href="/member"
                  className="px-6 py-2.5 rounded-xl font-medium transition-all duration-200"
                  style={{ background: 'rgba(0,255,65,0.15)', border: '1px solid rgba(0,255,65,0.3)', color: '#000', backgroundColor: '#4ade80', fontFamily: 'monospace' }}
                >
                  [升级]
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 主题创意选项弹窗（黑客帝国风格） */}
      {showIdeaOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-2xl mx-4 overflow-hidden rounded-2xl" style={{ background: '#000', border: '1px solid rgba(0,255,65,0.2)', boxShadow: '0 0 40px rgba(0,255,65,0.08)' }}>
            {/* 顶部标题栏 */}
            <div className="px-6 py-4" style={{ background: 'rgba(0,255,65,0.03)', borderBottom: '1px solid rgba(0,255,65,0.1)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,255,65,0.08)', border: '1px solid rgba(0,255,65,0.15)' }}>
                      <span style={{ color: '#4ade80', fontSize: '18px', textShadow: '0 0 10px #4ade80' }}>⟩</span>
                    </div>
                    {loadingIdeaOptions && <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse" style={{ background: '#4ade80', boxShadow: '0 0 8px #4ade80' }} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm" style={{ color: '#4ade80', fontFamily: 'monospace', textShadow: '0 0 6px rgba(0,255,65,0.3)' }}>{loadingIdeaOptions ? '> 正在生成创意大纲...' : '> 请选择小说核心创意'}</h3>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(0,255,65,0.4)', fontFamily: 'monospace' }}>{loadingIdeaOptions ? '正在分析创作参数...' : `已成功载入 ${ideaOptions.length} 个创意大纲，点击选择心仪方向`}</p>
                  </div>
                </div>
                <button onClick={() => { if (!loadingIdeaOptions) setShowIdeaOptions(false); }} className="p-2 rounded-lg transition-colors" style={{ color: 'rgba(0,255,65,0.4)' }} onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,255,65,0.1)')} onMouseOut={e => (e.currentTarget.style.background = 'transparent')} title="关闭">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              {/* 进度条（加载时显示） */}
              {loadingIdeaOptions && (
                <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,255,65,0.06)' }}>
                  <div className="h-full rounded-full animate-pulse" style={{ width: '60%', background: 'linear-gradient(90deg, #166534, #4ade80)', boxShadow: '0 0 8px #22c55e80' }} />
                </div>
              )}
            </div>

            {/* 内容区 */}
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {loadingIdeaOptions ? (
                /* 生成中动画 */
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="flex gap-2">
                    {[0,1,2,3,4].map(i => (
                      <div key={i} className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ background: '#4ade80', boxShadow: '0 0 6px #4ade80', animationDelay: `${i * 120}ms` }} />
                    ))}
                  </div>
                  <p className="text-sm" style={{ color: 'rgba(0,255,65,0.5)', fontFamily: 'monospace' }}>{'> '} 正在深度分析创作参数...</p>
                  <p className="text-xs" style={{ color: 'rgba(0,255,65,0.3)', fontFamily: 'monospace' }}>题材分类 · 风格基调 · 叙事视角 · 主角设定</p>
                </div>
              ) : (
                /* 选项列表 */
                <div className="space-y-3">
                  {ideaOptions.map((option, index) => (
                    <button
                      key={option.id}
                      onClick={() => handleSelectIdeaOption(option)}
                      className="w-full p-4 rounded-xl transition-all duration-200 text-left group"
                      style={{ border: '1px solid rgba(0,255,65,0.1)', background: 'rgba(0,255,65,0.02)' }}
                      onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(0,255,65,0.3)'; e.currentTarget.style.background = 'rgba(0,255,65,0.06)'; }}
                      onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(0,255,65,0.1)'; e.currentTarget.style.background = 'rgba(0,255,65,0.02)'; }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,255,65,0.1)', border: '1px solid rgba(0,255,65,0.2)', color: '#4ade80', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '14px' }}>
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold mb-1 transition-colors" style={{ color: '#4ade80', fontFamily: 'monospace' }}>
                            {option.title}
                          </h3>
                          <p className="text-xs mb-1.5" style={{ color: 'rgba(0,255,65,0.6)' }}>{option.idea}</p>
                          {option.concept && <p className="text-xs leading-relaxed mb-1" style={{ color: 'rgba(0,255,65,0.35)' }}>{option.concept}</p>}
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                            {option.protagonist && (
                              <p className="text-[11px]" style={{ color: 'rgba(0,255,65,0.3)' }}><span style={{ color: 'rgba(0,255,65,0.5)' }}>主角：</span>{option.protagonist}</p>
                            )}
                            {option.uniquePoint && (
                              <p className="text-[11px]" style={{ color: 'rgba(255,200,0,0.5)' }}><span style={{ color: 'rgba(255,200,0,0.7)' }}>亮点：</span>{option.uniquePoint}</p>
                            )}
                          </div>
                        </div>
                        <span className="flex-shrink-0 mt-1" style={{ color: 'rgba(0,255,65,0.3)', fontFamily: 'monospace' }}>⟩</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="px-6 py-4 flex gap-3" style={{ borderTop: '1px solid rgba(0,255,65,0.08)', background: 'rgba(0,255,65,0.02)' }}>
              <button
                onClick={() => setShowIdeaOptions(false)}
                disabled={loadingIdeaOptions}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'rgba(0,255,65,0.04)', border: '1px solid rgba(0,255,65,0.1)', color: 'rgba(0,255,65,0.5)', fontFamily: 'monospace' }}
              >
                [取消]
              </button>
              <button
                onClick={() => handleGenerateIdeaOptions()}
                disabled={loadingIdeaOptions}
                className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: '#4ade80', color: '#000', fontFamily: 'monospace', boxShadow: '0 0 12px rgba(0,255,65,0.2)' }}
              >
                {loadingIdeaOptions ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                    正在生成中...
                  </span>
                ) : '[重新生成]'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI配置弹窗 */}
      {showAiConfigModal && (
        <AIConfigModal isOpen={showAiConfigModal} onClose={() => setShowAiConfigModal(false)} />
      )}

      {/* 自定义模板弹窗 */}
      {showCustomPromptModal && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
          onClick={() => setShowCustomPromptModal(false)}
        >
          <div 
            className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-amber-500/30 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <span className="text-3xl">🎨</span>
                  自定义模型模板
                </h2>
                <button
                  onClick={() => setShowCustomPromptModal(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div 
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUseCustomPrompt(!useCustomPrompt);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={useCustomPrompt}
                      onChange={(e) => {
                        e.stopPropagation();
                        setUseCustomPrompt(e.target.checked);
                      }}
                      className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-white font-medium">启用自定义模板</span>
                  </div>
                </div>

                {useCustomPrompt && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-400">
                      启用后将使用自定义的系统提示词，而不是管理后台的"章节生成 - 系统提示词"。
                    </p>
                    <textarea
                      value={customSystemPrompt}
                      onChange={(e) => setCustomSystemPrompt(e.target.value)}
                      rows={12}
                      className="w-full px-4 py-3 border-2 border-amber-500/30 rounded-xl focus:outline-none focus:border-amber-500 bg-white/5 text-white transition-all duration-200 resize-none text-sm"
                      placeholder="请输入自定义的系统提示词，用于指导AI生成章节内容..."
                    />
                    <p className="text-xs text-gray-500">
                      提示：可以使用变量如 {'{idea}'}、{'{structure}'}、{'{tone}'} 等来引用小说信息
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowCustomPromptModal(false)}
                    className="flex-1 py-3 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200"
                  >
                    关闭
                  </button>
                  <button
                    onClick={() => setShowCustomPromptModal(false)}
                    className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold rounded-xl transition-all duration-200"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 角色编辑弹窗 */}
      {editingCharacterInfo && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
          onClick={() => setEditingCharacterInfo(null)}
        >
          <div 
            className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-white/10 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>👤</span>
                  编辑角色 — {editingCharacterInfo.role === 'protagonist' ? '主要人物' : '配角'}
                </h2>
                <button
                  onClick={() => setEditingCharacterInfo(null)}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-1.5">角色名称 *</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white/5 text-white transition-all text-sm"
                      value={editingCharacterInfo.name}
                      onChange={(e) => setEditingCharacterInfo({ ...editingCharacterInfo, name: e.target.value })}
                      placeholder="请输入角色名字"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-1.5">性别</label>
                    <select
                      className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white/5 text-white transition-all text-sm"
                      value={editingCharacterInfo.gender || ''}
                      onChange={(e) => setEditingCharacterInfo({ ...editingCharacterInfo, gender: e.target.value })}
                    >
                      <option value="">未知</option>
                      <option value="男">男</option>
                      <option value="女">女</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-1.5">角色类型</label>
                    <select
                      className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white/5 text-white transition-all text-sm"
                      value={editingCharacterInfo.role}
                      onChange={(e) => setEditingCharacterInfo({ ...editingCharacterInfo, role: e.target.value as 'protagonist' | 'supporting' })}
                    >
                      <option value="protagonist">主角</option>
                      <option value="supporting">配角</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">性格特点 (用逗号/斜杠分隔多个标签)</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white/5 text-white transition-all text-sm"
                    value={editingCharacterInfo.personality}
                    onChange={(e) => setEditingCharacterInfo({ ...editingCharacterInfo, personality: e.target.value })}
                    placeholder="例如: 傲娇, 善良, 冷酷"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">外貌特征</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-amber-300 mb-1">发色</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 bg-white/5 text-white transition-all text-sm"
                        value={editingCharacterInfo.appearanceHairColor}
                        onChange={(e) => setEditingCharacterInfo({ ...editingCharacterInfo, appearanceHairColor: e.target.value })}
                        placeholder="例如: 黑色"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-yellow-300 mb-1">发型</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500/30 focus:border-yellow-500 bg-white/5 text-white transition-all text-sm"
                        value={editingCharacterInfo.appearanceHairstyle}
                        onChange={(e) => setEditingCharacterInfo({ ...editingCharacterInfo, appearanceHairstyle: e.target.value })}
                        placeholder="例如: 短发"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-sky-300 mb-1">眼睛</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 bg-white/5 text-white transition-all text-sm"
                        value={editingCharacterInfo.appearanceEyes}
                        onChange={(e) => setEditingCharacterInfo({ ...editingCharacterInfo, appearanceEyes: e.target.value })}
                        placeholder="例如: 蓝色"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-violet-300 mb-1">上身</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 bg-white/5 text-white transition-all text-sm"
                        value={editingCharacterInfo.appearanceUpper}
                        onChange={(e) => setEditingCharacterInfo({ ...editingCharacterInfo, appearanceUpper: e.target.value })}
                        placeholder="例如: 白色衬衫"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-emerald-300 mb-1">下身</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 bg-white/5 text-white transition-all text-sm"
                        value={editingCharacterInfo.appearanceLower}
                        onChange={(e) => setEditingCharacterInfo({ ...editingCharacterInfo, appearanceLower: e.target.value })}
                        placeholder="例如: 黑色长裤"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">角色描述</label>
                  <textarea
                    rows={4}
                    className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white/5 text-white transition-all text-sm resize-none"
                    value={editingCharacterInfo.description}
                    onChange={(e) => setEditingCharacterInfo({ ...editingCharacterInfo, description: e.target.value })}
                    placeholder="请输入角色设定、身份和故事背景描述..."
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-white/10">
                  <button
                    onClick={() => setEditingCharacterInfo(null)}
                    className="flex-1 py-2.5 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200 text-sm cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveSingleCharacter}
                    disabled={savingCharacterInfo || !editingCharacterInfo.name.trim()}
                    className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all duration-200 text-sm disabled:opacity-50 cursor-pointer shadow-lg shadow-purple-500/20"
                  >
                    {savingCharacterInfo ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 结构条目编辑弹窗 */}
      {editingStructureItem && novelStructure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-lg rounded-2xl border shadow-2xl" style={{ background: 'rgba(20,20,35,0.98)', borderColor: 'rgba(139,92,246,0.2)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">
                {editingStructureItem.field === 'keyConflicts' && '⚔️ 编辑关键冲突'}
                {editingStructureItem.field === 'keyScenes' && '🏰 编辑关键场景'}
                {editingStructureItem.field === 'keyItems' && '🗝️ 编辑关键物品'}
              </h3>
              <button onClick={handleCancelEditStructureItem} className="p-2 text-gray-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {editingStructureItem.field === 'keyScenes' ? (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-1.5">场景名称 *</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 bg-white/5 text-white transition-all text-sm"
                      value={editingStructureItem.name || ''}
                      onChange={(e) => setEditingStructureItem({ ...editingStructureItem, name: e.target.value })}
                      placeholder="请输入场景名称"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-1.5">场景描述</label>
                    <textarea
                      rows={4}
                      className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 bg-white/5 text-white transition-all text-sm resize-none"
                      value={editingStructureItem.description || ''}
                      onChange={(e) => setEditingStructureItem({ ...editingStructureItem, description: e.target.value })}
                      placeholder="请输入场景详细描述"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-1.5">氛围</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 bg-white/5 text-white transition-all text-sm"
                      value={editingStructureItem.atmosphere || ''}
                      onChange={(e) => setEditingStructureItem({ ...editingStructureItem, atmosphere: e.target.value })}
                      placeholder="例如：紧张、神秘、压抑"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-1.5">标题</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 bg-white/5 text-white transition-all text-sm"
                      value={editingStructureItem.title || ''}
                      onChange={(e) => setEditingStructureItem({ ...editingStructureItem, title: e.target.value })}
                      placeholder="请输入标题（可为空）"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-1.5">内容 *</label>
                    <textarea
                      rows={4}
                      className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 bg-white/5 text-white transition-all text-sm resize-none"
                      value={editingStructureItem.content || ''}
                      onChange={(e) => setEditingStructureItem({ ...editingStructureItem, content: e.target.value })}
                      placeholder="请输入详细内容"
                    />
                  </div>
                </>
              )}
              <div className="flex gap-3 pt-4 border-t border-white/10">
                <button
                  onClick={handleCancelEditStructureItem}
                  className="flex-1 py-2.5 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200 text-sm cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveStructureItem}
                  disabled={!editingStructureItem.content && !editingStructureItem.description && !editingStructureItem.name}
                  className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all duration-200 text-sm disabled:opacity-50 cursor-pointer shadow-lg shadow-purple-500/20"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 角色关系编辑弹窗 */}
      {editingRelationshipItem && novelIdea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-lg rounded-2xl border shadow-2xl" style={{ background: 'rgba(20,20,35,0.98)', borderColor: 'rgba(99,102,241,0.2)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">🔗 编辑角色关系</h3>
              <button onClick={handleCancelEditRelationshipItem} className="p-2 text-gray-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">角色A *</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white/5 text-white transition-all text-sm"
                    value={editingRelationshipItem.name1}
                    onChange={(e) => setEditingRelationshipItem({ ...editingRelationshipItem, name1: e.target.value })}
                    placeholder="角色A名称"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">角色B</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white/5 text-white transition-all text-sm"
                    value={editingRelationshipItem.name2 !== editingRelationshipItem.name1 ? editingRelationshipItem.name2 : ''}
                    onChange={(e) => setEditingRelationshipItem({ ...editingRelationshipItem, name2: e.target.value })}
                    placeholder="角色B名称（可选）"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1.5">关系描述 *</label>
                <textarea
                  rows={4}
                  className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white/5 text-white transition-all text-sm resize-none"
                  value={editingRelationshipItem.relation || ''}
                  onChange={(e) => setEditingRelationshipItem({ ...editingRelationshipItem, relation: e.target.value })}
                  placeholder="请输入关系描述"
                />
              </div>
              <div className="flex gap-3 pt-4 border-t border-white/10">
                <button
                  onClick={handleCancelEditRelationshipItem}
                  className="flex-1 py-2.5 bg-white/8 hover:bg-white/15 text-gray-300 font-semibold rounded-xl transition-all duration-200 text-sm cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveRelationshipItem}
                  disabled={!editingRelationshipItem.name1.trim() || !editingRelationshipItem.relation.trim()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-200 text-sm disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-500/20"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </main>
      </div>
    </>
  );
}
