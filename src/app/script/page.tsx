'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/api/client';
import AIConfigModal from '@/components/AIConfigModal';
import { getToken as getStoredToken } from '@/lib/get-token';
import JSZip from 'jszip';

interface Scene {
  sceneIndex: number;
  sceneTitle: string;
  description: string;
  actions: string;
  dialogues: { character: string; line: string; direction?: string }[];
  stageDirections: string;
}

interface ImagePrompt {
  id: string;
  sceneIndex: number;
  shotIndex: number;
  shotType: string;
  description: string;
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  style: string;
}

interface VideoPrompt {
  id: string;
  sceneIndex: number;
  subShot: number;
  dialogueRange: string;
  description: string;
  startFrame: string;
  cameraMovement: string;
  action: string;
  endFrame: string;
  duration: string;
  prompt: string;
  style: string;
  transition: string;
  dialogues?: Array<{ character: string; line: string }>;
}

interface ScriptChapter {
  chapterIndex: number;
  chapterTitle: string;
  screenplay: { scenes: Scene[]; summary?: string; rawText?: string; targetSceneCount?: number } | null;
  imagePrompts: ImagePrompt[] | null;
  videoPrompts: VideoPrompt[] | null;
}

interface ScriptData {
  id: string;
  novelId: string;
  userId: string;
  status: string;
  chapters: ScriptChapter[];
  createdAt: string;
  updatedAt: string;
}

export default function ScriptPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-gray-500">加载中...</p></div>}>
      <ScriptPageContent />
    </Suspense>
  );
}

function MatrixStream({ text }: { text: string; maxChars?: number }) {
  const lines = text.split('\n');
  const displayLines = lines.slice(-40);

  const getFadeClass = (lineIndex: number, totalLines: number): string => {
    const age = totalLines - lineIndex - 1;
    if (age <= 1) return 'text-green-300 drop-shadow-[0_0_6px_#4ade80] opacity-100';
    if (age <= 3) return 'text-green-400 drop-shadow-[0_0_3px_#22c55e] opacity-90';
    if (age <= 6) return 'text-green-500 opacity-75';
    if (age <= 10) return 'text-green-600 opacity-55';
    if (age <= 15) return 'text-green-700 opacity-35';
    return 'text-green-800 opacity-20';
  };

  return (
    <div className="matrix-stream-container">
      <style>{`
        .matrix-stream-container {
          position: relative;
          overflow: hidden;
          background: linear-gradient(180deg, rgba(0,8,2,0.95) 0%, rgba(0,12,3,0.98) 100%);
          border: 1px solid rgba(0,255,65,0.08);
          border-radius: 12px;
        }
        .matrix-stream-container::before {
          content: '';
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,0,0,0.15) 2px,
            rgba(0,0,0,0.15) 4px
          );
          pointer-events: none;
          z-index: 2;
          opacity: 0.5;
        }
        .matrix-stream-container::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 100%, rgba(0,255,65,0.06) 0%, transparent 70%);
          pointer-events: none;
          z-index: 1;
        }
        .matrix-line {
          animation: matrixFadeIn 0.6s ease-out forwards;
          text-shadow: 0 0 2px currentColor;
          letter-spacing: 0.5px;
        }
        @keyframes matrixFadeIn {
          0% { opacity: 0; transform: translateY(-12px); filter: blur(2px); }
          40% { filter: blur(0px); }
          100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .matrix-cursor::after {
          content: '█';
          animation: matrixBlink 0.8s step-end infinite;
          color: #4ade80;
          text-shadow: 0 0 8px #4ade80, 0 0 16px #22c55e;
        }
        @keyframes matrixBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .matrix-rain {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          z-index: 0;
          overflow: hidden;
        }
        .matrix-drop {
          position: absolute;
          top: -100px;
          font-family: 'Courier New', monospace;
          font-size: 10px;
          color: rgba(0,255,65,0.07);
          animation: matrixDrop linear infinite;
          white-space: nowrap;
          text-shadow: 0 0 3px rgba(0,255,65,0.15);
        }
        @keyframes matrixDrop {
          0% { transform: translateY(-100px); opacity: 0; }
          10% { opacity: 0.15; }
          90% { opacity: 0.05; }
          100% { transform: translateY(400px); opacity: 0; }
        }
      `}</style>

      {/* Subtle background rain drops */}
      <div className="matrix-rain" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="matrix-drop"
            style={{
              left: `${5 + i * 8}%`,
              animationDuration: `${3 + Math.random() * 5}s`,
              animationDelay: `${Math.random() * 3}s`,
              fontSize: `${8 + Math.random() * 6}px`,
            }}
          >
            {Array.from({ length: 8 + Math.floor(Math.random() * 15) }).map(() =>
              String.fromCharCode(0x30A0 + Math.random() * 96)
            ).join('')}
          </span>
        ))}
      </div>

      {/* Main text display */}
      <div className="relative z-3 p-5 font-mono text-[13px] leading-[1.9] overflow-auto max-h-full">
        {displayLines.map((line, i) => (
          <div
            key={`${i}-${line.substring(0, 10)}`}
            className={`matrix-line ${getFadeClass(i, displayLines.length)}`}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            {line || '\u00A0'}
          </div>
        ))}
        <span className="matrix-cursor">&nbsp;</span>
      </div>
    </div>
  );
}

function ScriptPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userInfo, token, loading: authLoading } = useAuth();
  const novelId = searchParams.get('novelId');

  const [script, setScript] = useState<ScriptData | null>(null);
  const [novelTitle, setNovelTitle] = useState('');
  const [novelWordCount, setNovelWordCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingChapter, setGeneratingChapter] = useState<number | null>(null);
  const [generatingType, setGeneratingType] = useState<'screenplay' | 'image' | 'video' | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
  const [editingPrompt, setEditingPrompt] = useState<{ chapterIndex: number; type: 'image' | 'video'; promptIndex: number } | null>(null);
  const [editValue, setEditValue] = useState('');
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
    if (streamText && generating) {
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
  }, [streamText, generating, playTypingSound]);
  const [toastMsg, setToastMsg] = useState('');
  const [completionMsg, setCompletionMsg] = useState('');

  const speakCompletion = useCallback((text: string) => {
    try {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'zh-CN';
      utter.rate = 0.9;
      utter.pitch = 1.6;
      utter.volume = 1;
      const setVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const female = voices.find(v =>
          v.lang.startsWith('zh') && /female|woman|xiaoxiao|xiaoyi|yunxi|huihui|yaoyao|meijia|tingting/i.test(v.name)
        ) || voices.find(v => v.lang.startsWith('zh'));
        if (female) utter.voice = female;
        window.speechSynthesis.speak(utter);
      };
      if (window.speechSynthesis.getVoices().length > 0) {
        setVoice();
      } else {
        window.speechSynthesis.onvoiceschanged = setVoice;
      }
    } catch {}
  }, []);
  const [viewPrompt, setViewPrompt] = useState<{ type: 'image' | 'video'; data: ImagePrompt | VideoPrompt; sceneTitle?: string; sceneDialogues?: { character: string; line: string }[] } | null>(null);
  const [viewScene, setViewScene] = useState<{ scene: Scene; chapterIndex: number; chapterTitle: string } | null>(null);
  const [editingScene, setEditingScene] = useState<{ chapterIndex: number; sceneIndex: number } | null>(null);
  const [editSceneData, setEditSceneData] = useState<Scene | null>(null);
  const [availableConfigs, setAvailableConfigs] = useState<any[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [showAiConfigModal, setShowAiConfigModal] = useState(false);
  const [showCustomPromptModal, setShowCustomPromptModal] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [totalChaptersToGenerate, setTotalChaptersToGenerate] = useState(0);
  const [completedChaptersCount, setCompletedChaptersCount] = useState(0);

  const [customPromptEnabled, setCustomPromptEnabled] = useState<boolean>(false);
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>('');

  // 挂载后从 localStorage 加载，避免 Next.js SSR 水合冲突（Hydration Mismatch）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const enabled = localStorage.getItem('custom_prompt_enabled') === 'true';
      setCustomPromptEnabled(enabled);

      const saved = localStorage.getItem('custom_system_prompt');
      setCustomSystemPrompt(saved || `你是一位顶级好莱坞影视编剧和微短剧导演。你深谙微短剧节奏，精通将小说改编为极具画面感、节奏紧凑、反转不断的剧作场景。

【核心改编准则】
1. **画面先行（Show, don't tell）**：拒绝纯文字心理描写，所有情绪、冲突、人物背景必须外化为具体的“可拍画面、细微动作、音效声音”。
2. **场景高密度戏剧性**：每一个新场景（sceneTitle）必须是真正的时空转换（如：内景-破旧院落-深夜）。每场戏必须包含：【核心戏剧冲突推进】、【悬念微型铺垫】或【信息交代】。
3. **黄金台词标准**：对白（dialogues）要简练、口语化、符合身份，蕴含潜台词 and 弦外之音。没有对白的场景把 dialogues 设为空数组 []。
4. **舞台指示可视化**：stageDirections 应当提供明确的运镜方式（景别、运镜方式、转场建议），以及具有影视美感的后期转场指导。

## 输出格式要求
请严格输出合法的纯 JSON 格式（不要包含任何 markdown 代码块标记或前后解释字）：
{
  "scenes": [
    {
      "sceneIndex": 0,
      "sceneTitle": "内景-主卧室-清晨",
      "description": "清晨阳光穿过百叶窗，在地板落下一道斑驳。空气中浮动着尘埃，远处隐约传来厨房煎蛋的声音。",
      "actions": "主角紧捏着手中的旧信封，指节有些泛白，深吸一口气又缓缓吐出，眼神凝重地盯着门板。",
      "dialogues": [
        {"character": "主角名", "line": "这次，真的没有退路了。"}
      ],
      "stageDirections": "特写信封，随着主角深呼吸拉远至中景，伴随门轴嘎吱开门声转场。"
    }
  ]
}`);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('custom_prompt_enabled', customPromptEnabled ? 'true' : 'false');
    }
  }, [customPromptEnabled]);

  useEffect(() => {
    if (typeof window !== 'undefined' && customSystemPrompt) {
      localStorage.setItem('custom_system_prompt', customSystemPrompt);
    }
  }, [customSystemPrompt]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2000);
  };

  const fetchScript = useCallback(async () => {
    const authToken = token || getStoredToken();
    if (!novelId || !authToken) return;
    try {
      const res = await fetch(`/api/novel/script?novelId=${novelId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (data.success && data.data) {
        setScript(data.data);
      }
      const novelRes = await fetch(`/api/novels/${novelId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const novelData = await novelRes.json();
      if (novelData.success && novelData.data) {
        setNovelTitle(novelData.data.title);
        // 计算小说字数：统计所有章节content的字符数
        const chapters = novelData.data.chapters || [];
        const totalWords = chapters.reduce((sum: number, ch: { content?: string }) => {
          return sum + (ch.content ? ch.content.replace(/\s/g, '').length : 0);
        }, 0);
        setNovelWordCount(totalWords);
      }
    } catch (err) {
      console.error('Fetch script error:', err);
    } finally {
      setLoading(false);
    }
  }, [novelId, token]);

  useEffect(() => {
    if (authLoading) return;
    // 兼容 store hydration 竞态：如果 store 还没恢复 user，检查 localStorage
    const savedToken = getStoredToken();
    if (!userInfo && !savedToken) {
      router.push('/auth/login');
      return;
    }
    // 如果有 token（从 store 或 localStorage），就可以加载剧本
    if (token || savedToken) {
      fetchScript();
    }
  }, [userInfo, authLoading, router, fetchScript, token]);

  // 加载可用的AI配置
  const loadAvailableConfigs = async () => {
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
        if (result.data.defaultConfigId) {
          setSelectedConfigId(result.data.defaultConfigId);
        } else if (allConfigs.length > 0) {
          setSelectedConfigId(allConfigs[0].id);
        }
      }
    } catch (error) {
      console.error('获取AI配置失败:', error);
    } finally {
      setLoadingConfigs(false);
    }
  };

  useEffect(() => {
    if (!authLoading && userInfo) {
      loadAvailableConfigs();
    }
  }, [userInfo, authLoading]);

  // 规范化剧本中的对白数据，自适应处理 "角色:台词" 字符串数组，或具有不同属性名称的结构体对象，并自动过滤空白/占位对白
  const normalizeDialogues = (dialogues: any): Array<{ character: string; line: string; direction?: string }> => {
    if (!Array.isArray(dialogues)) return [];
    return dialogues.map((d: any) => {
      if (typeof d === 'string') {
        const separatorIdx = d.indexOf('：') !== -1 ? d.indexOf('：') : d.indexOf(':');
        if (separatorIdx !== -1) {
          const character = d.substring(0, separatorIdx).trim();
          const line = d.substring(separatorIdx + 1).trim();
          return { character, line };
        }
        return { character: '', line: d.trim() };
      }
      if (d && typeof d === 'object') {
        const char = d.character || d.role || d.speaker || '';
        const line = d.line || d.content || d.dialogue || d.text || '';
        if (!char.trim() && !line.trim()) return null;
        return {
          character: char.trim(),
          line: line.trim(),
          direction: d.direction || d.stage_direction || ''
        };
      }
      return null;
    }).filter(Boolean) as any[];
  };

  // 将原始JSON流文本格式化为可读文字
  const formatStreamJson = (raw: string): string => {
    try {
      // 尝试补全并解析 JSON
      let jsonStr = raw.trim();
      // 尝试多种补全方式
      const tryParse = (s: string) => {
        try { return JSON.parse(s); } catch { return null; }
      };
      let obj = tryParse(jsonStr) || tryParse(jsonStr + ']}') || tryParse(jsonStr + '"}]}') || tryParse(jsonStr + '"}]}}}');
      if (!obj) {
        // 提取已有的完整场景文本
        const lines: string[] = [];
        const titleRe = /"sceneTitle"\s*:\s*"([^"]+)"/g;
        const descRe = /"description"\s*:\s*"([^"]+)"/g;
        const charRe = /"character"\s*:\s*"([^"]+)"/g;
        const lineRe = /"line"\s*:\s*"([^"]+)"/g;
        const dirRe = /"stageDirections"\s*:\s*"([^"]+)"/g;
        const titles: string[] = []; let m;
        while ((m = titleRe.exec(raw)) !== null) titles.push(m[1]);
        const descs: string[] = []; while ((m = descRe.exec(raw)) !== null) descs.push(m[1]);
        const chars: string[] = []; while ((m = charRe.exec(raw)) !== null) chars.push(m[1]);
        const dLines: string[] = []; while ((m = lineRe.exec(raw)) !== null) dLines.push(m[1]);
        const dirs: string[] = []; while ((m = dirRe.exec(raw)) !== null) dirs.push(m[1]);
        for (let i = 0; i < titles.length; i++) {
          lines.push(`🎬 场景${i + 1}：${titles[i]}`);
          if (descs[i]) lines.push(`  ${descs[i]}`);
          if (dirs[i]) lines.push(`  🎥 ${dirs[i]}`);
          lines.push('');
        }
        // 对白
        for (let i = 0; i < chars.length; i++) {
          if (i === 0 || (i > 0 && chars[i] !== chars[i-1])) {
            lines.push(`  💬 ${chars[i]}：${dLines[i] || ''}`);
          } else {
            lines.push(`  💬 ${chars[i]}：${dLines[i] || ''}`);
          }
        }
        if (lines.length > 0) return lines.join('\n');
        // 回退：去掉JSON语法符号显示纯文本
        return raw.replace(/[{}\[\]"]/g, '').replace(/,\s*/g, '\n').replace(/^\s*\w+\s*:/gm, '').trim();
      }
      // 成功解析JSON，格式化输出
      const scenes = obj.scenes || (Array.isArray(obj) ? obj : [obj]);
      const result: string[] = [];
      scenes.forEach((scene: any, i: number) => {
        result.push(`🎬 场景${i + 1}：${scene.sceneTitle || ''}`);
        if (scene.description) result.push(`  ${scene.description}`);
        const normalized = normalizeDialogues(scene.dialogues);
        if (normalized.length > 0) {
          normalized.forEach((d: any) => {
            result.push(`  💬 ${d.character}：${d.line}`);
          });
        }
        if (scene.stageDirections) result.push(`  🎥 ${scene.stageDirections}`);
        result.push('');
      });
      return result.join('\n');
    } catch {
      return raw;
    }
  };

  const handleGenerateScript = async (chapterIdx?: number) => {
    if (!novelId || !token) return;
    setGenerating(true);
    setGeneratingType('screenplay');
    setStreamText('');
    setProgressPercent(0);
    setIsMinimized(false);
    setTotalChaptersToGenerate(0);
    setCompletedChaptersCount(0);
    try {
      const body: Record<string, unknown> = { 
        novelId, 
        configId: selectedConfigId,
        customPromptEnabled,
        customSystemPrompt
      };
      if (chapterIdx !== undefined) body.chapterIndex = chapterIdx;
      const res = await fetch('/api/novel/script/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '生成失败' }));
        setStreamText(errData.error || `生成失败 (${res.status})`);
        setGenerating(false);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';
      let totalChapters = 0;
      let completedChapters = 0;
      let accumulatedText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'start') {
                setStreamText('');
                accumulatedText = '';
                if (data.totalChapters) {
                  totalChapters = data.totalChapters;
                  setTotalChaptersToGenerate(totalChapters);
                }
              } else if (data.type === 'content') {
                accumulatedText += data.content;
                setStreamText(formatStreamJson(accumulatedText));
                // Estimate progress based on current chapter
                if (totalChapters > 0) {
                  const chapterBase = (completedChapters / totalChapters) * 100;
                  const chapterProgress = Math.min((accumulatedText.length / 2000), 1) * (100 / totalChapters);
                  setProgressPercent(Math.min(Math.round(chapterBase + chapterProgress), 99));
                }
              } else if (data.type === 'batch_progress' && data.status === 'generating') {
                showToast(`场景批次 ${data.currentBatch}/${data.totalBatches} 开始生成...`);
              } else if (data.type === 'batch_progress' && data.status === 'completed') {
                showToast(`场景批次 ${data.currentBatch}/${data.totalBatches} 完成，已生成 ${data.accumulatedScenes} 个场景`);
                accumulatedText = '';
                setStreamText('');
                await fetchScript();
              } else if (data.type === 'complete') {
                setProgressPercent(100);
                accumulatedText = '';
                setStreamText('');
                setCompletionMsg('小主已经给您生成完，请查看！');
                speakCompletion('小主已经给您生成完，请查看');
                await fetchScript();
              } else if (data.type === 'progress') {
                completedChapters = data.completedCount || completedChapters;
                setCompletedChaptersCount(completedChapters);
                if (data.totalChapters > 0) {
                  setProgressPercent(Math.round((completedChapters / data.totalChapters) * 100));
                }
                accumulatedText = '';
                setStreamText('');
                await fetchScript();
              } else if (data.type === 'skip') {
                // 章节已有剧本数据，跳过重新生成
                completedChapters++;
                setCompletedChaptersCount(completedChapters);
                if (totalChapters > 0) {
                  setProgressPercent(Math.round((completedChapters / totalChapters) * 100));
                }
                showToast(`章节「${data.title || ''}」已有剧本，已跳过`);
                await fetchScript();
              } else if (data.type === 'retry') {
                showToast(`章节生成解析失败，正在第${data.retry || 1}次重试...`);
              } else if (data.type === 'done') {
                setProgressPercent(100);
                setCompletionMsg('小主已经给您生成完，请查看！');
                speakCompletion('小主已经给您生成完，请查看');
                await fetchScript();
              } else if (data.type === 'error') { showToast(data.error); }
            } catch { /* skip */ }
          }
        }
      }
    } catch (err) {
      console.error('Generate script error:', err);
      showToast('剧本生成失败');
    } finally {
      setGenerating(false);
      setGeneratingType(null);
      setStreamText('');
      setProgressPercent(0);
    }
  };

  const handleGenerateImagePrompts = async (chapterIndex: number) => {
    if (!script || !token) return;
    setGeneratingChapter(chapterIndex);
    setGeneratingType('image');
    setStreamText('');
    setGenerating(true);
    setProgressPercent(0);
    setIsMinimized(false);
    try {
      const res = await fetch('/api/novel/script/image-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scriptId: script.id, chapterIndex, configId: selectedConfigId }),
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';
      let currentSceneText = '';
      let currentSceneTitle = '';
      let scenesToGenerate = 0;
      let completedScenes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.type === 'start') {
                scenesToGenerate = data.scenesToGenerate || data.totalScenes || 1;
                const skipped = data.skippedScenes || 0;
                if (skipped > 0) {
                  showToast(`跳过已生成${skipped}个场景，需生成${scenesToGenerate}个`);
                } else {
                  showToast(`共${scenesToGenerate}个场景，逐个生成...`);
                }
              } else if (data.type === 'scene_start') {
                currentSceneText = '';
                currentSceneTitle = data.sceneTitle || `场景${data.sceneIndex}`;
                setStreamText(`--- 正在生成：${currentSceneTitle} (${data.progress}/${data.total}) ---\n`);
              } else if (data.type === 'content') {
                currentSceneText += data.content;
                setStreamText(`--- 正在生成：${currentSceneTitle} ---\n\n${currentSceneText}`);
                if (scenesToGenerate > 0) {
                  const percent = Math.round((completedScenes / scenesToGenerate) * 100 + (currentSceneText.length / 1500) * (100 / scenesToGenerate));
                  setProgressPercent(Math.min(percent, 98));
                }
              } else if (data.type === 'scene_complete') {
                completedScenes = data.progress;
                const percent = Math.round((completedScenes / scenesToGenerate) * 100);
                setProgressPercent(Math.min(percent, 99));
                await fetchScript();
              } else if (data.type === 'scene_skip') {
                completedScenes = data.progress;
                showToast(`场景${data.sceneIndex}跳过：${data.reason}`);
              } else if (data.type === 'progress') {
                setProgressPercent(Math.min(data.percent, 99));
              } else if (data.type === 'complete' || data.type === 'done') {
                setProgressPercent(100);
                setCompletionMsg('小主已经给您生成完，请查看！');
                speakCompletion('小主已经给您生成完，请查看');
              } else if (data.type === 'error') {
                showToast(data.error);
              }
            } catch {
              // Not valid JSON in SSE data field, skip
            }
          }
        }
      }
      setProgressPercent(100);
      await fetchScript();
    } catch (err) {
      console.error('Generate image prompts error:', err);
      showToast('图片提示词生成失败');
    } finally {
      setGeneratingChapter(null);
      setGeneratingType(null);
      setStreamText('');
      setGenerating(false);
      setProgressPercent(0);
    }
  };

  const handleGenerateVideoPrompts = async (chapterIndex: number) => {
    if (!script || !token) return;
    setGeneratingChapter(chapterIndex);
    setGeneratingType('video');
    setStreamText('');
    setGenerating(true);
    setProgressPercent(0);
    setIsMinimized(false);
    try {
      const res = await fetch('/api/novel/script/video-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scriptId: script.id, chapterIndex, configId: selectedConfigId }),
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';
      let currentSceneText = '';
      let currentSceneTitle = '';
      let scenesToGenerate = 0;
      let completedScenes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.type === 'start') {
                scenesToGenerate = data.scenesToGenerate || data.totalScenes || 1;
                const skipped = data.skippedScenes || 0;
                if (skipped > 0) {
                  showToast(`跳过已生成${skipped}个场景，需生成${scenesToGenerate}个`);
                } else {
                  showToast(`共${scenesToGenerate}个场景，逐个生成...`);
                }
              } else if (data.type === 'scene_start') {
                currentSceneText = '';
                currentSceneTitle = data.sceneTitle || `场景${data.sceneIndex}`;
                setStreamText(`--- 正在生成：${currentSceneTitle} (${data.progress}/${data.total}) ---\n`);
              } else if (data.type === 'content') {
                currentSceneText += data.content;
                setStreamText(`--- 正在生成：${currentSceneTitle} ---\n\n${currentSceneText}`);
                if (scenesToGenerate > 0) {
                  const percent = Math.round((completedScenes / scenesToGenerate) * 100 + (currentSceneText.length / 1500) * (100 / scenesToGenerate));
                  setProgressPercent(Math.min(percent, 98));
                }
              } else if (data.type === 'scene_complete') {
                completedScenes = data.progress;
                const percent = Math.round((completedScenes / scenesToGenerate) * 100);
                setProgressPercent(Math.min(percent, 99));
                await fetchScript();
              } else if (data.type === 'scene_skip') {
                completedScenes = data.progress;
                showToast(`场景${data.sceneIndex}跳过：${data.reason}`);
              } else if (data.type === 'progress') {
                setProgressPercent(Math.min(data.percent, 99));
              } else if (data.type === 'complete' || data.type === 'done') {
                setProgressPercent(100);
                setCompletionMsg('小主已经给您生成完，请查看！');
                speakCompletion('小主已经给您生成完，请查看');
              } else if (data.type === 'error') {
                showToast(data.error);
              }
            } catch {
              // Not valid JSON in SSE data field, skip
            }
          }
        }
      }
      setProgressPercent(100);
      await fetchScript();
    } catch (err) {
      console.error('Generate video prompts error:', err);
      showToast('视频提示词生成失败');
    } finally {
      setGeneratingChapter(null);
      setGeneratingType(null);
      setStreamText('');
      setGenerating(false);
      setProgressPercent(0);
    }
  };

  const copyToClipboard = (text: string, label?: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast(label ? `${label}已复制` : '已复制到剪贴板');
    });
  };

  const copyAllPrompts = (chapter: ScriptChapter, type: 'image' | 'video') => {
    const prompts = type === 'image' ? chapter.imagePrompts : chapter.videoPrompts;
    if (!prompts || prompts.length === 0) return;
    const text = prompts.map((p, i) => {
      if (type === 'image') {
        const ip = p as ImagePrompt;
        return `【分镜${i + 1}】${ip.description}\n提示词：${ip.prompt}\n反向提示词：${ip.negativePrompt}\n风格：${ip.style}`;
      } else {
        const vp = p as VideoPrompt;
        return `【镜头${i + 1}】${vp.subShot > 1 ? `子镜头${vp.subShot} ` : ''}${vp.description}\n${vp.dialogueRange ? `对白: ${vp.dialogueRange}\n` : ''}提示词：${vp.prompt}\n镜头运动：${vp.cameraMovement}\n时长：${vp.duration}\n风格：${vp.style}`;
      }
    }).join('\n\n---\n\n');
    copyToClipboard(text, type === 'image' ? '图片提示词' : '视频提示词');
  };

  const handleSaveEdit = async () => {
    if (!script || !editingPrompt || !token) return;
    const { chapterIndex, type, promptIndex } = editingPrompt;
    const chapters = [...script.chapters];
    const chapter = { ...chapters[chapterIndex] };
    if (type === 'image' && chapter.imagePrompts) {
      const prompts = [...chapter.imagePrompts];
      prompts[promptIndex] = { ...prompts[promptIndex], prompt: editValue };
      chapter.imagePrompts = prompts;
    } else if (type === 'video' && chapter.videoPrompts) {
      const prompts = [...chapter.videoPrompts];
      prompts[promptIndex] = { ...prompts[promptIndex], prompt: editValue };
      chapter.videoPrompts = prompts;
    }
    chapters[chapterIndex] = chapter;
    try {
      await fetch('/api/novel/script', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scriptId: script.id, chapters }),
      });
      setScript({ ...script, chapters });
      showToast('修改已保存');
    } catch (err) {
      console.error('Save edit error:', err);
    }
    setEditingPrompt(null);
    setEditValue('');
  };

  const toggleChapter = (index: number) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const deleteScript = async () => {
    if (!script || !token) return;
    if (!confirm('确定删除此剧本？删除后不可恢复。')) return;
    try {
      await fetch(`/api/novel/script?scriptId=${script.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setScript(null);
      showToast('剧本已删除');
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleSaveScene = async () => {
    if (!script || !editingScene || !editSceneData || !token) return;
    const { chapterIndex, sceneIndex } = editingScene;
    const chapters = [...script.chapters];
    const chapter = { ...chapters[chapterIndex] };
    const screenplay = { ...chapter.screenplay, scenes: [...(chapter.screenplay?.scenes || [])] };
    const sceneIdx = screenplay.scenes.findIndex((s: Scene) => s.sceneIndex === sceneIndex);
    if (sceneIdx >= 0) {
      screenplay.scenes[sceneIdx] = editSceneData;
    }
    chapter.screenplay = screenplay;
    chapters[chapterIndex] = chapter;
    try {
      await fetch('/api/novel/script', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scriptId: script.id, chapters }),
      });
      setScript({ ...script, chapters });
      showToast('场景修改已保存');
    } catch (err) {
      console.error('Save scene error:', err);
    }
    setEditingScene(null);
    setEditSceneData(null);
  };

  const openSceneEditor = (chapterIndex: number, scene: Scene) => {
    setEditingScene({ chapterIndex, sceneIndex: scene.sceneIndex });
    setEditSceneData({ ...scene, dialogues: scene.dialogues?.map(d => ({ ...d })) || [] });
  };

  const handleDeletePrompt = async (chapterIndex: number, type: 'image' | 'video', promptIndex: number) => {
    if (!script || !token) return;
    if (!confirm('确定删除此提示词？')) return;
    const chapters = [...script.chapters];
    const chapter = { ...chapters[chapterIndex] };
    if (type === 'image' && chapter.imagePrompts) {
      const prompts = [...chapter.imagePrompts];
      prompts.splice(promptIndex, 1);
      chapter.imagePrompts = prompts.length > 0 ? prompts : null;
    } else if (type === 'video' && chapter.videoPrompts) {
      const prompts = [...chapter.videoPrompts];
      prompts.splice(promptIndex, 1);
      chapter.videoPrompts = prompts.length > 0 ? prompts : null;
    }
    chapters[chapterIndex] = chapter;
    try {
      await fetch('/api/novel/script', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scriptId: script.id, chapters }),
      });
      setScript({ ...script, chapters });
      showToast('提示词已删除');
    } catch (err) {
      console.error('Delete prompt error:', err);
    }
  };

  const handleDeleteAllImagePrompts = async () => {
    if (!script || !token) return;
    if (!confirm('确定删除全部分镜图片提示词？此操作不可恢复。')) return;
    const chapters = script.chapters.map((ch: ScriptChapter) => ({ ...ch, imagePrompts: null }));
    try {
      await fetch('/api/novel/script', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scriptId: script.id, chapters }),
      });
      setScript({ ...script, chapters });
      showToast('全部分镜图片提示词已删除');
    } catch (err) {
      console.error('Delete all image prompts error:', err);
    }
  };

  const handleDeleteAllVideoPrompts = async () => {
    if (!script || !token) return;
    if (!confirm('确定删除全部视频提示词？此操作不可恢复。')) return;
    const chapters = script.chapters.map((ch: ScriptChapter) => ({ ...ch, videoPrompts: null }));
    try {
      await fetch('/api/novel/script', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scriptId: script.id, chapters }),
      });
      setScript({ ...script, chapters });
      showToast('全部视频提示词已删除');
    } catch (err) {
      console.error('Delete all video prompts error:', err);
    }
  };

  // ===== Download helpers =====
  const getScreenplayText = (chapter: ScriptChapter) => {
    if (!chapter.screenplay?.scenes) return '';
    const scenes = chapter.screenplay.scenes;
    let text = `第${chapter.chapterIndex + 1}章 ${chapter.chapterTitle || ''}\n`;
    text += `${'='.repeat(40)}\n\n`;
    if (chapter.screenplay.summary) {
      text += `【章节概要】\n${chapter.screenplay.summary}\n\n`;
    }
    scenes.forEach((s: Scene) => {
      text += `【场景${s.sceneIndex}】${s.sceneTitle}\n`;
      text += `${'─'.repeat(30)}\n`;
      if (s.description) text += `[场景描述] ${s.description}\n\n`;
      if (s.actions) text += `[角色动作] ${s.actions}\n\n`;
      const normalizedDialogues = normalizeDialogues(s.dialogues);
      if (normalizedDialogues.length > 0) {
        text += `[对白]\n`;
        normalizedDialogues.forEach((d: any) => {
          text += `  ${d.character}：「${d.line}」${d.direction ? `（${d.direction}）` : ''}\n`;
        });
        text += '\n';
      }
      if (s.stageDirections) text += `[舞台指示] ${s.stageDirections}\n\n`;
    });
    return text;
  };

  const getImagePromptsText = (chapter: ScriptChapter) => {
    if (!chapter.imagePrompts?.length) return '';
    let text = `第${chapter.chapterIndex + 1}章 ${chapter.chapterTitle || ''} - 分镜图片提示词\n`;
    text += `${'='.repeat(40)}\n\n`;
    chapter.imagePrompts.forEach((ip: ImagePrompt, i: number) => {
      text += `【分镜${i + 1}】场景${ip.sceneIndex} · ${ip.shotType}\n`;
      text += `${'─'.repeat(30)}\n`;
      if (ip.description) text += `描述：${ip.description}\n`;
      text += `提示词：${ip.prompt}\n`;
      if (ip.negativePrompt) text += `反向提示词：${ip.negativePrompt}\n`;

      if (ip.style) text += `风格：${ip.style}\n`;
      text += '\n';
    });
    return text;
  };

  const getVideoPromptsText = (chapter: ScriptChapter) => {
    if (!chapter.videoPrompts?.length) return '';
    let text = `第${chapter.chapterIndex + 1}章 ${chapter.chapterTitle || ''} - 视频提示词\n`;
    text += `${'='.repeat(40)}\n\n`;
    chapter.videoPrompts.forEach((vp: VideoPrompt, i: number) => {
      text += `【镜头${i + 1}】场景${vp.sceneIndex}${vp.subShot > 1 ? `-子镜头${vp.subShot}` : ''}\n`;
      text += `${'─'.repeat(30)}\n`;
      if (vp.dialogueRange) text += `对白范围：${vp.dialogueRange}\n`;
      if (vp.description) text += `描述：${vp.description}\n`;
      if (vp.startFrame) text += `起始画面：${vp.startFrame}\n`;
      if (vp.endFrame) text += `结束画面：${vp.endFrame}\n`;
      if (vp.cameraMovement) text += `镜头运动：${vp.cameraMovement}\n`;
      if (vp.action) text += `角色动作：${vp.action}\n`;
      if (vp.duration) text += `时长：${vp.duration}\n`;
      text += `视频提示词：${vp.prompt}\n`;
      if (vp.style) text += `风格：${vp.style}\n`;
      if (vp.transition) text += `转场：${vp.transition}\n`;
      text += '\n';
    });
    return text;
  };

  const downloadTxt = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadZip = async (files: { name: string; content: string }[], zipName: string) => {
    const zip = new JSZip();
    files.forEach(f => zip.file(f.name, f.content));
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadScreenplay = (format: 'txt' | 'zip') => {
    if (!script) return;
    const safeName = novelTitle || '剧本';
    const chaptersWithScreenplay = chapters.filter((ch: ScriptChapter) => ch.screenplay);
    if (chaptersWithScreenplay.length === 0) { showToast('暂无已生成的剧本'); return; }

    if (format === 'txt') {
      const allText = chaptersWithScreenplay.map((ch: ScriptChapter) => getScreenplayText(ch)).join('\n\n' + '═'.repeat(50) + '\n\n');
      downloadTxt(allText, `${safeName}_影视剧本.txt`);
    } else {
      const files = chaptersWithScreenplay.map((ch: ScriptChapter) => ({
        name: `第${ch.chapterIndex + 1}章_${ch.chapterTitle || '剧本'}.txt`,
        content: getScreenplayText(ch),
      }));
      downloadZip(files, `${safeName}_影视剧本.zip`);
    }
    showToast('剧本下载完成');
  };

  const handleDownloadImagePrompts = (format: 'txt' | 'zip') => {
    if (!script) return;
    const safeName = novelTitle || '剧本';
    const chaptersWithImage = chapters.filter((ch: ScriptChapter) => ch.imagePrompts?.length);
    if (chaptersWithImage.length === 0) { showToast('暂无已生成的图片提示词'); return; }

    if (format === 'txt') {
      const allText = chaptersWithImage.map((ch: ScriptChapter) => getImagePromptsText(ch)).join('\n\n' + '═'.repeat(50) + '\n\n');
      downloadTxt(allText, `${safeName}_分镜图片提示词.txt`);
    } else {
      const files = chaptersWithImage.map((ch: ScriptChapter) => ({
        name: `第${ch.chapterIndex + 1}章_图片提示词.txt`,
        content: getImagePromptsText(ch),
      }));
      downloadZip(files, `${safeName}_分镜图片提示词.zip`);
    }
    showToast('图片提示词下载完成');
  };

  const handleDownloadVideoPrompts = (format: 'txt' | 'zip') => {
    if (!script) return;
    const safeName = novelTitle || '剧本';
    const chaptersWithVideo = chapters.filter((ch: ScriptChapter) => ch.videoPrompts?.length);
    if (chaptersWithVideo.length === 0) { showToast('暂无已生成的视频提示词'); return; }

    if (format === 'txt') {
      const allText = chaptersWithVideo.map((ch: ScriptChapter) => getVideoPromptsText(ch)).join('\n\n' + '═'.repeat(50) + '\n\n');
      downloadTxt(allText, `${safeName}_视频提示词.txt`);
    } else {
      const files = chaptersWithVideo.map((ch: ScriptChapter) => ({
        name: `第${ch.chapterIndex + 1}章_视频提示词.txt`,
        content: getVideoPromptsText(ch),
      }));
      downloadZip(files, `${safeName}_视频提示词.zip`);
    }
    showToast('视频提示词下载完成');
  };

  // ===== Render helpers =====
  const renderImagePromptCard = (ip: ImagePrompt, idx: number, chapterIdx: number, originalIndex: number) => (
    <div
      key={ip.id || idx}
      className="bg-sky-950/50 rounded-xl p-3 border border-sky-500/20 hover:border-sky-400/40 transition-all group cursor-pointer hover:bg-sky-900/50"
      onClick={() => setViewPrompt({ type: 'image', data: ip, sceneTitle: `场景 ${ip.sceneIndex}` })}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 bg-sky-500/25 text-sky-200 text-[10px] font-bold rounded">{ip.shotType}</span>

        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button onClick={() => copyToClipboard(ip.prompt, 'Prompt')} className="p-1 text-gray-500 hover:text-sky-400 rounded hover:bg-sky-500/10 transition-colors" title="复制">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>
          <button onClick={() => { setEditingPrompt({ chapterIndex: chapterIdx, type: 'image', promptIndex: originalIndex }); setEditValue(ip.prompt); }} className="p-1 text-gray-500 hover:text-amber-400 rounded hover:bg-amber-500/10 transition-colors" title="编辑">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button onClick={() => handleDeletePrompt(chapterIdx, 'image', originalIndex)} className="p-1 text-gray-500 hover:text-red-400 rounded hover:bg-red-500/10 transition-colors" title="删除">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
      {ip.description && <p className="text-[12px] text-white/85 mb-1.5 font-semibold leading-snug">{ip.description}</p>}
      <p className="text-[11px] text-gray-400/80 leading-[1.75] line-clamp-2">{ip.prompt}</p>
      <div className="mt-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px]">
          {ip.negativePrompt && <span className="text-red-400/50 truncate max-w-[45%]">反向: {ip.negativePrompt}</span>}
          {ip.style && <span className="text-gray-600 truncate">风格: {ip.style}</span>}
        </div>
        <span className="text-[9px] text-sky-400/30 group-hover:text-sky-400/60 transition-colors">放大</span>
      </div>
    </div>
  );

  const renderVideoPromptCard = (vp: VideoPrompt, vi: number, chapterIdx: number, originalIndex: number, sceneDialogues?: Array<{character: string; line: string}>) => (
    <div
      key={vp.id || vi}
      className="bg-violet-950/50 rounded-xl p-3 border border-violet-500/20 hover:border-violet-400/40 transition-all group cursor-pointer hover:bg-violet-900/50"
      onClick={() => setViewPrompt({ type: 'video', data: vp, sceneTitle: `场景 ${vp.sceneIndex}`, sceneDialogues })}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {vp.subShot > 1 && <span className="px-1.5 py-0.5 bg-blue-500/25 text-blue-200 text-[10px] font-bold rounded">子镜头{vp.subShot}</span>}
          <span className="px-1.5 py-0.5 bg-violet-500/25 text-violet-200 text-[10px] font-bold rounded">{vp.duration}</span>
          {vp.dialogueRange && <span className="px-1.5 py-0.5 bg-amber-500/25 text-amber-200 text-[10px] font-bold rounded">对白{vp.dialogueRange}</span>}
          {vp.transition && <span className="text-[10px] text-gray-600 font-mono">{vp.transition}</span>}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button onClick={() => copyToClipboard(vp.prompt, 'Prompt')} className="p-1 text-gray-500 hover:text-violet-400 rounded hover:bg-violet-500/10 transition-colors" title="复制">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>
          <button onClick={() => { setEditingPrompt({ chapterIndex: chapterIdx, type: 'video', promptIndex: originalIndex }); setEditValue(vp.prompt); }} className="p-1 text-gray-500 hover:text-amber-400 rounded hover:bg-amber-500/10 transition-colors" title="编辑">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button onClick={() => handleDeletePrompt(chapterIdx, 'video', originalIndex)} className="p-1 text-gray-500 hover:text-red-400 rounded hover:bg-red-500/10 transition-colors" title="删除">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
      {vp.description && <p className="text-[12px] text-white/85 mb-1.5 font-semibold leading-snug">{vp.description}</p>}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-1.5 text-[10px]">
        {vp.cameraMovement && <div><span className="text-gray-600">镜头</span><p className="text-gray-300/70 mt-0.5">{vp.cameraMovement}</p></div>}
        {vp.action && <div><span className="text-gray-600">动作</span><p className="text-gray-300/70 mt-0.5">{vp.action}</p></div>}
      </div>
      <p className="text-[11px] text-gray-400/80 leading-[1.75] line-clamp-2">{vp.prompt}</p>
      <div className="mt-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px]">
          {vp.startFrame && <span className="text-gray-600 truncate max-w-[45%]">起: {vp.startFrame}</span>}
          {vp.style && <span className="text-gray-600 truncate">风格: {vp.style}</span>}
        </div>
        <span className="text-[9px] text-violet-400/30 group-hover:text-violet-400/60 transition-colors">放大</span>
      </div>
    </div>
  );

  // ===== Loading / Error states =====
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-950 to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  if (!novelId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-950 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg mb-4">未指定小说</p>
          <button onClick={() => router.push('/my-novels')} className="px-6 py-2 bg-amber-600 text-white rounded-xl">返回小说库</button>
        </div>
      </div>
    );
  }

  const chapters = script?.chapters || [];
  const completedScreenplays = chapters.filter((ch: ScriptChapter) => ch.screenplay).length;
  const completedImagePrompts = chapters.filter((ch: ScriptChapter) => ch.imagePrompts && ch.imagePrompts.length > 0).length;
  const completedVideoPrompts = chapters.filter((ch: ScriptChapter) => ch.videoPrompts && ch.videoPrompts.length > 0).length;

  return (
    <div className="min-h-screen text-white" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #0d1b2a 100%)' }}>
      {/* 背景装饰 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-600/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-orange-600/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-0 w-64 h-64 bg-yellow-600/6 rounded-full blur-3xl" />
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 bg-emerald-600 text-white rounded-xl shadow-2xl shadow-emerald-600/30 text-sm font-bold animate-bounce">
          {toastMsg}
        </div>
      )}

      {/* Completion dialog */}
      {completionMsg && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 border border-emerald-500/30 rounded-2xl shadow-2xl shadow-emerald-500/10 p-8 max-w-sm mx-4 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white text-base font-semibold leading-relaxed">{completionMsg}</p>
            <p className="text-gray-400 text-xs mt-2">页面已自动刷新，可在下方查看生成结果</p>
            <button
              onClick={() => setCompletionMsg('')}
              className="mt-6 px-8 py-2.5 bg-gradient-to-r from-emerald-500 to-green-500 text-white text-sm font-semibold rounded-xl hover:from-emerald-400 hover:to-green-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 backdrop-blur-xl sticky top-0" style={{ background: 'rgba(15,12,41,0.85)' }}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/my-novels" className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/15 border border-purple-500/25 text-purple-400 rounded-lg hover:bg-purple-500/25 transition-colors text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              我的小说
            </Link>
            <Link href="/scripts" className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 border border-amber-500/25 text-amber-400 rounded-lg hover:bg-amber-500/25 transition-colors text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
              我的剧本
            </Link>
            <Link href="/short-dramas" className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/15 border border-violet-500/25 text-violet-400 rounded-lg hover:bg-violet-500/25 transition-colors text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              短剧制作
            </Link>
            {userInfo?.role === 'admin' && (
              <Link href="/admin/members" className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 border border-red-500/25 text-red-400 rounded-lg hover:bg-red-500/25 transition-colors text-xs font-medium">管理后台</Link>
            )}
          </div>
          <div className="flex items-center gap-1 px-4 py-2 rounded-xl border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
            <span className="text-white font-bold text-sm">创世纪联盟</span>
          </div>
          <div className="flex items-center gap-3">
            {userInfo ? (
              <>
                <Link href="/member" className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 transition-colors text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                  会员中心
                </Link>
                <button onClick={() => setShowAiConfigModal(true)} className="flex items-center gap-1.5 text-gray-400 hover:text-purple-400 transition-colors text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  API设置
                </button>
                <button onClick={() => { localStorage.removeItem('accessToken'); localStorage.removeItem('token'); localStorage.removeItem('refreshToken'); localStorage.removeItem('user'); localStorage.removeItem('auth-storage'); window.location.href = '/'; }} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 border border-red-500/25 text-red-400 rounded-lg hover:bg-red-500/25 transition-colors text-xs font-medium">退出</button>
              </>
            ) : (
              <Link href="/auth/login" className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors text-xs font-medium">登录</Link>
            )}
          </div>
        </div>
      </header>

      {/* Sub-header: 剧本信息 + 操作按钮 */}
      <div className="relative z-10 border-b border-white/5" style={{ background: 'rgba(15,12,41,0.5)' }}>
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg sm:text-xl font-black bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500 bg-clip-text text-transparent">{novelTitle ? `《${novelTitle}》` : '剧本工坊'}</h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-[11px] text-gray-600 tracking-wider">SCRIPT &middot; STORYBOARD &middot; PROMPTS</p>
                {novelWordCount > 0 && (
                  <span className="text-base font-bold text-amber-400">{novelWordCount.toLocaleString()}<span className="text-sm font-medium text-amber-400/80"> 字</span></span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {script && script.status === 'completed' && (
                <div className="hidden sm:flex items-center gap-3 flex-wrap">
                  {/* 统计徽章 - 将 0 的隐藏 */}
                  <div className="flex items-center gap-2.5 text-sm mr-1">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />剧本 {completedScreenplays}/{chapters.length}</span>
                    {completedImagePrompts > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500" />图片 {completedImagePrompts}/{chapters.length}</span>}
                    {completedVideoPrompts > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500" />视频 {completedVideoPrompts}/{chapters.length}</span>}
                  </div>
                  {/* 下载按鈕组 */}
                  {completedScreenplays > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-emerald-400/70 font-bold">剧本</span>
                      <button onClick={() => handleDownloadScreenplay('txt')} className="px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold rounded transition-all">TXT</button>
                      <button onClick={() => handleDownloadScreenplay('zip')} className="px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold rounded transition-all">ZIP</button>
                    </div>
                  )}
                  {completedImagePrompts > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-sky-400/70 font-bold">图片</span>
                      <button onClick={() => handleDownloadImagePrompts('txt')} className="px-2 py-1 bg-sky-500/15 hover:bg-sky-500/30 text-sky-300 text-xs font-bold rounded transition-all">TXT</button>
                      <button onClick={() => handleDownloadImagePrompts('zip')} className="px-2 py-1 bg-sky-500/15 hover:bg-sky-500/30 text-sky-300 text-xs font-bold rounded transition-all">ZIP</button>
                    </div>
                  )}
                  {completedVideoPrompts > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-violet-400/70 font-bold">视频</span>
                      <button onClick={() => handleDownloadVideoPrompts('txt')} className="px-2 py-1 bg-violet-500/15 hover:bg-violet-500/30 text-violet-300 text-xs font-bold rounded transition-all">TXT</button>
                      <button onClick={() => handleDownloadVideoPrompts('zip')} className="px-2 py-1 bg-violet-500/15 hover:bg-violet-500/30 text-violet-300 text-xs font-bold rounded transition-all">ZIP</button>
                    </div>
                  )}
                </div>
              )}
              {script && (
                <button onClick={deleteScript} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="删除剧本">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              )}
              {!script || script.status !== 'generating' ? (
                <button
                  onClick={() => handleGenerateScript()}
                  disabled={generating}
                  className="px-4 sm:px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl text-sm font-bold hover:from-amber-600 hover:to-orange-700 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2"
                >
                  {generating ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{generatingType === 'image' ? '图片生成中' : generatingType === 'video' ? '视频生成中' : '剧本生成中'}</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{script ? '重新生成' : '生成剧本'}</>
                  )}
                </button>
              ) : (
                <span className="px-4 py-2.5 bg-amber-500/10 text-amber-400 rounded-xl text-sm font-bold flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />生成中
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stream overlay - show full panel only when no chapters exist yet */}
      {(generating || streamText) && (
        <>
          {!script || chapters.length === 0 ? (
            isMinimized ? (
              <div
                className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl cursor-pointer hover:border-white/20 transition-all"
                onClick={() => setIsMinimized(false)}
              >
                <div className="relative">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                    {generatingType === 'image' ? (
                      <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    ) : generatingType === 'video' ? (
                      <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    ) : (
                      <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    )}
                  </div>
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-white">{generatingType === 'image' ? '图片提示词' : generatingType === 'video' ? '视频提示词' : '影视剧本'}生成中</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-300 ${generatingType === 'image' ? 'bg-gradient-to-r from-sky-500 to-sky-400' : generatingType === 'video' ? 'bg-gradient-to-r from-violet-500 to-violet-400' : 'bg-gradient-to-r from-amber-500 to-orange-500'}`} style={{ width: `${progressPercent}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">{progressPercent}%</span>
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-500 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
              </div>
            ) : (
            /* Full panel for first-time generation */
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="w-full max-w-2xl mx-4 bg-gradient-to-b from-slate-900/98 to-slate-950/98 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                {/* Progress header */}
                <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          generatingType === 'image' ? 'bg-gradient-to-br from-sky-500/20 to-blue-500/20' :
                          generatingType === 'video' ? 'bg-gradient-to-br from-violet-500/20 to-purple-500/20' :
                          'bg-gradient-to-br from-amber-500/20 to-orange-500/20'
                        }`}>
                          {generatingType === 'image' ? (
                            <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          ) : generatingType === 'video' ? (
                            <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          ) : (
                            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          )}
                        </div>
                        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-sm">
                          {generatingType === 'image' ? '分镜图片提示词' : generatingType === 'video' ? '视频提示词' : '影视剧本'}生成中
                          {totalChaptersToGenerate > 0 && generatingType === 'screenplay' && (
                            <span className="text-gray-500 font-normal ml-2">({completedChaptersCount}/{totalChaptersToGenerate} 章)</span>
                          )}
                        </h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {generatingType === 'image' ? 'AI 正在分析场景生成未完成的图片提示词...' : generatingType === 'video' ? 'AI 正在分析场景生成未完成的视频提示词...' : 'AI 正在将小说转化为影视剧本...'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Minimize button */}
                      <button
                        onClick={() => setIsMinimized(true)}
                        className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                        title="缩小"
                      >
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>
                  </div>
                  {/* Progress bar with percentage */}
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          progressPercent >= 100 ? 'bg-gradient-to-r from-emerald-500 to-green-400' :
                          generatingType === 'image' ? 'bg-gradient-to-r from-sky-500 to-sky-400' :
                          generatingType === 'video' ? 'bg-gradient-to-r from-violet-500 to-violet-400' :
                          'bg-gradient-to-r from-amber-500 to-orange-500'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <span className={`text-sm font-bold font-mono min-w-[3rem] text-right ${
                      progressPercent >= 100 ? 'text-emerald-400' :
                      generatingType === 'image' ? 'text-sky-400' :
                      generatingType === 'video' ? 'text-violet-400' :
                      'text-amber-400'
                    }`}>
                      {progressPercent}%
                    </span>
                  </div>
                </div>
                {/* Typing content area */}
                <div className="p-6 max-h-[50vh] overflow-auto">
                  <div className="min-h-[120px]">
                    <MatrixStream text={streamText.slice(-2000)} />
                  </div>
                </div>
                {/* Footer hint */}
                <div className="px-6 py-3 bg-slate-900/50 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] text-green-400/60 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_6px_#22c55e]" />
                    {progressPercent >= 100 ? '生成完成' : '实时生成中，内容持续更新'}
                  </span>
                  <span className="text-[11px] text-green-400/60 font-mono">
                    已生成 {streamText.length} 字
                  </span>
                </div>
              </div>
            </div>
            )
          ) : (
            /* Slim floating progress bar when chapters already exist */
            isMinimized ? (
              <div
                className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl cursor-pointer hover:border-white/20 transition-all"
                onClick={() => setIsMinimized(false)}
              >
                <div className="relative">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                    {generatingType === 'image' ? (
                      <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    ) : generatingType === 'video' ? (
                      <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    ) : (
                      <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    )}
                  </div>
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-white">
                    {generatingType === 'image' ? '图片提示词' : generatingType === 'video' ? '视频提示词' : '影视剧本'}生成中
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          generatingType === 'image' ? 'bg-gradient-to-r from-sky-500 to-sky-400' :
                          generatingType === 'video' ? 'bg-gradient-to-r from-violet-500 to-violet-400' :
                          'bg-gradient-to-r from-amber-500 to-orange-500'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">{progressPercent}%</span>
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-500 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
              </div>
            ) : (
              /* Expanded inline progress panel */
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="w-full max-w-2xl mx-4 bg-gradient-to-b from-slate-900/98 to-slate-950/98 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                  <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-white/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            generatingType === 'image' ? 'bg-gradient-to-br from-sky-500/20 to-blue-500/20' :
                            generatingType === 'video' ? 'bg-gradient-to-br from-violet-500/20 to-purple-500/20' :
                            'bg-gradient-to-br from-amber-500/20 to-orange-500/20'
                          }`}>
                            {generatingType === 'image' ? (
                              <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            ) : generatingType === 'video' ? (
                              <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            ) : (
                              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            )}
                          </div>
                          <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-sm">
                            {generatingType === 'image' ? '分镜图片提示词' : generatingType === 'video' ? '视频提示词' : '影视剧本'}生成中
                          </h3>
                          <p className="text-[11px] text-gray-500 mt-0.5">可查看下方已生成的场景，继续等待中...</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setIsMinimized(true)} className="p-2 hover:bg-white/5 rounded-lg transition-colors" title="缩小">
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            progressPercent >= 100 ? 'bg-gradient-to-r from-emerald-500 to-green-400' :
                            generatingType === 'image' ? 'bg-gradient-to-r from-sky-500 to-sky-400' :
                            generatingType === 'video' ? 'bg-gradient-to-r from-violet-500 to-violet-400' :
                            'bg-gradient-to-r from-amber-500 to-orange-500'
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <span className={`text-sm font-bold font-mono min-w-[3rem] text-right ${
                        progressPercent >= 100 ? 'text-emerald-400' :
                        generatingType === 'image' ? 'text-sky-400' :
                        generatingType === 'video' ? 'text-violet-400' :
                        'text-amber-400'
                      }`}>{progressPercent}%</span>
                    </div>
                  </div>
                  <div className="p-6 max-h-[40vh] overflow-auto">
                    <div className="min-h-[80px]">
                      <MatrixStream text={streamText.slice(-1500)} />
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </>
      )}

      {/* Edit Modal */}
      {editingPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setEditingPrompt(null); setEditValue(''); }}>
          <div className="w-full max-w-2xl mx-4 bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">编辑提示词</h3>
              <button onClick={() => { setEditingPrompt(null); setEditValue(''); }} className="p-2 hover:bg-white/5 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={10}
              className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500/50 resize-none"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setEditingPrompt(null); setEditValue(''); }} className="px-5 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl text-sm transition-colors">取消</button>
              <button onClick={handleSaveEdit} className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl text-sm font-bold shadow-lg">保存修改</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Scene Editor Modal ===== */}
      {editingScene && editSceneData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setEditingScene(null); setEditSceneData(null); }}>
          <div className="w-full max-w-3xl mx-4 max-h-[85vh] overflow-auto bg-gradient-to-b from-slate-900 to-slate-950 border border-white/10 rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-base">📜</span>
                <div>
                  <h3 className="font-bold text-lg">编辑场景 {editSceneData.sceneIndex}</h3>
                  <p className="text-xs text-gray-500">修改场景内容后点击保存</p>
                </div>
              </div>
              <button onClick={() => { setEditingScene(null); setEditSceneData(null); }} className="p-2 hover:bg-white/5 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="space-y-4">
              {/* Scene title */}
              <div>
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5 block">场景标题</label>
                <input
                  value={editSceneData.sceneTitle}
                  onChange={(e) => setEditSceneData({ ...editSceneData, sceneTitle: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50"
                  placeholder="如：内景 客厅 日"
                />
              </div>
              {/* Description */}
              <div>
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5 block">场景描述</label>
                <textarea
                  value={editSceneData.description || ''}
                  onChange={(e) => setEditSceneData({ ...editSceneData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50 resize-none"
                  placeholder="环境、氛围、道具、光影描写"
                />
              </div>
              {/* Actions */}
              <div>
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5 block">角色动作</label>
                <textarea
                  value={editSceneData.actions || ''}
                  onChange={(e) => setEditSceneData({ ...editSceneData, actions: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50 resize-none"
                  placeholder="角色行为、表情、肢体语言"
                />
              </div>
              {/* Dialogues */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">对白</label>
                  <button
                    onClick={() => setEditSceneData({
                      ...editSceneData,
                      dialogues: [...(editSceneData.dialogues || []), { character: '', line: '', direction: '' }]
                    })}
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 px-2 py-1 hover:bg-emerald-500/10 rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    添加对白
                  </button>
                </div>
                <div className="space-y-2">
                  {(editSceneData.dialogues || []).map((d, di) => (
                    <div key={di} className="flex items-start gap-2 bg-slate-800/50 rounded-lg p-3 border border-white/5">
                      <input
                        value={d.character}
                        onChange={(e) => {
                          const newDialogues = [...(editSceneData.dialogues || [])];
                          newDialogues[di] = { ...newDialogues[di], character: e.target.value };
                          setEditSceneData({ ...editSceneData, dialogues: newDialogues });
                        }}
                        className="w-24 px-2.5 py-1.5 bg-slate-700 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500/50 shrink-0"
                        placeholder="角色名"
                      />
                      <input
                        value={d.line}
                        onChange={(e) => {
                          const newDialogues = [...(editSceneData.dialogues || [])];
                          newDialogues[di] = { ...newDialogues[di], line: e.target.value };
                          setEditSceneData({ ...editSceneData, dialogues: newDialogues });
                        }}
                        className="flex-1 px-2.5 py-1.5 bg-slate-700 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500/50"
                        placeholder="台词内容"
                      />
                      <button
                        onClick={() => {
                          const newDialogues = (editSceneData.dialogues || []).filter((_, i) => i !== di);
                          setEditSceneData({ ...editSceneData, dialogues: newDialogues });
                        }}
                        className="p-1.5 text-gray-600 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              {/* Stage directions */}
              <div>
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5 block">舞台指示</label>
                <textarea
                  value={editSceneData.stageDirections || ''}
                  onChange={(e) => setEditSceneData({ ...editSceneData, stageDirections: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50 resize-none"
                  placeholder="音效、转场、特效提示"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/5">
              <button onClick={() => { setEditingScene(null); setEditSceneData(null); }} className="px-5 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl text-sm transition-colors">取消</button>
              <button onClick={handleSaveScene} className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all">保存修改</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== View Prompt Modal (enlarge) ===== */}
      {viewPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={() => setViewPrompt(null)}>
          <div className="w-full max-w-3xl mx-4 max-h-[85vh] overflow-auto bg-gradient-to-b from-slate-900 to-slate-950 border border-white/10 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {viewPrompt.type === 'image' ? (
                  <span className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center text-base">🖼️</span>
                ) : (
                  <span className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center text-base">🎥</span>
                )}
                <div>
                  <h3 className="font-bold text-base">{viewPrompt.type === 'image' ? '分镜图片提示词' : '视频提示词'}</h3>
                  {viewPrompt.sceneTitle && <p className="text-xs text-gray-500">{viewPrompt.sceneTitle}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const d = viewPrompt.data;
                    copyToClipboard(d.prompt, '提示词');
                  }}
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  复制
                </button>
                <button onClick={() => setViewPrompt(null)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="p-6">
              {viewPrompt.type === 'image' ? (() => {
                const ip = viewPrompt.data as ImagePrompt;
                return (
                  <div className="space-y-5">
                    {/* Tags */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-3 py-1 bg-sky-500/25 text-sky-200 text-xs font-bold rounded-lg">{ip.shotType}</span>

                      {ip.style && <span className="px-3 py-1 bg-white/5 text-gray-400 text-xs rounded-lg">{ip.style}</span>}
                    </div>
                    {/* Description */}
                    {ip.description && (
                      <div>
                        <h4 className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5">描述</h4>
                        <p className="text-base text-white/90 font-semibold leading-relaxed">{ip.description}</p>
                      </div>
                    )}
                    {/* Prompt */}
                    <div>
                      <h4 className="text-xs text-sky-400 font-bold uppercase tracking-wider mb-1.5">提示词</h4>
                      <div className="bg-sky-900/40 border border-sky-500/20 rounded-xl p-4">
                        <p className="text-sm text-gray-200 leading-[2] whitespace-pre-wrap">{ip.prompt}</p>
                      </div>
                    </div>
                    {/* Negative Prompt */}
                    {ip.negativePrompt && (
                      <div>
                        <h4 className="text-xs text-red-400/60 font-bold uppercase tracking-wider mb-1.5">反向提示词</h4>
                        <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4">
                          <p className="text-sm text-gray-400 leading-[2] whitespace-pre-wrap">{ip.negativePrompt}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })() : (() => {
                const vp = viewPrompt.data as VideoPrompt;
                return (
                  <div className="space-y-5">
                    {/* Tags */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {vp.subShot > 1 && <span className="px-3 py-1 bg-orange-500/25 text-orange-200 text-xs font-bold rounded-lg">子镜头 {vp.subShot}</span>}
                      <span className="px-3 py-1 bg-violet-500/25 text-violet-200 text-xs font-bold rounded-lg">{vp.duration}</span>
                      {vp.dialogueRange && <span className="px-3 py-1 bg-cyan-500/25 text-cyan-200 text-xs rounded-lg">{vp.dialogueRange}</span>}
                      {vp.transition && <span className="px-3 py-1 bg-white/5 text-gray-400 text-xs rounded-lg font-mono">{vp.transition}</span>}
                      {vp.style && <span className="px-3 py-1 bg-white/5 text-gray-400 text-xs rounded-lg">{vp.style}</span>}
                    </div>
                    {/* Description */}
                    {vp.description && (
                      <div>
                        <h4 className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5">描述</h4>
                        <p className="text-base text-white/90 font-semibold leading-relaxed">{vp.description}</p>
                      </div>
                    )}
                    {/* Details grid */}
                    <div className="grid grid-cols-2 gap-4">
                      {vp.startFrame && (
                        <div className="bg-violet-900/40 border border-violet-500/20 rounded-xl p-4">
                          <h4 className="text-base font-extrabold mb-1.5 bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">起始画面</h4>
                          <p className="text-sm text-gray-200 leading-relaxed">{vp.startFrame}</p>
                        </div>
                      )}
                      {vp.endFrame && (
                        <div className="bg-violet-900/40 border border-violet-500/20 rounded-xl p-4">
                          <h4 className="text-base font-extrabold mb-1.5 bg-gradient-to-r from-purple-400 to-pink-300 bg-clip-text text-transparent">结束画面</h4>
                          <p className="text-sm text-gray-200 leading-relaxed">{vp.endFrame}</p>
                        </div>
                      )}
                      {vp.cameraMovement && (
                        <div className="bg-violet-900/40 border border-violet-500/20 rounded-xl p-4">
                          <h4 className="text-base font-extrabold mb-1.5 bg-gradient-to-r from-amber-400 to-orange-300 bg-clip-text text-transparent">镜头运动</h4>
                          <p className="text-sm text-gray-200 leading-relaxed">{vp.cameraMovement}</p>
                        </div>
                      )}
                      {vp.action && (
                        <div className="bg-violet-900/40 border border-violet-500/20 rounded-xl p-4">
                          <h4 className="text-base font-extrabold mb-1.5 bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">角色动作</h4>
                          <p className="text-sm text-gray-200 leading-relaxed">{vp.action}</p>
                        </div>
                      )}
                      {(() => {
                        const rawDialogues = (vp.dialogues && vp.dialogues.length > 0) ? vp.dialogues : (viewPrompt.sceneDialogues && viewPrompt.sceneDialogues.length > 0 ? viewPrompt.sceneDialogues : null);
                        const dialogues = normalizeDialogues(rawDialogues);
                        return dialogues.length > 0 ? (
                        <div className="bg-violet-900/40 border border-violet-500/20 rounded-xl p-4">
                          <h4 className="text-base font-extrabold mb-1.5 bg-gradient-to-r from-rose-400 to-fuchsia-300 bg-clip-text text-transparent">角色对话</h4>
                          <div className="space-y-1.5">
                            {dialogues.map((d: any, di: number) => (
                              <div key={di} className="flex items-start gap-2 text-sm">
                                <span className="text-rose-300 font-bold shrink-0">{d.character}：</span>
                                <span className="text-gray-200">{d.line}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        ) : null;
                      })()}
                    </div>
                    {/* Prompt */}
                    <div>
                      <h4 className="text-xs text-violet-400 font-bold uppercase tracking-wider mb-1.5">视频提示词</h4>
                      <div className="bg-violet-900/40 border border-violet-500/20 rounded-xl p-4">
                        <p className="text-sm text-gray-200 leading-[2] whitespace-pre-wrap">{vp.prompt}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Sleek, compact model status bar */}
        {!generating && (
          <div className="bg-slate-900/40 border border-white/[0.04] rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 mb-6">
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
                  className="bg-slate-950/60 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-500/50 cursor-pointer"
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

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCustomPromptModal(true)}
                className={`px-4 py-1.5 border rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 hover:shadow-lg ${
                  customPromptEnabled
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 hover:shadow-emerald-500/10'
                    : 'bg-slate-800 border-white/5 text-gray-300 hover:text-white hover:bg-slate-750'
                }`}
              >
                ⚙️ {customPromptEnabled ? '自定义剧本提示词（已启用）' : '自定义剧本提示词（未启用）'}
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {(!script || chapters.length === 0) && !generating && (
          <div className="text-center py-24">
            <div className="w-24 h-24 mx-auto mb-8 rounded-3xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center">
              <span className="text-5xl">🎬</span>
            </div>
            <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-amber-200 to-orange-300 bg-clip-text text-transparent">剧本工坊</h2>
            <p className="text-gray-500 mb-10 max-w-lg mx-auto leading-relaxed">
              将小说章节转化为专业影视剧本，<br />自动生成分镜图片提示词和视频提示词
            </p>
            <button
              onClick={() => handleGenerateScript()}
              className="px-10 py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-2xl text-lg font-bold hover:from-amber-600 hover:to-orange-700 transition-all shadow-xl shadow-amber-500/20 hover:shadow-amber-500/30 hover:scale-105 active:scale-95"
            >
              开始生成剧本
            </button>
          </div>
        )}

        {/* Generating state - show when generating and no stream overlay visible */}
        {generating && !script && !streamText && (
          <div className="text-center py-24">
            <div className="w-20 h-20 mx-auto mb-8 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
            <h2 className="text-2xl font-bold text-amber-300 mb-3">剧本生成中</h2>
            <p className="text-gray-500">AI 正在将小说转化为影视剧本，请稍候...</p>
          </div>
        )}

        {/* Chapter list - 3 columns grid */}
        {chapters.length > 0 && (
          <div className="space-y-6">
            {/* Compact toolbar: delete prompts */}
            {(() => {
              const hasImg = chapters.some((c: ScriptChapter) => !!(c.imagePrompts && c.imagePrompts.length > 0));
              const hasVid = chapters.some((c: ScriptChapter) => !!(c.videoPrompts && c.videoPrompts.length > 0));
              if (!hasImg && !hasVid) return null;
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  {hasImg && (
                    <button onClick={handleDeleteAllImagePrompts} disabled={generating} className="px-3 py-1.5 bg-red-900/30 hover:bg-red-800/50 border border-red-500/15 text-red-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      删除图片提示词
                    </button>
                  )}
                  {hasVid && (
                    <button onClick={handleDeleteAllVideoPrompts} disabled={generating} className="px-3 py-1.5 bg-red-900/30 hover:bg-red-800/50 border border-red-500/15 text-red-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      删除视频提示词
                    </button>
                  )}
                </div>
              );
            })()}

            {/* ===== 3-column chapter grid ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {chapters.map((chapter: ScriptChapter, idx: number) => {
                const isExpanded = expandedChapters.has(idx);
                const hasScreenplay = !!(chapter.screenplay && chapter.screenplay.scenes && chapter.screenplay.scenes.length > 0);
                const isScreenplayIncomplete = hasScreenplay && chapter.screenplay!.targetSceneCount && chapter.screenplay!.scenes.length < chapter.screenplay!.targetSceneCount * 0.85;
                const hasImagePrompts = !!(chapter.imagePrompts && chapter.imagePrompts.length > 0);
                const hasVideoPrompts = !!(chapter.videoPrompts && chapter.videoPrompts.length > 0);
                const isChapterGenerating = generatingChapter === idx;
                const progress = [hasScreenplay, hasImagePrompts, hasVideoPrompts].filter(Boolean).length;

                const chapterColorMap: Record<string,{bg:string,border:string,text:string,gradient:string}> = {
                  emerald:{bg:'rgba(6,78,59,0.3)',border:'rgba(16,185,129,0.3)',text:'#34d399',gradient:'linear-gradient(135deg,rgba(6,78,59,0.25),rgba(15,23,42,0.5))'},
                  sky:{bg:'rgba(12,74,110,0.3)',border:'rgba(14,165,233,0.3)',text:'#38bdf8',gradient:'linear-gradient(135deg,rgba(12,74,110,0.25),rgba(15,23,42,0.5))'},
                  violet:{bg:'rgba(76,29,149,0.3)',border:'rgba(139,92,246,0.3)',text:'#a78bfa',gradient:'linear-gradient(135deg,rgba(76,29,149,0.25),rgba(15,23,42,0.5))'},
                  amber:{bg:'rgba(120,53,15,0.3)',border:'rgba(245,158,11,0.3)',text:'#fbbf24',gradient:'linear-gradient(135deg,rgba(120,53,15,0.25),rgba(15,23,42,0.5))'},
                  rose:{bg:'rgba(136,19,55,0.3)',border:'rgba(244,63,94,0.3)',text:'#fb7185',gradient:'linear-gradient(135deg,rgba(136,19,55,0.25),rgba(15,23,42,0.5))'},
                  cyan:{bg:'rgba(22,78,99,0.3)',border:'rgba(6,182,212,0.3)',text:'#22d3ee',gradient:'linear-gradient(135deg,rgba(22,78,99,0.25),rgba(15,23,42,0.5))'},
                  indigo:{bg:'rgba(55,48,163,0.3)',border:'rgba(99,102,241,0.3)',text:'#818cf8',gradient:'linear-gradient(135deg,rgba(55,48,163,0.25),rgba(15,23,42,0.5))'},
                  teal:{bg:'rgba(17,94,89,0.3)',border:'rgba(20,184,166,0.3)',text:'#2dd4bf',gradient:'linear-gradient(135deg,rgba(17,94,89,0.25),rgba(15,23,42,0.5))'},
                  fuchsia:{bg:'rgba(112,26,117,0.3)',border:'rgba(217,70,239,0.3)',text:'#e879f9',gradient:'linear-gradient(135deg,rgba(112,26,117,0.25),rgba(15,23,42,0.5))'},
                  orange:{bg:'rgba(124,45,18,0.3)',border:'rgba(249,115,22,0.3)',text:'#fb923c',gradient:'linear-gradient(135deg,rgba(124,45,18,0.25),rgba(15,23,42,0.5))'},
                };
                const chapterColors = Object.keys(chapterColorMap);
                const chColorKey = chapterColors[idx % chapterColors.length];
                const chColor = chapterColorMap[chColorKey];

                return (
                  <div key={idx}
                    className={`bg-slate-900/50 border rounded-2xl overflow-hidden transition-all duration-300 ${isExpanded ? 'md:col-span-2 xl:col-span-3 border-amber-500/20 shadow-lg shadow-amber-500/[0.03]' : 'border-white/[0.04]'}`}
                    {...(!isExpanded ? {
                      onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
                        e.currentTarget.style.background = chColor.gradient;
                        e.currentTarget.style.borderColor = chColor.border;
                      },
                      onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
                        e.currentTarget.style.background = '';
                        e.currentTarget.style.borderColor = '';
                      }
                    } : {})}
                  >
                    {/* Chapter card header */}
                    <button
                      onClick={() => toggleChapter(idx)}
                      className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                          style={{background:chColor.bg, color:chColor.text, boxShadow:`inset 0 0 8px ${chColor.border}`}}>
                          {idx + 1}
                        </div>
                        <div className="text-left min-w-0">
                          <span className="font-bold text-[14px] block truncate">{chapter.chapterTitle || `第${idx + 1}章`}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex gap-1">
                              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${hasScreenplay ? 'bg-emerald-400' : 'bg-gray-700'}`} />
                              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${hasImagePrompts ? 'bg-sky-400' : 'bg-gray-700'}`} />
                              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${hasVideoPrompts ? 'bg-violet-400' : 'bg-gray-700'}`} />
                            </div>
                            <span className="text-[10px] text-gray-600 font-mono">{progress}/3</span>
                          </div>
                        </div>
                      </div>
                      <svg className={`w-4 h-4 text-gray-600 transition-transform duration-300 shrink-0 ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    {/* Expanded chapter content */}
                    {isExpanded && (
                      <div className="border-t border-white/[0.04]">
                        {/* Screenplay generation button */}
                        <div className="px-5 py-3.5 bg-gradient-to-r from-slate-800/40 to-slate-900/30 border-b border-white/[0.03]">
                          <div className="flex items-center gap-3 flex-wrap">
                            {(!hasScreenplay || isScreenplayIncomplete) && (
                            <button
                              onClick={() => handleGenerateScript(idx)}
                              disabled={generating && generatingType === 'screenplay' && generatingChapter === idx}
                              className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-600 text-white rounded-xl text-[13px] font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-amber-500/10"
                            >
                              {generating && generatingType === 'screenplay' && generatingChapter === idx ? (
                                <>
                                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                  生成中
                                </>
                              ) : !hasScreenplay ? (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                  生成剧本
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                  继续生成
                                </>
                              )}
                            </button>
                            )}
                            {hasScreenplay && (
                              <span className="text-[11px] text-gray-500 font-mono">
                                已有 {chapter.screenplay?.scenes?.length || 0} 个场景
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Image/Video prompt copy buttons */}
                        {hasScreenplay && (hasImagePrompts || hasVideoPrompts) && (
                          <div className="px-5 py-2 border-b border-white/[0.03]">
                            <div className="flex items-center gap-2 flex-wrap">
                              {hasImagePrompts && (
                                <button onClick={() => copyAllPrompts(chapter, 'image')} className="text-[11px] text-gray-500 hover:text-sky-400 flex items-center gap-1 px-2 py-1 hover:bg-sky-500/10 rounded-lg transition-colors">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                  复制分镜图片提示词
                                </button>
                              )}
                              {hasVideoPrompts && (
                                <button onClick={() => copyAllPrompts(chapter, 'video')} className="text-[11px] text-gray-500 hover:text-violet-400 flex items-center gap-1 px-2 py-1 hover:bg-violet-500/10 rounded-lg transition-colors">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                  复制分镜视频提示词
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Screenplay content */}
                        <div className="px-5 py-6">
                          <div className="flex items-center justify-between mb-5">
                            <h3 className="font-bold text-emerald-400 flex items-center gap-2 text-sm">
                              <span className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center text-xs">📜</span>
                              影视剧本
                            </h3>
                            {hasScreenplay && chapter.screenplay?.scenes && (
                              <button
                                onClick={() => copyToClipboard(
                                  chapter.screenplay!.scenes!.map((s: Scene) => {
                                    const normalized = normalizeDialogues(s.dialogues);
                                    const dialoguesStr = normalized.map((d: any) => `${d.character}：${d.line}`).join('\n');
                                    return `【场景${s.sceneIndex}】${s.sceneTitle}\n${s.description}\n${s.actions}\n${dialoguesStr ? '[对白]\n' + dialoguesStr + '\n' : ''}${s.stageDirections}`;
                                  }).join('\n\n---\n\n'),
                                  '剧本'
                                )}
                                className="text-xs text-gray-500 hover:text-emerald-400 flex items-center gap-1.5 px-3 py-1.5 hover:bg-emerald-500/10 rounded-lg transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                复制全部剧本
                              </button>
                            )}
                          </div>

                          {!hasScreenplay ? (
                            <div className="flex flex-col items-center justify-center py-12">
                              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-600/10 flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-emerald-500/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              </div>
                              <p className="text-sm text-gray-500 mb-1">剧本尚未生成</p>
                              <p className="text-xs text-gray-600">请先点击顶部"生成剧本"按钮</p>
                            </div>
                          ) : (
                            <div>
                              {chapter.screenplay?.summary && (
                                <div className="bg-gradient-to-r from-emerald-500/5 via-emerald-500/10 to-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 mb-5">
                                  <h4 className="text-[11px] text-emerald-400/60 font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    章节概要
                                  </h4>
                                  <p className="text-sm text-gray-300 leading-relaxed italic">{chapter.screenplay.summary}</p>
                                </div>
                              )}

                              {/* ===== 2-column scene grid ===== */}
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                {chapter.screenplay?.scenes?.map((scene: Scene, si: number) => {
                                  const sceneImagePrompts = chapter.imagePrompts?.filter((ip: ImagePrompt) => ip.sceneIndex === scene.sceneIndex) || [];
                                  const sceneVideoPrompts = chapter.videoPrompts?.filter((vp: VideoPrompt) => vp.sceneIndex === scene.sceneIndex) || [];
                                  const hasSceneImage = sceneImagePrompts.length > 0;
                                  const hasSceneVideo = sceneVideoPrompts.length > 0;
                                  const hoverColors = ['hover:text-emerald-400','hover:text-sky-400','hover:text-violet-400','hover:text-amber-400','hover:text-rose-400','hover:text-cyan-400','hover:text-indigo-400','hover:text-teal-400','hover:text-fuchsia-400','hover:text-orange-400','hover:text-lime-400','hover:text-pink-400'];
                                  const borderColors = ['hover:border-emerald-500/50','hover:border-sky-500/50','hover:border-violet-500/50','hover:border-amber-500/50','hover:border-rose-500/50','hover:border-cyan-500/50','hover:border-indigo-500/50','hover:border-teal-500/50','hover:border-fuchsia-500/50','hover:border-orange-500/50','hover:border-lime-500/50','hover:border-pink-500/50'];
                                  const bgColors = ['hover:bg-emerald-500/10','hover:bg-sky-500/10','hover:bg-violet-500/10','hover:bg-amber-500/10','hover:bg-rose-500/10','hover:bg-cyan-500/10','hover:bg-indigo-500/10','hover:bg-teal-500/10','hover:bg-fuchsia-500/10','hover:bg-orange-500/10','hover:bg-lime-500/10','hover:bg-pink-500/10'];
                                  const ci = si % hoverColors.length;
                                  return (
                                    <div key={si} onClick={() => setViewScene({ scene, chapterIndex: idx, chapterTitle: chapter.chapterTitle || `第${idx+1}章` })} className="bg-white/[0.02] rounded-2xl border border-white/[0.06] overflow-hidden hover:shadow-lg hover:shadow-black/20 transition-all duration-300 cursor-pointer hover:scale-[1.02]">
                                      {/* Scene title - random hover color */}
                                      <div className={`flex items-center justify-between px-4 py-3 bg-white/[0.08] border-b border-white/[0.05] transition-all duration-300 ${bgColors[ci]} ${borderColors[ci]} group/title cursor-default`}>
                                        <h4 className={`text-sm font-bold text-amber-400 flex items-center gap-2 transition-colors duration-300 ${hoverColors[ci]} group-hover/title:scale-[1.01]`}>
                                          🎬 场景{scene.sceneIndex}：{scene.sceneTitle}
                                        </h4>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); openSceneEditor(idx, scene); }}
                                            className="p-1.5 text-gray-600 hover:text-amber-400 rounded-lg hover:bg-amber-500/10 transition-colors"
                                            title="编辑此场景"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); 
                                              const normalized = normalizeDialogues(scene.dialogues);
                                              const dialoguesStr = normalized.map((d: any) => `${d.character}：${d.line}`).join('\n');
                                              copyToClipboard(
                                                `【场景${scene.sceneIndex}】${scene.sceneTitle}\n${scene.description}\n${scene.actions}\n${dialoguesStr ? '[对白]\n' + dialoguesStr + '\n' : ''}${scene.stageDirections}`,
                                                '场景'
                                              ); }}
                                            className="p-1.5 text-gray-600 hover:text-sky-400 rounded-lg hover:bg-sky-500/10 transition-colors"
                                            title="复制此场景"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                          </button>
                                        </div>
                                      </div>

                                      {/* Scene body */}
                                      <div className="px-4 py-4 space-y-3">
                                        {/* Description */}
                                        {scene.description && (
                                          <p className="text-[13px] text-gray-300 leading-[1.9] tracking-wide">{scene.description}</p>
                                        )}

                                        {/* Actions */}
                                        {scene.actions && (
                                          <div className="bg-amber-500/[0.06] border-l-2 border-amber-500/30 rounded-r-lg px-4 py-2.5">
                                            <p className="text-[13px] text-amber-200/70 italic leading-relaxed">{scene.actions}</p>
                                          </div>
                                        )}

                                        {/* Dialogues */}
                                        {(() => {
                                          const normalized = normalizeDialogues(scene.dialogues);
                                          return normalized.length > 0 ? (
                                            <div className="space-y-1.5">
                                              {normalized.map((d: any, di: number) => (
                                                <p key={di} className="text-[13px] leading-relaxed">
                                                  <span className="text-cyan-400 font-bold">💬 {d.character}：</span>
                                                  {d.direction && <span className="text-gray-600 text-xs">（{d.direction}）</span>}
                                                  <span className="text-gray-200">「{d.line}」</span>
                                                </p>
                                              ))}
                                            </div>
                                          ) : null;
                                        })()}

                                        {/* Stage Directions */}
                                        {scene.stageDirections && (
                                          <p className="text-xs text-gray-500 italic flex items-start gap-1.5">
                                            <span className="shrink-0">🎥</span>
                                            <span>{scene.stageDirections}</span>
                                          </p>
                                        )}
                                      </div>

                                      {/* Image & Video prompts */}
                                      {(hasSceneImage || hasSceneVideo) && (
                                        <div className="border-t border-white/[0.04]">
                                          {hasSceneImage && (
                                            <div className="px-4 py-3 border-b border-white/[0.03] bg-sky-950/20">
                                              <h4 className="text-xs font-bold text-sky-300 mb-2.5 flex items-center gap-1.5">
                                                <span className="w-5 h-5 rounded bg-sky-500/25 flex items-center justify-center text-[10px]">🖼</span>
                                                分镜图片 · {sceneImagePrompts.length}个镜头
                                              </h4>
                                              <div className="space-y-2">
                                                {sceneImagePrompts.map((ip: ImagePrompt, pi: number) => {
                                                  const originalIndex = chapter.imagePrompts!.indexOf(ip);
                                                  return renderImagePromptCard(ip, pi, idx, originalIndex);
                                                })}
                                              </div>
                                            </div>
                                          )}
                                          {hasSceneVideo && (
                                            <div className="px-4 py-3 bg-violet-950/20">
                                              <h4 className="text-xs font-bold text-violet-300 mb-2.5 flex items-center gap-1.5">
                                                <span className="w-5 h-5 rounded bg-violet-500/25 flex items-center justify-center text-[10px]">🎥</span>
                                                视频镜头 · {sceneVideoPrompts.length}个镜头
                                              </h4>
                                              <div className="space-y-2">
                                                {sceneVideoPrompts.map((vp: VideoPrompt, vi: number) => {
                                                  const originalIndex = chapter.videoPrompts!.indexOf(vp);
                                                  return renderVideoPromptCard(vp, vi, idx, originalIndex, scene.dialogues);
                                                })}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {chapter.screenplay?.rawText && !chapter.screenplay.scenes && (
                                <pre className="text-sm text-gray-400 whitespace-pre-wrap bg-slate-800/40 rounded-xl p-5 leading-relaxed">{chapter.screenplay.rawText}</pre>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Scene Detail Modal */}
      {viewScene && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setViewScene(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-3xl max-h-[85vh] bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-white/10 bg-white/[0.04] flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">🎬 场景{viewScene.scene.sceneIndex}：{viewScene.scene.sceneTitle}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{viewScene.chapterTitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    copyToClipboard(
                      `【场景${viewScene.scene.sceneIndex}】${viewScene.scene.sceneTitle}\n${viewScene.scene.description}\n${viewScene.scene.actions}\n${viewScene.scene.dialogues?.map((d: any) => `${d.character}：${d.line}`).join('\n') || ''}\n${viewScene.scene.stageDirections}`,
                      '场景'
                    );
                  }}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  复制
                </button>
                <button
                  onClick={() => { openSceneEditor(viewScene.chapterIndex, viewScene.scene); setViewScene(null); }}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  编辑
                </button>
                <button onClick={() => setViewScene(null)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Description */}
              {viewScene.scene.description && (
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">场景描述</h4>
                  <p className="text-sm text-gray-200 leading-[2] tracking-wide">{viewScene.scene.description}</p>
                </div>
              )}
              {/* Actions */}
              {viewScene.scene.actions && (
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">角色动作</h4>
                  <div className="bg-amber-500/[0.06] border-l-2 border-amber-500/30 rounded-r-lg px-4 py-3">
                    <p className="text-sm text-amber-200/80 italic leading-relaxed">{viewScene.scene.actions}</p>
                  </div>
                </div>
              )}
              {/* Dialogues */}
              {(() => {
                const normalized = normalizeDialogues(viewScene.scene.dialogues);
                return normalized.length > 0 ? (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">对白 ({normalized.length})</h4>
                    <div className="space-y-2 bg-white/[0.02] rounded-xl p-4 border border-white/[0.05]">
                      {normalized.map((d: any, di: number) => (
                        <p key={di} className="text-sm leading-relaxed">
                          <span className="text-cyan-400 font-bold">💬 {d.character}：</span>
                          {d.direction && <span className="text-gray-600 text-xs">（{d.direction}）</span>}
                          <span className="text-gray-200">「{d.line}」</span>
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
              {/* Stage Directions */}
              {viewScene.scene.stageDirections && (
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">导演指示</h4>
                  <p className="text-sm text-gray-400 italic flex items-start gap-2">
                    <span className="shrink-0">🎥</span>
                    <span className="leading-relaxed">{viewScene.scene.stageDirections}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 弹窗：自定义剧本提示词配置 */}
      {showCustomPromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-2xl bg-slate-900 border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-white/[0.05] flex items-center justify-between bg-slate-950/20">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                ⚙️ 自定义剧本生成提示词设置
              </h3>
              <button 
                onClick={() => setShowCustomPromptModal(false)}
                className="text-gray-500 hover:text-white p-1 hover:bg-white/5 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Custom system prompt switch & textarea */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    ✍️ 剧本改编指令（系统提示词）
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">使用自定义提示词：</span>
                    <button
                      type="button"
                      onClick={() => setCustomPromptEnabled(!customPromptEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        customPromptEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          customPromptEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {customPromptEnabled ? (
                  <div className="space-y-2 bg-slate-950/30 rounded-xl p-3 border border-white/[0.04] transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-amber-400/80 font-bold flex items-center gap-1.5">
                        💡 已启用独立提示词，生成时将忽略管理后台“提示词管理”中的配置。
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('确定要恢复默认预设提示词吗？')) {
                            setCustomSystemPrompt(`你是一位顶级好莱坞影视编剧和微短剧导演。你深谙微短剧节奏，精通将小说改编为极具画面感、节奏紧凑、反转不断的剧作场景。

【核心改编准则】
1. **画面先行（Show, don't tell）**：拒绝纯文字心理描写，所有情绪、冲突、人物背景必须外化为具体的“可拍画面、细微动作、音效声音”。
2. **场景高密度戏剧性**：每一个新场景（sceneTitle）必须是真正的时空转换（如：内景-破旧院落-深夜）。每场戏必须包含：【核心戏剧冲突推进】、【悬念微型铺垫】或【信息交代】。
3. **黄金台词标准**：对白（dialogues）要简练、口语化、符合身份，蕴含潜台词 and 弦外之音。没有对白的场景把 dialogues 设为空数组 []。
4. **舞台指示可视化**：stageDirections 应当提供明确 of 运镜方式（景别、运镜方式、转场建议），以及具有影视美感的后期转场指导。

## 输出格式要求
请严格输出合法的纯 JSON 格式（不要包含任何 markdown 代码块标记或前后解释字）：
{
  "scenes": [
    {
      "sceneIndex": 0,
      "sceneTitle": "内景-主卧室-清晨",
      "description": "清晨阳光穿过百叶窗，在地板落下一道斑驳。空气中浮动着尘埃，远处隐约传来厨房煎蛋的声音。",
      "actions": "主角紧捏着手中的旧信封，指节有些泛白，深吸一口气又缓缓吐出，眼神凝重地盯着门板。",
      "dialogues": [
        {"character": "主角名", "line": "这次，真的没有退路了。"}
      ],
      "stageDirections": "特写信封，随着主角深呼吸拉远至中景，伴随门轴嘎吱开门声转场。"
    }
  ]
}`);
                          }
                        }}
                        className="text-[10px] text-gray-500 hover:text-amber-400 transition-colors bg-white/5 hover:bg-white/10 px-2 py-1 rounded border border-white/5"
                      >
                        恢复默认预设
                      </button>
                    </div>
                    <textarea
                      value={customSystemPrompt}
                      onChange={(e) => setCustomSystemPrompt(e.target.value)}
                      rows={10}
                      className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-gray-300 leading-relaxed focus:outline-none focus:border-emerald-500/50 resize-y"
                      placeholder="请输入你的自定义系统提示词..."
                    />
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      * 编写自定义提示词时，必须包含完整的 JSON 格式规范，大模型将以此规则对小说章节进行影视编剧级的场景切分与对白改编。
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 bg-slate-950/20 rounded-xl p-3 border border-white/[0.02]">
                    🔒 当前处于默认模式：系统将**自动应用**管理后台「提示词管理」配置的剧本系统提示词模型。
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-white/[0.05] flex gap-3 justify-end bg-slate-950/10">
              <button
                onClick={() => setShowCustomPromptModal(false)}
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-500/10"
              >
                保存并关闭设置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Config Modal */}
      <AIConfigModal isOpen={showAiConfigModal} onClose={() => { setShowAiConfigModal(false); loadAvailableConfigs(); }} />
    </div>
  );
}
