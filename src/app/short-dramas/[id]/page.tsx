"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import JSZip from "jszip";
import { getToken as getAuthToken } from "@/lib/get-token";
import { getCategoryLabel } from "@/lib/category";
import AIConfigModal from "@/components/AIConfigModal";
import { broadcastDataChange, onDataChange } from "@/lib/data-sync";
import { IMAGE_PROVIDERS, VIDEO_PROVIDERS } from "@/storage/database/shared/schema";
import { CustomSelect } from "@/components/custom-select";
import { uploadFile } from "@/lib/api/storage";

type WorkTab = 'overview' | 'source' | 'episodes' | 'characters' | 'scenes' | 'items' | 'image-storyboards' | 'video-storyboards' | 'jianying';

interface NovelChapter { index: number; title: string; wordCount: number; content: string; }
interface NovelCharacter { id: string; name: string; role: string; description: string | null; personality: string | null; appearance: string | null; background: string | null; relationships: string | null; }
interface NovelScene { id: string; name: string; description: string | null; atmosphere: string | null; }
interface NovelData {
  id: string; title: string; description: string | null; category: string | null;
  genderTarget: string | null; tone: string | null; protagonist: string | null;
  totalChapters: number; currentChapters: number; status: string;
  structure: any; chapters: NovelChapter[];
  characters: NovelCharacter[]; scenes: NovelScene[]; items: any[]; plot: any; chapterHooks: any[];
  characterRelationships?: { id: string; fromCharacter: string; toCharacter: string; relationship: string | null }[];
}
interface ScriptChapter { index: number; title: string; hasScreenplay: boolean; screenplay: string | null; scenes: any[]; imagePrompts: any[]; videoPrompts: any[]; }
interface ScriptData {
  id: string; novelId: string; status: string; createdAt: string;
  chapters: ScriptChapter[];
}
interface Drama {
  id: string; title: string; description: string | null; genre: string | null;
  totalEpisodes: number; currentEpisodes: number; status: string;
  style: string | null; platform: string | null; novelId: string | null; scriptId: string | null;
  episodes: Episode[]; characters: Character[]; scenes: any[]; items: any[]; shotCount: number; assetCount: number; pendingTasks: number;
  novel: NovelData | null; script: ScriptData | null;
}
interface Episode {
  id: string; episodeNumber: number; title: string | null; synopsis: string | null;
  screenplay: string | null; status: string; duration: number | null;
  sourceChapter: number | null; sourceScriptChapterIndex: number | null;
}
interface Character {
  id: string; name: string; role: string | null; gender: string | null; description: string | null;
  personality: string | null; appearance: string | null; imageUrl: string | null;
  voiceProvider: string | null; voiceId: string | null;
}
interface Shot {
  id: string; shotNumber: number; shotType: string | null; sceneDescription: string | null;
  cameraAngle: string | null; dialogue: string | null; voiceover: string | null;
  imagePrompt: string | null; imageUrl: string | null; videoUrl: string | null;
  audioUrl: string | null; ttsText: string | null; subtitle: string | null;
  duration: number | null; status: string;
}

const cleanCharName = (name: string) =>
  name ? name.replace(/\s*[—–\-]+\s*【.*$/, '').replace(/\s*【.*$/, '').trim() : name;

function MatrixStream({ text }: { text: string }) {
  const lines = text.split('\n');
  const displayLines = lines.slice(-40);
  const getFadeClass = (i: number, total: number): string => {
    const age = total - i - 1;
    if (age <= 1) return 'text-green-300 drop-shadow-[0_0_6px_#4ade80] opacity-100';
    if (age <= 3) return 'text-green-400 drop-shadow-[0_0_3px_#22c55e] opacity-90';
    if (age <= 6) return 'text-green-500 opacity-75';
    if (age <= 10) return 'text-green-600 opacity-55';
    if (age <= 15) return 'text-green-700 opacity-35';
    return 'text-green-800 opacity-20';
  };
  return (
    <div className="matrix-sdc-container">
      <style>{`
        .matrix-sdc-container{position:relative;overflow:hidden;background:linear-gradient(180deg,rgba(0,8,2,.95) 0%,rgba(0,12,3,.98) 100%);border:1px solid rgba(0,255,65,.08);border-radius:12px}
        .matrix-sdc-container::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.15) 2px,rgba(0,0,0,.15) 4px);pointer-events:none;z-index:2;opacity:.5}
        .matrix-sdc-container::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 100%,rgba(0,255,65,.06) 0%,transparent 70%);pointer-events:none;z-index:1}
        .matrix-sdc-line{animation:sdcFadeIn .6s ease-out forwards;text-shadow:0 0 2px currentColor;letter-spacing:.5px}
        @keyframes sdcFadeIn{0%{opacity:0;transform:translateY(-12px);filter:blur(2px)}40%{filter:blur(0)}100%{opacity:1;transform:translateY(0);filter:blur(0)}}
        .matrix-sdc-cursor::after{content:'█';animation:sdcBlink .8s step-end infinite;color:#4ade80;text-shadow:0 0 8px #4ade80,0 0 16px #22c55e}
        @keyframes sdcBlink{0%,100%{opacity:1}50%{opacity:0}}
      `}</style>
      <div className="matrix-sdc-rain" aria-hidden="true" style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:0,overflow:'hidden'}}>
        {Array.from({length:10}).map((_,i)=>(
          <span key={i} style={{position:'absolute',top:-100,left:`${5+i*9}%`,fontFamily:'Courier New,monospace',fontSize:10,color:'rgba(0,255,65,.07)',animation:`sdcDrop ${3+i*.7}s linear ${i*.3}s infinite`,whiteSpace:'nowrap'}}>
            {Array.from({length:8+i*2}).map(()=>String.fromCharCode(0x30A0+Math.random()*96)).join('')}
          </span>
        ))}
      </div>
      <style>{`@keyframes sdcDrop{0%{transform:translateY(-100px);opacity:0}10%{opacity:.15}90%{opacity:.05}100%{transform:translateY(400px);opacity:0}}`}</style>
      <div className="relative z-10 p-5 font-mono text-[13px] leading-[1.9] overflow-auto max-h-full">
        {displayLines.map((line,i)=>(
          <div key={`${i}-${line.slice(0,8)}`} className={`matrix-sdc-line ${getFadeClass(i,displayLines.length)}`} style={{animationDelay:`${i*30}ms`}}>
            {line||'\u00A0'}
          </div>
        ))}
        <span className="matrix-sdc-cursor">&nbsp;</span>
      </div>
    </div>
  );
}

export default function ShortDramaWorkspace() {
  const router = useRouter();
  const params = useParams();
  const dramaId = params.id as string;

  const [tab, setTab] = useState<WorkTab>('overview');
  const [drama, setDrama] = useState<Drama | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [shotsLoading, setShotsLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatingSet, setGeneratingSet] = useState<Set<string>>(new Set());
  type GenJob = { id: string; label: string; status: 'running'|'done'|'error'; startTime: number; endTime?: number; error?: string; logs?: string[] };
  const [genLog, setGenLog] = useState<GenJob[]>([]);
  const [showGenLog, setShowGenLog] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [genStreamText, setGenStreamText] = useState('');
  const [showGenModal, setShowGenModal] = useState(false);
  const [isGenModalMin, setIsGenModalMin] = useState(false);
  const [genModalType, setGenModalType] = useState<'image'|'video'|'asset'|'prompt-image'|'prompt-video'>('image');
  const [genSessionStart, setGenSessionStart] = useState(0);
  const [completionMsg, setCompletionMsg] = useState('');
  const [completionType, setCompletionType] = useState<'image'|'video'|'asset'|'prompt-image'|'prompt-video'>('image');
  const pendingMediaJobsRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const typingSoundIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedEpisodeRef = useRef<Episode | null>(null);
  const [isAdmin] = useState<boolean>(() => { try { return JSON.parse(typeof window !== 'undefined' ? (localStorage.getItem('user') || 'null') : 'null')?.role === 'admin'; } catch { return false; } });
  const [availableConfigs, setAvailableConfigs] = useState<any[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [showAiConfigModal, setShowAiConfigModal] = useState(false);

  // ── 右键上下文菜单与本地上传导入 ──
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'character'|'scene'|'item'|'image-storyboard'|'video-storyboard', id: string } | null>(null);
  const [uploadTarget, setUploadTarget] = useState<{ type: string, id: string } | null>(null);
  const globalFileInputRef = useRef<HTMLInputElement>(null);

  // 关闭右键菜单
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const handleTriggerUpload = (type: 'character'|'scene'|'item'|'image-storyboard'|'video-storyboard', id: string) => {
    setUploadTarget({ type, id });
    setContextMenu(null);
    if (globalFileInputRef.current) {
      globalFileInputRef.current.accept = type === 'video-storyboard' ? 'video/*' : 'image/*';
      globalFileInputRef.current.click();
    }
  };

  const handleGlobalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !uploadTarget) return;

    setGenerating('uploading');
    try {
      const subDir = uploadTarget.type === 'video-storyboard' ? 'videos' : 'images';
      const token = getToken();
      
      // 1. 调用上传接口
      const uploadedUrl = await uploadFile(file, subDir, dramaId);

      // 2. 根据类型调用不同的 PUT 接口保存入库
      if (uploadTarget.type === 'character') {
        await fetch(`/api/short-dramas/${dramaId}/characters`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ characterId: uploadTarget.id, imageUrl: uploadedUrl }),
        });
      } else if (uploadTarget.type === 'scene') {
        await fetch(`/api/short-dramas/${dramaId}/scenes`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sceneId: uploadTarget.id, imageUrl: uploadedUrl }),
        });
      } else if (uploadTarget.type === 'item') {
        await fetch(`/api/short-dramas/${dramaId}/items`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ itemId: uploadTarget.id, imageUrl: uploadedUrl }),
        });
      } else if (uploadTarget.type === 'image-storyboard') {
        await fetch(`/api/short-dramas/${dramaId}/storyboards`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ shotId: uploadTarget.id, imageUrl: uploadedUrl }),
        });
        if (selectedEpisode) await fetchShots(selectedEpisode.id);
      } else if (uploadTarget.type === 'video-storyboard') {
        await fetch(`/api/short-dramas/${dramaId}/storyboards`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ shotId: uploadTarget.id, videoUrl: uploadedUrl }),
        });
        if (selectedEpisode) await fetchShots(selectedEpisode.id);
      }

      // 3. 重新拉取整个短剧的状态
      await fetchDrama();
      alert('导入成功！');
    } catch (err: any) {
      alert('导入失败: ' + err.message);
    } finally {
      setGenerating(null);
      setUploadTarget(null);
    }
  };

  // 系统媒体API配置（从服务器加载）
  const [systemMediaConfigs, setSystemMediaConfigs] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/media-configs').then(r => r.json()).then(d => { if (d.success) setSystemMediaConfigs(d.data); }).catch(() => {});
  }, []);

  // 图片/视频 媒体API配置（存 localStorage）
  const [mediaConfig, setMediaConfig] = useState<{ image: Record<string,string>; video: Record<string,string> }>(() => {
    if (typeof window === 'undefined') return { image: { provider: 'siliconflow', model: 'black-forest-labs/FLUX.1-schnell', apiKey: '', apiUrl: '' }, video: { provider: 'kling', model: 'kling-v1-6', apiKey: '', apiUrl: '' } };
    try { return JSON.parse(localStorage.getItem('mediaConfig') || 'null') || { image: { provider: 'siliconflow', model: 'black-forest-labs/FLUX.1-schnell', apiKey: '', apiUrl: '' }, video: { provider: 'kling', model: 'kling-v1-6', apiKey: '', apiUrl: '' } }; } catch { return { image: { provider: 'siliconflow', model: 'black-forest-labs/FLUX.1-schnell', apiKey: '', apiUrl: '' }, video: { provider: 'kling', model: 'kling-v1-6', apiKey: '', apiUrl: '' } }; }
  });
  const saveMediaConfig = (cfg: typeof mediaConfig) => { setMediaConfig(cfg); if (typeof window !== 'undefined') localStorage.setItem('mediaConfig', JSON.stringify(cfg)); };

  const getToken = useCallback(() => getAuthToken(), []);

  const playTypingSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const bufferSize = ctx.sampleRate * 0.05;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 700 + Math.random() * 500;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(ctx.currentTime);
      source.stop(ctx.currentTime + 0.05);
    } catch {}
  }, []);

  useEffect(() => {
    if (genStreamText && showGenModal) {
      if (typingSoundIntervalRef.current) clearInterval(typingSoundIntervalRef.current);
      typingSoundIntervalRef.current = setInterval(playTypingSound, 140);
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
  }, [genStreamText, showGenModal, playTypingSound]);

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
      if (window.speechSynthesis.getVoices().length > 0) { setVoice(); }
      else { window.speechSynthesis.onvoiceschanged = setVoice; }
    } catch {}
  }, []);

  const fetchDrama = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/short-dramas/${dramaId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setDrama(data.data);
        if (data.data.episodes?.length > 0 && !selectedEpisode) {
          setSelectedEpisode(data.data.episodes[0]);
          selectedEpisodeRef.current = data.data.episodes[0];
        }
        // 后台自动本地化外部图片链接
        const toLocalize: any[] = [
          ...(data.data.characters || []).filter((c: any) => c.imageUrl?.startsWith('http')).map((c: any) => ({ assetType: 'character', assetId: c.id, url: c.imageUrl, mediaType: 'image' })),
          ...(data.data.scenes || []).filter((s: any) => s.imageUrl?.startsWith('http')).map((s: any) => ({ assetType: 'scene', assetId: s.id, url: s.imageUrl, mediaType: 'image' })),
          ...(data.data.items || []).filter((i: any) => i.imageUrl?.startsWith('http')).map((i: any) => ({ assetType: 'item', assetId: i.id, url: i.imageUrl, mediaType: 'image' })),
        ];
        if (toLocalize.length > 0) {
          fetch(`/api/short-dramas/${dramaId}/localize-media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
            body: JSON.stringify(toLocalize),
          }).then(r => r.json()).then(r => {
            if (r.success && r.data?.length > 0) {
              setDrama((prev: any) => {
                if (!prev) return prev;
                const map = Object.fromEntries(r.data.map((x: any) => [x.assetId, x.localUrl]));
                return {
                  ...prev,
                  characters: (prev.characters || []).map((c: any) => map[c.id] ? { ...c, imageUrl: map[c.id] } : c),
                  scenes: (prev.scenes || []).map((s: any) => map[s.id] ? { ...s, imageUrl: map[s.id] } : s),
                  items: (prev.items || []).map((i: any) => map[i.id] ? { ...i, imageUrl: map[i.id] } : i),
                };
              });
            }
          }).catch(() => {});
        }
      } else {
        router.push('/short-dramas');
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [dramaId, getToken, router]);

  useEffect(() => { fetchDrama(); }, [fetchDrama]);

  const loadAvailableConfigs = useCallback(async () => {
    const tk = getToken();
    if (!tk) return;
    setLoadingConfigs(true);
    try {
      const response = await fetch('/api/ai/configs', { headers: { Authorization: `Bearer ${tk}` } });
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
      console.error('加载AI配置失败:', error);
    } finally {
      setLoadingConfigs(false);
    }
  }, [getToken]);

  useEffect(() => { loadAvailableConfigs(); }, [loadAvailableConfigs]);

  const fetchShots = useCallback(async (episodeId: string) => {
    setShotsLoading(true);
    try {
      const res = await fetch(`/api/short-dramas/${dramaId}/storyboards?episodeId=${episodeId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setShots(data.data);
        // 后台自动本地化外部分镜媒体链接
        const toLocalize: any[] = [
          ...data.data.filter((s: any) => s.imageUrl?.startsWith('http')).map((s: any) => ({ assetType: 'shot', assetId: s.id, url: s.imageUrl, mediaType: 'image' })),
          ...data.data.filter((s: any) => s.videoUrl?.startsWith('http')).map((s: any) => ({ assetType: 'shot', assetId: s.id, url: s.videoUrl, mediaType: 'video' })),
          ...data.data.filter((s: any) => s.audioUrl?.startsWith('http')).map((s: any) => ({ assetType: 'shot', assetId: s.id, url: s.audioUrl, mediaType: 'audio' })),
        ];
        if (toLocalize.length > 0) {
          fetch(`/api/short-dramas/${dramaId}/localize-media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
            body: JSON.stringify(toLocalize),
          }).then(r => r.json()).then(r => {
            if (r.success && r.data?.length > 0) {
              const map = Object.fromEntries(r.data.map((x: any) => [x.assetId, x.localUrl]));
              setShots(prev => prev.map(s => {
                if (map[s.id]) {
                  const item = toLocalize.find(t => t.assetId === s.id);
                  if (item?.mediaType === 'video') return { ...s, videoUrl: map[s.id] };
                  if (item?.mediaType === 'audio') return { ...s, audioUrl: map[s.id] };
                  return { ...s, imageUrl: map[s.id] };
                }
                return s;
              }));
            }
          }).catch(() => {});
        }
      }
    } catch (e) { console.error(e); }
    finally { setShotsLoading(false); }
  }, [dramaId, getToken]);

  useEffect(() => {
    if (selectedEpisode && (tab === 'image-storyboards' || tab === 'video-storyboards' || tab === 'overview')) {
      fetchShots(selectedEpisode.id);
    }
  }, [selectedEpisode, tab, fetchShots]);

  useEffect(() => {
    const cleanup = onDataChange((e) => {
      if ((e.type === 'short-drama') && e.id === dramaId) {
        fetchDrama();
        const ep = selectedEpisodeRef.current;
        if (ep) fetchShots(ep.id);
      }
    });
    return cleanup;
  }, [dramaId, fetchDrama]);

  const callGenerate = async (action: string, extra: Record<string, any> = {}) => {
    const PER_ITEM_ACTIONS = ['generate-image','generate-video','generate-asset-image','generate-tts'];
    const isItemGen = PER_ITEM_ACTIONS.includes(action);
    const itemKey = isItemGen
      ? (extra.shotId ? `${action}:${extra.shotId}`
        : extra.assetId ? `${action}:${extra.assetType}:${extra.assetId}`
        : action)
      : null;

    const getLabel = () => {
      if (action === 'generate-image') { const s = shots.find(x => x.id === extra.shotId); return `图片 · 镜头#${s?.shotNumber ?? '?'}`; }
      if (action === 'generate-video') { const s = shots.find(x => x.id === extra.shotId); return `视频 · 镜头#${s?.shotNumber ?? '?'}`; }
      if (action === 'generate-tts')  { const s = shots.find(x => x.id === extra.shotId); return `配音 · 镜头#${s?.shotNumber ?? '?'}`; }
      if (action === 'generate-asset-image') return `${{ character:'角色图', scene:'场景图', item:'物品图' }[extra.assetType as string] ?? '图片'}`;
      if (action === 'generate-image-prompt') return '生成图片提示词';
      if (action === 'generate-video-prompt') return '生成视频提示词';
      return action;
    };
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2,5)}`;
    const label = getLabel();

    const appendJobLog = (msg: string) => {
      const ts = new Date().toLocaleTimeString('zh-CN', {hour12:false});
      const formatted = `[${ts}] ${msg}`;
      setGenLog(prev => prev.map(j => j.id === jobId ? { ...j, logs: [...(j.logs || []), formatted] } : j));
    };

    if (isItemGen && itemKey) {
      setGeneratingSet(prev => { const s = new Set(prev); s.add(itemKey!); return s; });
    } else {
      setGenerating(action);
    }
    const startTs = new Date().toLocaleTimeString('zh-CN', {hour12:false});
    setGenLog(prev => [{ id: jobId, label, status: 'running' as const, startTime: Date.now(), logs: [`[${startTs}] ▶ 任务初始化: ${label}`] }, ...prev].slice(0, 100));

    const isMediaGen = ['generate-image','generate-video','generate-asset-image','generate-image-prompt','generate-video-prompt'].includes(action);
    if (isMediaGen) {
      const mtype = action === 'generate-image' ? 'image' : action === 'generate-video' ? 'video' : action === 'generate-image-prompt' ? 'prompt-image' : action === 'generate-video-prompt' ? 'prompt-video' : 'asset';
      setGenModalType(mtype);
      setShowGenModal(true);
      setIsGenModalMin(false);
      setGenSessionStart(prev => prev || (Date.now() - 50));
      const ts = new Date().toLocaleTimeString('zh-CN', {hour12:false});
      setGenStreamText(prev => `${prev ? prev + '\n' : ''}[${ts}] ▶ 开始生成: ${label}`);
      pendingMediaJobsRef.current++;
    }

    try {
      // ── 图片/视频提示词走 SSE 流式专用接口，实时打字机输出 ──
      if (action === 'generate-image-prompt' || action === 'generate-video-prompt') {
        const promptType = action === 'generate-image-prompt' ? 'image' : 'video';
        const episodeId = extra.episodeId || selectedEpisode?.id;
        if (!episodeId) {
          pendingMediaJobsRef.current = Math.max(0, pendingMediaJobsRef.current - 1);
          if (pendingMediaJobsRef.current === 0) { setShowGenModal(false); setGenSessionStart(0); }
          alert('请先选择分集'); return;
        }

        const res = await fetch(`/api/short-dramas/${dramaId}/generate-prompts-stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({
            type: promptType,
            episodeId,
            configId: selectedConfigId,
            style: extra.style,
            customSystemPrompt: extra.customSystemPrompt,
            customUserPromptTpl: extra.customUserPromptTpl
          }),
        });
        if (!res.ok || !res.body) {
          const errData = await res.json().catch(() => ({ error: '流式请求失败' }));
          const errMsg = errData.error || '连接失败';
          setGenLog(prev => prev.map(j => j.id === jobId ? { ...j, status: 'error', endTime: Date.now(), error: errMsg } : j));
          setGenStreamText(prev => prev + `\n✗ ${errMsg}`);
          pendingMediaJobsRef.current = Math.max(0, pendingMediaJobsRef.current - 1);
          if (pendingMediaJobsRef.current === 0) { setShowGenModal(false); setGenSessionStart(0); }
          alert(errMsg);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let shotAccum = '';  // 当前分镜的 token 累积
        let savedCount = 0;
        let totalShots = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const ev = JSON.parse(line.slice(6));
                if (ev.type === 'start') {
                  totalShots = ev.total;
                  const pending = ev.pending ?? ev.total;
                  const skipped = ev.skipped ?? 0;
                  let msg = `→ 共 ${totalShots} 个分镜`;
                  if (skipped > 0) msg += `，跳过 ${skipped} 个已生成（断点续传）`;
                  msg += `，开始生成 ${pending} 个...`;
                  setGenStreamText(prev => prev + `\n  ${msg}`);
                  appendJobLog(`初始化成功: ${msg}`);
                } else if (ev.type === 'generating') {
                  shotAccum = '';
                  setGenStreamText(prev => prev + `\n  ⟳ 镜头${ev.shotNumber}...`);
                  appendJobLog(`⟳ 开始生成 镜头#${ev.shotNumber} 提示词...`);
                } else if (ev.type === 'status') {
                  setGenStreamText(prev => prev + `\n~ ${ev.message}`);
                  appendJobLog(`~ 状态更新: ${ev.message}`);
                } else if (ev.type === 'token') {
                  shotAccum += ev.content || '';
                  const preview = shotAccum.replace(/[\n\r"{}[\]]/g, ' ').trim().slice(-80);
                  if (preview.length > 8) {
                    setGenStreamText(prev => {
                      const lines2 = prev.split('\n');
                      if (lines2[lines2.length - 1].startsWith('    ✍️')) {
                        lines2[lines2.length - 1] = `    ✍️ ${preview}`;
                        return lines2.join('\n');
                      }
                      return prev + `\n    ✍️ ${preview}`;
                    });
                  }
                } else if (ev.type === 'saved') {
                  savedCount++;
                  // 立即更新 shots 状态，让分镜即时出现在页面
                  setShots(prev => prev.map((s: any) => {
                    if (s.id !== ev.shotId) return s;
                    if (ev.imagePrompt) return { ...s, imagePrompt: ev.imagePrompt };
                    if (ev.videoPromptJson) return { ...s, videoPrompt: ev.videoPromptJson };
                    if (ev.videoPrompt) return { ...s, videoPrompt: JSON.stringify({ prompt: ev.videoPrompt, startFrame: '', endFrame: '', stateNote: '', cameraMovement: '', characterAction: '' }) };
                    return s;
                  }));
                  const promptPreview = (ev.imagePrompt || ev.videoPrompt || '').slice(0, 70);
                  setGenStreamText(prev => {
                    const lines2 = prev.split('\n');
                    if (lines2[lines2.length - 1].startsWith('    ✍️')) lines2.pop();
                    return lines2.join('\n') + `\n  ✓ 镜头${ev.shotNumber}: ${promptPreview}${promptPreview.length >= 70 ? '…' : ''}`;
                  });
                  appendJobLog(`✓ 镜头#${ev.shotNumber} 保存成功! 提示词: ${ev.imagePrompt || ev.videoPrompt}`);
                } else if (ev.type === 'shotError') {
                  setGenStreamText(prev => prev + `\n  ✗ 镜头${ev.shotNumber}: ${ev.message}`);
                  appendJobLog(`✗ 镜头#${ev.shotNumber} 失败: ${ev.message}`);
                } else if (ev.type === 'done') {
                  savedCount = ev.saved ?? savedCount;
                  const ts2 = new Date().toLocaleTimeString('zh-CN', {hour12:false});
                  setGenStreamText(prev => prev + `\n[${ts2}] ✓ 已保存 ${savedCount}/${ev.total} 个提示词`);
                  appendJobLog(`✓ 流式生成全部完成! 成功保存 ${savedCount}/${ev.total} 个提示词。`);
                  if (selectedEpisode) await fetchShots(selectedEpisode.id);
                } else if (ev.type === 'error') {
                  setGenStreamText(prev => prev + `\n✗ 错误: ${ev.message}`);
                  appendJobLog(`✗ 异常错误: ${ev.message}`);
                }
              } catch {}
            }
          }
        } finally {
          reader.releaseLock();
        }

        setGenLog(prev => prev.map(j => j.id === jobId ? { ...j, status: savedCount > 0 ? 'done' : 'error', endTime: Date.now() } : j));
        pendingMediaJobsRef.current = Math.max(0, pendingMediaJobsRef.current - 1);
        if (pendingMediaJobsRef.current === 0) {
          await new Promise(r => setTimeout(r, 600));
          setShowGenModal(false);
          setGenSessionStart(0);
          setTimeout(() => {
            setCompletionType(promptType === 'image' ? 'prompt-image' : 'prompt-video');
            setCompletionMsg('小主已经给您生成完，请查看！');
            speakCompletion('小主已经给您生成完，请查看');
          }, 300);
        }
        return;
      }

      const isImageGen = action === 'generate-image';
      const isVideoGen = action === 'generate-video';
      const mediaCfg = isImageGen ? mediaConfig.image : isVideoGen ? mediaConfig.video : {};

      appendJobLog(`正在向大模型服务器提交请求...`);
      // POST 立即返回 taskId，不等待生成完成
      const res = await fetch(`/api/short-dramas/${dramaId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ action, configId: selectedConfigId, ...(Object.keys(mediaCfg).length ? mediaCfg : {}), ...extra, ...(mediaCfg?.systemConfigId ? { systemConfigId: mediaCfg.systemConfigId } : {}) }),
      });
      const data = await res.json();
      if (!data.success) {
        appendJobLog(`✗ 提交任务失败: ${data.error || '服务器报错'}`);
        setGenLog(prev => prev.map(j => j.id === jobId ? { ...j, status: 'error', endTime: Date.now(), error: data.error || '提交失败' } : j));
        alert(data.error || '生成失败');
        return;
      }

      // 轮询任务状态直到完成（每 3 秒一次，最长 10 分钟）
      const taskId = data.taskId;
      appendJobLog(`✓ 后端受理成功! 分配后台 TaskID: [ ${taskId} ]，进入状态轮询队列...`);
      const maxWait = 600_000;
      const pollMs = 3_000;
      const pollStart = Date.now();
      let pollCount = 0;
      while (Date.now() - pollStart < maxWait) {
        await new Promise(r => setTimeout(r, pollMs));
        pollCount++;
        if (isMediaGen && pollCount % 5 === 0) {
          const elapsed = Math.floor((Date.now() - pollStart) / 1000);
          setGenStreamText(prev => prev + `\n~ ${label} AI处理中... (${elapsed}s)`);
          appendJobLog(`~ 任务处理中... (已轮询 ${pollCount} 次, 耗时 ${elapsed}s)`);
        }
        try {
          const pr = await fetch(`/api/short-dramas/${dramaId}/generate?taskId=${taskId}`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          });
          const pd = await pr.json();
          const status = pd.data?.status;
          if (status === 'completed') {
            appendJobLog(`✓ 任务计算完成！开始拉取数据并同步资源链接...`);
            // 对 shot 媒体：直接轮询 API 直到 URL 出现；对资产/其他：重试 fetchDrama
            const mediaField: Record<string,string> = {
              'generate-image': 'imageUrl', 'generate-video': 'videoUrl', 'generate-tts': 'audioUrl',
            };
            const mField = mediaField[action];
            if (mField && extra.shotId && selectedEpisode) {
              for (let t = 0; t < 8; t++) {
                if (t > 0) await new Promise(r => setTimeout(r, 2_000));
                try {
                  const sr = await fetch(`/api/short-dramas/${dramaId}/storyboards?episodeId=${selectedEpisode.id}`, {
                    headers: { Authorization: `Bearer ${getToken()}` },
                  });
                  const sd = await sr.json();
                  if (sd.success) {
                    setShots(sd.data);
                    const hit = sd.data.find((s: any) => s.id === extra.shotId);
                    if (hit?.[mField]) {
                      appendJobLog(`✓ 媒体链接同步成功! URL: ${hit[mField]}`);
                      break;
                    }
                  }
                } catch { /* 继续重试 */ }
              }
              await fetchDrama();
            } else if (action === 'generate-asset-image' && extra.assetId && extra.assetType) {
              // 角色/场景/物品：轮询直到 imageUrl 出现，最多 8 次 × 2s
              for (let t = 0; t < 8; t++) {
                if (t > 0) await new Promise(r => setTimeout(r, 2_000));
                try {
                  const dr = await fetch(`/api/short-dramas/${dramaId}`, {
                    headers: { Authorization: `Bearer ${getToken()}` },
                  });
                  const dd = await dr.json();
                  if (dd.success) {
                    setDrama(dd.data);
                    const list = extra.assetType === 'character' ? dd.data.characters
                      : extra.assetType === 'scene' ? dd.data.scenes : dd.data.items;
                    const asset = (list || []).find((a: any) => a.id === extra.assetId);
                    if (asset?.imageUrl) {
                      appendJobLog(`✓ 资产图片同步成功! URL: ${asset.imageUrl}`);
                      break;
                    }
                  }
                } catch { /* 继续重试 */ }
              }
            } else {
              for (let t = 0; t < 3; t++) {
                if (t > 0) await new Promise(r => setTimeout(r, 1_500));
                await fetchDrama();
              }
            }
            broadcastDataChange({ type: 'short-drama', action: 'update', id: dramaId });
            appendJobLog(`✓ 任务全部执行完成。已成功生成并拉回数据。`);
            setGenLog(prev => prev.map(j => j.id === jobId ? { ...j, status: 'done', endTime: Date.now() } : j));
            if (isMediaGen) {
              const ts = new Date().toLocaleTimeString('zh-CN', {hour12:false});
              setGenStreamText(prev => prev + `\n[${ts}] ✓ ${label} 生成完成`);
              // 图片/视频提示词任务完成后：逐行打字机展示每个分镜的提示词内容
              if ((action === 'generate-image-prompt' || action === 'generate-video-prompt') && selectedEpisode) {
                try {
                  const sr = await fetch(`/api/short-dramas/${dramaId}/storyboards?episodeId=${selectedEpisode.id}`, {
                    headers: { Authorization: `Bearer ${getToken()}` },
                  });
                  const sd = await sr.json();
                  if (sd.success && sd.data?.length > 0) {
                    setShots(sd.data);
                    const fieldName = action === 'generate-image-prompt' ? 'imagePrompt' : 'videoPrompt';
                    const promptShots = (sd.data as any[]).filter((s: any) => s[fieldName]);
                    setGenStreamText(prev => prev + `\n  → 已生成 ${promptShots.length}/${sd.data.length} 个分镜提示词`);
                    for (const s of promptShots.slice(0, 30)) {
                      await new Promise(r => setTimeout(r, 55));
                      let promptText: string = (s as any)[fieldName] || '';
                      if (fieldName === 'videoPrompt') {
                        try { const vp = JSON.parse(promptText); promptText = vp.prompt || promptText; } catch {}
                      }
                      const preview = promptText.length > 88 ? promptText.slice(0, 88) + '…' : promptText;
                      setGenStreamText(prev => prev + `\n镜头${(s as any).shotNumber}: ${preview}`);
                    }
                    await new Promise(r => setTimeout(r, 400));
                  }
                } catch {}
              }
              pendingMediaJobsRef.current = Math.max(0, pendingMediaJobsRef.current - 1);
              if (pendingMediaJobsRef.current === 0) {
                setShowGenModal(false);
                setGenSessionStart(0);
                setTimeout(() => {
                  setCompletionType(action === 'generate-image' ? 'image' : action === 'generate-video' ? 'video' : action === 'generate-image-prompt' ? 'prompt-image' : action === 'generate-video-prompt' ? 'prompt-video' : 'asset');
                  setCompletionMsg('小主已经给您生成完，请查看！');
                  speakCompletion('小主已经给您生成完，请查看');
                }, 300);
              }
            }
            return;
          } else if (status === 'failed') {
            const errMsg = pd.data?.error || '生成失败';
            appendJobLog(`✗ 任务执行失败: ${errMsg}`);
            setGenLog(prev => prev.map(j => j.id === jobId ? { ...j, status: 'error', endTime: Date.now(), error: errMsg } : j));
            if (isMediaGen) {
              const ts = new Date().toLocaleTimeString('zh-CN', {hour12:false});
              setGenStreamText(prev => prev + `\n[${ts}] ✗ ${label} 失败: ${errMsg}`);
              pendingMediaJobsRef.current = Math.max(0, pendingMediaJobsRef.current - 1);
            }
            alert(errMsg);
            return;
          }
          // pending / running — 继续轮询
        } catch { /* 忽略单次轮询错误，继续重试 */ }
      }
      // 超时仍刷新一次
      appendJobLog(`✗ 任务轮询等待超时！(已超过 10 分钟最大等待时限)`);
      setGenLog(prev => prev.map(j => j.id === jobId ? { ...j, status: 'error', endTime: Date.now(), error: '等待超时，请检查结果' } : j));
      if (isMediaGen) { const ts = new Date().toLocaleTimeString('zh-CN', {hour12:false}); setGenStreamText(prev => prev + `\n[${ts}] ⚠ ${label} 等待超时`); pendingMediaJobsRef.current = Math.max(0, pendingMediaJobsRef.current - 1); }
      try { await fetchDrama(); if (selectedEpisode) await fetchShots(selectedEpisode.id); } catch {}
    } catch (e: any) {
      appendJobLog(`✗ 运行异常: ${e.message}`);
      setGenLog(prev => prev.map(j => j.id === jobId ? { ...j, status: 'error', endTime: Date.now(), error: e.message } : j));
      if (isMediaGen) { const ts = new Date().toLocaleTimeString('zh-CN', {hour12:false}); setGenStreamText(prev => prev + `\n[${ts}] ✗ ${label} 异常: ${e.message}`); pendingMediaJobsRef.current = Math.max(0, pendingMediaJobsRef.current - 1); }
      try { await fetchDrama(); if (selectedEpisode) await fetchShots(selectedEpisode.id); } catch {}
      alert(e.message);
    } finally {
      if (isItemGen && itemKey) {
        setGeneratingSet(prev => { const s = new Set(prev); s.delete(itemKey!); return s; });
      } else {
        setGenerating(null);
      }
    }
  };

  if (loading || !drama) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #0d1b2a 100%)' }}>
        <div className="animate-spin w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const tabs: { key: WorkTab; label: string; icon: string; badge?: number }[] = [
    { key: 'overview', label: '总览', icon: '📋' },
    { key: 'source', label: '数据源', icon: '📚', badge: (drama.novel ? 1 : 0) + (drama.script ? 1 : 0) },
    { key: 'episodes', label: '分集管理', icon: '📺', badge: drama.episodes.length },
    { key: 'characters', label: '角色管理', icon: '👤', badge: drama.characters.length },
    { key: 'scenes', label: '场景管理', icon: '🏔️', badge: drama.scenes?.length || 0 },
    { key: 'items', label: '物品管理', icon: '🔑', badge: drama.items?.length || 0 },
    { key: 'image-storyboards', label: '图片分镜', icon: '🖼️', badge: drama.shotCount },
    { key: 'video-storyboards', label: '视频分镜', icon: '🎥', badge: drama.shotCount },
    { key: 'jianying', label: '剪映导出', icon: '🎬' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #0d1b2a 100%)' }}>
      {/* 顶部导航栏 */}
      <header className="relative z-30 border-b border-white/5 backdrop-blur-xl sticky top-0" style={{ background: 'rgba(15,12,41,0.85)' }}>
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/novel-generator" className="flex items-center gap-2 text-gray-400 hover:text-purple-400 transition-colors text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              创作中心
            </Link>
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
            {isAdmin && (
              <Link href="/admin/members" className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 border border-red-500/25 text-red-400 rounded-lg hover:bg-red-500/25 transition-colors text-xs font-medium">管理后台</Link>
            )}
          </div>
          <div className="flex items-center gap-1 px-4 py-2 rounded-xl border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            <span className="text-white font-bold text-sm">创世纪联盟</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/member" className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 transition-colors text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
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
          </div>
        </div>
      </header>

      {/* 短剧标题栏 */}
      <div className="relative z-20 border-b border-white/5" style={{ background: 'rgba(15,12,41,0.5)' }}>
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/short-dramas" className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <div>
              <h1 className="text-lg sm:text-xl font-black bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500 bg-clip-text text-transparent">《{drama.title}》</h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-[11px] text-gray-600 tracking-wider">{getCategoryLabel(drama.genre) || '短剧'} &middot; {drama.currentEpisodes}/{drama.totalEpisodes}集</p>
              </div>
            </div>
          </div>
          {(generating || generatingSet.size > 0) && (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-violet-500/20 border border-violet-500/30 rounded-full">
              <div className="animate-spin w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full" />
              <span className="text-xs text-violet-300">生成中{generatingSet.size > 1 ? ` (×${generatingSet.size})` : ''}…</span>
            </div>
          )}
          <button onClick={() => setShowGenLog(v => !v)}
            className="relative px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all flex items-center gap-1">
            📋 日志
            {genLog.filter(j => j.status === 'running').length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-violet-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full">{genLog.filter(j => j.status === 'running').length}</span>
            )}
          </button>
        </div>
      </div>

      {/* 左侧栏 + 右侧内容 */}
      <div className="relative z-10">
        <div className="max-w-[1600px] mx-auto flex">
          {/* 左侧 Tab 导航栏 */}
          <nav className="w-44 shrink-0 py-6 px-3 border-r border-white/5" style={{ background: 'rgba(15,12,41,0.3)' }}>
            <div className="space-y-1">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                    tab === t.key
                      ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30 shadow-sm shadow-violet-500/10'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className="text-base">{t.icon}</span><span>{t.label}</span>
                  {t.badge !== undefined && t.badge > 0 && <span className="ml-auto px-1.5 py-0.5 text-[10px] bg-white/10 rounded-full">{t.badge}</span>}
                </button>
              ))}
            </div>
          </nav>
          {/* 右侧内容区 */}
          <div className="flex-1 min-w-0 py-6 px-6">
        {/* ===== 总览 ===== */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* 状态卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: '分集', value: `${drama.currentEpisodes}/${drama.totalEpisodes}`, color: 'violet', icon: '📺', tab: 'episodes' },
                { label: '角色', value: drama.characters.length, color: 'pink', icon: '👤', tab: 'characters' },
                { label: '场景', value: drama.scenes?.length || 0, color: 'emerald', icon: '🏔️', tab: 'scenes' },
                { label: '物品', value: drama.items?.length || 0, color: 'amber', icon: '🔑', tab: 'items' },
                { label: '图片分镜', value: drama.shotCount, color: 'blue', icon: '🖼️', tab: 'image-storyboards' },
                { label: '视频分镜', value: drama.shotCount, color: 'violet', icon: '🎥', tab: 'video-storyboards' },
              ].map((s, i) => (
                <div key={i} onClick={() => s.tab && setTab(s.tab as WorkTab)}
                  className={`rounded-xl p-4 border border-${s.color}-500/20 bg-${s.color}-500/10 ${s.tab ? 'cursor-pointer hover:border-' + s.color + '-500/50 hover:bg-' + s.color + '-500/20 transition-all' : ''}`}>
                  <div className="flex items-center gap-2 mb-2"><span className="text-lg">{s.icon}</span><span className="text-xs text-gray-400">{s.label}</span></div>
                  <div className="text-2xl font-bold text-white">{s.value}</div>
                </div>
              ))}
            </div>

            {/* 数据源概要 */}
            {(drama.novel || drama.script) && (
              <div className="backdrop-blur-xl rounded-2xl p-5 border border-amber-500/20" style={{ background: 'rgba(245,158,11,0.05)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">📚 关联数据源</h3>
                  <button onClick={() => setTab('source')} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">查看详情 →</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {drama.novel && (
                    <div className="rounded-xl p-3 bg-white/5 border border-white/10">
                      <div className="text-xs text-gray-400 mb-1">关联小说</div>
                      <div className="text-sm font-bold text-white">《{drama.novel.title}》</div>
                      <div className="flex gap-2 mt-1.5 text-[10px] text-gray-500">
                        <span>{drama.novel.currentChapters}章</span>
                        <span>{drama.novel.characters.length}个角色</span>
                        <span>{drama.novel.scenes.length}个场景</span>
                      </div>
                    </div>
                  )}
                  {drama.script && (
                    <div className="rounded-xl p-3 bg-white/5 border border-white/10">
                      <div className="text-xs text-gray-400 mb-1">关联剧本</div>
                      <div className="text-sm font-bold text-white">剧本工坊 · {drama.script.chapters.length}章</div>
                      <div className="flex gap-2 mt-1.5 text-[10px] text-gray-500">
                        <span className="text-emerald-400">{drama.script.chapters.filter(c => c.hasScreenplay).length} 剧本</span>
                        <span className="text-sky-400">{drama.script.chapters.filter(c => c.imagePrompts?.length > 0).length} 图片提示</span>
                        <span className="text-violet-400">{drama.script.chapters.filter(c => c.videoPrompts?.length > 0).length} 视频提示</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}


          </div>
        )}

        {/* ===== 数据源 ===== */}
        {tab === 'source' && (
          <SourceTab drama={drama} dramaId={dramaId} getToken={getToken} onRefresh={fetchDrama} />
        )}

        {/* ===== 分集管理 ===== */}
        {tab === 'episodes' && (
          <EpisodesTab drama={drama} dramaId={dramaId} getToken={getToken} onRefresh={fetchDrama} selectedEpisode={selectedEpisode} onSelect={setSelectedEpisode} />
        )}

        {/* ===== 角色管理 ===== */}
        {tab === 'characters' && (
          <CharactersTab 
            onContextMenuCard={(e: React.MouseEvent, id: string) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, type: 'character', id });
            }}
            drama={drama} dramaId={dramaId} getToken={getToken} onRefresh={fetchDrama} generating={generating} generatingSet={generatingSet} onGenerate={callGenerate} mediaConfig={mediaConfig} onSaveMediaConfig={saveMediaConfig} systemMediaConfigs={systemMediaConfigs.filter((c:any) => c.modelType === 'image')} />
        )}

        {/* ===== 场景管理 ===== */}
        {tab === 'scenes' && (
          <ScenesTab 
            onContextMenuCard={(e: React.MouseEvent, id: string) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, type: 'scene', id });
            }}
            drama={drama} dramaId={dramaId} getToken={getToken} onRefresh={fetchDrama} generating={generating} generatingSet={generatingSet} onGenerate={callGenerate} mediaConfig={mediaConfig} onSaveMediaConfig={saveMediaConfig} systemMediaConfigs={systemMediaConfigs.filter((c:any) => c.modelType === 'image')} />
        )}

        {/* ===== 物品管理 ===== */}
        {tab === 'items' && (
          <ItemsTab 
            onContextMenuCard={(e: React.MouseEvent, id: string) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, type: 'item', id });
            }}
            drama={drama} dramaId={dramaId} getToken={getToken} onRefresh={fetchDrama} generating={generating} generatingSet={generatingSet} onGenerate={callGenerate} mediaConfig={mediaConfig} onSaveMediaConfig={saveMediaConfig} systemMediaConfigs={systemMediaConfigs.filter((c:any) => c.modelType === 'image')} />
        )}

        {/* ===== 图片分镜制作 ===== */}
        {tab === 'image-storyboards' && (
          <StoryboardsTab mode="image"
            onContextMenuCard={(e: React.MouseEvent, id: string) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, type: 'image-storyboard', id });
            }}
            drama={drama} dramaId={dramaId} getToken={getToken}
            selectedEpisode={selectedEpisode} onSelectEpisode={setSelectedEpisode}
            shots={shots} shotsLoading={shotsLoading}
            generating={generating} generatingSet={generatingSet} onGenerate={callGenerate}
            onRefreshShots={() => selectedEpisode && fetchShots(selectedEpisode.id)}
            mediaConfig={mediaConfig} onSaveMediaConfig={saveMediaConfig}
            systemMediaConfigs={systemMediaConfigs.filter((c:any) => c.modelType === 'image')}
          />
        )}

        {/* ===== 视频分镜制作 ===== */}
        {tab === 'video-storyboards' && (
          <StoryboardsTab mode="video"
            onContextMenuCard={(e: React.MouseEvent, id: string) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, type: 'video-storyboard', id });
            }}
            drama={drama} dramaId={dramaId} getToken={getToken}
            selectedEpisode={selectedEpisode} onSelectEpisode={setSelectedEpisode}
            shots={shots} shotsLoading={shotsLoading}
            generating={generating} generatingSet={generatingSet} onGenerate={callGenerate}
            onRefreshShots={() => selectedEpisode && fetchShots(selectedEpisode.id)}
            mediaConfig={mediaConfig} onSaveMediaConfig={saveMediaConfig}
            systemMediaConfigs={systemMediaConfigs.filter((c:any) => c.modelType === 'video')}
          />
        )}

        {/* ===== 剪映一键草稿导出 ===== */}
        {tab === 'jianying' && (
          <JianyingExportTab
            drama={drama}
            selectedEpisode={selectedEpisode}
            onSelectEpisode={setSelectedEpisode}
            shots={shots}
            shotsLoading={shotsLoading}
            getToken={getToken}
          />
        )}

      </div>

      {/* AI Config Modal */}
      <AIConfigModal isOpen={showAiConfigModal} onClose={() => { setShowAiConfigModal(false); loadAvailableConfigs(); }} />

      {/* ── 生成进度矩阵弹窗 ── */}
      {showGenModal && !isGenModalMin && (() => {
        const sessionJobs = genSessionStart > 0 ? genLog.filter(j => j.startTime >= genSessionStart) : genLog.slice(0, 20);
        const running = sessionJobs.filter(j => j.status === 'running').length;
        const done = sessionJobs.filter(j => j.status === 'done').length;
        const total = sessionJobs.length;
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);
        const isRunning = running > 0;
        const C = genModalType === 'image'
          ? { bg: 'from-sky-500/20 to-blue-500/20', bar: isRunning ? 'from-sky-500 to-sky-400' : 'from-emerald-500 to-green-400', txt: isRunning ? 'text-sky-400' : 'text-emerald-400' }
          : genModalType === 'video'
          ? { bg: 'from-violet-500/20 to-purple-500/20', bar: isRunning ? 'from-violet-500 to-violet-400' : 'from-emerald-500 to-green-400', txt: isRunning ? 'text-violet-400' : 'text-emerald-400' }
          : genModalType === 'prompt-image'
          ? { bg: 'from-sky-500/20 to-cyan-500/20', bar: isRunning ? 'from-sky-400 to-cyan-400' : 'from-emerald-500 to-green-400', txt: isRunning ? 'text-cyan-400' : 'text-emerald-400' }
          : genModalType === 'prompt-video'
          ? { bg: 'from-fuchsia-500/20 to-violet-500/20', bar: isRunning ? 'from-fuchsia-500 to-violet-400' : 'from-emerald-500 to-green-400', txt: isRunning ? 'text-fuchsia-400' : 'text-emerald-400' }
          : { bg: 'from-amber-500/20 to-orange-500/20', bar: isRunning ? 'from-amber-500 to-orange-500' : 'from-emerald-500 to-green-400', txt: isRunning ? 'text-amber-400' : 'text-emerald-400' };
        const titles: Record<string,string> = { image: '图片生成中', video: '视频生成中', asset: '素材图生成中', 'prompt-image': '图片提示词生成中', 'prompt-video': '视频提示词生成中' };
        const subtitles: Record<string,string> = { image: 'AI 正在渲染分镜图片...', video: 'AI 正在生成短剧视频...', asset: 'AI 正在生成素材图片...', 'prompt-image': 'AI 正在为每个分镜生成图片提示词...', 'prompt-video': 'AI 正在为每个分镜生成视频运镜提示词...' };
        const icons: Record<string,React.ReactNode> = {
          image: <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
          video: <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
          asset: <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
          'prompt-image': <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
          'prompt-video': <svg className="w-5 h-5 text-fuchsia-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>,
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-2xl mx-4 bg-gradient-to-b from-slate-900/98 to-slate-950/98 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${C.bg}`}>
                        {icons[genModalType]}
                      </div>
                      {isRunning && <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm">
                        {titles[genModalType]}
                        {total > 0 && <span className="text-gray-500 font-normal ml-2">({done}/{total})</span>}
                      </h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">{isRunning ? subtitles[genModalType] : '生成完成，可关闭此窗口'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setIsGenModalMin(true)} className="p-2 hover:bg-white/5 rounded-lg transition-colors" title="最小化">
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {!isRunning && (
                      <button onClick={() => { setShowGenModal(false); setGenSessionStart(0); setGenStreamText(''); }} className="p-2 hover:bg-white/5 rounded-lg transition-colors" title="关闭">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${C.bar}`}
                      style={{ width: `${isRunning ? Math.max(pct, 5) : 100}%` }} />
                  </div>
                  <span className={`text-sm font-bold font-mono min-w-[4rem] text-right ${C.txt}`}>
                    {isRunning ? (running > 1 ? `×${running} 并发` : 'AI处理中') : '100%'}
                  </span>
                </div>
              </div>
              {/* MatrixStream content */}
              <div className="p-6 max-h-[45vh] overflow-auto">
                <div className="min-h-[120px]">
                  <MatrixStream text={genStreamText.slice(-2000)} />
                </div>
              </div>
              {/* Footer */}
              <div className="px-6 py-3 bg-slate-900/50 border-t border-white/5 flex items-center justify-between">
                <span className="text-[11px] text-green-400/60 flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-500 animate-pulse shadow-[0_0_6px_#22c55e]' : 'bg-gray-600'}`} />
                  {isRunning ? '实时生成中，内容持续更新' : '生成完成'}
                </span>
                <span className="text-[11px] text-green-400/60 font-mono">已完成 {done}/{total}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 最小化悬浮胶囊 ── */}
      {showGenModal && isGenModalMin && (() => {
        const sessionJobs = genSessionStart > 0 ? genLog.filter(j => j.startTime >= genSessionStart) : genLog.slice(0, 20);
        const running = sessionJobs.filter(j => j.status === 'running').length;
        const done = sessionJobs.filter(j => j.status === 'done').length;
        return (
          <div onClick={() => setIsGenModalMin(false)}
            className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 cursor-pointer bg-gray-950/95 border border-white/15 rounded-full px-4 py-2 shadow-2xl backdrop-blur-md hover:bg-gray-900/95 transition-colors">
            <div className={`w-2 h-2 rounded-full ${running > 0 ? 'bg-emerald-500 animate-pulse shadow-[0_0_6px_#22c55e]' : 'bg-gray-500'}`} />
            <span className="text-xs font-medium text-white">
              {running > 0 ? `生成中${running > 1 ? ` (×${running})` : ''}...` : '生成完成'}
            </span>
            {done > 0 && <span className="text-[10px] text-gray-500">{done} 完成</span>}
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
          </div>
        );
      })()}

      {/* 生成工作日志面板（历史记录） */}
      {showGenLog && (
        <div className="fixed right-4 bottom-4 z-[60] w-96 bg-gray-950/95 border border-white/15 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-sm font-bold text-white">📋 生成工作日志</span>
            <div className="flex items-center gap-2">
              <button onClick={() => { setGenLog([]); setExpandedLogId(null); }} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">清空</button>
              <button onClick={() => setShowGenLog(false)} className="text-gray-500 hover:text-white w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-all">✕</button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-white/5">
            {genLog.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">暂无生成记录</div>
            ) : genLog.map(j => {
              const isExpanded = expandedLogId === j.id;
              return (
                <div key={j.id} 
                  onClick={() => setExpandedLogId(isExpanded ? null : j.id)}
                  className={`px-4 py-3 flex flex-col gap-1 cursor-pointer transition-all border-l-2 hover:bg-white/5 ${
                    isExpanded 
                      ? 'bg-white/4 border-violet-500' 
                      : 'border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex-shrink-0 w-4 flex justify-center">
                      {j.status === 'running'
                        ? <div className="w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                        : j.status === 'done'
                        ? <span className="text-green-400 text-xs leading-4">✓</span>
                        : <span className="text-red-400 text-xs leading-4">✕</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-gray-200 truncate">{j.label}</p>
                        <svg className={`w-3 h-3 text-gray-500 transition-transform ${isExpanded ? 'rotate-180 text-violet-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {new Date(j.startTime).toLocaleTimeString()}
                        {j.endTime ? ` · 耗时 ${((j.endTime - j.startTime) / 1000).toFixed(1)}s` : ' · 正在生成…'}
                      </p>
                      {j.error && <p className="text-[10px] text-red-400 mt-1 font-medium bg-red-950/20 border border-red-500/10 px-2 py-1 rounded">{j.error}</p>}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="mt-2.5 p-2.5 rounded-xl bg-black/60 border border-white/8 font-mono text-[10px] text-gray-300 space-y-1.5 overflow-y-auto max-h-52" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between text-[9px] text-gray-500 pb-1.5 border-b border-white/5 mb-1.5 uppercase font-sans">
                        <span>📋 执行流水线日志</span>
                        <span>Log Detail</span>
                      </div>
                      {j.logs && j.logs.length > 0 ? (
                        j.logs.map((logLine, idx) => (
                          <div key={idx} className="whitespace-pre-wrap leading-relaxed border-l border-white/5 pl-2 hover:border-violet-500/40 transition-colors">
                            {logLine}
                          </div>
                        ))
                      ) : (
                        <div className="text-gray-600 italic py-1 pl-1">暂无执行流水信息</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* ── 完成提示弹窗 ── */}
      {completionMsg && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 border border-emerald-500/30 rounded-2xl shadow-2xl shadow-emerald-500/10 p-8 max-w-sm mx-4 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white text-base font-semibold leading-relaxed">{completionMsg}</p>
            <p className="text-gray-400 text-xs mt-2">{completionType === 'video' ? '视频已自动刷新，可在视频分镜卡片中查看' : completionType === 'asset' ? '素材图已自动刷新，可在资产管理中查看' : completionType === 'prompt-image' ? '图片提示词已生成，请切换到图片分镜查看' : completionType === 'prompt-video' ? '视频提示词已生成，请切换到视频分镜查看' : '图片已自动刷新，可在分镜卡片中查看'}</p>
            <button
              onClick={() => setCompletionMsg('')}
              className="mt-6 px-8 py-2.5 bg-gradient-to-r from-emerald-500 to-green-500 text-white text-sm font-semibold rounded-xl hover:from-emerald-400 hover:to-green-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {/* 全局右键媒体导入隐藏 Input */}
      <input
        type="file"
        ref={globalFileInputRef}
        onChange={handleGlobalFileChange}
        className="hidden"
      />

      {/* 局域网右键导入本地图片与视频 */}
      {contextMenu && (
        <div
          className="fixed bg-[#120a2e]/95 border border-white/12 rounded-xl py-1 px-1 shadow-2xl z-[150] min-w-[150px] text-xs backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.type === 'video-storyboard' ? (
            <>
              <button
                onClick={() => handleTriggerUpload('image-storyboard', contextMenu.id)}
                className="w-full text-left px-3 py-2 text-gray-200 hover:bg-violet-600/50 hover:text-white rounded-lg transition-all flex items-center gap-2 cursor-pointer font-medium"
              >
                🖼️ 导入本地图片
              </button>
              <button
                onClick={() => handleTriggerUpload('video-storyboard', contextMenu.id)}
                className="w-full text-left px-3 py-2 text-gray-200 hover:bg-violet-600/50 hover:text-white rounded-lg transition-all flex items-center gap-2 cursor-pointer font-medium"
              >
                🎥 导入本地视频
              </button>
            </>
          ) : (
            <button
              onClick={() => handleTriggerUpload(contextMenu.type, contextMenu.id)}
              className="w-full text-left px-3 py-2 text-gray-200 hover:bg-violet-600/50 hover:text-white rounded-lg transition-all flex items-center gap-2 cursor-pointer font-medium"
            >
              {contextMenu.type === 'image-storyboard' ? '🖼️ 导入本地图片' : '🖼️ 导入本地图片'}
            </button>
          )}
          <div className="border-t border-white/5 my-0.5" />
          <button
            onClick={() => setContextMenu(null)}
            className="w-full text-left px-3 py-1.5 text-gray-500 hover:text-gray-300 rounded-lg transition-all flex items-center gap-2 cursor-pointer"
          >
            ✕ 取消
          </button>
        </div>
      )}
    </div>
  </div>
</div>
  );
}

// ======================== 数据源 ========================
function SourceTab({ drama, dramaId, getToken, onRefresh }: any) {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [novelList, setNovelList] = useState<any[]>([]);
  const [loadingNovels, setLoadingNovels] = useState(false);
  const [expandedNovelCh, setExpandedNovelCh] = useState<number | null>(null);
  const [expandedScriptCh, setExpandedScriptCh] = useState<number | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  const novel = drama.novel;
  const script = drama.script;

  const loadNovels = async () => {
    setLoadingNovels(true);
    try {
      const res = await fetch(`/api/short-dramas/${dramaId}/import`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setNovelList(data.data.novels || []);
    } catch {}
    finally { setLoadingNovels(false); }
  };

  const handleLinkNovel = async (novelId: string) => {
    await fetch(`/api/short-dramas/${dramaId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ novelId }),
    });
    setShowLinkModal(false);
    onRefresh();
  };

  const handleImport = async () => {
    if (!drama.novelId) { alert("请先关联小说"); return; }
    setImporting(true); setImportResult(null);
    try {
      const res = await fetch(`/api/short-dramas/${dramaId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ novelId: drama.novelId, scriptId: drama.scriptId }),
      });
      const data = await res.json();
      if (data.success) {
        setImportResult(`导入成功！共导入 ${data.data.importedEpisodes} 个分集` +
          (data.data.scriptChaptersCount > 0 ? `（含剧本数据 ${data.data.scriptChaptersCount} 章）` : `（小说 ${data.data.novelChaptersCount} 章）`));
        onRefresh();
      } else { setImportResult(`导入失败: ${data.error}`); }
    } catch (e: any) { setImportResult(`导入异常: ${e.message}`); }
    finally { setImporting(false); }
  };

  const handleImportCharacters = async () => {
    if (!novel?.characters?.length) return;
    for (const nc of novel.characters) {
      await fetch(`/api/short-dramas/${dramaId}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          name: nc.name, role: nc.role || 'supporting',
          description: nc.description, personality: nc.personality, appearance: nc.appearance,
        }),
      });
    }
    onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* 关联操作 */}
      <div className="flex items-center gap-3 flex-wrap">
        {!novel && (
          <button onClick={() => { setShowLinkModal(true); loadNovels(); }}
            className="px-5 py-2.5 text-xs font-medium bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl hover:from-amber-700 hover:to-orange-700 transition-all flex items-center gap-2">
            📚 关联小说
          </button>
        )}
      </div>
      {importResult && (
        <div className={`p-3 rounded-xl text-xs ${importResult.includes('成功') ? 'bg-green-500/15 text-green-400 border border-green-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>
          {importResult}
        </div>
      )}

      {/* 关联小说选择弹窗 */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center" onClick={() => setShowLinkModal(false)}>
          <div className="w-full max-w-lg mx-4 bg-slate-900 border border-white/10 rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">选择关联小说</h3>
              <button onClick={() => setShowLinkModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2">
              {loadingNovels ? (
                <div className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full mx-auto" /></div>
              ) : novelList.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">暂无小说，请先创作</div>
              ) : novelList.map((n: any) => (
                <button key={n.id} onClick={() => handleLinkNovel(n.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-all hover:bg-white/5 ${drama.novelId === n.id ? 'border-amber-500/50 bg-amber-500/10' : 'border-white/10'}`}>
                  <div className="text-sm font-bold text-white">《{n.title}》</div>
                  <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
                    <span>{n.category || '未分类'}</span>
                    <span>{n.currentChapters}/{n.totalChapters}章</span>
                    <span>{n.chapterCount}章内容</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ====== 小说数据 ====== */}
      {novel && (
        <div className="rounded-2xl border border-amber-500/20 overflow-hidden shadow-xl shadow-amber-900/10" style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.07) 0%,rgba(15,12,41,0.95) 60%)' }}>
          {/* Hero header */}
          <div className="px-6 pt-5 pb-4 border-b border-amber-500/15">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">📖</span>
                  <h3 className="text-base font-bold text-white tracking-tight">《{novel.title}》</h3>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {novel.category && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25">{getCategoryLabel(novel.category)}</span>}
                  {novel.genderTarget && <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/25">{novel.genderTarget === 'male' ? '男频' : novel.genderTarget === 'female' ? '女频' : novel.genderTarget}</span>}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/25">{novel.currentChapters}/{novel.totalChapters} 章</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-gray-400 border border-white/10">{{'draft':'草稿','generating':'生成中','completed':'已完成'}[novel.status as 'draft'|'generating'|'completed'] || novel.status}</span>
                  {novel.protagonist && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/25">主角: {novel.protagonist}</span>}
                </div>
              </div>
            </div>
          </div>
          {/* 小说简介 */}
          {novel.description && <div className="px-6 py-3 border-b border-white/5 text-xs text-gray-400 leading-relaxed bg-white/2 italic">{novel.description}</div>}
          {/* 小说剧情 */}
          {novel.plot && (
            <div className="px-6 py-4 border-b border-white/5">
              <div className="text-xs text-violet-300 mb-2 font-semibold flex items-center gap-2">
                <span className="w-5 h-5 rounded-lg bg-violet-500/20 flex items-center justify-center text-[11px]">📋</span>
                主线剧情
              </div>
              <p className="text-xs text-gray-300 leading-relaxed bg-violet-500/5 rounded-xl px-3 py-2.5 border border-violet-500/15">{novel.plot.mainPlot || '-'}</p>
              {novel.plot.keyConflicts && <p className="text-[10px] text-gray-400 mt-2 pl-1">⚡ 冲突: {novel.plot.keyConflicts}</p>}
            </div>
          )}
          {/* 小说角色 - 按主角/反派/配角分组展示 */}
          {novel.characters.length > 0 && (() => {
            const protagonists = novel.characters.filter((c: NovelCharacter) => c.role === 'protagonist');
            const antagonists = novel.characters.filter((c: NovelCharacter) => c.role === 'antagonist');
            const supporting = novel.characters.filter((c: NovelCharacter) => c.role !== 'protagonist' && c.role !== 'antagonist');
            const roleStyle = (role: string) => role === 'protagonist'
              ? { border: 'border-amber-500/40', bg: 'bg-amber-500/8', badge: 'bg-amber-500/20 text-amber-300', avatar: 'bg-amber-500/25 text-amber-300' }
              : role === 'antagonist'
              ? { border: 'border-red-500/40', bg: 'bg-red-500/8', badge: 'bg-red-500/20 text-red-300', avatar: 'bg-red-500/25 text-red-300' }
              : { border: 'border-white/10', bg: 'bg-white/3', badge: 'bg-gray-500/20 text-gray-400', avatar: 'bg-gray-500/20 text-gray-300' };
            const renderGroup = (list: NovelCharacter[], label: string, colorCls: string) => list.length === 0 ? null : (
              <div className="mb-4">
                <div className={`text-[10px] font-semibold mb-2 flex items-center gap-1.5 ${colorCls}`}>
                  <span className="w-1 h-3 rounded-full inline-block" style={{background:'currentColor',opacity:0.6}} />
                  {label} <span className="opacity-60">({list.length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {list.map((c: NovelCharacter) => {
                    const rs = roleStyle(c.role);
                    const initial = cleanCharName(c.name).charAt(0);
                    return (
                      <div key={c.id} className={`flex gap-3 p-3 rounded-xl border ${rs.border} ${rs.bg} hover:bg-white/5 transition-colors`}>
                        <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-bold ${rs.avatar}`}>{initial}</div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white">{cleanCharName(c.name)}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${rs.badge}`}>
                              {c.role === 'protagonist' ? '主角' : c.role === 'antagonist' ? '反派' : '配角'}
                            </span>
                          </div>
                          {c.description && <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">{c.description}</p>}
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                            {c.personality && <span className="text-[10px] text-violet-400/80">性格: {c.personality}</span>}
                            {c.appearance && <span className="text-[10px] text-pink-400/80">外貌: {c.appearance}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
            return (
              <div className="px-6 py-4 border-b border-white/5">
                <div className="text-xs text-amber-300 mb-3 font-semibold flex items-center gap-2">
                  <span className="w-5 h-5 rounded-lg bg-amber-500/20 flex items-center justify-center text-[11px]">👤</span>
                  角色体系 <span className="text-amber-500/60">({novel.characters.length})</span>
                </div>
                {renderGroup(protagonists, '⭐ 主角', 'text-amber-400')}
                {renderGroup(antagonists, '⚡ 反派', 'text-red-400')}
                {renderGroup(supporting, '👥 配角', 'text-gray-400')}
              </div>
            );
          })()}

          {/* 角色关系体系 */}
          {(novel.characterRelationships && novel.characterRelationships.length > 0) && (
            <div className="px-6 py-4 border-b border-white/5">
              <div className="text-xs text-pink-300 mb-3 font-semibold flex items-center gap-2">
                <span className="w-5 h-5 rounded-lg bg-pink-500/20 flex items-center justify-center text-[11px]">🔗</span>
                角色关系体系 <span className="text-pink-500/60">({novel.characterRelationships.length})</span>
              </div>
              <div className="space-y-2">
                {novel.characterRelationships.map((r: any) => (
                  <div key={r.id} className="flex gap-2.5 p-3 rounded-xl bg-pink-500/6 border border-pink-500/15">
                    <div className="w-7 h-7 rounded-lg bg-pink-500/20 text-pink-300 text-xs font-bold flex items-center justify-center flex-shrink-0">🔗</div>
                    <div>
                      <div className="text-xs font-bold text-white">
                        <span className="text-amber-400">{r.fromCharacter}</span>
                        <span className="text-gray-500 mx-1">→</span>
                        <span className="text-violet-400">{r.toCharacter}</span>
                      </div>
                      {r.relationship && <p className="text-[10px] text-gray-400 leading-relaxed mt-0.5">{r.relationship}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* 小说场景 */}
          {novel.scenes.length > 0 && (
            <div className="px-6 py-4 border-b border-white/5">
              <div className="text-xs text-emerald-300 mb-3 font-semibold flex items-center gap-2">
                <span className="w-5 h-5 rounded-lg bg-emerald-500/20 flex items-center justify-center text-[11px]">🏔️</span>
                场景 <span className="text-emerald-500/60">({novel.scenes.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {novel.scenes.map((s: NovelScene) => (
                  <span key={s.id} className="px-3 py-1.5 text-[10px] rounded-xl bg-emerald-500/8 border border-emerald-500/20 text-emerald-200 flex items-center gap-1.5" title={s.description || ''}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 flex-shrink-0" />
                    {s.name}{s.atmosphere && <span className="text-emerald-500/60">· {s.atmosphere}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* 小说物品 */}
          {novel.items && novel.items.length > 0 && (
            <div className="px-6 py-4 border-b border-white/5">
              <div className="text-xs text-orange-300 mb-3 font-semibold flex items-center gap-2">
                <span className="w-5 h-5 rounded-lg bg-orange-500/20 flex items-center justify-center text-[11px]">🔑</span>
                物品 <span className="text-orange-500/60">({novel.items.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {novel.items.map((it: any) => (
                  <div key={it.id} className="flex items-start gap-2.5 p-3 rounded-xl bg-orange-500/6 border border-orange-500/15 hover:bg-orange-500/10 transition-colors">
                    <span className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center text-sm flex-shrink-0">🔑</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white">{it.name}</span>
                        {it.significance && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">{it.significance}</span>}
                      </div>
                      {it.description && <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{it.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* 小说章节 */}
          <div className="px-6 py-4">
            <div className="text-xs text-sky-300 mb-3 font-semibold flex items-center gap-2">
              <span className="w-5 h-5 rounded-lg bg-sky-500/20 flex items-center justify-center text-[11px]">📄</span>
              章节内容 <span className="text-sky-500/60">({novel.chapters.length})</span>
            </div>
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
              {novel.chapters.map((ch: NovelChapter) => (
                <div key={ch.index} className="rounded-xl border border-white/8 overflow-hidden bg-white/2 hover:bg-white/4 transition-colors">
                  <button onClick={() => setExpandedNovelCh(expandedNovelCh === ch.index ? null : ch.index)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-sky-500/15 text-sky-400 text-[9px] font-bold flex items-center justify-center flex-shrink-0">{ch.index}</span>
                      <span className="text-gray-200 font-medium">{ch.title}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-gray-500">{ch.wordCount}字</span>
                      <span className="text-gray-500 text-[10px]">{expandedNovelCh === ch.index ? '▼' : '▶'}</span>
                    </div>
                  </button>
                  {expandedNovelCh === ch.index && (
                    <div className="px-3 pb-3 text-xs text-gray-400 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">{ch.content.slice(0, 2000)}{ch.content.length > 2000 ? '...' : ''}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ====== 剧本数据 ====== */}
      {script && (
        <div className="backdrop-blur-xl rounded-2xl border border-emerald-500/20 overflow-hidden" style={{ background: 'rgba(16,185,129,0.04)' }}>
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">🎬 关联剧本</h3>
              <div className="flex gap-4 mt-1 text-[10px] text-gray-400">
                <span>共 {script.chapters.length} 章</span>
                <span className="text-emerald-400">{script.chapters.filter((c: ScriptChapter) => c.hasScreenplay).length} 章有剧本</span>
                <span className="text-sky-400">{script.chapters.filter((c: ScriptChapter) => c.imagePrompts?.length > 0).length} 章有图片提示词</span>
                <span className="text-violet-400">{script.chapters.filter((c: ScriptChapter) => c.videoPrompts?.length > 0).length} 章有视频提示词</span>
              </div>
            </div>
            {novel && (
              <a href={`/script?novelId=${novel.id}`} target="_blank" rel="noreferrer"
                className="px-3 py-1.5 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-all">
                打开剧本工坊 ↗
              </a>
            )}
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {script.chapters.map((ch: ScriptChapter, idx: number) => {
                const isExpanded = expandedScriptCh === ch.index;
                const hasScreenplay = ch.hasScreenplay;
                const hasImagePrompts = !!(ch.imagePrompts?.length > 0);
                const hasVideoPrompts = !!(ch.videoPrompts?.length > 0);
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
                const chColorKey = Object.keys(chapterColorMap)[idx % Object.keys(chapterColorMap).length];
                const chColor = chapterColorMap[chColorKey];
                return (
                  <div key={ch.index}
                    className={`bg-slate-900/50 border rounded-2xl overflow-hidden transition-all duration-300 ${isExpanded ? 'md:col-span-2 xl:col-span-3 border-amber-500/20 shadow-lg shadow-amber-500/[0.03]' : 'border-white/[0.04]'}`}
                    {...(!isExpanded ? {
                      onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = chColor.gradient; e.currentTarget.style.borderColor = chColor.border; },
                      onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = ''; }
                    } : {})}
                  >
                    <button onClick={() => setExpandedScriptCh(isExpanded ? null : ch.index)}
                      className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                          style={{background:chColor.bg, color:chColor.text, boxShadow:`inset 0 0 8px ${chColor.border}`}}>
                          {idx + 1}
                        </div>
                        <div className="text-left min-w-0">
                          <span className="font-bold text-[14px] block truncate">{ch.title || `第${idx + 1}章`}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex gap-1">
                              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${hasScreenplay ? 'bg-emerald-400' : 'bg-gray-700'}`} title="剧本" />
                              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${hasImagePrompts ? 'bg-sky-400' : 'bg-gray-700'}`} title="图片提示词" />
                              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${hasVideoPrompts ? 'bg-violet-400' : 'bg-gray-700'}`} title="视频提示词" />
                            </div>
                            <span className="text-[10px] text-gray-600 font-mono">{progress}/3</span>
                          </div>
                        </div>
                      </div>
                      <svg className={`w-4 h-4 text-gray-600 transition-transform duration-300 shrink-0 ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-white/[0.04] px-5 pb-4 space-y-3 pt-3">
                        {ch.screenplay && (
                          <div>
                            <div className="text-[10px] text-emerald-400 mb-1.5 font-medium">📝 剧本内容</div>
                            <ScreenplayRenderer screenplay={typeof ch.screenplay === 'string' ? ch.screenplay : JSON.stringify(ch.screenplay)} />
                          </div>
                        )}
                        {ch.scenes?.length > 0 && (
                          <div>
                            <div className="text-[10px] text-sky-400 mb-1.5 font-medium">🎭 场景 ({ch.scenes.length})</div>
                            <div className="text-xs text-gray-400 bg-white/5 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1">
                              {ch.scenes.map((sc: any, si: number) => (
                                <div key={si}><span className="text-white">{sc.location || sc.sceneIndex}:</span> {sc.description || JSON.stringify(sc)}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        {ch.imagePrompts?.length > 0 && (
                          <div>
                            <div className="text-[10px] text-sky-400 mb-1.5 font-medium">🖼️ 图片提示词 ({ch.imagePrompts.length})</div>
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              {ch.imagePrompts.map((p: any, pi: number) => (
                                <div key={pi} className="text-[10px] text-gray-400 bg-white/5 rounded-lg p-2 italic">{typeof p === 'string' ? p : (p.prompt || p.imagePrompt || JSON.stringify(p))}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        {ch.videoPrompts?.length > 0 && (
                          <div>
                            <div className="text-[10px] text-violet-400 mb-1.5 font-medium">🎥 视频提示词 ({ch.videoPrompts.length})</div>
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              {ch.videoPrompts.map((p: any, pi: number) => (
                                <div key={pi} className="text-[10px] text-gray-400 bg-white/5 rounded-lg p-2 italic">{typeof p === 'string' ? p : (p.prompt || p.videoPrompt || JSON.stringify(p))}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        {!ch.screenplay && !ch.scenes?.length && !ch.imagePrompts?.length && !ch.videoPrompts?.length && (
                          <p className="text-xs text-gray-600 text-center py-2">该章节暂无内容</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 无数据状态 */}
      {!novel && !script && (
        <div className="text-center py-16">
          <span className="text-5xl block mb-4">📚</span>
          <h3 className="text-lg font-bold text-white mb-2">未关联数据源</h3>
          <p className="text-sm text-gray-400 mb-6">关联小说后，可自动导入章节内容、角色、场景等数据到短剧分集</p>
          <button onClick={() => { setShowLinkModal(true); loadNovels(); }}
            className="px-6 py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl font-medium transition-all">
            📚 关联小说
          </button>
        </div>
      )}
    </div>
  );
}

// ======================== 分集管理 ========================
function EpisodesTab({ drama, dramaId, getToken, onRefresh, selectedEpisode, onSelect }: any) {
  const [addEpisode, setAddEpisode] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editEp, setEditEp] = useState<Episode | null>(null);
  const [editForm, setEditForm] = useState({ title: "", synopsis: "", screenplay: "", status: "draft" });
  const [saving, setSaving] = useState(false);
  const [syncingScript, setSyncingScript] = useState(false);
  const [syncScriptMsg, setSyncScriptMsg] = useState<string | null>(null);

  const handleSyncFromScript = async () => {
    setSyncingScript(true);
    setSyncScriptMsg(null);
    try {
      const res = await fetch(`/api/short-dramas/${dramaId}/sync-from-script`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) { setSyncScriptMsg(data.message); onRefresh(); }
      else setSyncScriptMsg(data.error || '同步失败');
    } catch (e: any) { setSyncScriptMsg(e.message); }
    finally { setSyncingScript(false); }
  };

  const safeText = (s: string | null | undefined): string => {
    if (!s) return '';
    const t = s.trim();
    if (t.startsWith('{') || t.startsWith('[')) return '';
    return t;
  };

  const openEdit = (ep: Episode) => {
    const chIdx = (ep as any).sourceScriptChapterIndex;
    const linkedChapter = chIdx != null ? (drama.script?.chapters?.[chIdx] as any) : null;
    const resolvedScreenplay = ep.screenplay ||
      (linkedChapter?.screenplay
        ? (typeof linkedChapter.screenplay === 'string' ? linkedChapter.screenplay : JSON.stringify(linkedChapter.screenplay))
        : '') || '';
    setEditEp(ep);
    setEditForm({
      title: ep.title || linkedChapter?.title || linkedChapter?.chapterTitle || `第${ep.episodeNumber}集`,
      synopsis: safeText(ep.synopsis),
      screenplay: resolvedScreenplay,
      status: ep.status || 'draft',
    });
  };

  const handleAdd = async () => {
    const nextNum = (drama.episodes?.length || 0) + 1;
    await fetch(`/api/short-dramas/${dramaId}/episodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ episodeNumber: nextNum, title: newTitle || `第${nextNum}集` }),
    });
    setAddEpisode(false);
    setNewTitle("");
    onRefresh();
  };

  const handleSave = async () => {
    if (!editEp) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/short-dramas/${dramaId}/episodes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ episodeId: editEp.id, title: editForm.title, synopsis: editForm.synopsis, screenplay: editForm.screenplay, status: editForm.status }),
      });
      const data = await res.json();
      if (data.success) { setEditEp(null); onRefresh(); }
      else alert(data.error || '保存失败');
    } finally { setSaving(false); }
  };

  const handleDelete = async (ep: Episode) => {
    if (!confirm(`确定删除第${ep.episodeNumber}集吗？`)) return;
    await fetch(`/api/short-dramas/${dramaId}/episodes`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ episodeId: ep.id }),
    });
    setEditEp(null);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* 编辑展示面板 - 无弹窗，直接页内打开 */}
      {editEp ? (
        <div className="bg-[#150f35]/30 border border-white/10 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <button onClick={() => setEditEp(null)} className="flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-violet-400 bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-xl transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              返回分集列表
            </button>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg border tracking-wide bg-violet-500/10 text-violet-300 border-violet-500/20">第 {editEp.episodeNumber} 集详情</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-black text-slate-300 tracking-wider uppercase block">标题</label>
              <input type="text" className="w-full px-3.5 py-2.5 text-sm font-semibold border border-white/10 rounded-xl bg-white/5 text-white focus:outline-none focus:border-violet-500 transition-all" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-black text-slate-300 tracking-wider uppercase block">状态</label>
              <select className="w-full px-3.5 py-2.5 text-sm font-semibold border border-white/10 rounded-xl bg-[#1a1040] text-white focus:outline-none focus:border-violet-500 transition-all" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                <option value="draft">草稿</option>
                <option value="generating">生成中</option>
                <option value="completed">已完成</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-black text-slate-300 tracking-wider uppercase block">简介（剧情概述）</label>
            <textarea rows={3} className="w-full px-3.5 py-2.5 text-sm font-semibold border border-white/10 rounded-xl bg-white/5 text-white resize-none focus:outline-none focus:border-violet-500 transition-all" placeholder="本集剧情简介…" value={editForm.synopsis} onChange={e => setEditForm(f => ({ ...f, synopsis: e.target.value }))} />
          </div>

          {editForm.screenplay ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-black text-slate-300 tracking-wider uppercase block">剧本内容</label>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-bold">已生成</span>
              </div>
              <div className="max-h-96 overflow-y-auto rounded-xl border border-white/5 bg-black/25 px-4 py-4 cinema-modal-scrollbar">
                <ScreenplayRenderer screenplay={editForm.screenplay} />
              </div>
            </div>
          ) : (
            <div className="text-sm font-semibold text-gray-500 text-center py-6 border border-dashed border-white/10 rounded-xl">暂无剧本，可从分镜制作页AI生成</div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-white/5">
            <button onClick={() => handleDelete(editEp)} className="px-3.5 py-2 text-xs font-semibold text-red-400 hover:text-red-300 border border-red-500/20 rounded-xl hover:bg-red-500/10 transition-all">删除本集</button>
            <div className="flex gap-3">
              <button onClick={() => setEditEp(null)} className="px-5 py-2 text-xs font-semibold text-gray-400 hover:text-white rounded-xl transition-all">返回列表</button>
              <button onClick={handleSave} disabled={saving} className="px-6 py-2 text-xs font-black bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-all shadow-lg shadow-violet-600/15">
                {saving ? '保存中…' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 分集列表视图 */
        <>
          {syncScriptMsg && (
            <div className={`px-4 py-2.5 rounded-xl text-xs flex items-center justify-between ${syncScriptMsg.includes('失败') || syncScriptMsg.includes('错') ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'}`}>
              <span>{syncScriptMsg}</span>
              <button onClick={() => setSyncScriptMsg(null)} className="opacity-60 hover:opacity-100 ml-2">✕</button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">📺 分集列表</h3>
            <div className="flex items-center gap-2">
              {drama.scriptId && (
                <button onClick={handleSyncFromScript} disabled={syncingScript} className="px-4 py-2 text-xs font-medium bg-amber-600/80 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1 transition-all">
                  {syncingScript ? <><span className="animate-spin inline-block w-3 h-3 border border-white border-t-transparent rounded-full" /> 同步中...</> : '📜 从剧本同步'}
                </button>
              )}
              <button onClick={() => setAddEpisode(true)} className="px-4 py-2 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-all flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                添加分集
              </button>
            </div>
          </div>

          {addEpisode && (
            <div className="flex gap-3 items-center p-4 rounded-xl bg-white/5 border border-white/10">
              <input type="text" placeholder="分集标题（可选）" className="flex-1 px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
              <button onClick={handleAdd} className="px-4 py-2 text-xs bg-violet-600 text-white rounded-lg">添加</button>
              <button onClick={() => setAddEpisode(false)} className="px-4 py-2 text-xs text-gray-400 hover:text-white rounded-lg">取消</button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {drama.episodes?.map((ep: Episode) => {
              const displaySynopsis = safeText(ep.synopsis);
              const chIdx2 = (ep as any).sourceScriptChapterIndex;
              const srcCh2 = (ep as any).sourceChapter;
              const linkedCh = chIdx2 != null
                ? (drama.script?.chapters?.[chIdx2] as any)
                : srcCh2 != null
                  ? (drama.script?.chapters?.find((c: any) => c.index === srcCh2 - 1) as any)
                  : (drama.script?.chapters?.[ep.episodeNumber - 1] as any) ?? null;
              const novelCh2 = (drama.novel?.chapters as any[]|undefined)?.[ep.episodeNumber - 1];
              const _epChTitle = linkedCh?.title || novelCh2?.title || ep.title;
              const _epGeneric = !_epChTitle || /^第\d+集$/.test(_epChTitle.trim());
              const displayTitle = _epGeneric ? `第${ep.episodeNumber}集` : `第${ep.episodeNumber}集：${_epChTitle}`;
              return (
                <div key={ep.id}
                  onClick={() => openEdit(ep)}
                  className="flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all bg-white/5 border-white/10 hover:bg-violet-500/8 hover:border-violet-500/30 group"
                >
                  <span className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-violet-600/20 text-violet-300 text-sm font-bold">{ep.episodeNumber}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">{displayTitle}</div>
                    {displaySynopsis && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{displaySynopsis}</p>}
                    <div className="flex gap-2 mt-1 text-[10px] text-gray-500">
                      {(ep.screenplay || linkedCh?.screenplay) && <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">剧本 ✓</span>}
                      {!!ep.sourceChapter && <span>来自第{ep.sourceChapter}章</span>}
                      {ep.sourceScriptChapterIndex != null && <span>剧本第{ep.sourceScriptChapterIndex + 1}章</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-1 rounded-full ${ep.status === 'completed' ? 'bg-green-500/20 text-green-400' : ep.status === 'generating' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-400'}`}>
                      {ep.status === 'completed' ? '已完成' : ep.status === 'generating' ? '生成中' : '草稿'}
                    </span>
                    <span className="text-[10px] text-gray-600 group-hover:text-violet-400 transition-colors">✏️</span>
                  </div>
                </div>
              );
            })}
            {(!drama.episodes || drama.episodes.length === 0) && (
              <div className="text-center py-12 text-gray-500 text-sm">暂无分集，点击上方按钮添加</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ======================== 共享图片生成配置面板 ========================
function AssetImgPanel({ mediaConfig, onSaveMediaConfig, systemMediaConfigs = [], imageAspect, setImageAspect, moduleKey = 'image' }: any) {
  const IMAGE_ASPECTS = [
    { key: '1:1',  label: '1:1',  w: 1024, h: 1024 },
    { key: '16:9', label: '16:9', w: 1280, h: 720  },
    { key: '9:16', label: '9:16', w: 720,  h: 1280 },
    { key: '4:3',  label: '4:3',  w: 1024, h: 768  },
    { key: '3:4',  label: '3:4',  w: 768,  h: 1024 },
  ] as const;
  type MediaProvider = { id: string; name: string; baseUrl: string; models: readonly string[] };
  const providers = IMAGE_PROVIDERS as readonly MediaProvider[];
  const curCfg = mediaConfig?.[moduleKey] || mediaConfig?.image || {};
  const activeSysCfg = systemMediaConfigs.find((sc: any) => sc.id === curCfg.systemConfigId);
  const isCustomSelected = !curCfg.systemConfigId;
  const selectedCardId = curCfg.systemConfigId || '__custom__';
  const isReady = !!curCfg.apiKey || (!!activeSysCfg && activeSysCfg.hasKey);
  const curProvider = Array.from(providers).find((p: any) => p.id === curCfg.provider) || providers[0];
  const [showCfgForm, setShowCfgForm] = useState(!curCfg.apiKey && isCustomSelected);

  return (
    <div className="backdrop-blur-xl rounded-2xl p-4 border border-blue-500/20" style={{ background: 'rgba(59,130,246,0.04)' }}>
      {/* Header and Selector merged */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
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
          <span className="font-semibold flex items-center gap-1.5 select-none">
            <span className="animate-rainbow font-black text-sm flex items-center gap-1">
              {moduleKey === 'character' ? '👤 角色生图' : moduleKey === 'scene' ? '🏔️ 场景生图' : moduleKey === 'item' ? '🔑 物品生图' : '🖼️ 图片生成'}API配置：
            </span>
          </span>
          <div className="flex items-center gap-2">
            <select
              value={selectedCardId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__custom__') {
                  onSaveMediaConfig({ ...(mediaConfig || {}), [moduleKey]: { ...curCfg, systemConfigId: '' } });
                  setShowCfgForm(true);
                } else {
                  const sc = systemMediaConfigs.find((x: any) => x.id === val);
                  if (sc) {
                    onSaveMediaConfig({ ...(mediaConfig || {}), [moduleKey]: { ...curCfg, provider: sc.provider, model: sc.model, apiUrl: sc.apiUrl || '', systemConfigId: sc.id, apiKey: '' } });
                    setShowCfgForm(false);
                  }
                }
              }}
              className="bg-slate-950/60 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-blue-400 font-bold focus:outline-none focus:border-blue-500/50 cursor-pointer"
            >
              {systemMediaConfigs.map((sc: any) => (
                <option key={sc.id} value={sc.id} className="bg-[#111827] text-slate-100 font-normal">
                  {sc.name} ({sc.provider} · {sc.model?.split('/').pop()}) {sc.isDefault === 1 ? '★' : ''}
                </option>
              ))}
              <option value="__custom__" className="bg-[#111827] text-slate-100 font-normal">自定义配置 (填入您自己的 API Key)</option>
            </select>
          </div>
        </div>
        {isReady && <span className="text-[10px] text-green-400 bg-green-500/10 px-2.5 py-1 rounded-lg border border-green-500/20 font-bold">✓ 已就绪: {activeSysCfg ? activeSysCfg.name : `${curProvider?.name} · ${(curCfg.model || '').split('/').pop()}`}</span>}
        {!isReady && <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 font-bold">⚠️ 未配置</span>}
      </div>
      {/* Custom config form */}
      {isCustomSelected && showCfgForm && (
        <div className="mt-3 pt-3 border-t border-white/8 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">供应商</label>
              <CustomSelect
                value={curCfg.provider || providers[0]?.id || ''}
                onChange={v => {
                  const p = Array.from(providers).find((x: any) => x.id === v);
                  onSaveMediaConfig({ ...(mediaConfig || {}), [moduleKey]: { ...curCfg, provider: v, apiUrl: (p as any)?.baseUrl || '', model: (p as any)?.models?.[0] || '', systemConfigId: '' } });
                }}
                options={Array.from(providers).map((p: any) => ({ value: p.id, label: p.name }))}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 mb-1 block">模型</label>
              {(curProvider?.models?.length ?? 0) > 0 ? (
                <CustomSelect
                  value={curCfg.model || curProvider?.models?.[0] || ''}
                  onChange={v => onSaveMediaConfig({ ...(mediaConfig || {}), [moduleKey]: { ...curCfg, model: v, systemConfigId: '' } })}
                  options={(curProvider?.models || []).map((m: string) => ({ value: m, label: m }))}
                />
              ) : (
                <input value={curCfg.model || ''} placeholder="输入模型名称"
                  onChange={e => onSaveMediaConfig({ ...(mediaConfig || {}), [moduleKey]: { ...curCfg, model: e.target.value, systemConfigId: '' } })}
                  className="w-full text-xs bg-white/8 border border-white/10 rounded-lg px-2 py-1.5 text-white placeholder-gray-600 focus:outline-none" />
              )}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 mb-1 block">API Key <span className="text-red-400">*</span></label>
            <input type="password" value={curCfg.apiKey || ''} placeholder="请输入 API Key（sk-...）"
              onChange={e => onSaveMediaConfig({ ...(mediaConfig || {}), [moduleKey]: { ...curCfg, apiKey: e.target.value, systemConfigId: '' } })}
              className="w-full text-xs bg-white/8 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-white/25" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 mb-1 block">自定义 API URL <span className="text-gray-600 ml-1">(可选，默认: {curProvider?.baseUrl})</span></label>
            <input value={curCfg.apiUrl || ''} placeholder={curProvider?.baseUrl || 'https://...'}
              onChange={e => onSaveMediaConfig({ ...(mediaConfig || {}), [moduleKey]: { ...curCfg, apiUrl: e.target.value } })}
              className="w-full text-xs bg-white/8 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/25" />
          </div>
          <div className="text-[10px] text-gray-500">配置自动保存到本地浏览器。</div>
        </div>
      )}
      {isCustomSelected && (
        <button onClick={() => setShowCfgForm(v => !v)} className="mt-2 text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
          {showCfgForm ? '▲ 收起配置' : '▼ 展开配置'}
        </button>
      )}
    </div>
  );
}

// ======================== 风格设置弹窗 ========================
type StyleType = 'character' | 'scene' | 'item' | 'image-storyboard' | 'video-storyboard';
interface StyleConfig { prePrompt: string; postPrompt: string; referenceImages: string[]; }
const STYLE_META: Record<StyleType, { label: string; desc: string; color: string }> = {
  character: { label: '角色风格设置', desc: '设置本作品的角色生成风格，这些设置将应用于所有角色生成', color: 'violet' },
  scene:     { label: '场景风格设置', desc: '设置本作品的场景生成风格，这些设置将应用于所有场景生成', color: 'emerald' },
  item:      { label: '物品风格设置', desc: '设置本作品的物品生成风格，这些设置将应用于所有物品生成', color: 'amber' },
  'image-storyboard': { label: '图片分镜风格设置', desc: '设置本作品的图片分镜生成风格，前置和后置提示词会自动拼接到每个分镜的图片生图提示词中', color: 'sky' },
  'video-storyboard': { label: '视频分镜风格设置', desc: '设置本作品的视频分镜生成风格，前置和后置提示词会自动拼接到每个分镜的视频生图提示词中', color: 'violet' },
};
function StyleSettingModal({ type, style, onSave, onClose }: { type: StyleType; style: StyleConfig; onSave: (s: StyleConfig) => Promise<void>; onClose: () => void }) {
  const meta = STYLE_META[type];
  const colorMap: Record<string, string> = { violet: 'violet-500', emerald: 'emerald-500', amber: 'amber-500', sky: 'sky-500' };
  const borderColor = `border-${colorMap[meta.color]}/30`;
  const [form, setForm] = useState<StyleConfig>({ prePrompt: style.prePrompt || '', postPrompt: style.postPrompt || '', referenceImages: [...(style.referenceImages || [null, null, null, null])].slice(0, 4).concat(Array(4).fill(null)).slice(0, 4) });
  const [saving, setSaving] = useState(false);
  const fileRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const handleFile = (idx: number, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const imgs = [...form.referenceImages] as string[];
      imgs[idx] = e.target?.result as string;
      setForm(f => ({ ...f, referenceImages: imgs }));
    };
    reader.readAsDataURL(file);
  };
  const removeImg = (idx: number) => {
    const imgs = [...form.referenceImages] as string[];
    imgs[idx] = '';
    setForm(f => ({ ...f, referenceImages: imgs }));
  };
  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); onClose(); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#1a1040] border border-white/15 rounded-2xl p-6 w-full max-w-[520px] max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-base">{meta.label}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>
        <p className="text-xs text-gray-400">{meta.desc}</p>
        <div className="space-y-1">
          <label className="text-xs text-gray-300 font-medium">前置提示词</label>
          <textarea rows={4} className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none focus:border-violet-500" placeholder="在生成提示词前面添加的固定内容..." value={form.prePrompt} onChange={e => setForm(f => ({ ...f, prePrompt: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-300 font-medium">后置提示词</label>
          <textarea rows={3} className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none focus:border-violet-500" placeholder="在生成提示词后面追加的固定内容..." value={form.postPrompt} onChange={e => setForm(f => ({ ...f, postPrompt: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-sky-400 font-medium">参考图片</label>
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map(idx => (
              <div key={idx} className="relative aspect-square rounded-xl border-2 border-dashed border-white/15 bg-white/3 flex items-center justify-center cursor-pointer hover:border-white/30 overflow-hidden group" onClick={() => fileRefs[idx].current?.click()}>
                {form.referenceImages[idx] ? (
                  <>
                    <img src={form.referenceImages[idx]} alt="" className="w-full h-full object-cover" />
                    <button onClick={e => { e.stopPropagation(); removeImg(idx); }} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                  </>
                ) : (
                  <span className="text-gray-500 text-xs">参考图{idx + 1}</span>
                )}
                <input ref={fileRefs[idx]} type="file" accept="image/*" className="hidden" onChange={e => handleFile(idx, e.target.files?.[0] || null)} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 text-xs text-gray-400 hover:text-white border border-white/10 rounded-lg transition-colors">取消</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-all">{saving ? '保存中…' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}

// ======================== 角色管理 ========================
function CharactersTab({ drama, dramaId, getToken, onRefresh, generating, generatingSet = new Set(), onGenerate, mediaConfig, onSaveMediaConfig, systemMediaConfigs, onContextMenuCard }: any) {
  const [addChar, setAddChar] = useState(false);
  const [charForm, setCharForm] = useState({ name: "", role: "supporting", gender: "", description: "", personality: "", appearance: "", appearanceHairColor: "", appearanceHairstyle: "", appearanceEyes: "", appearanceUpper: "", appearanceLower: "" });
  const [editChar, setEditChar] = useState<Character | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "supporting", gender: "", description: "", personality: "", appearance: "", appearanceHairColor: "", appearanceHairstyle: "", appearanceEyes: "", appearanceUpper: "", appearanceLower: "" });
  const [saving, setSaving] = useState(false);
  const [imageAspect, setImageAspectRaw] = useState<string>(() =>
    (typeof window !== 'undefined' && localStorage.getItem('sdc-aspect-character')) || '1:1'
  );
  const setImageAspect = (v: string) => {
    if (typeof window !== 'undefined') localStorage.setItem('sdc-aspect-character', v);
    setImageAspectRaw(v);
  };
  const IMAGE_ASPECTS = [{ key:'1:1',w:1024,h:1024 },{ key:'16:9',w:1280,h:720 },{ key:'9:16',w:720,h:1280 },{ key:'4:3',w:1024,h:768 },{ key:'3:4',w:768,h:1024 }] as const;
  const [lightboxImg, setLightboxImg] = useState<{url:string,name:string}|null>(null);
  const [showCharStyle, setShowCharStyle] = useState(false);
  const getCharStyle = (): StyleConfig => { try { return drama.characterStyle ? JSON.parse(drama.characterStyle) : { prePrompt: '', postPrompt: '', referenceImages: [] }; } catch { return { prePrompt: '', postPrompt: '', referenceImages: [] }; } };
  const saveCharStyle = async (s: StyleConfig) => {
    await fetch(`/api/short-dramas/${dramaId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ characterStyle: JSON.stringify(s) }) });
    onRefresh();
  };

  const parseAppearanceField = (appearance: string, label: string): string => {
    const regex = new RegExp(`${label}[：:]\\s*([^｜|]*)`);
    const match = appearance.match(regex);
    return match ? match[1].trim() : '';
  };

  const openEdit = (c: Character) => {
    setEditChar(c);
    // 如果 gender 为空但 personality 包含性别信息，自动提取
    let gender = c.gender || '';
    let personality = (c as any).personality || '';
    if (!gender && (personality === '男' || personality === '女')) {
      gender = personality;
      personality = '';
    }
    setEditForm({ 
      name: cleanCharName(c.name), 
      role: c.role || 'supporting', 
      gender, 
      description: c.description || '', 
      personality,
      appearance: c.appearance || '',
      appearanceHairColor: parseAppearanceField(c.appearance || '', '发色'),
      appearanceHairstyle: parseAppearanceField(c.appearance || '', '发型'),
      appearanceEyes: parseAppearanceField(c.appearance || '', '眼睛'),
      appearanceUpper: parseAppearanceField(c.appearance || '', '上身'),
      appearanceLower: parseAppearanceField(c.appearance || '', '下身'),
    });
  };

  const handleUpdate = async () => {
    if (!editChar || !editForm.name) return;
    setSaving(true);
    try {
      // 组合外貌子字段为完整字符串
      const appearanceParts: string[] = [];
      if (editForm.appearanceHairColor) appearanceParts.push(`发色：${editForm.appearanceHairColor}`);
      if (editForm.appearanceHairstyle) appearanceParts.push(`发型：${editForm.appearanceHairstyle}`);
      if (editForm.appearanceEyes) appearanceParts.push(`眼睛：${editForm.appearanceEyes}`);
      if (editForm.appearanceUpper) appearanceParts.push(`上身：${editForm.appearanceUpper}`);
      if (editForm.appearanceLower) appearanceParts.push(`下身：${editForm.appearanceLower}`);
      const appearance = appearanceParts.join('｜');

      const res = await fetch(`/api/short-dramas/${dramaId}/characters`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ characterId: editChar.id, name: editForm.name, role: editForm.role, gender: editForm.gender, description: editForm.description, personality: editForm.personality, appearance }),
      });
      const data = await res.json();
      if (data.success) {
        broadcastDataChange({ type: 'short-drama', action: 'update', id: dramaId });
        onRefresh();
        setEditChar(null);
      }
    } finally { setSaving(false); }
  };

  const handleAdd = async () => {
    if (!charForm.name) return;
    // 组合外貌子字段为完整字符串
    const appearanceParts: string[] = [];
    if (charForm.appearanceHairColor) appearanceParts.push(`发色：${charForm.appearanceHairColor}`);
    if (charForm.appearanceHairstyle) appearanceParts.push(`发型：${charForm.appearanceHairstyle}`);
    if (charForm.appearanceEyes) appearanceParts.push(`眼睛：${charForm.appearanceEyes}`);
    if (charForm.appearanceUpper) appearanceParts.push(`上身：${charForm.appearanceUpper}`);
    if (charForm.appearanceLower) appearanceParts.push(`下身：${charForm.appearanceLower}`);
    const appearance = appearanceParts.join('｜');

    await fetch(`/api/short-dramas/${dramaId}/characters`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ name: charForm.name, role: charForm.role, gender: charForm.gender, description: charForm.description, personality: charForm.personality, appearance }),
    });
    setAddChar(false);
    setCharForm({ name: "", role: "supporting", gender: "", description: "", personality: "", appearance: "", appearanceHairColor: "", appearanceHairstyle: "", appearanceEyes: "", appearanceUpper: "", appearanceLower: "" });
    onRefresh();
  };

  const handleDelete = async (charId: string, name?: string) => {
    if (!confirm(`确认删除角色「${name || ''}」？此操作不可撤销。`)) return;
    await fetch(`/api/short-dramas/${dramaId}/characters`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ characterId: charId }),
    });
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* 编辑弹窗 */}
      {editChar && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setEditChar(null)}>
          <div className="bg-[#1a1040] border border-white/15 rounded-2xl p-6 w-full max-w-[480px] max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-base">✏️ 编辑角色</h3>
              <button onClick={() => setEditChar(null)} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-1">
                <label className="text-xs text-gray-400">角色名 *</label>
                <input type="text" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-violet-500" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">性别</label>
                <select className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-[#1a1040] text-white focus:outline-none focus:border-violet-500" value={editForm.gender} onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))}>
                  <option value="">未知</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">角色类型</label>
                <select className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-[#1a1040] text-white focus:outline-none focus:border-violet-500" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="protagonist">主角</option>
                  <option value="antagonist">反派</option>
                  <option value="supporting">配角</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">角色描述</label>
              <textarea rows={4} className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none focus:border-violet-500" placeholder="介绍角色背景、身份、故事..." value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">性格特点</label>
              <input type="text" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-violet-500" placeholder="如：冷静、偏执、藏得深" value={editForm.personality} onChange={e => setEditForm(f => ({ ...f, personality: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">外貌特征</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-amber-300">发色</label>
                  <input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-amber-500" value={editForm.appearanceHairColor} onChange={e => setEditForm(f => ({ ...f, appearanceHairColor: e.target.value }))} placeholder="例如: 黑色" />
                </div>
                <div>
                  <label className="text-[10px] text-yellow-300">发型</label>
                  <input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-yellow-500" value={editForm.appearanceHairstyle} onChange={e => setEditForm(f => ({ ...f, appearanceHairstyle: e.target.value }))} placeholder="例如: 短发" />
                </div>
                <div>
                  <label className="text-[10px] text-sky-300">眼睛</label>
                  <input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-sky-500" value={editForm.appearanceEyes} onChange={e => setEditForm(f => ({ ...f, appearanceEyes: e.target.value }))} placeholder="例如: 蓝色" />
                </div>
                <div>
                  <label className="text-[10px] text-violet-300">上身</label>
                  <input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-violet-500" value={editForm.appearanceUpper} onChange={e => setEditForm(f => ({ ...f, appearanceUpper: e.target.value }))} placeholder="例如: 白色衬衫" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-emerald-300">下身</label>
                  <input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-emerald-500" value={editForm.appearanceLower} onChange={e => setEditForm(f => ({ ...f, appearanceLower: e.target.value }))} placeholder="例如: 黑色长裤" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t border-white/10">
              <button onClick={() => setEditChar(null)} className="px-4 py-2 text-xs text-gray-400 hover:text-white border border-white/10 rounded-lg transition-colors">取消</button>
              <button onClick={handleUpdate} disabled={saving} className="px-5 py-2 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-all">
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AssetImgPanel mediaConfig={mediaConfig} onSaveMediaConfig={onSaveMediaConfig} systemMediaConfigs={systemMediaConfigs} imageAspect={imageAspect} setImageAspect={setImageAspect} moduleKey="character" />

      <div className="border-t border-white/10 my-6" />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">👤 角色列表</h3>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <select
              value={imageAspect}
              onChange={e => setImageAspect(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-xs font-bold rounded-lg border-2 border-sky-500 bg-gradient-to-r from-sky-600/25 to-blue-600/25 text-sky-200 cursor-pointer hover:border-sky-400 hover:from-sky-600/35 hover:to-blue-600/35 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all shadow-[0_0_12px_rgba(14,165,233,0.35)]"
            >
              {IMAGE_ASPECTS.map(a => (
                <option key={a.key} value={a.key} className="bg-[#0d1b2a] text-white font-normal">
                  {a.key}（{a.w}×{a.h}）
                </option>
              ))}
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-sky-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
          </div>
          {drama.novelId && (
            <button onClick={async () => {
              try {
                const res = await fetch(`/api/short-dramas/${dramaId}/sync-from-novel`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` } });
                const data = await res.json();
                if (data.success) { alert(data.message); onRefresh(); } else alert(data.error || '同步失败');
              } catch (e: any) { alert(e.message); }
            }} className="px-4 py-2 text-xs font-medium bg-blue-600/80 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1 transition-all">
              📖 从小说提取
            </button>
          )}
          <button onClick={async () => {
            if (!confirm('确认清除全部角色？此操作不可撤销。')) return;
            await fetch(`/api/short-dramas/${dramaId}/characters`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ clearAll: true }) });
            onRefresh();
          }} className="px-4 py-2 text-xs font-medium bg-red-700/70 text-white rounded-lg hover:bg-red-700 flex items-center gap-1 transition-all">
            🗑️ 批量清除
          </button>
          <button
            onClick={async () => {
              const pending = (drama.characters || []).filter((c: any) => !c.imageUrl);
              if (pending.length === 0) {
                alert('所有角色都已经有图片了！');
                return;
              }
              if (!confirm(`确认一键为 ${pending.length} 个角色生成角色图？`)) return;
              const asp = IMAGE_ASPECTS.find(a => a.key === imageAspect);
              for (const c of pending) {
                onGenerate('generate-asset-image', {
                  assetType: 'character',
                  assetId: c.id,
                  imageWidth: asp?.w,
                  imageHeight: asp?.h,
                  ...(mediaConfig?.character || mediaConfig?.image || {})
                });
                await new Promise(r => setTimeout(r, 200));
              }
            }}
            disabled={!!generating || (drama.characters || []).length === 0}
            className="px-4 py-2 text-xs font-semibold bg-violet-600/90 text-white rounded-lg hover:bg-violet-500 disabled:opacity-50 flex items-center gap-1 transition-all"
          >
            🎨 一键生成全部角色图
          </button>
          <button onClick={() => setShowCharStyle(true)} className="px-4 py-2 text-xs font-medium bg-violet-500/20 border border-violet-500/30 text-violet-400 rounded-lg hover:bg-violet-500/30 flex items-center gap-1 transition-all">
            🎨 风格设置
          </button>
          <button onClick={() => setAddChar(true)} className="px-4 py-2 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center gap-1 transition-all">
            + 手动添加
          </button>
        </div>
      </div>
      {showCharStyle && <StyleSettingModal type="character" style={getCharStyle()} onSave={saveCharStyle} onClose={() => setShowCharStyle(false)} />}

      {addChar && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input type="text" placeholder="角色名 *" className="px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none" value={charForm.name} onChange={e => setCharForm(f => ({ ...f, name: e.target.value }))} />
            <select className="px-3 py-2 text-sm border border-white/15 rounded-lg bg-[#1a1040] text-white focus:outline-none" value={charForm.gender} onChange={e => setCharForm(f => ({ ...f, gender: e.target.value }))}>
              <option value="">性别</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
            <select className="px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none" value={charForm.role} onChange={e => setCharForm(f => ({ ...f, role: e.target.value }))}>
              <option value="protagonist">主角</option>
              <option value="antagonist">反派</option>
              <option value="supporting">配角</option>
            </select>
          </div>
          <textarea placeholder="角色描述" rows={2} className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none" value={charForm.description} onChange={e => setCharForm(f => ({ ...f, description: e.target.value }))} />
          <div className="space-y-1">
            <label className="text-xs text-gray-400">外貌特征</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-amber-300">发色</label>
                <input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-amber-500" value={charForm.appearanceHairColor} onChange={e => setCharForm(f => ({ ...f, appearanceHairColor: e.target.value }))} placeholder="例如: 黑色" />
              </div>
              <div>
                <label className="text-[10px] text-yellow-300">发型</label>
                <input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-yellow-500" value={charForm.appearanceHairstyle} onChange={e => setCharForm(f => ({ ...f, appearanceHairstyle: e.target.value }))} placeholder="例如: 短发" />
              </div>
              <div>
                <label className="text-[10px] text-sky-300">眼睛</label>
                <input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-sky-500" value={charForm.appearanceEyes} onChange={e => setCharForm(f => ({ ...f, appearanceEyes: e.target.value }))} placeholder="例如: 蓝色" />
              </div>
              <div>
                <label className="text-[10px] text-violet-300">上身</label>
                <input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-violet-500" value={charForm.appearanceUpper} onChange={e => setCharForm(f => ({ ...f, appearanceUpper: e.target.value }))} placeholder="例如: 白色衬衫" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-emerald-300">下身</label>
                <input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-emerald-500" value={charForm.appearanceLower} onChange={e => setCharForm(f => ({ ...f, appearanceLower: e.target.value }))} placeholder="例如: 黑色长裤" />
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAddChar(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white">取消</button>
            <button onClick={handleAdd} className="px-4 py-1.5 text-xs bg-violet-600 text-white rounded-lg">保存</button>
          </div>
        </div>
      )}

      {(() => {
        const chars: Character[] = drama.characters || [];
        if (chars.length === 0) return (
          <div className="text-center py-12 text-gray-500 text-sm">暂无角色，使用 AI提取 或 手动添加</div>
        );
        const protagonists = chars.filter(c => c.role === 'protagonist');
        const antagonists = chars.filter(c => c.role === 'antagonist');
        const supporting = chars.filter(c => c.role !== 'protagonist' && c.role !== 'antagonist');
        const renderCard = (c: Character) => (
          <div key={c.id} 
            onContextMenu={e => onContextMenuCard && onContextMenuCard(e, c.id)}
            className="rounded-xl border border-white/10 bg-white/5 hover:border-violet-500/40 hover:bg-violet-500/5 transition-all group overflow-hidden"
          >
            {/* 头像区 — 点击放大 */}
            {c.imageUrl ? (
              <div className="relative w-full h-[300px] cursor-pointer" onClick={() => setLightboxImg({url:c.imageUrl!,name:cleanCharName(c.name)})}>
                <img src={c.imageUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white">🔍 点击放大</div>
                <button onClick={async e=>{ e.stopPropagation(); if(!confirm(`确认删除「${cleanCharName(c.name)}」的图片？`))return; await fetch(`/api/short-dramas/${dramaId}/characters`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${getToken()}`},body:JSON.stringify({characterId:c.id,imageUrl:''})}); onRefresh(); }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md bg-black/60 text-gray-400 hover:bg-red-600/80 hover:text-white transition-all opacity-0 group-hover:opacity-100 text-[11px] z-10" title="删除图片">🗑️</button>
              </div>
            ) : null}
            <div className="p-4 cursor-pointer" onClick={() => openEdit(c)}>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400 to-pink-500 flex items-center justify-center text-white text-base font-bold flex-shrink-0 overflow-hidden">
                {c.imageUrl ? <img src={c.imageUrl} alt="" className="w-full h-full object-cover" /> : cleanCharName(c.name)[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white">{cleanCharName(c.name)}</span>
                  {c.gender && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.gender === '男' ? 'bg-blue-500/20 text-blue-400' : 'bg-pink-500/20 text-pink-400'}`}>{c.gender}</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    c.role === 'protagonist' ? 'bg-amber-500/20 text-amber-400' :
                    c.role === 'antagonist' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'
                  }`}>{c.role === 'protagonist' ? '主角' : c.role === 'antagonist' ? '反派' : '配角'}</span>
                  <span className="ml-auto text-[10px] text-gray-600 group-hover:text-violet-400 transition-colors">✏️ 编辑</span>
                </div>
                {c.description
                  ? <p className="text-xs text-gray-400 mt-1 line-clamp-2">{c.description}</p>
                  : <p className="text-xs text-gray-600 mt-1 italic">暂无介绍，点击编辑添加</p>}
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {(c as any).personality && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400">{(c as any).personality}</span>}
                  {c.appearance
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">📸 有绘图描述</span>
                    : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-500/10 text-gray-600">📸 无绘图描述</span>}
                  {c.voiceProvider && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400">🔊 {c.voiceProvider}</span>}
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); handleDelete(c.id, cleanCharName(c.name)); }} className="text-gray-500 hover:text-red-400 transition-colors text-xs flex-shrink-0">✕</button>
            </div>
            </div>
            <div className="px-4 pb-3" onClick={e => e.stopPropagation()}>
              <button onClick={() => { const asp = IMAGE_ASPECTS.find(a => a.key === imageAspect); onGenerate('generate-asset-image', { assetType: 'character', assetId: c.id, imageWidth: asp?.w, imageHeight: asp?.h, ...(mediaConfig?.character || mediaConfig?.image || {}) }); }}
                disabled={generatingSet.has(`generate-asset-image:character:${c.id}`)}
                className="w-full py-1.5 text-[11px] font-medium bg-sky-600/70 hover:bg-sky-500/80 text-white rounded-lg disabled:opacity-40 transition-all flex items-center justify-center gap-1">
                {generatingSet.has(`generate-asset-image:character:${c.id}`) ? '生成中…' : '🖼️ 生成角色图'}
              </button>
            </div>
          </div>
        );
        const renderGroup = (list: Character[], label: string, icon: string, borderCls: string, titleCls: string) => list.length === 0 ? null : (
          <div className={`rounded-xl border ${borderCls} p-4 space-y-3`}>
            <div className={`text-xs font-semibold ${titleCls} flex items-center gap-1.5`}>{icon} {label} <span className="text-gray-500 font-normal">({list.length})</span></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map(renderCard)}
            </div>
          </div>
        );
        return (
          <div className="space-y-4">
            {renderGroup(protagonists, '主角', '⭐', 'border-amber-500/20 bg-amber-500/5', 'text-amber-400')}
            {renderGroup(antagonists, '反派', '⚡', 'border-red-500/20 bg-red-500/5', 'text-red-400')}
            {renderGroup(supporting, '配角', '👥', 'border-gray-500/20 bg-white/3', 'text-gray-400')}
          </div>
        );
      })()}
      {lightboxImg && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md" onClick={()=>setLightboxImg(null)}>
          <div className="absolute top-4 right-4 flex items-center gap-2" onClick={e=>e.stopPropagation()}>
            <span className="text-sm font-semibold text-white">{lightboxImg.name}</span>
            <button onClick={()=>setLightboxImg(null)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-all">✕</button>
          </div>
          <img src={lightboxImg.url} alt="" className="max-w-[92vw] max-h-[88vh] object-contain rounded-xl shadow-2xl" onClick={e=>e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// ======================== 场景管理 ========================
function ScenesTab({ drama, dramaId, getToken, onRefresh, generating, generatingSet = new Set(), onGenerate, mediaConfig, onSaveMediaConfig, systemMediaConfigs, onContextMenuCard }: any) {
  const [addScene, setAddScene] = useState(false);
  const [sceneForm, setSceneForm] = useState({ name: "", description: "", atmosphere: "" });
  const [syncing, setSyncing] = useState(false);
  const [editScene, setEditScene] = useState<any | null>(null);
  const [editSceneForm, setEditSceneForm] = useState({ name: "", description: "", atmosphere: "" });
  const [savingScene, setSavingScene] = useState(false);
  const [imageAspect, setImageAspectRaw] = useState<string>(() =>
    (typeof window !== 'undefined' && localStorage.getItem('sdc-aspect-scene')) || '16:9'
  );
  const setImageAspect = (v: string) => {
    if (typeof window !== 'undefined') localStorage.setItem('sdc-aspect-scene', v);
    setImageAspectRaw(v);
  };
  const [lightboxImg, setLightboxImg] = useState<{url:string,name:string}|null>(null);
  const IMAGE_ASPECTS = [{ key:'1:1',w:1024,h:1024 },{ key:'16:9',w:1280,h:720 },{ key:'9:16',w:720,h:1280 },{ key:'4:3',w:1024,h:768 },{ key:'3:4',w:768,h:1024 }] as const;
  const [showSceneStyle, setShowSceneStyle] = useState(false);
  const getSceneStyle = (): StyleConfig => { try { return drama.sceneStyle ? JSON.parse(drama.sceneStyle) : { prePrompt: '', postPrompt: '', referenceImages: [] }; } catch { return { prePrompt: '', postPrompt: '', referenceImages: [] }; } };
  const saveSceneStyle = async (s: StyleConfig) => {
    await fetch(`/api/short-dramas/${dramaId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ sceneStyle: JSON.stringify(s) }) });
    onRefresh();
  };

  const openEditScene = (s: any) => {
    setEditScene(s);
    setEditSceneForm({ name: s.name || '', description: s.description || '', atmosphere: s.atmosphere || '' });
  };

  const handleUpdateScene = async () => {
    if (!editScene || !editSceneForm.name) return;
    setSavingScene(true);
    try {
      const res = await fetch(`/api/short-dramas/${dramaId}/scenes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ sceneId: editScene.id, ...editSceneForm }),
      });
      const data = await res.json();
      if (data.success) {
        broadcastDataChange({ type: 'short-drama', action: 'update', id: dramaId });
        onRefresh();
        setEditScene(null);
      }
    } finally { setSavingScene(false); }
  };

  const handleSyncFromNovel = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/short-dramas/${dramaId}/sync-from-novel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) { alert(data.message); onRefresh(); }
      else alert(data.error || '同步失败');
    } catch (e: any) { alert(e.message); }
    finally { setSyncing(false); }
  };

  const handleAdd = async () => {
    if (!sceneForm.name) return;
    await fetch(`/api/short-dramas/${dramaId}/scenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(sceneForm),
    });
    setAddScene(false);
    setSceneForm({ name: "", description: "", atmosphere: "" });
    onRefresh();
  };

  const handleDelete = async (sceneId: string, name?: string) => {
    if (!confirm(`确认删除场景「${name || ''}」？此操作不可撤销。`)) return;
    await fetch(`/api/short-dramas/${dramaId}/scenes`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ sceneId }),
    });
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* 编辑弹窗 */}
      {editScene && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setEditScene(null)}>
          <div className="bg-[#1a1040] border border-white/15 rounded-2xl p-6 w-full max-w-[480px] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-base">✏️ 编辑场景</h3>
              <button onClick={() => setEditScene(null)} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">场景名称 *</label>
              <input type="text" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-emerald-500" value={editSceneForm.name} onChange={e => setEditSceneForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">场景描述</label>
              <textarea rows={4} className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none focus:border-emerald-500" placeholder="场景环境、氛围、视觉感受..." value={editSceneForm.description} onChange={e => setEditSceneForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">氛围/基调</label>
              <input type="text" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-emerald-500" placeholder="如：阴沉压抑、热闹喜庆..." value={editSceneForm.atmosphere} onChange={e => setEditSceneForm(f => ({ ...f, atmosphere: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t border-white/10">
              <button onClick={() => setEditScene(null)} className="px-4 py-2 text-xs text-gray-400 hover:text-white border border-white/10 rounded-lg transition-colors">取消</button>
              <button onClick={handleUpdateScene} disabled={savingScene} className="px-5 py-2 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-all">
                {savingScene ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AssetImgPanel mediaConfig={mediaConfig} onSaveMediaConfig={onSaveMediaConfig} systemMediaConfigs={systemMediaConfigs} imageAspect={imageAspect} setImageAspect={setImageAspect} moduleKey="scene" />

      <div className="border-t border-white/10 my-6" />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">🏔️ 场景列表</h3>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <select
              value={imageAspect}
              onChange={e => setImageAspect(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-xs font-bold rounded-lg border-2 border-sky-500 bg-gradient-to-r from-sky-600/25 to-blue-600/25 text-sky-200 cursor-pointer hover:border-sky-400 hover:from-sky-600/35 hover:to-blue-600/35 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all shadow-[0_0_12px_rgba(14,165,233,0.35)]"
            >
              {IMAGE_ASPECTS.map(a => (
                <option key={a.key} value={a.key} className="bg-[#0d1b2a] text-white font-normal">
                  {a.key}（{a.w}×{a.h}）
                </option>
              ))}
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-sky-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
          </div>
          {drama.novelId && (
            <button onClick={handleSyncFromNovel} disabled={syncing}
              className="px-4 py-2 text-xs font-medium bg-teal-600/80 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 flex items-center gap-1 transition-all">
              {syncing ? <><span className="animate-spin inline-block w-3 h-3 border border-white border-t-transparent rounded-full" /> 同步中...</> : '📖 从小说提取'}
            </button>
          )}
          <button onClick={async () => {
            if (!confirm('确认清除全部场景？此操作不可撤销。')) return;
            await fetch(`/api/short-dramas/${dramaId}/scenes`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ clearAll: true }) });
            onRefresh();
          }} className="px-4 py-2 text-xs font-medium bg-red-700/70 text-white rounded-lg hover:bg-red-700 flex items-center gap-1 transition-all">
            🗑️ 批量清除
          </button>
          <button
            onClick={async () => {
              const pending = (drama.scenes || []).filter((s: any) => !s.imageUrl);
              if (pending.length === 0) {
                alert('所有场景都已经有图片了！');
                return;
              }
              if (!confirm(`确认一键为 ${pending.length} 个场景生成场景图？`)) return;
              const asp = IMAGE_ASPECTS.find(a => a.key === imageAspect);
              for (const s of pending) {
                onGenerate('generate-asset-image', {
                  assetType: 'scene',
                  assetId: s.id,
                  imageWidth: asp?.w,
                  imageHeight: asp?.h,
                  ...(mediaConfig?.scene || mediaConfig?.image || {})
                });
                await new Promise(r => setTimeout(r, 200));
              }
            }}
            disabled={!!generating || (drama.scenes || []).length === 0}
            className="px-4 py-2 text-xs font-semibold bg-violet-600/90 text-white rounded-lg hover:bg-violet-500 disabled:opacity-50 flex items-center gap-1 transition-all"
          >
            🏔️ 一键生成全部场景图
          </button>
          <button onClick={() => setShowSceneStyle(true)} className="px-4 py-2 text-xs font-medium bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg hover:bg-emerald-500/30 flex items-center gap-1 transition-all">
            🎨 风格设置
          </button>
          <button onClick={() => setAddScene(true)} className="px-4 py-2 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-1 transition-all">
            + 手动添加
          </button>
        </div>
      </div>
      {showSceneStyle && <StyleSettingModal type="scene" style={getSceneStyle()} onSave={saveSceneStyle} onClose={() => setShowSceneStyle(false)} />}

      {addScene && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
          <input type="text" placeholder="场景名称 *" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none" value={sceneForm.name} onChange={e => setSceneForm(f => ({ ...f, name: e.target.value }))} />
          <textarea placeholder="场景描述" rows={3} className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none" value={sceneForm.description} onChange={e => setSceneForm(f => ({ ...f, description: e.target.value }))} />
          <input type="text" placeholder="氛围/基调" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none" value={sceneForm.atmosphere} onChange={e => setSceneForm(f => ({ ...f, atmosphere: e.target.value }))} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAddScene(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white">取消</button>
            <button onClick={handleAdd} className="px-4 py-1.5 text-xs bg-emerald-600 text-white rounded-lg">保存</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {drama.scenes?.map((s: any, idx: number) => (
          <div key={s.id} 
            onContextMenu={e => onContextMenuCard && onContextMenuCard(e, s.id)}
            className="rounded-xl border border-white/10 bg-white/5 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all group overflow-hidden"
          >
            {s.imageUrl ? (
              <div className="relative w-full h-[300px] cursor-pointer" onClick={() => setLightboxImg({url:s.imageUrl,name:s.name})}>
                <img src={s.imageUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white">🔍 点击放大</div>
                <button onClick={async e=>{ e.stopPropagation(); if(!confirm(`确认删除「${s.name}」的图片？`))return; await fetch(`/api/short-dramas/${dramaId}/scenes`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${getToken()}`},body:JSON.stringify({sceneId:s.id,imageUrl:''})}); onRefresh(); }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md bg-black/60 text-gray-400 hover:bg-red-600/80 hover:text-white transition-all opacity-0 group-hover:opacity-100 text-[11px] z-10" title="删除图片">🗑️</button>
              </div>
            ) : null}
            <div className="p-4 cursor-pointer" onClick={() => openEditScene(s)}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{idx + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold text-white">{s.name}</span>
                    <span className="ml-auto text-[10px] text-gray-600 group-hover:text-emerald-400 transition-colors">✏️</span>
                  </div>
                  {s.atmosphere && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">{s.atmosphere}</span>}
                  {s.description
                    ? <p className="text-xs text-gray-400 mt-1 line-clamp-2">{s.description}</p>
                    : <p className="text-xs text-gray-600 mt-1 italic">暂无描述，点击编辑添加</p>}
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(s.id, s.name); }} className="text-gray-500 hover:text-red-400 transition-colors text-xs flex-shrink-0">✕</button>
              </div>
            </div>
            <div className="px-4 pb-3" onClick={e => e.stopPropagation()}>
              <button onClick={() => { const asp = IMAGE_ASPECTS.find(a => a.key === imageAspect); onGenerate('generate-asset-image', { assetType: 'scene', assetId: s.id, imageWidth: asp?.w, imageHeight: asp?.h, ...(mediaConfig?.scene || mediaConfig?.image || {}) }); }}
                disabled={generatingSet.has(`generate-asset-image:scene:${s.id}`)}
                className="w-full py-1.5 text-[11px] font-medium bg-emerald-600/70 hover:bg-emerald-500/80 text-white rounded-lg disabled:opacity-40 transition-all flex items-center justify-center gap-1">
                {generatingSet.has(`generate-asset-image:scene:${s.id}`) ? '生成中…' : '🖼️ 生成场景图'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {(!drama.scenes || drama.scenes.length === 0) && (
        <div className="text-center py-12 text-gray-500 text-sm">暂无场景，点击手动添加或从小说自动同步</div>
      )}
      {lightboxImg && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md" onClick={()=>setLightboxImg(null)}>
          <div className="absolute top-4 right-4 flex items-center gap-2" onClick={e=>e.stopPropagation()}>
            <span className="text-sm font-semibold text-white">{lightboxImg.name}</span>
            <button onClick={()=>setLightboxImg(null)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-all">✕</button>
          </div>
          <img src={lightboxImg.url} alt="" className="max-w-[92vw] max-h-[88vh] object-contain rounded-xl shadow-2xl" onClick={e=>e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// ======================== 物品管理 ========================
function ItemsTab({ drama, dramaId, getToken, onRefresh, generating, generatingSet = new Set(), onGenerate, mediaConfig, onSaveMediaConfig, systemMediaConfigs, onContextMenuCard }: any) {
  const [addItem, setAddItem] = useState(false);
  const [itemForm, setItemForm] = useState({ name: "", description: "", significance: "" });
  const [syncing, setSyncing] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [editItemForm, setEditItemForm] = useState({ name: "", description: "", significance: "" });
  const [savingItem, setSavingItem] = useState(false);
  const [imageAspect, setImageAspectRaw] = useState<string>(() =>
    (typeof window !== 'undefined' && localStorage.getItem('sdc-aspect-item')) || '1:1'
  );
  const setImageAspect = (v: string) => {
    if (typeof window !== 'undefined') localStorage.setItem('sdc-aspect-item', v);
    setImageAspectRaw(v);
  };
  const [lightboxImg, setLightboxImg] = useState<{url:string,name:string}|null>(null);
  const IMAGE_ASPECTS = [{ key:'1:1',w:1024,h:1024 },{ key:'16:9',w:1280,h:720 },{ key:'9:16',w:720,h:1280 },{ key:'4:3',w:1024,h:768 },{ key:'3:4',w:768,h:1024 }] as const;
  const [showItemStyle, setShowItemStyle] = useState(false);
  const getItemStyle = (): StyleConfig => { try { return drama.itemStyle ? JSON.parse(drama.itemStyle) : { prePrompt: '', postPrompt: '', referenceImages: [] }; } catch { return { prePrompt: '', postPrompt: '', referenceImages: [] }; } };
  const saveItemStyle = async (s: StyleConfig) => {
    await fetch(`/api/short-dramas/${dramaId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ itemStyle: JSON.stringify(s) }) });
    onRefresh();
  };

  const openEditItem = (item: any) => {
    setEditItem(item);
    setEditItemForm({ name: item.name || '', description: item.description || '', significance: item.significance || '' });
  };

  const handleUpdateItem = async () => {
    if (!editItem || !editItemForm.name) return;
    setSavingItem(true);
    try {
      const res = await fetch(`/api/short-dramas/${dramaId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ itemId: editItem.id, ...editItemForm }),
      });
      const data = await res.json();
      if (data.success) {
        broadcastDataChange({ type: 'short-drama', action: 'update', id: dramaId });
        onRefresh();
        setEditItem(null);
      }
    } finally { setSavingItem(false); }
  };

  const handleSyncFromNovel = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/short-dramas/${dramaId}/sync-from-novel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) { alert(data.message); onRefresh(); }
      else alert(data.error || '同步失败');
    } catch (e: any) { alert(e.message); }
    finally { setSyncing(false); }
  };

  const handleAdd = async () => {
    if (!itemForm.name) return;
    await fetch(`/api/short-dramas/${dramaId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(itemForm),
    });
    setAddItem(false);
    setItemForm({ name: "", description: "", significance: "" });
    onRefresh();
  };

  const handleDelete = async (itemId: string, name?: string) => {
    if (!confirm(`确认删除物品「${name || ''}」？此操作不可撤销。`)) return;
    await fetch(`/api/short-dramas/${dramaId}/items`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ itemId }),
    });
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* 编辑弹窗 */}
      {editItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setEditItem(null)}>
          <div className="bg-[#1a1040] border border-white/15 rounded-2xl p-6 w-full max-w-[480px] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-base">✏️ 编辑物品</h3>
              <button onClick={() => setEditItem(null)} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">物品名称 *</label>
              <input type="text" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-amber-500" value={editItemForm.name} onChange={e => setEditItemForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">物品描述</label>
              <textarea rows={4} className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none focus:border-amber-500" placeholder="物品外观、来历、用途..." value={editItemForm.description} onChange={e => setEditItemForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">重要性/象征意义</label>
              <input type="text" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-amber-500" placeholder="如：主角传家宝、故事关键道具..." value={editItemForm.significance} onChange={e => setEditItemForm(f => ({ ...f, significance: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t border-white/10">
              <button onClick={() => setEditItem(null)} className="px-4 py-2 text-xs text-gray-400 hover:text-white border border-white/10 rounded-lg transition-colors">取消</button>
              <button onClick={handleUpdateItem} disabled={savingItem} className="px-5 py-2 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-all">
                {savingItem ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AssetImgPanel mediaConfig={mediaConfig} onSaveMediaConfig={onSaveMediaConfig} systemMediaConfigs={systemMediaConfigs} imageAspect={imageAspect} setImageAspect={setImageAspect} moduleKey="item" />

      <div className="border-t border-white/10 my-6" />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">🔑 物品列表</h3>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <select
              value={imageAspect}
              onChange={e => setImageAspect(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-xs font-bold rounded-lg border-2 border-sky-500 bg-gradient-to-r from-sky-600/25 to-blue-600/25 text-sky-200 cursor-pointer hover:border-sky-400 hover:from-sky-600/35 hover:to-blue-600/35 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all shadow-[0_0_12px_rgba(14,165,233,0.35)]"
            >
              {IMAGE_ASPECTS.map(a => (
                <option key={a.key} value={a.key} className="bg-[#0d1b2a] text-white font-normal">
                  {a.key}（{a.w}×{a.h}）
                </option>
              ))}
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-sky-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
          </div>
          {drama.novelId && (
            <button onClick={handleSyncFromNovel} disabled={syncing}
              className="px-4 py-2 text-xs font-medium bg-orange-600/80 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1 transition-all">
              {syncing ? <><span className="animate-spin inline-block w-3 h-3 border border-white border-t-transparent rounded-full" /> 同步中...</> : '📖 从小说提取'}
            </button>
          )}
          <button onClick={async () => {
            if (!confirm('确认清除全部物品？此操作不可撤销。')) return;
            await fetch(`/api/short-dramas/${dramaId}/items`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ clearAll: true }) });
            onRefresh();
          }} className="px-4 py-2 text-xs font-medium bg-red-700/70 text-white rounded-lg hover:bg-red-700 flex items-center gap-1 transition-all">
            🗑️ 批量清除
          </button>
          <button
            onClick={async () => {
              const pending = (drama.items || []).filter((item: any) => !item.imageUrl);
              if (pending.length === 0) {
                alert('所有物品都已经有图片了！');
                return;
              }
              if (!confirm(`确认一键为 ${pending.length} 个物品生成物品图？`)) return;
              const asp = IMAGE_ASPECTS.find(a => a.key === imageAspect);
              for (const item of pending) {
                onGenerate('generate-asset-image', {
                  assetType: 'item',
                  assetId: item.id,
                  imageWidth: asp?.w,
                  imageHeight: asp?.h,
                  ...(mediaConfig?.item || mediaConfig?.image || {})
                });
                await new Promise(r => setTimeout(r, 200));
              }
            }}
            disabled={!!generating || (drama.items || []).length === 0}
            className="px-4 py-2 text-xs font-semibold bg-violet-600/90 text-white rounded-lg hover:bg-violet-500 disabled:opacity-50 flex items-center gap-1 transition-all"
          >
            🔑 一键生成全部物品图
          </button>
          <button onClick={() => setShowItemStyle(true)} className="px-4 py-2 text-xs font-medium bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg hover:bg-amber-500/30 flex items-center gap-1 transition-all">
            🎨 风格设置
          </button>
          <button onClick={() => setAddItem(true)} className="px-4 py-2 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center gap-1 transition-all">
            + 手动添加
          </button>
        </div>
      </div>
      {showItemStyle && <StyleSettingModal type="item" style={getItemStyle()} onSave={saveItemStyle} onClose={() => setShowItemStyle(false)} />}

      {addItem && (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
          <input type="text" placeholder="物品名称 *" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none" value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} />
          <textarea placeholder="物品描述" rows={3} className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none" value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} />
          <input type="text" placeholder="重要性/象征意义" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none" value={itemForm.significance} onChange={e => setItemForm(f => ({ ...f, significance: e.target.value }))} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAddItem(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white">取消</button>
            <button onClick={handleAdd} className="px-4 py-1.5 text-xs bg-amber-600 text-white rounded-lg">保存</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {drama.items?.map((item: any, idx: number) => (
          <div key={item.id} 
            onContextMenu={e => onContextMenuCard && onContextMenuCard(e, item.id)}
            className="rounded-xl border border-white/10 bg-white/5 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all group overflow-hidden"
          >
            {item.imageUrl ? (
              <div className="relative w-full h-[300px] cursor-pointer" onClick={() => setLightboxImg({url:item.imageUrl,name:item.name})}>
                <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-white">🔍 点击放大</div>
                <button onClick={async e=>{ e.stopPropagation(); if(!confirm(`确认删除「${item.name}」的图片？`))return; await fetch(`/api/short-dramas/${dramaId}/items`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${getToken()}`},body:JSON.stringify({itemId:item.id,imageUrl:''})}); onRefresh(); }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md bg-black/60 text-gray-400 hover:bg-red-600/80 hover:text-white transition-all opacity-0 group-hover:opacity-100 text-[11px] z-10" title="删除图片">🗑️</button>
              </div>
            ) : null}
            <div className="p-4 cursor-pointer" onClick={() => openEditItem(item)}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{idx + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold text-white">{item.name}</span>
                    <span className="ml-auto text-[10px] text-gray-600 group-hover:text-amber-400 transition-colors">✏️</span>
                  </div>
                  {item.significance && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">{item.significance}</span>}
                  {item.description
                    ? <p className="text-xs text-gray-400 mt-1 line-clamp-2">{item.description}</p>
                    : <p className="text-xs text-gray-600 mt-1 italic">暂无描述，点击编辑添加</p>}
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(item.id, item.name); }} className="text-gray-500 hover:text-red-400 transition-colors text-xs flex-shrink-0">✕</button>
              </div>
            </div>
            <div className="px-4 pb-3" onClick={e => e.stopPropagation()}>
              <button onClick={() => { const asp = IMAGE_ASPECTS.find(a => a.key === imageAspect); onGenerate('generate-asset-image', { assetType: 'item', assetId: item.id, imageWidth: asp?.w, imageHeight: asp?.h, ...(mediaConfig?.item || mediaConfig?.image || {}) }); }}
                disabled={generatingSet.has(`generate-asset-image:item:${item.id}`)}
                className="w-full py-1.5 text-[11px] font-medium bg-amber-600/70 hover:bg-amber-500/80 text-white rounded-lg disabled:opacity-40 transition-all flex items-center justify-center gap-1">
                {generatingSet.has(`generate-asset-image:item:${item.id}`) ? '生成中…' : '🖼️ 生成物品图'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {(!drama.items || drama.items.length === 0) && (
        <div className="text-center py-12 text-gray-500 text-sm">暂无物品，点击手动添加或从小说自动同步</div>
      )}
      {lightboxImg && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md" onClick={()=>setLightboxImg(null)}>
          <div className="absolute top-4 right-4 flex items-center gap-2" onClick={e=>e.stopPropagation()}>
            <span className="text-sm font-semibold text-white">{lightboxImg.name}</span>
            <button onClick={()=>setLightboxImg(null)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-all">✕</button>
          </div>
          <img src={lightboxImg.url} alt="" className="max-w-[92vw] max-h-[88vh] object-contain rounded-xl shadow-2xl" onClick={e=>e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// ======================== 剧本渲染器 ========================
function ScreenplayRenderer({ screenplay }: { screenplay: string }) {
  let scenes: any[] = [];
  let summary = '';
  let rawText = '';
  try {
    const parsed = JSON.parse(screenplay);
    if (parsed?.scenes && Array.isArray(parsed.scenes)) {
      scenes = parsed.scenes;
      summary = parsed.summary || '';
    } else { rawText = screenplay; }
  } catch { rawText = screenplay; }

  if (scenes.length === 0) {
    return (
      <pre className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed font-sans bg-black/20 rounded-lg p-3 border border-white/5 max-h-96 overflow-y-auto">{rawText || screenplay}</pre>
    );
  }
  return (
    <div className="space-y-3">
      {summary && (
        <p className="text-xs text-gray-400 italic bg-white/5 rounded-lg px-3 py-2 border border-white/10">
          <span className="text-gray-500 font-medium">概要：</span>{summary}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {scenes.map((scene: any, i: number) => (
        <div key={i} className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.03]">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/[0.07] border-b border-white/10">
            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded">场景{scene.sceneIndex}</span>
            <span className="text-xs text-amber-200/90 font-medium">{scene.sceneTitle}</span>
          </div>
          <div className="px-4 py-3 space-y-2">
            {scene.description && (
              <p className="text-[13px] text-gray-300 leading-[1.9] tracking-wide">{scene.description}</p>
            )}
            {scene.actions && (
              <div className="bg-amber-500/[0.06] border-l-2 border-amber-500/30 rounded-r-lg px-4 py-2.5">
                <p className="text-[13px] text-amber-200/70 italic leading-relaxed">{scene.actions}</p>
              </div>
            )}
            {scene.dialogues?.length > 0 && (
              <div className="space-y-1.5">
                {scene.dialogues.map((d: any, di: number) => (
                  <p key={di} className="text-[13px] leading-relaxed">
                    <span className="text-cyan-400 font-bold">💬 {d.character}：</span>
                    {d.direction && <span className="text-gray-600 text-xs">（{d.direction}）</span>}
                    <span className="text-gray-200">「{d.line}」</span>
                  </p>
                ))}
              </div>
            )}
            {scene.stageDirections && (
              <p className="text-xs text-gray-500 italic flex items-start gap-1.5">
                <span className="shrink-0">🎥</span>
                <span>{scene.stageDirections}</span>
              </p>
            )}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

// INDEX_TTS 音色模版
const INDEX_TTS_TEMPLATES = [
  { id: 'naiyou_xiaosheng', name: '奶油小生', avatar: '👦', description: '阳光帅气，年轻男声' },
  { id: 'yiyi', name: '伊伊', avatar: '👧', description: '甜美可爱，年轻女声' },
  { id: 'nainai', name: '奈奈', avatar: '👩', description: '温柔知性，成熟女声' },
  { id: 'luoluo', name: '骆络', avatar: '👩', description: '清脆甜美，少女女声' },
  { id: 'kaka', name: '卡卡', avatar: '👧', description: '活泼开朗，元气少女' },
  { id: 'fengchu', name: '凤雏', avatar: '🧑', description: '幽默滑稽，搞怪男声' },
  { id: 'yizhi_houzi', name: '一只猴子', avatar: '🐒', description: '俏皮机灵，卡通音色' },
  { id: 'liu_ruyan', name: '柳如烟', avatar: '👩', description: '清冷高雅，古风女声' },
  { id: 'chuichui', name: '锤锤', avatar: '👨', description: '沉稳有力，中年男声' },
  { id: 'dashage', name: '大傻哥', avatar: '🧔', description: '粗犷豪放，江湖男声' },
  { id: 'shangshang', name: '尚尚', avatar: '👦', description: '温润儒雅，青年男声' },
  { id: 'shangshang_2', name: '赏赏', avatar: '👧', description: '欢快悦耳，萌系童声' },
  { id: 'nuonuo', name: '诺诺', avatar: '👧', description: '软萌可爱，幼齿女童' },
  { id: 'daxian', name: '大仙', avatar: '🧔', description: '沧桑古老，老者男声' },
  { id: 'naiwawa', name: '奶娃娃', avatar: '👶', description: '稚嫩天真，幼儿男女' },
  { id: 'longlong', name: '龙龙', avatar: '👨', description: '霸气威严，帝王男声' },
  { id: 'wenwen', name: '温温', avatar: '👩', description: '温婉居家，亲切女声' },
  { id: 'sisi', name: '丝丝', avatar: '👩', description: '丝滑妩媚，性感女声' },
  { id: 'shoushou', name: '手手', avatar: '🧑', description: '搞怪奇特，趣味音色' },
  { id: 'xiaoluoli', name: '小萝莉', avatar: '👧', description: '撒娇卖萌，萝莉女声' }
];

const EDGE_TTS_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 (女)' },
  { id: 'zh-CN-YunxiNeural', name: '云希 (男)' },
  { id: 'zh-CN-YunjianNeural', name: '云健 (男)' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊 (女)' }
];

// ======================== 分镜制作 ========================
function StoryboardsTab({ mode, drama, dramaId, getToken, selectedEpisode, onSelectEpisode, shots, shotsLoading, generating, generatingSet = new Set(), onGenerate, onRefreshShots, mediaConfig, onSaveMediaConfig, systemMediaConfigs = [], onContextMenuCard }: any) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [showScriptRef, setShowScriptRef] = useState(false);
  const [editingShot, setEditingShot] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [savingShot, setSavingShot] = useState(false);
  const [viewingImage, setViewingImage] = useState<any>(null);

  // ── 🛡️ 标签本地化翻译字典 (Tag Translator) ──
  const translateTag = (tag: string): string => {
    if (!tag) return '';
    const mapping: Record<string, string> = {
      // 镜头类别与状态
      'storyboard': '分镜',
      'shot': '镜头',
      'scene': '场景',
      'draft': '草稿',
      'generating': '生成中',
      'completed': '已完成',
      
      // 短剧题材风格
      'eastern-fantasy': '东方玄幻',
      'urban': '都市',
      'romance': '言情',
      'thriller': '悬疑',
      'sci-fi': '科幻',
      'comedy': '喜剧',
      'costume': '古装',
      'wuxia': '武侠',
      'fantasy': '奇幻',
      'modern': '现代',
      'historical': '历史',
      'military': '军事',
      'adventure': '冒险',
      'suspense': '悬疑',
      'revenge': '复仇',
      'war': '战争',
      'action': '动作',

      // 镜头运镜机位 (Camera Angles & Shots)
      'extreme-long-shot': '极远景',
      'long-shot': '远景',
      'medium-shot': '中景',
      'close-up': '特写',
      'extreme-close-up': '大特写',
      'birds-eye-view': '鸟瞰俯拍',
      'high-angle': '俯拍',
      'low-angle': '仰拍',
      'eye-level': '平拍',
      'over-the-shoulder': '过肩拍',
      'point-of-view': '主观视角(POV)',
      'pov': '主观视角(POV)',
      'tracking-shot': '跟镜头',
      'pan': '摇镜头',
      'tilt': '俯仰镜头',
      'zoom': '推拉镜头',
    };
    return mapping[tag.toLowerCase().trim()] || tag;
  };

  // ── 🛡️ @提及 自动联想自动检索状态 (Autocomplete Autocompletion Menu) ──
  const [atMenu, setAtMenu] = useState<{
    show: boolean;
    type: 'image' | 'video';
    query: string;
    cursorPos: number; // '@' 符号在 textarea 中的索引位置
    selectionStart: number; // 当前光标的位置
  }>({
    show: false,
    type: 'image',
    query: '',
    cursorPos: -1,
    selectionStart: -1,
  });

  // ── 🛡️ Autocomplete Core Handlers ──
  const handleTextareaChange = (val: string, type: 'image' | 'video', selectionStart: number) => {
    if (type === 'image') {
      setEditForm((f: any) => ({ ...f, imagePrompt: val }));
    } else {
      setEditForm((f: any) => {
        let base = { startFrame: '', endFrame: '', cameraMovement: '', characterAction: '', prompt: '', stateNote: '' };
        if (f.videoPrompt) {
          try { base = { ...base, ...JSON.parse(f.videoPrompt) }; } catch {}
        }
        base.prompt = val;
        return { ...f, videoPrompt: JSON.stringify(base) };
      });
    }

    // 检测 @ 符号并调起检索下拉面板
    const textBeforeCursor = val.slice(0, selectionStart);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex !== -1) {
      const query = textBeforeCursor.slice(atIndex + 1);
      // 联想词内部不能含有任何标点、空格、或换行，以此判断还在打字阶段
      const invalidQueryRegex = /[\s,，。\.！？!？@（）()\[\]{}、;:："'“”“‘’]/;
      if (!invalidQueryRegex.test(query)) {
        setAtMenu({
          show: true,
          type,
          query,
          cursorPos: atIndex,
          selectionStart
        });
        return;
      }
    }
    setAtMenu({ show: false, type, query: '', cursorPos: -1, selectionStart: -1 });
  };

  const insertSelectedAsset = (assetName: string, type: 'image' | 'video') => {
    let rawText = '';
    if (type === 'image') {
      rawText = editForm.imagePrompt || '';
    } else {
      if (editForm.videoPrompt) {
        try { rawText = JSON.parse(editForm.videoPrompt).prompt || ''; } catch { rawText = editForm.videoPrompt; }
      }
    }

    const prefix = rawText.slice(0, atMenu.cursorPos);
    const suffix = rawText.slice(atMenu.selectionStart);
    const newText = `${prefix}@${assetName} ${suffix}`;

    if (type === 'image') {
      setEditForm((f: any) => ({ ...f, imagePrompt: newText }));
    } else {
      setEditForm((f: any) => {
        let base = { startFrame: '', endFrame: '', cameraMovement: '', characterAction: '', prompt: '', stateNote: '' };
        if (f.videoPrompt) {
          try { base = { ...base, ...JSON.parse(f.videoPrompt) }; } catch {}
        }
        base.prompt = newText;
        return { ...f, videoPrompt: JSON.stringify(base) };
      });
    }

    setAtMenu({ show: false, type, query: '', cursorPos: -1, selectionStart: -1 });

    // 让对应的输入框重新获得焦点，并且把光标准确放在插入词后方
    setTimeout(() => {
      const textarea = document.querySelector(
        type === 'image'
          ? 'textarea[placeholder="图片生成提示词..."]'
          : 'textarea[placeholder="完整视频运镜提示词..."]'
      ) as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        const newPos = prefix.length + assetName.length + 2; // +1 for @, +1 for space
        textarea.setSelectionRange(newPos, newPos);
      }
    }, 50);
  };

  // ── 对白配音系统状态 ──
  const [dubbingShotId, setDubbingShotId] = useState<string | null>(null);
  const [dubbingActiveTab, setDubbingActiveTab] = useState<'edge-tts' | 'index-tts' | 'gpt-sovits'>('index-tts');
  const [dubbingCharacter, setDubbingCharacter] = useState<string>('');
  const [dubbingCharacterVoices, setDubbingCharacterVoices] = useState<Record<string, {
    provider: string;
    voiceId: string;
    customAudioUrl?: string;
    customAudioName?: string;
    emotion?: string;
    voiceDesc?: string;
  }>>({});
  const [dubbedAudios, setDubbedAudios] = useState<Record<string, string>>({}); // lineIndex -> audioUrl
  const [generatingLineIndex, setGeneratingLineIndex] = useState<number | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [savingDubbing, setSavingDubbing] = useState(false);
  const [trialText, setTrialText] = useState('这是一段测试文本，用于试听配音效果。');
  const [trialling, setTrialling] = useState(false);
  const [trialAudioUrl, setTrialAudioUrl] = useState<string | null>(null);

  // ── EdgeTTS / GPT-SoVITS / IndexTTS 专属参数 ──
  const [edgeTtsApiUrl, setEdgeTtsApiUrl] = useState<string>(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('edge-tts-api-url')) || 'http://127.0.0.1:5003';
  });
  const [gptSovitsApiUrl, setGptSovitsApiUrl] = useState<string>(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('gpt-sovits-api-url')) || 'http://127.0.0.1:9880';
  });
  const [indexTtsApiUrl, setIndexTtsApiUrl] = useState<string>(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('index-tts-api-url')) || 'http://127.0.0.1:7860';
  });
  const [indexTtsStartPause, setIndexTtsStartPause] = useState<number>(() => {
    const val = typeof window !== 'undefined' && localStorage.getItem('index-tts-start-pause');
    return val ? parseInt(val) : 100;
  });
  const [indexTtsEndPause, setIndexTtsEndPause] = useState<number>(() => {
    const val = typeof window !== 'undefined' && localStorage.getItem('index-tts-end-pause');
    return val ? parseInt(val) : 100;
  });

  const handleEdgeTtsApiUrlChange = (val: string) => {
    setEdgeTtsApiUrl(val);
    localStorage.setItem('edge-tts-api-url', val);
  };
  const handleGptSovitsApiUrlChange = (val: string) => {
    setGptSovitsApiUrl(val);
    localStorage.setItem('gpt-sovits-api-url', val);
  };
  const handleIndexTtsApiUrlChange = (val: string) => {
    setIndexTtsApiUrl(val);
    localStorage.setItem('index-tts-api-url', val);
  };
  const handleIndexTtsStartPauseChange = (val: number) => {
    setIndexTtsStartPause(val);
    localStorage.setItem('index-tts-start-pause', String(val));
  };
  const handleIndexTtsEndPauseChange = (val: number) => {
    setIndexTtsEndPause(val);
    localStorage.setItem('index-tts-end-pause', String(val));
  };

  const parseDialogueLines = (dialogueText: string) => {
    if (!dialogueText) return [];
    return dialogueText.split('\n').filter(Boolean).map((line, index) => {
      const match = line.match(/^([^：:]+)[：:](.+)$/);
      if (match) {
        return { id: index, character: match[1].trim(), text: match[2].trim(), originalLine: line };
      }
      return { id: index, character: '旁白', text: line.trim(), originalLine: line };
    });
  };

  useEffect(() => {
    if (dubbingShotId) {
      const shot = shots.find((s: any) => s.id === dubbingShotId);
      if (shot) {
        const lines = parseDialogueLines(shot.dialogue || '');
        const characters = Array.from(new Set(lines.map(l => l.character)));
        if (characters.length > 0) {
          setDubbingCharacter(characters[0]);
        } else {
          setDubbingCharacter('旁白');
        }

        const initialDubbed: Record<string, string> = {};
        if (shot.audioUrl) {
          if (shot.audioUrl.startsWith('[')) {
            try {
              const list = JSON.parse(shot.audioUrl);
              list.forEach((item: any, idx: number) => {
                if (item.audioUrl) {
                  initialDubbed[idx] = item.audioUrl;
                }
              });
            } catch {}
          } else {
            initialDubbed[0] = shot.audioUrl;
          }
        }
        setDubbedAudios(initialDubbed);
        setTrialAudioUrl(null);
        setTrialText('这是一段测试文本，用于试听配音效果。');
      }
    } else {
      setDubbingCharacter('');
      setDubbedAudios({});
      setTrialAudioUrl(null);
    }
  }, [dubbingShotId, shots]);

  const handleTrialListen = async () => {
    if (!dubbingCharacter) return;
    const config = dubbingCharacterVoices[dubbingCharacter] || { provider: 'edge-tts', voiceId: 'zh-CN-XiaoxiaoNeural' };
    
    setTrialling(true);
    setTrialAudioUrl(null);
    try {
      const res = await fetch(`/api/short-dramas/${dramaId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          action: 'generate-tts',
          shotId: dubbingShotId,
          extraParams: {
            text: trialText,
            provider: config.provider,
            voiceId: config.voiceId === 'custom' ? config.customAudioUrl : config.voiceId,
            apiUrl: config.provider === 'index-tts' ? indexTtsApiUrl
                    : config.provider === 'gpt-sovits' ? gptSovitsApiUrl
                    : config.provider === 'edge-tts' ? edgeTtsApiUrl
                    : undefined,
            extraConfig: {
              emotion: config.emotion,
              voice_desc: config.voiceDesc,
              start_pause: config.provider === 'index-tts' ? indexTtsStartPause : undefined,
              end_pause: config.provider === 'index-tts' ? indexTtsEndPause : undefined
            }
          }
        })
      });
      const data = await res.json();
      if (data.data?.audioUrl) {
        setTrialAudioUrl(data.data.audioUrl);
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
      alert('试听配音生成失败');
    } finally {
      setTrialling(false);
    }
  };

  const handleGenerateLineDub = async (lineText: string, lineIndex: number, lineCharacter: string) => {
    const config = dubbingCharacterVoices[lineCharacter] || { provider: 'edge-tts', voiceId: 'zh-CN-XiaoxiaoNeural' };
    
    setGeneratingLineIndex(lineIndex);
    try {
      const res = await fetch(`/api/short-dramas/${dramaId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          action: 'generate-tts',
          shotId: dubbingShotId,
          extraParams: {
            text: lineText,
            provider: config.provider,
            voiceId: config.voiceId === 'custom' ? config.customAudioUrl : config.voiceId,
            apiUrl: config.provider === 'index-tts' ? indexTtsApiUrl
                    : config.provider === 'gpt-sovits' ? gptSovitsApiUrl
                    : config.provider === 'edge-tts' ? edgeTtsApiUrl
                    : undefined,
            extraConfig: {
              emotion: config.emotion,
              voice_desc: config.voiceDesc,
              start_pause: config.provider === 'index-tts' ? indexTtsStartPause : undefined,
              end_pause: config.provider === 'index-tts' ? indexTtsEndPause : undefined
            }
          }
        })
      });
      const data = await res.json();
      if (data.data?.audioUrl) {
        setDubbedAudios(prev => ({
          ...prev,
          [lineIndex]: data.data.audioUrl
        }));
        return data.data.audioUrl;
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
      alert('配音生成错误');
    } finally {
      setGeneratingLineIndex(null);
    }
    return null;
  };

  const handleGenerateAllDubs = async (lines: any[]) => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      await handleGenerateLineDub(line.text, i, line.character);
    }
  };

  const handleSaveDubbing = async (lines: any[]) => {
    setSavingDubbing(true);
    try {
      const dubbedList = lines.map((line, idx) => ({
        character: line.character,
        text: line.text,
        audioUrl: dubbedAudios[idx] || ''
      }));

      const res = await fetch(`/api/short-dramas/${dramaId}/storyboards`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          shotId: dubbingShotId,
          audioUrl: JSON.stringify(dubbedList)
        })
      });

      if (res.ok) {
        setDubbingShotId(null);
        onRefreshShots();
      } else {
        alert('保存配音失败');
      }
    } catch (err) {
      console.error(err);
      alert('保存配音出错');
    } finally {
      setSavingDubbing(false);
    }
  };

  // ── 风格设置与手动添加 ──
  const [showStyleModal, setShowStyleModal] = useState(false);
  const [addShot, setAddShot] = useState(false);
  
  // ── 自定义生成模板大模型 ──
  const [showCustomPromptPanel, setShowCustomPromptPanel] = useState(false);
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');
  const [customUserPrompt, setCustomUserPrompt] = useState('');
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);

  useEffect(() => {
    const sys = localStorage.getItem(`custom-prompt-sys-${mode}`) || '';
    const usr = localStorage.getItem(`custom-prompt-usr-${mode}`) || '';
    const enabled = localStorage.getItem(`custom-prompt-enabled-${mode}`) === 'true';
    setCustomSystemPrompt(sys);
    setCustomUserPrompt(usr);
    setUseCustomPrompt(enabled);
  }, [mode]);

  const saveCustomPromptConfig = (sys: string, usr: string, enabled: boolean) => {
    localStorage.setItem(`custom-prompt-sys-${mode}`, sys);
    localStorage.setItem(`custom-prompt-usr-${mode}`, usr);
    localStorage.setItem(`custom-prompt-enabled-${mode}`, enabled ? 'true' : 'false');
    setCustomSystemPrompt(sys);
    setCustomUserPrompt(usr);
    setUseCustomPrompt(enabled);
  };

  const [newShotForm, setNewShotForm] = useState({
    shotNumber: 1,
    cameraAngle: '',
    sceneDescription: '',
    dialogue: '',
    imagePrompt: '',
    videoPrompt: '',
    startFrame: '',
    endFrame: '',
    cameraMovement: '',
    characterAction: '',
    voiceover: '',
    negativePrompt: '',
    duration: 5
  });

  // 当 shots 变化或者打开 addShot 时，自动把镜头号设为最大值 + 1
  useEffect(() => {
    if (addShot && shots.length > 0) {
      const maxNum = Math.max(...shots.map((s: any) => s.shotNumber || 0));
      setNewShotForm(f => ({ ...f, shotNumber: maxNum + 1 }));
    }
  }, [addShot, shots]);

  const getStoryboardStyle = (): StyleConfig => {
    try {
      const stored = localStorage.getItem(`storyboard-style-${mode}`);
      return stored ? JSON.parse(stored) : { prePrompt: '', postPrompt: '', referenceImages: [] };
    } catch {
      return { prePrompt: '', postPrompt: '', referenceImages: [] };
    }
  };

  const saveStoryboardStyle = async (s: StyleConfig) => {
    localStorage.setItem(`storyboard-style-${mode}`, JSON.stringify(s));
    setShowStyleModal(false);
  };

  const handleAddShot = async () => {
    if (!selectedEpisode) return;
    if (!newShotForm.sceneDescription) {
      alert('请输入画面场景描述');
      return;
    }
    
    // 构造 videoPrompt JSON 字符串（如果是视频模式且有任意视频结构化参数）
    let finalVideoPrompt: string | null = null;
    if (mode === 'video') {
      const vpObj = {
        startFrame: newShotForm.startFrame || '',
        endFrame: newShotForm.endFrame || '',
        cameraMovement: newShotForm.cameraMovement || '',
        characterAction: newShotForm.characterAction || '',
        prompt: newShotForm.videoPrompt || ''
      };
      finalVideoPrompt = JSON.stringify(vpObj);
    }

    const body = {
      episodeId: selectedEpisode.id,
      shotNumber: newShotForm.shotNumber,
      shotType: 'storyboard',
      sceneDescription: newShotForm.sceneDescription,
      cameraAngle: newShotForm.cameraAngle || null,
      dialogue: newShotForm.dialogue || null,
      imagePrompt: mode === 'image' ? (newShotForm.imagePrompt || null) : null,
      videoPrompt: mode === 'video' ? finalVideoPrompt : null,
      duration: mode === 'video' ? newShotForm.duration : 3
    };

    const res = await fetch(`/api/short-dramas/${dramaId}/storyboards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(body),
    });
    
    if (res.ok) {
      setAddShot(false);
      setNewShotForm({
        shotNumber: 1,
        cameraAngle: '',
        sceneDescription: '',
        dialogue: '',
        imagePrompt: '',
        videoPrompt: '',
        startFrame: '',
        endFrame: '',
        cameraMovement: '',
        characterAction: '',
        voiceover: '',
        negativePrompt: '',
        duration: 5
      });
      onRefreshShots();
    } else {
      const d = await res.json();
      alert(d.error || '添加分镜失败');
    }
  };
  // ── 参考图 ──
  const [refImages, setRefImages] = useState<{url:string;label:string;type:string}[]>([]);
  const [showRefPanel, setShowRefPanel] = useState(false);
  const [useAutoRef, setUseAutoRef] = useState(true);
  const refFileInputRef = useRef<HTMLInputElement>(null);
  // ── 参考图预览 ──
  const [imgPreviewUrl, setImgPreviewUrl] = useState<string|null>(null);
  // ── 每个分镜独立参考图 ──
  const [shotRefImages, setShotRefImages] = useState<Record<string,{url:string;label:string;type:string}[]>>({});
  const [refPanelShotId, setRefPanelShotId] = useState<string|null>(null);
  const shotRefFileInputRef = useRef<HTMLInputElement>(null);
  const getShotRefs = (shotId: string) => shotRefImages[shotId] || [];
  // ── 合并参考图（Canvas 拼贴） ──
  const [mergingVideoShotId, setMergingVideoShotId] = useState<string|null>(null);
  const mergeRefsToCanvas = (urls: string[]): Promise<string> => new Promise(resolve => {
    if (urls.length === 0) { resolve(''); return; }
    const SIZE = 512;
    const cols = urls.length <= 2 ? urls.length : Math.ceil(Math.sqrt(urls.length));
    const rows = Math.ceil(urls.length / cols);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE * cols; canvas.height = SIZE * rows;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let loaded = 0;
    const done = () => { if (++loaded === urls.length) resolve(canvas.toDataURL('image/jpeg', 0.9)); };
    urls.forEach((url, i) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        const col = i % cols; const row = Math.floor(i / cols);
        const scale = Math.max(SIZE / img.width, SIZE / img.height);
        const sw = img.width * scale; const sh = img.height * scale;
        ctx.drawImage(img, col * SIZE + (SIZE - sw) / 2, row * SIZE + (SIZE - sh) / 2, sw, sh);
        done();
      };
      img.onerror = done;
      img.src = url.startsWith('/') ? `${window.location.origin}${url}` : url;
    });
  });
  const setShotRefs = (shotId: string, refs: {url:string;label:string;type:string}[]) =>
    setShotRefImages(prev => ({ ...prev, [shotId]: refs }));
  const getAutoRefs = (shot: any): string[] => {
    const refs: string[] = [];
    // 将图片提示词 + 场景描述合并为搜索文本
    const searchText = [(shot.imagePrompt || ''), (shot.sceneDescription || ''), (shot.videoPrompt ? (() => { try { const vp = JSON.parse(shot.videoPrompt); return vp.prompt || shot.videoPrompt; } catch { return shot.videoPrompt; } })() : '')].join(' ').toLowerCase();
    // 1. 从 characterIds JSON 匹配
    let charIds: string[] = [];
    try { charIds = Array.isArray(shot.characterIds) ? shot.characterIds : JSON.parse(shot.characterIds || '[]'); } catch {}
    for (const cid of charIds) {
      const char = (drama?.characters || []).find((c: any) =>
        c.id === cid || cleanCharName(c.name) === cid || (c.name || '').includes(cid) || (cid || '').includes(cleanCharName(c.name)));
      if (char?.imageUrl && !refs.includes(char.imageUrl)) refs.push(char.imageUrl);
    }
    // 2. 从 imagePrompt 文本匹配角色名
    for (const c of (drama?.characters || [])) {
      if (!c.imageUrl || refs.includes(c.imageUrl)) continue;
      const name = cleanCharName(c.name || '').toLowerCase();
      if (name.length >= 2 && searchText.includes(name)) refs.push(c.imageUrl);
    }
    // 3. 匹配场景名
    for (const sc of (drama?.scenes || [])) {
      if (!sc.imageUrl || refs.includes(sc.imageUrl)) continue;
      const name = (sc.name || '').toLowerCase();
      if (name.length >= 2 && searchText.includes(name)) { refs.push(sc.imageUrl); }
    }
    // 4. 匹配物品名
    for (const it of (drama?.items || [])) {
      if (!it.imageUrl || refs.includes(it.imageUrl)) continue;
      const name = (it.name || '').toLowerCase();
      if (name.length >= 2 && searchText.includes(name)) { refs.push(it.imageUrl); }
    }
    return refs.slice(0, 6);
  };
  const deleteShot = async (shotId: string, shotNumber: number) => {
    if (!confirm(`确认删除镜头 #${shotNumber}？此操作不可撤销。`)) return;
    await fetch(`/api/short-dramas/${dramaId}/storyboards`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ shotId }),
    });
    onRefreshShots();
  };
  const IMAGE_ASPECTS = [
    { key: '1:1',  label: '1:1',  w: 1024, h: 1024 },
    { key: '16:9', label: '16:9', w: 1280, h: 720 },
    { key: '9:16', label: '9:16', w: 720,  h: 1280 },
    { key: '4:3',  label: '4:3',  w: 1024, h: 768 },
    { key: '3:4',  label: '3:4',  w: 768,  h: 1024 },
  ] as const;
  const VIDEO_ASPECTS = [
    { key: '1:1',  label: '1:1',  w: 1080, h: 1080, ratio: '1:1'  },
    { key: '16:9', label: '16:9', w: 1280, h: 720,  ratio: '16:9' },
    { key: '9:16', label: '9:16', w: 720,  h: 1280, ratio: '9:16' },
    { key: '4:3',  label: '4:3',  w: 1024, h: 768,  ratio: '4:3'  },
    { key: '3:4',  label: '3:4',  w: 768,  h: 1024, ratio: '3:4'  },
  ] as const;
  const [imageAspect, setImageAspectRaw] = useState<string>(() =>
    (typeof window !== 'undefined' && localStorage.getItem('sdc-aspect-storyboard')) || '16:9'
  );
  const setImageAspect = (v: string) => {
    if (typeof window !== 'undefined') localStorage.setItem('sdc-aspect-storyboard', v);
    setImageAspectRaw(v);
  };
  const [videoAspect, setVideoAspectRaw] = useState<string>(() =>
    (typeof window !== 'undefined' && localStorage.getItem('sdc-aspect-video')) || '16:9'
  );
  const setVideoAspect = (v: string) => {
    if (typeof window !== 'undefined') localStorage.setItem('sdc-aspect-video', v);
    setVideoAspectRaw(v);
  };
  type MediaProvider = { id: string; name: string; baseUrl: string; models: readonly string[] };
  const providers = (mode === 'image' ? IMAGE_PROVIDERS : VIDEO_PROVIDERS) as readonly MediaProvider[];
  const curCfg = mode === 'image' ? (mediaConfig?.image || {}) : (mediaConfig?.video || {});
  const [showMediaCfg, setShowMediaCfg] = useState(!curCfg.apiKey);
  const curProvider = Array.from(providers).find((p: any) => p.id === curCfg.provider) || providers[0];

  const openEdit = (s: any) => {
    setEditingShot(s);

    // ── 1. 清理 imagePrompt ──
    let cleanedImagePrompt = s.imagePrompt || '';
    if (cleanedImagePrompt.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(cleanedImagePrompt);
        cleanedImagePrompt = parsed.imagePrompt || parsed.prompt || cleanedImagePrompt;
      } catch {
        const regex = /"imagePrompt"\s*:\s*"([\s\S]*?)"(?=\s*,|\s*})/g;
        const m = regex.exec(cleanedImagePrompt);
        if (m && m[1]) {
          cleanedImagePrompt = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
        } else {
          const regexPrompt = /"prompt"\s*:\s*"([\s\S]*?)"(?=\s*,|\s*})/g;
          const mP = regexPrompt.exec(cleanedImagePrompt);
          if (mP && mP[1]) {
            cleanedImagePrompt = mP[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
          }
        }
      }
    }

    // ── 2. 清理并标准化 videoPrompt 为合法的 JSON 字符串 ──
    let cleanedVideoPrompt = s.videoPrompt || '';
    if (cleanedVideoPrompt) {
      const base = { startFrame: '', endFrame: '', cameraMovement: '', characterAction: '', prompt: '' };
      let vp: any = { ...base };
      let parseSuccess = false;
      try {
        const parsed = JSON.parse(cleanedVideoPrompt);
        if (parsed.startFrame || parsed.cameraMovement || parsed.prompt) {
          vp = { ...base, ...parsed };
          parseSuccess = true;
        }
      } catch {}

      if (!parseSuccess) {
        const getFieldByRegex = (jsonStr: string, field: string): string => {
          const regex = new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,|\\s*})`, 'g');
          const m = regex.exec(jsonStr);
          if (m && m[1]) {
            return m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
          }
          return '';
        };

        const regStart = getFieldByRegex(cleanedVideoPrompt, 'startFrame');
        const regEnd = getFieldByRegex(cleanedVideoPrompt, 'endFrame');
        const regCam = getFieldByRegex(cleanedVideoPrompt, 'cameraMovement');
        const regChar = getFieldByRegex(cleanedVideoPrompt, 'characterAction');
        const regPrompt = getFieldByRegex(cleanedVideoPrompt, 'prompt');

        if (regStart || regEnd || regCam || regChar || regPrompt) {
          vp = {
            startFrame: regStart,
            endFrame: regEnd,
            cameraMovement: regCam,
            characterAction: regChar,
            prompt: regPrompt || cleanedVideoPrompt
          };
        } else {
          vp.prompt = cleanedVideoPrompt;
        }
      }
      cleanedVideoPrompt = JSON.stringify(vp);
    }

    setEditForm({
      sceneDescription: s.sceneDescription || '',
      dialogue: s.dialogue || '',
      cameraAngle: s.cameraAngle || '',
      imagePrompt: cleanedImagePrompt,
      videoPrompt: cleanedVideoPrompt,
      negativePrompt: (s as any).negativePrompt || ''
    });
  };
  const saveEdit = async () => {
    if (!editingShot) return;
    setSavingShot(true);
    try {
      const { negativePrompt: _np, ...saveFields } = editForm;

      // ── 🛡️ 严格落库排查与自动补齐 @ 守护机制 (Database Guard) ──
      // 在用户或 AI 生成的数据提交到数据库的最后一关，强制进行全量扫描补齐，确保落库提示词 100% 正确携带 @
      const assetNames: string[] = [];
      if (drama) {
        (drama.characters || []).forEach((c: any) => { if (c.name) assetNames.push(c.name); });
        (drama.scenes || []).forEach((s: any) => { if (s.name) assetNames.push(s.name); });
        (drama.items || []).forEach((i: any) => { if (i.name) assetNames.push(i.name); });
      }
      // 按长度由长到短排序，防止子串破坏
      const sortedNames = assetNames.filter(Boolean).sort((a, b) => b.length - a.length);

      const autoAtRepair = (inputText: string): string => {
        if (!inputText) return '';
        let result = inputText;
        // 如果是 JSON 字符串，我们需要递归解析和替换
        if (result.startsWith('{')) {
          try {
            const parsed = JSON.parse(result);
            if (parsed.prompt !== undefined) {
              parsed.prompt = autoAtRepair(parsed.prompt);
            }
            if (parsed.startFrame !== undefined) {
              parsed.startFrame = autoAtRepair(parsed.startFrame);
            }
            if (parsed.endFrame !== undefined) {
              parsed.endFrame = autoAtRepair(parsed.endFrame);
            }
            if (parsed.cameraMovement !== undefined) {
              parsed.cameraMovement = autoAtRepair(parsed.cameraMovement);
            }
            if (parsed.characterAction !== undefined) {
              parsed.characterAction = autoAtRepair(parsed.characterAction);
            }
            return JSON.stringify(parsed);
          } catch {}
        }
        // 普通文本，直接执行 @ 补全
        for (const name of sortedNames) {
          const escapeRegex = (str: string) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const escapedName = escapeRegex(name);
          const regex = new RegExp(`(?<!@)${escapedName}`, 'g');
          result = result.replace(regex, `@${name}`);
        }
        return result;
      };

      if (saveFields.imagePrompt) {
        saveFields.imagePrompt = autoAtRepair(saveFields.imagePrompt);
      }
      if (saveFields.videoPrompt) {
        saveFields.videoPrompt = autoAtRepair(saveFields.videoPrompt);
      }

      await fetch(`/api/short-dramas/${dramaId}/storyboards`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ shotId: editingShot.id, ...saveFields }),
      });
      setEditingShot(null);
      onRefreshShots();
    } finally { setSavingShot(false); }
  };

  // Resolve screenplay: episode own → linked script chapter
  const episodeScreenplay = selectedEpisode?.screenplay ||
    (selectedEpisode?.sourceScriptChapterIndex != null
      ? drama.script?.chapters?.[selectedEpisode.sourceScriptChapterIndex]?.screenplay
      : null) ||
    (selectedEpisode?.sourceChapter != null
      ? drama.script?.chapters?.find((c: any) => c.index === selectedEpisode.sourceChapter - 1)?.screenplay
      : null) || null;

  const handleSyncFromScript = async (episodeId?: string) => {
    if (!drama.scriptId) { alert('该短剧未关联剧本，无法同步'); return; }
    setSyncing(true); setSyncMsg(null);
    try {
      const res = await fetch(`/api/short-dramas/${dramaId}/sync-storyboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(episodeId ? { episodeId } : {}),
      });
      const data = await res.json();
      if (data.success) {
        setSyncMsg(data.message);
        onRefreshShots();
      } else {
        setSyncMsg(data.error || '同步失败');
      }
    } catch (e: any) { setSyncMsg(e.message); }
    finally { setSyncing(false); }
  };

  return (
    <div className="space-y-4">
      {/* ── 媒体API配置面板（卡片风格）── */}
      {(() => {
        const CUSTOM_ID = '__custom__';
        const activeSysCfg = systemMediaConfigs.find((sc: any) => sc.id === curCfg.systemConfigId);
        const isCustomSelected = !curCfg.systemConfigId;
        const selectedCardId = curCfg.systemConfigId || CUSTOM_ID;
        const isReady = !!curCfg.apiKey || (!!activeSysCfg && activeSysCfg.hasKey);
        return (
          <div className="backdrop-blur-xl rounded-2xl p-4 border border-blue-500/20" style={{ background: 'rgba(59,130,246,0.04)' }}>
            {/* Header and Selector merged */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
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
                <span className="font-semibold flex items-center gap-1.5 select-none">
                  <span className="animate-rainbow font-black text-sm flex items-center gap-1">
                    {mode === 'image' ? '🖼️' : '🎬'} {mode === 'image' ? '图片' : '视频'}生成API配置：
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedCardId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__custom__') {
                        onSaveMediaConfig({ ...(mediaConfig || {}), [mode]: { ...curCfg, systemConfigId: '' } });
                        setShowMediaCfg(true);
                      } else {
                        const sc = systemMediaConfigs.find((x: any) => x.id === val);
                        if (sc) {
                          onSaveMediaConfig({ ...(mediaConfig || {}), [mode]: { ...curCfg, provider: sc.provider, model: sc.model, apiUrl: sc.apiUrl || '', systemConfigId: sc.id, apiKey: '' } });
                          setShowMediaCfg(false);
                        }
                      }
                    }}
                    className="bg-slate-950/60 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-blue-400 font-bold focus:outline-none focus:border-blue-500/50 cursor-pointer"
                  >
                    {systemMediaConfigs.map((sc: any) => (
                      <option key={sc.id} value={sc.id} className="bg-[#111827] text-slate-100 font-normal">
                        {sc.name} ({sc.provider} · {sc.model?.split('/').pop()}) {sc.isDefault === 1 ? '★' : ''}
                      </option>
                    ))}
                    <option value="__custom__" className="bg-[#111827] text-slate-100 font-normal">自定义配置 (填入您自己的 API Key)</option>
                  </select>
                </div>
              </div>
              {isReady && <span className="text-[10px] text-green-400 bg-green-500/10 px-2.5 py-1 rounded-lg border border-green-500/20 font-bold">✓ 已就绪: {activeSysCfg ? activeSysCfg.name : `${curProvider?.name} · ${(curCfg.model || '').split('/').pop()}`}</span>}
              {!isReady && <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 font-bold">⚠️ 未配置</span>}
            </div>

            {/* Custom config form — shown when custom card selected */}
            {isCustomSelected && showMediaCfg && (
              <div className="mt-3 pt-3 border-t border-white/8 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-400 mb-1 block">供应商</label>
                    <CustomSelect
                      value={curCfg.provider || providers[0]?.id || ''}
                      onChange={v => {
                        const p = Array.from(providers).find((x: any) => x.id === v);
                        onSaveMediaConfig({ ...(mediaConfig || {}), [mode]: { ...curCfg, provider: v, apiUrl: (p as any)?.baseUrl || '', model: (p as any)?.models?.[0] || '', systemConfigId: '' } });
                      }}
                      options={Array.from(providers).map((p: any) => ({ value: p.id, label: p.name }))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-1 block">模型</label>
                    {(curProvider?.models?.length ?? 0) > 0 ? (
                      <CustomSelect
                        value={curCfg.model || curProvider?.models?.[0] || ''}
                        onChange={v => onSaveMediaConfig({ ...(mediaConfig || {}), [mode]: { ...curCfg, model: v, systemConfigId: '' } })}
                        options={(curProvider?.models || []).map((m: string) => ({ value: m, label: m }))}
                      />
                    ) : (
                      <input value={curCfg.model || ''} placeholder="输入模型名称"
                        onChange={e => onSaveMediaConfig({ ...(mediaConfig || {}), [mode]: { ...curCfg, model: e.target.value, systemConfigId: '' } })}
                        className="w-full text-xs bg-white/8 border border-white/10 rounded-lg px-2 py-1.5 text-white placeholder-gray-600 focus:outline-none" />
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 mb-1 block">API Key <span className="text-red-400">*</span></label>
                  <input type="password" value={curCfg.apiKey || ''} placeholder="请输入 API Key（sk-...）"
                    onChange={e => onSaveMediaConfig({ ...(mediaConfig || {}), [mode]: { ...curCfg, apiKey: e.target.value, systemConfigId: '' } })}
                    className="w-full text-xs bg-white/8 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-white/25" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 mb-1 block">自定义 API URL
                    <span className="text-gray-600 ml-1">(可选，默认: {curProvider?.baseUrl})</span>
                  </label>
                  <input value={curCfg.apiUrl || ''} placeholder={curProvider?.baseUrl || 'https://...'}
                    onChange={e => onSaveMediaConfig({ ...(mediaConfig || {}), [mode]: { ...curCfg, apiUrl: e.target.value } })}
                    className="w-full text-xs bg-white/8 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/25" />
                </div>
                <div className="text-[10px] text-gray-500">配置自动保存到本地浏览器。</div>
              </div>
            )}
            {/* toggle custom form when custom card already selected */}
            {isCustomSelected && (
              <button onClick={() => setShowMediaCfg(v => !v)} className="mt-2 text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                {showMediaCfg ? '▲ 收起配置' : '▼ 展开配置'}
              </button>
            )}
          </div>
        );
      })()}

      {/* 分集选择 */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        <span className="text-xs text-gray-400 whitespace-nowrap">选择分集:</span>
        {drama.episodes?.map((ep: Episode) => {
          const _chIdx = (ep as any).sourceScriptChapterIndex;
          const _srcCh = (ep as any).sourceChapter;
          const _ch = _chIdx != null
            ? drama.script?.chapters?.[_chIdx]
            : _srcCh != null
              ? drama.script?.chapters?.find((c: any) => c.index === _srcCh - 1)
              : drama.script?.chapters?.[ep.episodeNumber - 1] ?? null;
          const _novelCh = (drama.novel?.chapters as any[]|undefined)?.[ep.episodeNumber - 1];
          const _rawTitle = (_ch as any)?.title || _novelCh?.title || ep.title;
          const _isGeneric = !_rawTitle || /^第\d+集$/.test(_rawTitle.trim());
          const _label = _isGeneric ? `第${ep.episodeNumber}集` : `第${ep.episodeNumber}集：${_rawTitle}`;
          return (
            <button key={ep.id} onClick={() => onSelectEpisode(ep)}
              className={`px-3 py-1.5 text-xs rounded-xl whitespace-nowrap transition-all font-medium ${
                selectedEpisode?.id === ep.id
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-900/40'
                  : 'bg-white/5 text-gray-400 hover:bg-violet-500/15 hover:text-violet-300 border border-white/8 hover:border-violet-500/30'
              }`}
            >{_label}</button>
          );
        })}
      </div>

      {syncMsg && (
        <div className={`px-3 py-2 rounded-lg text-xs border ${syncMsg.includes('失败') || syncMsg.includes('错误') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}>
          {syncMsg}
          <button onClick={() => setSyncMsg(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* 操作栏 */}
      {(() => {
        const visibleShots = shots || [];
        const handleClear = async () => {
          if (!selectedEpisode) return;
          const label = mode === 'image' ? '图片提示词' : '视频提示词';
          if (!confirm(`确认清空第${selectedEpisode.episodeNumber}集全部 ${visibleShots.length} 个分镜的${label}？`)) return;
          await fetch(`/api/short-dramas/${dramaId}/storyboards/clear-prompts`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
            body: JSON.stringify({ episodeId: selectedEpisode.id, type: mode }),
          });
          onRefreshShots();
        };
        return selectedEpisode ? (
          <div className="space-y-4">
            {/* 尺寸与秒数选择面板 */}
            <div className="rounded-2xl border border-white/8 px-4 py-3.5" style={{background:'rgba(255,255,255,0.03)'}}>
              {mode === 'image' ? (
                /* 尺寸选择 */
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 font-medium whitespace-nowrap">生成尺寸</span>
                  <div className="flex gap-2">
                    {IMAGE_ASPECTS.map((a: any) => (
                      <button key={a.key} onClick={() => setImageAspect(a.key)}
                        className={`px-4 py-2 text-sm font-semibold rounded-xl border transition-all ${
                          imageAspect === a.key
                            ? 'border-sky-500/70 bg-sky-500/20 text-sky-200 shadow-sm shadow-sky-500/20'
                            : 'border-white/12 bg-white/5 text-gray-300 hover:bg-white/10 hover:border-white/25 hover:text-white'
                        }`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-gray-500 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/8">
                    {`${IMAGE_ASPECTS.find((a: any) => a.key === imageAspect)?.w} × ${IMAGE_ASPECTS.find((a: any) => a.key === imageAspect)?.h}`}
                  </span>
                </div>
              ) : (
                /* 视频模式：两栏布局（尺寸 + 秒数） */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  {/* 左边：生成尺寸 */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 font-medium whitespace-nowrap">生成尺寸</span>
                    <div className="flex gap-2">
                      {VIDEO_ASPECTS.map((a: any) => (
                        <button key={a.key} onClick={() => setVideoAspect(a.key)}
                          className={`px-4 py-2 text-sm font-semibold rounded-xl border transition-all ${
                            videoAspect === a.key
                              ? 'border-sky-500/70 bg-sky-500/20 text-sky-200 shadow-sm shadow-sky-500/20'
                              : 'border-white/12 bg-white/5 text-gray-300 hover:bg-white/10 hover:border-white/25 hover:text-white'
                          }`}>
                          {a.label}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-gray-500 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/8">
                      {`${VIDEO_ASPECTS.find((a: any) => a.key === videoAspect)?.w} × ${VIDEO_ASPECTS.find((a: any) => a.key === videoAspect)?.h}`}
                    </span>
                  </div>

                  {/* 右边：生成秒数 */}
                  <div className="flex items-center gap-3 border-t md:border-t-0 md:border-l border-white/8 pt-3 md:pt-0 md:pl-6 flex-wrap">
                    <span className="text-xs text-gray-400 font-medium whitespace-nowrap">生成秒数</span>
                    <div className="flex gap-2 flex-wrap items-center">
                      {[5, 6, 8, 10, 12, 15].map((sec) => (
                        <button key={sec} onClick={() => {
                          onSaveMediaConfig({
                            ...(mediaConfig || {}),
                            video: {
                              ...(mediaConfig?.video || {}),
                              duration: sec
                            }
                          });
                        }}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                            (mediaConfig?.video?.duration ?? 5) === sec
                              ? 'border-violet-500/70 bg-violet-500/20 text-violet-200 shadow-sm shadow-violet-500/20'
                              : 'border-white/12 bg-white/5 text-gray-300 hover:bg-white/10 hover:border-white/25 hover:text-white'
                          }`}>
                          {sec}秒
                        </button>
                      ))}

                      {/* 自定义输入框 */}
                      <div className={`flex items-center bg-white/5 border rounded-xl px-2 py-1 max-w-[85px] transition-all focus-within:border-violet-500/70 ${
                        ![5, 6, 8, 10, 12, 15].includes(mediaConfig?.video?.duration ?? 5)
                          ? 'border-violet-500/70 ring-1 ring-violet-500/20 bg-violet-500/10'
                          : 'border-white/12 hover:border-white/20'
                      }`}>
                        <input
                          type="number"
                          min="1"
                          max="300"
                          value={[5, 6, 8, 10, 12, 15].includes(mediaConfig?.video?.duration ?? 5) ? '' : (mediaConfig?.video?.duration ?? '')}
                          placeholder="自定义"
                          onChange={e => {
                            const val = parseInt(e.target.value);
                            onSaveMediaConfig({
                              ...(mediaConfig || {}),
                              video: {
                                ...(mediaConfig?.video || {}),
                                duration: isNaN(val) ? '' as any : val
                              }
                            });
                          }}
                          className="w-full bg-transparent text-xs text-center text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-[11px] text-gray-500 pr-0.5 select-none whitespace-nowrap">秒</span>
                      </div>

                      {/* 声音选择 */}
                      <div className="flex bg-white/5 p-0.5 rounded-xl border border-white/8 ml-3 flex-shrink-0">
                        <button
                          onClick={() => onSaveMediaConfig({
                            ...(mediaConfig || {}),
                            video: {
                              ...(mediaConfig?.video || {}),
                              audio: true
                            }
                          })}
                          className={`px-3 py-1 text-[11px] font-semibold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                            (mediaConfig?.video?.audio !== false)
                              ? 'bg-violet-500/25 text-violet-200 border border-violet-500/30'
                              : 'text-gray-400 border border-transparent hover:text-white'
                          }`}
                        >
                          🔊 有声音
                        </button>
                        <button
                          onClick={() => onSaveMediaConfig({
                            ...(mediaConfig || {}),
                            video: {
                              ...(mediaConfig?.video || {}),
                              audio: false
                            }
                          })}
                          className={`px-3 py-1 text-[11px] font-semibold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                            (mediaConfig?.video?.audio === false)
                              ? 'bg-violet-500/25 text-violet-200 border border-violet-500/30'
                              : 'text-gray-400 border border-transparent hover:text-white'
                          }`}
                        >
                          🔇 无声音
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 提示词与配置控制面板 */}
            <div className="rounded-2xl border border-white/8 px-4 py-3.5" style={{background:'rgba(255,255,255,0.03)'}}>
              <div className="flex items-center gap-2 flex-wrap">
                {mode === 'image' ? (
                  <>
                  <button onClick={() => onGenerate('generate-image-prompt', {
                    episodeId: selectedEpisode.id,
                    customSystemPrompt: useCustomPrompt ? customSystemPrompt : undefined,
                    customUserPromptTpl: useCustomPrompt ? customUserPrompt : undefined
                  })}
                    disabled={!!generating}
                    className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-sky-600 to-blue-600 text-white rounded-xl hover:from-sky-500 hover:to-blue-500 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-md shadow-sky-900/30">
                    {generating === 'generate-image-prompt' ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />生成中…</> : <>🖼️ 生成图片提示词</>}
                  </button>
                  <button
                    onClick={async () => {
                      const pending = visibleShots.filter((s: any) => !s.imageUrl);
                      if (pending.length === 0) {
                        alert('当前所有分镜都已经有图片了！');
                        return;
                      }
                      if (!confirm(`确认一键为 ${pending.length} 个分镜生成分镜图？`)) return;
                      const asp = IMAGE_ASPECTS.find(a => a.key === imageAspect);
                      const style = getStoryboardStyle();
                      for (const s of pending) {
                        const autoRefs = useAutoRef ? getAutoRefs(s) : [];
                        const perShot = getShotRefs(s.id).map(r => r.url);
                        const globalFallback = refImages.map(r => r.url);
                        const allRefs = [...new Set([...perShot, ...autoRefs, ...globalFallback])].slice(0, 6);
                        
                        let finalPrompt = s.imagePrompt || '';
                        if (style.prePrompt) finalPrompt = style.prePrompt + ', ' + finalPrompt;
                        if (style.postPrompt) finalPrompt = finalPrompt + ', ' + style.postPrompt;
                        const styleRefs = (style.referenceImages || []).filter(Boolean);
                        const allRefsWithStyle = [...new Set([...allRefs, ...styleRefs])].slice(0, 6);
                        
                        onGenerate('generate-image', {
                          shotId: s.id,
                          prompt: finalPrompt,
                          imageWidth: asp?.w,
                          imageHeight: asp?.h,
                          imageAspect,
                          ...(allRefsWithStyle.length > 0 ? { referenceImages: allRefsWithStyle } : {})
                        });
                        await new Promise(r => setTimeout(r, 200));
                      }
                    }}
                    disabled={!!generating || visibleShots.length === 0}
                    className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-md shadow-emerald-900/30"
                  >
                    🎨 一键生成全部图片分镜
                  </button>
                  </>
                ) : (
                  <>
                  <button onClick={() => onGenerate('generate-video-prompt', {
                    episodeId: selectedEpisode.id,
                    customSystemPrompt: useCustomPrompt ? customSystemPrompt : undefined,
                    customUserPromptTpl: useCustomPrompt ? customUserPrompt : undefined
                  })}
                    disabled={!!generating}
                    className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-md shadow-violet-900/30">
                    {generating === 'generate-video-prompt' ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />生成中…</> : <>🎥 生成视频提示词</>}
                  </button>
                  <button
                    onClick={async () => {
                      const pending = visibleShots.filter((s: any) => !s.videoUrl && s.imageUrl);
                      if (pending.length === 0) {
                        alert('没有符合条件的待生成视频分镜！请确认：\n1. 这些分镜是否均已经生成了【分镜图片】；\n2. 它们是否尚未生成【视频】。');
                        return;
                      }
                      if (!confirm(`确认一键为 ${pending.length} 个分镜生成视频（基于分镜图首帧）？`)) return;
                      const vasp = VIDEO_ASPECTS.find(a => a.key === videoAspect);
                      const style = getStoryboardStyle();
                      for (const s of pending) {
                        let finalPrompt = (s as any).videoPrompt || '';
                        let isJson = false;
                        let vp: any = {};
                        try {
                          vp = JSON.parse(finalPrompt);
                          if (vp.prompt) {
                            isJson = true;
                            if (style.prePrompt) vp.prompt = style.prePrompt + ', ' + vp.prompt;
                            if (style.postPrompt) vp.prompt = vp.prompt + ', ' + style.postPrompt;
                            finalPrompt = JSON.stringify(vp);
                          }
                        } catch {}
                        if (!isJson && finalPrompt) {
                          if (style.prePrompt) finalPrompt = style.prePrompt + ', ' + finalPrompt;
                          if (style.postPrompt) finalPrompt = finalPrompt + ', ' + style.postPrompt;
                        }
                        const styleRefs = (style.referenceImages || []).filter(Boolean);
                        const allRefsWithStyle = [...new Set([...styleRefs])].slice(0, 6);
                        
                        onGenerate('generate-video', {
                          shotId: s.id,
                          videoWidth: vasp?.w,
                          videoHeight: vasp?.h,
                          videoAspect,
                          videoGenMode: 'shot',
                          ...(isJson ? { videoPrompt: finalPrompt } : { promptText: finalPrompt }),
                          ...(allRefsWithStyle.length > 0 ? { referenceImages: allRefsWithStyle } : {})
                        });
                        await new Promise(r => setTimeout(r, 200));
                      }
                    }}
                    disabled={!!generating || visibleShots.length === 0}
                    className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-md shadow-emerald-900/30"
                  >
                    🎬 一键生成全部视频分镜
                  </button>
                  </>
                )}
                {visibleShots.length > 0 && (
                  <button onClick={handleClear} disabled={!!generating}
                    className="px-3 py-2 text-xs font-medium bg-red-500/10 text-red-400 rounded-xl border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5">
                    🗑️ 清空{mode === 'image' ? '图片' : '视频'}提示词
                  </button>
                )}
                
                <span className="text-[11px] text-gray-500 bg-white/4 px-2 py-1 rounded-lg border border-white/8">{visibleShots.length} 个分镜</span>
                
                <button onClick={() => setShowCustomPromptPanel(v => !v)}
                  className={`ml-auto px-3 py-2 text-xs font-semibold rounded-xl border transition-all flex items-center gap-1.5 ${
                    useCustomPrompt
                      ? 'border-yellow-500/40 bg-yellow-500/15 text-yellow-300 hover:bg-yellow-500/25 shadow-sm shadow-yellow-900/20'
                      : 'border-white/10 bg-white/4 text-gray-400 hover:border-yellow-500/30 hover:text-yellow-300'
                  }`}>
                  📝 {useCustomPrompt ? '已启用自定义模板' : '自定义生成模板'}
                </button>

                <button onClick={() => setShowStyleModal(true)}
                  className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all flex items-center gap-1.5 ${
                    mode === 'image'
                      ? 'border-sky-500/20 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'
                      : 'border-violet-500/20 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20'
                  }`}>
                  🎨 风格设置
                </button>
                
                <button onClick={() => setAddShot(v => !v)}
                  className={`px-3 py-2 text-xs font-semibold rounded-xl text-white flex items-center gap-1.5 transition-all ${
                    mode === 'image' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-violet-600 hover:bg-violet-500'
                  }`}>
                  {addShot ? '✕ 收起添加' : '+ 手动添加'}
                </button>

                <button onClick={() => setShowRefPanel(v => !v)}
                  className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all flex items-center gap-1.5 ${
                    refImages.length > 0
                      ? 'border-violet-400/40 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 shadow-sm shadow-violet-900/20'
                      : 'border-white/10 bg-white/4 text-gray-400 hover:border-violet-500/30 hover:text-violet-300'
                  }`}>
                  🖼️ 备用参考图{refImages.length > 0 ? <span className="ml-0.5 text-[10px] bg-violet-500/30 text-violet-200 px-1 py-0.5 rounded-full">{refImages.length}</span> : ''}
                </button>
              </div>
            </div>

            {/* 自定义生成模板设置面板 */}
            {showCustomPromptPanel && (
              <div className="p-5 rounded-2xl bg-[#2d1b4e]/30 border border-yellow-500/20 space-y-4 shadow-xl relative overflow-hidden">
                {/* 装饰条 */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-yellow-500/20 via-yellow-500 to-yellow-500/20" />

                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <h4 className="text-sm font-bold text-yellow-300 flex items-center gap-1.5">
                    <span>📝 自定义{mode === 'image' ? '图片' : '视频'}提示词生成模板</span>
                    <span className="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-md font-normal uppercase">Custom Model Prompts</span>
                  </h4>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={useCustomPrompt} onChange={e => saveCustomPromptConfig(customSystemPrompt, customUserPrompt, e.target.checked)} className="rounded border-white/10 bg-white/5 text-yellow-500 focus:ring-0" />
                      <span>启用自定义模板去生成</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold text-gray-400 block">自定义系统提示词 (System Prompt)</label>
                      <span className="text-[10px] text-gray-500">主宰大模型生成风格与逻辑的宏观指令</span>
                    </div>
                    <textarea value={customSystemPrompt} onChange={e => setCustomSystemPrompt(e.target.value)}
                      rows={5} placeholder={mode === 'image' 
                        ? "例如: 你是一位拥有 20 年经验的好莱坞资深影视原画师，擅长将普通的情节点转化为富有戏剧张力、充满赛博朋克科幻美学、细节颗粒度极高的 Midjourney 绘画提示词。要求返回纯 JSON 格式..."
                        : "例如: 你是一个拥有丰富 3D 特效渲染经验的影视导演，擅长设计极具镜头流动感、史诗级光影对比的 Sora/Runway 运镜提示词，让生成的动态短片具有呼吸感与好莱坞电影质感。要求返回纯 JSON 格式..."
                      }
                      className="w-full text-xs font-semibold bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-yellow-500 transition-all placeholder:text-gray-600" />
                  </div>

                  {mode === 'image' && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold text-gray-400 block">用户提示词模板 (User Prompt Template)</label>
                        <span className="text-[10px] text-gray-500">支持双大括号变量替换, 如 {'{{sceneTitle}}'}、{'{{sceneDescription}}'}</span>
                      </div>
                      <input type="text" value={customUserPrompt} onChange={e => setCustomUserPrompt(e.target.value)}
                        placeholder="例如: 请为以下短剧场景设计提示词 -> 镜头: {{sceneTitle}}, 情节画面: {{sceneDescription}}"
                        className="w-full text-xs font-semibold bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-yellow-500 transition-all placeholder:text-gray-600" />
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
                  <button onClick={() => {
                    setCustomSystemPrompt('');
                    setCustomUserPrompt('');
                    saveCustomPromptConfig('', '', false);
                  }} className="px-4 py-2 text-xs font-semibold text-red-400 hover:text-red-300 transition-colors">恢复系统默认</button>
                  <div className="flex gap-2">
                    <button onClick={() => setShowCustomPromptPanel(false)} className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors">关闭</button>
                    <button onClick={() => {
                      saveCustomPromptConfig(customSystemPrompt, customUserPrompt, true);
                      setShowCustomPromptPanel(false);
                      alert('自定义生成模板已成功保存并启用！现在点击“生成提示词”按钮将采用您的专属自定义模板生成。');
                    }} className="px-5 py-2 text-xs font-black rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white shadow-lg shadow-yellow-600/10 transition-all">保存并启用</button>
                  </div>
                </div>
              </div>
            )}

            {/* 手动添加分镜表单 */}
            {addShot && (
              <div className="p-5 rounded-2xl bg-white/4 border border-white/10 space-y-4 shadow-xl">
                <h4 className="text-sm font-bold text-gray-200 flex items-center gap-1.5 pb-2 border-b border-white/5">
                  <span>➕ 手动添加分镜</span>
                  <span className="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-md font-normal">EPISODE SHOT ADDER</span>
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 mb-1.5 block">镜头号</label>
                    <input type="number" value={newShotForm.shotNumber} onChange={e => setNewShotForm(f => ({ ...f, shotNumber: parseInt(e.target.value) || 1 }))}
                      className="w-full text-xs font-semibold bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-all" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 mb-1.5 block">镜头视角 / 景别</label>
                    <input type="text" value={newShotForm.cameraAngle} onChange={e => setNewShotForm(f => ({ ...f, cameraAngle: e.target.value }))}
                      placeholder="例如: 特写, 近景, 全景..."
                      className="w-full text-xs font-semibold bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-all" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 mb-1.5 block">画面场景描述</label>
                    <textarea value={newShotForm.sceneDescription} onChange={e => setNewShotForm(f => ({ ...f, sceneDescription: e.target.value }))}
                      rows={3} placeholder="详细描述该分镜的画面内容..."
                      className="w-full text-xs font-semibold bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-all" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 mb-1.5 block">对白配音 (选填)</label>
                    <textarea value={newShotForm.dialogue} onChange={e => setNewShotForm(f => ({ ...f, dialogue: e.target.value }))}
                      rows={3} placeholder="输入台词或旁白..."
                      className="w-full text-xs font-semibold bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-all" />
                  </div>
                </div>

                {mode === 'image' ? (
                  <div>
                    <label className="text-[11px] font-black text-sky-400 mb-1.5 block">图片生成提示词 (选填，打 @ 可呼出资产菜单)</label>
                    <textarea value={newShotForm.imagePrompt} onChange={e => setNewShotForm(f => ({ ...f, imagePrompt: e.target.value }))}
                      rows={3} placeholder="图片生成提示词..."
                      className="w-full text-xs font-semibold bg-sky-950/15 border border-sky-500/15 rounded-xl px-3 py-2.5 text-sky-100 focus:outline-none focus:border-sky-500 transition-all placeholder:text-sky-800/40" />
                  </div>
                ) : (
                  <div className="space-y-4 border-t border-white/5 pt-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] font-bold text-violet-400 mb-1.5 block">起始画面 START FRAME</label>
                        <input type="text" value={newShotForm.startFrame} onChange={e => setNewShotForm(f => ({ ...f, startFrame: e.target.value }))}
                          placeholder="例如: 塌矿边缘全景中近景..."
                          className="w-full text-xs font-semibold bg-violet-950/10 border border-violet-500/15 rounded-xl px-3 py-2.5 text-violet-100 focus:outline-none focus:border-violet-500 transition-all" />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-violet-400 mb-1.5 block">结束画面 END FRAME</label>
                        <input type="text" value={newShotForm.endFrame} onChange={e => setNewShotForm(f => ({ ...f, endFrame: e.target.value }))}
                          placeholder="例如: 镜头快速推近@纪凡赛尔侧脸..."
                          className="w-full text-xs font-semibold bg-violet-950/10 border border-violet-500/15 rounded-xl px-3 py-2.5 text-violet-100 focus:outline-none focus:border-violet-500 transition-all" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[11px] font-bold text-violet-400 mb-1.5 block">镜头运动 CAMERA MOVEMENT</label>
                        <input type="text" value={newShotForm.cameraMovement} onChange={e => setNewShotForm(f => ({ ...f, cameraMovement: e.target.value }))}
                          placeholder="例如: 缓慢冲推, 低机位跟拍..."
                          className="w-full text-xs font-semibold bg-violet-950/10 border border-violet-500/15 rounded-xl px-3 py-2.5 text-violet-100 focus:outline-none focus:border-violet-500 transition-all" />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-violet-400 mb-1.5 block">角色动作 CHARACTER ACTION</label>
                        <input type="text" value={newShotForm.characterAction} onChange={e => setNewShotForm(f => ({ ...f, characterAction: e.target.value }))}
                          placeholder="例如: 贴地趴着, 缓缓向前挪动..."
                          className="w-full text-xs font-semibold bg-violet-950/10 border border-violet-500/15 rounded-xl px-3 py-2.5 text-violet-100 focus:outline-none focus:border-violet-500 transition-all" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <label className="text-[11px] font-black text-violet-400 mb-1.5 block">视频提示词 PROMPT WORKSPACE (选填，打 @ 可呼出资产菜单)</label>
                        <textarea value={newShotForm.videoPrompt} onChange={e => setNewShotForm(f => ({ ...f, videoPrompt: e.target.value }))}
                          rows={2} placeholder="视频运镜提示词内容..."
                          className="w-full text-xs font-semibold bg-violet-950/15 border border-violet-500/15 rounded-xl px-3 py-2.5 text-violet-100 focus:outline-none focus:border-violet-500 transition-all placeholder:text-violet-800/40" />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-violet-400 mb-1.5 block">视频时长 (秒)</label>
                        <input type="number" value={newShotForm.duration} onChange={e => setNewShotForm(f => ({ ...f, duration: parseInt(e.target.value) || 5 }))}
                          className="w-full text-xs font-semibold bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-all" />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
                  <button onClick={() => setAddShot(false)} className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors">取消</button>
                  <button onClick={handleAddShot} className={`px-5 py-2 text-xs font-black rounded-xl text-white shadow-lg transition-all ${
                    mode === 'image' ? 'bg-sky-600 hover:bg-sky-500 shadow-sky-600/10' : 'bg-violet-600 hover:bg-violet-500 shadow-violet-600/10'
                  }`}>确认添加分镜</button>
                </div>
              </div>
            )}

            {/* 风格设置弹窗 */}
            {showStyleModal && (
              <StyleSettingModal
                type={mode === 'image' ? 'image-storyboard' : 'video-storyboard'}
                style={getStoryboardStyle()}
                onSave={saveStoryboardStyle}
                onClose={() => setShowStyleModal(false)}
              />
            )}

            {/* ── 参考图弹窗（图片/视频模式均可用，fixed modal）── */}
            {showRefPanel && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowRefPanel(false)}>
                <div className="bg-[#1a1040] border border-white/15 rounded-2xl w-full max-w-[700px] max-h-[82vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-white">🖼️ 备用参考图</span>
                      <span className="text-xs text-gray-400">每个分镜优先使用提示词中的角色/场景/物品图，此处补充剩余位置</span>
                      {refImages.length > 0 && <span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full">{refImages.length}/6 已选</span>}
                      <button onClick={e => { e.stopPropagation(); setUseAutoRef(v => !v); }}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                          useAutoRef ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : 'border-white/10 text-gray-500'
                        }`}>智能自动匹配 {useAutoRef ? '✓' : '○'}</button>
                    </div>
                    <button onClick={() => setShowRefPanel(false)} className="text-gray-400 hover:text-white text-lg leading-none transition-colors">✕</button>
                  </div>
                  <div className="overflow-y-auto">
                    <div className="pt-3 pb-3 px-5 space-y-4">
                      {/* 参考项：当前已选 */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-gray-200">参考项 <span className="text-gray-500 font-normal text-xs">{refImages.length}/6</span></span>
                          {refImages.length > 0 && <button onClick={() => setRefImages([])} className="text-xs text-gray-500 hover:text-red-400 transition-colors">清空全部</button>}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {refImages.map((r, i) => (
                            <div key={i} className="relative group rounded-xl overflow-hidden border-2 border-violet-400/60 flex-shrink-0" style={{width:90,height:90}}>
                              <img src={r.url} alt={r.label} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                              <p className="absolute bottom-0 left-0 right-0 text-[8px] text-white/80 truncate px-1.5 pb-1">{r.label}</p>
                              <button onClick={() => setRefImages(prev => prev.filter((_,j)=>j!==i))}
                                className="absolute top-1 right-1 w-4 h-4 bg-red-500/90 rounded-full text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                            </div>
                          ))}
                          {refImages.length < 6 && (
                            <button onClick={() => refFileInputRef.current?.click()}
                              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-violet-500/30 text-violet-400/60 hover:border-violet-400 hover:text-violet-300 transition-all flex-shrink-0"
                              style={{width:90,height:90}}>
                              <span className="text-2xl leading-none">+</span>
                              <span className="text-xs mt-1">上传</span>
                            </button>
                          )}
                          {refImages.length === 0 && (
                            <p className="text-sm text-gray-500 self-center pl-1">从下方点击选择，或点击 + 上传自定义图片</p>
                          )}
                        </div>
                      </div>
                      {/* 角色 */}
                      {(drama?.characters||[]).filter((c:any)=>c.imageUrl).length > 0 && (
                        <div>
                          <p className="text-sm font-semibold text-amber-300 mb-2">角色</p>
                          <div className="grid grid-cols-5 gap-2">
                            {(drama.characters||[]).filter((c:any)=>c.imageUrl).map((c:any) => {
                              const selected = refImages.some(r => r.url === c.imageUrl);
                              return (
                                <button key={c.id} onClick={() => {
                                  if (selected) setRefImages(prev => prev.filter(r => r.url !== c.imageUrl));
                                  else if (refImages.length < 6) setRefImages(prev => [...prev, {url: c.imageUrl, label: cleanCharName(c.name), type: 'character'}]);
                                }} className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                                  selected ? 'border-violet-400 ring-1 ring-violet-400/40' : 'border-white/5 hover:border-violet-500/50'
                                }`}>
                                  <div className="aspect-square bg-white/5">
                                    <img src={c.imageUrl} alt={cleanCharName(c.name)} className="w-full h-full object-cover" />
                                  </div>
                                  <div className="bg-black/60 px-1 py-1">
                                    <p className="text-xs text-gray-200 truncate text-center">{cleanCharName(c.name)}</p>
                                  </div>
                                  {selected && <div className="absolute top-1 right-1 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">✓</div>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {/* 场景 */}
                      {(drama?.scenes||[]).filter((s:any)=>s.imageUrl).length > 0 && (
                        <div>
                          <p className="text-sm font-semibold text-emerald-300 mb-2">场景</p>
                          <div className="grid grid-cols-5 gap-2">
                            {(drama.scenes||[]).filter((s:any)=>s.imageUrl).map((s:any) => {
                              const selected = refImages.some(r => r.url === s.imageUrl);
                              return (
                                <button key={s.id} onClick={() => {
                                  if (selected) setRefImages(prev => prev.filter(r => r.url !== s.imageUrl));
                                  else if (refImages.length < 6) setRefImages(prev => [...prev, {url: s.imageUrl, label: s.name, type: 'scene'}]);
                                }} className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                                  selected ? 'border-violet-400 ring-1 ring-violet-400/40' : 'border-white/5 hover:border-violet-500/50'
                                }`}>
                                  <div className="aspect-video bg-white/5">
                                    <img src={s.imageUrl} alt={s.name} className="w-full h-full object-cover" />
                                  </div>
                                  <div className="bg-black/60 px-1 py-1">
                                    <p className="text-xs text-gray-200 truncate text-center">{s.name}</p>
                                  </div>
                                  {selected && <div className="absolute top-1 right-1 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">✓</div>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {/* 物品 */}
                      {(drama?.items||[]).filter((item:any)=>item.imageUrl).length > 0 && (
                        <div>
                          <p className="text-sm font-semibold text-orange-300 mb-2">物品</p>
                          <div className="grid grid-cols-5 gap-2">
                            {(drama.items||[]).filter((item:any)=>item.imageUrl).map((item:any) => {
                              const selected = refImages.some(r => r.url === item.imageUrl);
                              return (
                                <button key={item.id} onClick={() => {
                                  if (selected) setRefImages(prev => prev.filter(r => r.url !== item.imageUrl));
                                  else if (refImages.length < 6) setRefImages(prev => [...prev, {url: item.imageUrl, label: item.name, type: 'item'}]);
                                }} className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                                  selected ? 'border-violet-400 ring-1 ring-violet-400/40' : 'border-white/5 hover:border-violet-500/50'
                                }`}>
                                  <div className="aspect-square bg-white/5">
                                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                  </div>
                                  <div className="bg-black/60 px-1 py-1">
                                    <p className="text-xs text-gray-200 truncate text-center">{item.name}</p>
                                  </div>
                                  {selected && <div className="absolute top-1 right-1 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">✓</div>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {/* 空状态 */}
                      {!(drama?.characters||[]).some((c:any)=>c.imageUrl) && !(drama?.scenes||[]).some((s:any)=>s.imageUrl) && !(drama?.items||[]).some((i:any)=>i.imageUrl) && (
                        <p className="text-sm text-gray-500">暂无可用资产图，请先在角色/场景/物品管理中生成图片</p>
                      )}
                      <input ref={refFileInputRef} type="file" accept="image/*" multiple className="hidden"
                        onChange={e => {
                          Array.from(e.target.files||[]).forEach(file => {
                            if (refImages.length >= 6) return;
                            const reader = new FileReader();
                            reader.onload = () => setRefImages(prev => prev.length < 6 ? [...prev, {url: reader.result as string, label: file.name, type: 'upload'}] : prev);
                            reader.readAsDataURL(file);
                          });
                          e.target.value = '';
                        }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null;
      })()}

      {/* 剧本章节参考 — 渲染为场景卡片 */}
      {selectedEpisode && episodeScreenplay && (
        <div className="rounded-2xl border border-emerald-500/20 overflow-hidden shadow-sm" style={{background:'rgba(16,185,129,0.03)'}}>
          <button
            onClick={() => setShowScriptRef(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-emerald-500/8 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center text-sm">📋</span>
              <span className="text-sm font-semibold text-emerald-200">第{selectedEpisode.episodeNumber}集剧本内容</span>
              {selectedEpisode.title && <span className="text-[11px] text-emerald-500/70 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">{selectedEpisode.title}</span>}
            </div>
            <div className={`w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center transition-transform ${showScriptRef ? 'rotate-90' : ''}`}>
              <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
          {showScriptRef && (
            <div className="px-4 pb-5 pt-3">
              <ScreenplayRenderer screenplay={episodeScreenplay} />
            </div>
          )}
        </div>
      )}


      {/* 分镜列表 */}
      {shotsLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" /></div>
      ) : (() => {
        const visibleShots = shots || [];
        return visibleShots.length > 0 ? (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleShots.map((s: Shot) => (
            <div key={s.id}
              onContextMenu={e => onContextMenuCard && onContextMenuCard(e, s.id)}
              className="rounded-2xl border border-white/8 bg-[#0f0a1e]/80 hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-900/20 transition-all duration-200 overflow-hidden group"
            >
              {/* 缩略图 / 视频预览 */}
              <div className="w-full h-[300px] bg-gray-900/80 flex items-center justify-center overflow-hidden relative cursor-pointer"
                onClick={() => mode === 'image' ? (s.imageUrl ? setViewingImage(s) : openEdit(s)) : openEdit(s)}>
                {mode === 'video' && (s as any).videoUrl ? (
                  <div className="relative w-full h-full group/video">
                    <video
                      src={(s as any).videoUrl}
                      className="w-full h-full object-cover"
                      controls
                      preload="metadata"
                      onClick={e => e.stopPropagation()}
                    />
                    {/* 顶部悬浮操作按钮栏 */}
                    <div className="absolute top-2 right-2 z-10 flex gap-1.5 opacity-0 group-hover/video:opacity-100 transition-opacity">
                      {s.imageUrl && (
                        <button
                          onClick={async e => {
                            e.stopPropagation();
                            if (!confirm(`确认删除镜头 #${s.shotNumber} 的首帧图片？`)) return;
                            await fetch(`/api/short-dramas/${dramaId}/storyboards`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                              body: JSON.stringify({ shotId: s.id, imageUrl: null }),
                            });
                            onRefreshShots();
                          }}
                          className="px-2 py-1 flex items-center gap-1 rounded-md bg-black/80 text-gray-300 hover:bg-red-600/80 hover:text-white transition-all text-[10px] font-medium cursor-pointer"
                          title="删除图片"
                        >
                          🖼️ 删图
                        </button>
                      )}
                      <button
                        onClick={async e => {
                          e.stopPropagation();
                          if (!confirm(`确认删除镜头 #${s.shotNumber} 的视频？`)) return;
                          await fetch(`/api/short-dramas/${dramaId}/storyboards`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                            body: JSON.stringify({ shotId: s.id, videoUrl: null }),
                          });
                          onRefreshShots();
                        }}
                        className="px-2 py-1 flex items-center gap-1 rounded-md bg-black/80 text-gray-300 hover:bg-red-600/80 hover:text-white transition-all text-[10px] font-medium cursor-pointer"
                        title="删除视频"
                      >
                        🎥 删视
                      </button>
                    </div>
                  </div>
                ) : mode === 'video' && s.imageUrl ? (
                  <div className="relative w-full h-full group/video">
                    <img src={s.imageUrl} alt="" className="w-full h-full object-cover opacity-60" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-gray-400">
                      <span className="text-2xl opacity-50">🎥</span>
                      <span className="text-[10px] bg-black/50 px-2 py-0.5 rounded">未生成视频</span>
                    </div>
                    <button
                      onClick={async e => {
                        e.stopPropagation();
                        if (!confirm(`确认删除镜头 #${s.shotNumber} 的首帧图片？`)) return;
                        await fetch(`/api/short-dramas/${dramaId}/storyboards`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                          body: JSON.stringify({ shotId: s.id, imageUrl: null }),
                        });
                        onRefreshShots();
                      }}
                      className="absolute top-2 right-2 z-10 px-2 py-1 flex items-center gap-1 rounded-md bg-black/85 text-gray-300 hover:bg-red-600/80 hover:text-white transition-all text-[10px] font-medium opacity-0 group-hover/video:opacity-100 cursor-pointer"
                      title="删除图片"
                    >
                      🖼️ 删图
                    </button>
                  </div>
                ) : mode === 'image' && s.imageUrl ? (
                  <>
                    <img src={s.imageUrl} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <span className="text-white text-xs font-medium bg-black/40 px-2 py-1 rounded-lg">🔍 查看大图</span>
                    </div>
                    <button
                      onClick={async e => {
                        e.stopPropagation();
                        if (!confirm(`确认删除镜头 #${s.shotNumber} 的图片？`)) return;
                        await fetch(`/api/short-dramas/${dramaId}/storyboards`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                          body: JSON.stringify({ shotId: s.id, imageUrl: null }),
                        });
                        onRefreshShots();
                      }}
                      className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md bg-black/60 text-gray-400 hover:bg-red-600/80 hover:text-white transition-all opacity-0 group-hover:opacity-100 text-[11px]"
                      title="删除图片"
                    >🗑️</button>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-gray-700">
                    <span className="text-3xl opacity-20">{mode === 'image' ? '🖼️' : '🎥'}</span>
                    <span className="text-[10px] text-gray-600">未生成{mode === 'image' ? '图片' : '视频'}</span>
                  </div>
                )}
                {/* 镜头编号浮层 */}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-sm text-[10px] font-bold text-white/80 pointer-events-none">#{s.shotNumber}</div>
              </div>
              {/* 内容 — 点击编辑提示词 */}
              <div className="p-3.5 cursor-pointer hover:bg-white/2 transition-colors" onClick={() => openEdit(s)}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {s.cameraAngle && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/20 whitespace-nowrap">{s.cameraAngle}</span>}
                    {s.duration && <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded-md">{s.duration}s</span>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteShot(s.id, s.shotNumber); }}
                    className="text-gray-700 hover:text-red-400 transition-colors text-xs leading-none flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/10">✕</button>
                </div>
                {s.sceneDescription && <p className="text-xs text-gray-200 line-clamp-3 mb-1.5 leading-relaxed">{s.sceneDescription}</p>}
                {mode === 'image'
                  ? s.imagePrompt && <p className="text-[11px] text-sky-300 line-clamp-2 italic border-l-2 border-sky-400/50 pl-2">{s.imagePrompt}</p>
                  : (() => {
                      const vRaw = (s as any).videoPrompt;
                      if (!vRaw) return null;
                      let vText = vRaw;
                      try { const vj = JSON.parse(vRaw); vText = vj.prompt || vRaw; } catch {}
                      return <p className="text-[11px] text-violet-300 line-clamp-2 italic border-l-2 border-violet-400/50 pl-2">{vText}</p>;
                    })()
                }
                {/* 分镇参考图缩略图（per-shot手动 > 自动匹配 > 全局备用） */}
                {(() => {
                  const autoRefs = useAutoRef ? getAutoRefs(s) : [];
                  const perShot = getShotRefs(s.id).map(r => r.url);
                  const allRefs = [...new Set([...perShot, ...autoRefs, ...refImages.map(r => r.url)])].slice(0, 6);
                  if (!allRefs.length) return null;
                  return (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      <span className="text-[15px] text-orange-400">参考:</span>
                      {allRefs.map((url, ri) => (
                        <img key={ri} src={url} alt="" className="w-7 h-7 rounded object-cover border border-violet-500/40 cursor-pointer hover:border-violet-300 transition-all flex-shrink-0"
                          onClick={e => { e.stopPropagation(); setImgPreviewUrl(url); }} />
                      ))}
                      <button onClick={e => { e.stopPropagation(); setRefPanelShotId(s.id); }}
                        className={`w-7 h-7 rounded flex items-center justify-center text-[10px] transition-all flex-shrink-0 ${getShotRefs(s.id).length > 0 ? 'bg-violet-500/30 text-violet-300' : 'bg-white/5 text-gray-500 hover:text-violet-300'}`}
                        title="设置参考图">⚙</button>
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between mt-2.5 gap-2 pt-2.5 border-t border-white/5">
                  {/* 状态徽章 */}
                  <div className="flex gap-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${s.imageUrl ? 'bg-green-500/15 text-green-400 border border-green-500/20' : 'bg-white/4 text-gray-600 border border-white/6'}`}>{s.imageUrl ? '🖼️✔' : '🖼️'}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${(s as any).videoUrl ? 'bg-sky-500/15 text-sky-400 border border-sky-500/20' : 'bg-white/4 text-gray-600 border border-white/6'}`}>{(s as any).videoUrl ? '🎥✔' : '🎥'}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${(s as any).audioUrl ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 'bg-white/4 text-gray-600 border border-white/6'}`}>{(s as any).audioUrl ? '🔊✔' : '🔊'}</span>
                  </div>
                  {/* 生成按钮 */}
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    {(() => {
                      const autoRefs = useAutoRef ? getAutoRefs(s) : [];
                      const perShot = getShotRefs(s.id).map(r => r.url);
                      const globalFallback = refImages.map(r => r.url);
                      const allRefs = [...new Set([...perShot, ...autoRefs, ...globalFallback])].slice(0, 6);
                      return mode === 'image' ? (
                        <>
                        <button onClick={e => { e.stopPropagation(); setRefPanelShotId(s.id); }}
                          className={`text-xs px-2 py-1 rounded border transition-all flex-shrink-0 ${
                            getShotRefs(s.id).length > 0
                              ? 'border-violet-400/50 bg-violet-500/15 text-violet-300'
                              : 'border-white/10 bg-white/5 text-gray-500 hover:border-violet-500/40 hover:text-violet-300'
                          }`} title="设置此分镜参考图">
                          🖼️{getShotRefs(s.id).length > 0 ? getShotRefs(s.id).length : ''}
                        </button>
                        <button onClick={() => {
                          const asp = IMAGE_ASPECTS.find(a => a.key === imageAspect);
                          const style = getStoryboardStyle();
                          let finalPrompt = s.imagePrompt || '';
                          if (style.prePrompt) finalPrompt = style.prePrompt + ', ' + finalPrompt;
                          if (style.postPrompt) finalPrompt = finalPrompt + ', ' + style.postPrompt;
                          const styleRefs = (style.referenceImages || []).filter(Boolean);
                          const allRefsWithStyle = [...new Set([...allRefs, ...styleRefs])].slice(0, 6);
                          onGenerate('generate-image', {
                            shotId: s.id,
                            prompt: finalPrompt,
                            imageWidth: asp?.w,
                            imageHeight: asp?.h,
                            imageAspect,
                            referenceImages: allRefsWithStyle
                          });
                        }}
                          disabled={generatingSet.has(`generate-image:${s.id}`)}
                          className="text-[11px] px-2.5 py-1 rounded-full bg-sky-600/80 hover:bg-sky-500 text-white disabled:opacity-40 transition-all font-medium">
                          {generatingSet.has(`generate-image:${s.id}`) ? '…' : '🖼️ 生成图'}
                        </button>
                        </>
                      ) : (
                        <>
                        <button onClick={e => { e.stopPropagation(); setRefPanelShotId(s.id); }}
                          className={`text-xs px-2 py-1 rounded border transition-all flex-shrink-0 ${
                            getShotRefs(s.id).length > 0
                              ? 'border-violet-400/50 bg-violet-500/15 text-violet-300'
                              : 'border-white/10 bg-white/5 text-gray-500 hover:border-violet-500/40 hover:text-violet-300'
                          }`} title="设置此分镜参考图">
                          🖼️{getShotRefs(s.id).length > 0 ? getShotRefs(s.id).length : ''}
                        </button>
                        {generatingSet.has(`generate-video:${s.id}`) ? (
                          <span className="text-[11px] px-2.5 py-1 rounded-full bg-violet-600/40 text-violet-300 flex items-center gap-1"><span className="w-2.5 h-2.5 border border-violet-400 border-t-transparent rounded-full animate-spin inline-block" />生成中</span>
                        ) : (
                          <div className="flex gap-1 flex-wrap">
                          <button
                            onClick={() => {
                              const vasp = VIDEO_ASPECTS.find(a => a.key === videoAspect);
                              const style = getStoryboardStyle();
                              let finalPrompt = (s as any).videoPrompt || '';
                              let isJson = false;
                              let vp: any = {};
                              try {
                                vp = JSON.parse(finalPrompt);
                                if (vp.prompt) {
                                  isJson = true;
                                  if (style.prePrompt) vp.prompt = style.prePrompt + ', ' + vp.prompt;
                                  if (style.postPrompt) vp.prompt = vp.prompt + ', ' + style.postPrompt;
                                  finalPrompt = JSON.stringify(vp);
                                }
                              } catch {}
                              if (!isJson && finalPrompt) {
                                if (style.prePrompt) finalPrompt = style.prePrompt + ', ' + finalPrompt;
                                if (style.postPrompt) finalPrompt = finalPrompt + ', ' + style.postPrompt;
                              }
                              const styleRefs = (style.referenceImages || []).filter(Boolean);
                              const allRefsWithStyle = [...new Set([...styleRefs])].slice(0, 6);
                              onGenerate('generate-video', {
                                shotId: s.id,
                                videoWidth: vasp?.w,
                                videoHeight: vasp?.h,
                                videoAspect,
                                videoGenMode: 'shot',
                                ...(isJson ? { videoPrompt: finalPrompt } : { promptText: finalPrompt }),
                                ...(allRefsWithStyle.length > 0 ? { referenceImages: allRefsWithStyle } : {})
                              });
                            }}
                            disabled={!s.imageUrl}
                            title="用分镜图作为首帧生成视频"
                            className="text-[11px] px-2 py-0.5 rounded-full bg-sky-700/70 hover:bg-sky-600/80 text-sky-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all whitespace-nowrap">
                            📸 图生视
                          </button>
                          <button
                            onClick={() => {
                              const vasp = VIDEO_ASPECTS.find(a => a.key === videoAspect);
                              const style = getStoryboardStyle();
                              let finalPrompt = (s as any).videoPrompt || '';
                              let isJson = false;
                              let vp: any = {};
                              try {
                                vp = JSON.parse(finalPrompt);
                                if (vp.prompt) {
                                  isJson = true;
                                  if (style.prePrompt) vp.prompt = style.prePrompt + ', ' + vp.prompt;
                                  if (style.postPrompt) vp.prompt = vp.prompt + ', ' + style.postPrompt;
                                  finalPrompt = JSON.stringify(vp);
                                }
                              } catch {}
                              if (!isJson && finalPrompt) {
                                if (style.prePrompt) finalPrompt = style.prePrompt + ', ' + finalPrompt;
                                if (style.postPrompt) finalPrompt = finalPrompt + ', ' + style.postPrompt;
                              }
                              const styleRefs = (style.referenceImages || []).filter(Boolean);
                              const allRefsWithStyle = [...new Set([...allRefs, ...styleRefs])].slice(0, 6);
                              onGenerate('generate-video', {
                                shotId: s.id,
                                videoWidth: vasp?.w,
                                videoHeight: vasp?.h,
                                videoAspect,
                                videoGenMode: 'ref',
                                ...(isJson ? { videoPrompt: finalPrompt } : { promptText: finalPrompt }),
                                ...(allRefsWithStyle.length > 0 ? { referenceImages: allRefsWithStyle } : {})
                              });
                            }}
                            disabled={allRefs.length === 0}
                            title="用参考图多图参考生成视频"
                            className="text-[11px] px-2 py-0.5 rounded-full bg-violet-600/70 hover:bg-violet-500/80 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all whitespace-nowrap">
                            🎞 多参视
                          </button>
                          <button
                            onClick={async () => {
                              if (allRefs.length === 0) return;
                              setMergingVideoShotId(s.id);
                              try {
                                const style = getStoryboardStyle();
                                let finalPrompt = (s as any).videoPrompt || '';
                                let isJson = false;
                                let vp: any = {};
                                try {
                                  vp = JSON.parse(finalPrompt);
                                  if (vp.prompt) {
                                    isJson = true;
                                    if (style.prePrompt) vp.prompt = style.prePrompt + ', ' + vp.prompt;
                                    if (style.postPrompt) vp.prompt = vp.prompt + ', ' + style.postPrompt;
                                    finalPrompt = JSON.stringify(vp);
                                  }
                                } catch {}
                                if (!isJson && finalPrompt) {
                                  if (style.prePrompt) finalPrompt = style.prePrompt + ', ' + finalPrompt;
                                  if (style.postPrompt) finalPrompt = finalPrompt + ', ' + style.postPrompt;
                                }
                                const mergedBase64 = await mergeRefsToCanvas(allRefs);
                                if (!mergedBase64) return;
                                const vasp = VIDEO_ASPECTS.find(a => a.key === videoAspect);
                                onGenerate('generate-video', {
                                  shotId: s.id,
                                  videoWidth: vasp?.w,
                                  videoHeight: vasp?.h,
                                  videoAspect,
                                  videoGenMode: 'merged',
                                  referenceImages: [mergedBase64],
                                  ...(isJson ? { videoPrompt: finalPrompt } : { promptText: finalPrompt })
                                });
                              } finally {
                                setMergingVideoShotId(null);
                              }
                            }}
                            disabled={allRefs.length === 0 || mergingVideoShotId === s.id}
                            title="将所有参考图合成一张图片，再用合成图生成视频"
                            className="text-[11px] px-2 py-0.5 rounded-full bg-fuchsia-700/70 hover:bg-fuchsia-600/80 text-fuchsia-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all whitespace-nowrap">
                            {mergingVideoShotId === s.id ? '合并中…' : '🔀 合并视'}
                          </button>
                          </div>
                        )}
                        </>
                      );
                    })()}
                    <button onClick={() => setDubbingShotId(s.id)}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-amber-600/60 hover:bg-amber-500/80 text-amber-100 transition-all">
                      🔊 配音
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── 每个分镜独立参考图弹窗 ── */}
        {refPanelShotId && (() => {
          const panelShot = visibleShots.find((s: any) => s.id === refPanelShotId);
          const curRefs = getShotRefs(refPanelShotId);
          const autoPreview = useAutoRef && panelShot ? getAutoRefs(panelShot) : [];
          return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={() => setRefPanelShotId(null)}>
              <div className="bg-[#1a1040] border border-white/15 rounded-2xl w-full max-w-[700px] max-h-[82vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-base font-bold text-white">🖼️ 镜头#{panelShot?.shotNumber} 参考图</span>
                    {curRefs.length > 0 && <span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full">{curRefs.length}/6 手动选</span>}
                    {autoPreview.length > 0 && <span className="text-xs bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full">{autoPreview.length} 自动匹配</span>}
                    <span className="text-xs text-gray-400">手动选的优先，自动匹配补充剩余位置</span>
                  </div>
                  <button onClick={() => setRefPanelShotId(null)} className="text-gray-400 hover:text-white text-lg leading-none transition-colors">✕</button>
                </div>
                <div className="overflow-y-auto">
                <div className="pt-3 pb-3 px-5 space-y-4">
                  {/* 当前手动已选 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-200">手动参考图 <span className="text-gray-500 font-normal text-xs">{curRefs.length}/6</span></span>
                      {curRefs.length > 0 && <button onClick={() => setShotRefs(refPanelShotId, [])} className="text-xs text-gray-500 hover:text-red-400 transition-colors">清空</button>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {curRefs.map((r, i) => (
                        <div key={i} className="relative group rounded-xl overflow-hidden border-2 border-violet-400/60 flex-shrink-0 cursor-pointer" style={{width:80,height:80}}
                          onClick={() => setImgPreviewUrl(r.url)}>
                          <img src={r.url} alt={r.label} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                          <p className="absolute bottom-0 left-0 right-0 text-[8px] text-white/80 truncate px-1 pb-0.5">{r.label}</p>
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                            <span className="text-white text-lg">🔍</span>
                          </div>
                          <div role="button" onClick={e => { e.stopPropagation(); setShotRefs(refPanelShotId, curRefs.filter((_,j)=>j!==i)); }}
                            className="absolute top-1 right-1 w-4 h-4 bg-red-500/90 rounded-full text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer">✕</div>
                        </div>
                      ))}
                      {curRefs.length < 6 && (
                        <button onClick={() => shotRefFileInputRef.current?.click()}
                          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-violet-500/30 text-violet-400/60 hover:border-violet-400 hover:text-violet-300 transition-all flex-shrink-0"
                          style={{width:80,height:80}}>
                          <span className="text-2xl leading-none">+</span>
                          <span className="text-xs mt-1">上传</span>
                        </button>
                      )}
                      {curRefs.length === 0 && <p className="text-sm text-gray-500 self-center pl-1">从下方点击选择，或 + 上传自定义图片</p>}
                    </div>
                  </div>
                  {/* 自动匹配预览（只读） */}
                  {autoPreview.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-sky-300 mb-2">自动匹配（基于提示词中的角色/场景/物品名）</p>
                      <div className="flex gap-2 flex-wrap">
                        {autoPreview.map((url, i) => (
                          <div key={i} className="relative group rounded-xl overflow-hidden border-2 border-sky-500/40 flex-shrink-0 cursor-pointer" style={{width:80,height:80}}
                            onClick={() => setImgPreviewUrl(url)}>
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <div className="absolute top-1 left-1 bg-sky-600/80 rounded px-1.5 text-[10px] text-white">自动</div>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                              <span className="text-white text-lg">🔍</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 角色 */}
                  {(drama?.characters||[]).filter((c:any)=>c.imageUrl).length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-amber-300 mb-2">角色</p>
                      <div className="grid grid-cols-5 gap-2">
                        {(drama.characters||[]).filter((c:any)=>c.imageUrl).map((c:any) => {
                          const sel = curRefs.some(r => r.url === c.imageUrl);
                          return (
                            <button key={c.id} onClick={() => {
                              if (sel) setShotRefs(refPanelShotId, curRefs.filter(r => r.url !== c.imageUrl));
                              else if (curRefs.length < 6) setShotRefs(refPanelShotId, [...curRefs, {url: c.imageUrl, label: cleanCharName(c.name), type: 'character'}]);
                            }} className={`relative rounded-xl overflow-hidden border-2 transition-all ${sel ? 'border-violet-400 ring-1 ring-violet-400/40' : 'border-white/5 hover:border-violet-500/50'}`}>
                              <div className="aspect-square bg-white/5 relative group/img">
                                <img src={c.imageUrl} alt={cleanCharName(c.name)} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/40">
                                  <div role="button" onClick={e => { e.stopPropagation(); setImgPreviewUrl(c.imageUrl); }} className="text-white text-base cursor-pointer">🔍</div>
                                </div>
                              </div>
                              <div className="bg-black/60 px-1 py-1"><p className="text-xs text-gray-200 truncate text-center">{cleanCharName(c.name)}</p></div>
                              {sel && <div className="absolute top-1 right-1 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">✓</div>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* 场景 */}
                  {(drama?.scenes||[]).filter((s:any)=>s.imageUrl).length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-emerald-300 mb-2">场景</p>
                      <div className="grid grid-cols-5 gap-2">
                        {(drama.scenes||[]).filter((sc:any)=>sc.imageUrl).map((sc:any) => {
                          const sel = curRefs.some(r => r.url === sc.imageUrl);
                          return (
                            <button key={sc.id} onClick={() => {
                              if (sel) setShotRefs(refPanelShotId, curRefs.filter(r => r.url !== sc.imageUrl));
                              else if (curRefs.length < 6) setShotRefs(refPanelShotId, [...curRefs, {url: sc.imageUrl, label: sc.name, type: 'scene'}]);
                            }} className={`relative rounded-xl overflow-hidden border-2 transition-all ${sel ? 'border-violet-400 ring-1 ring-violet-400/40' : 'border-white/5 hover:border-violet-500/50'}`}>
                              <div className="aspect-video bg-white/5 relative group/img">
                                <img src={sc.imageUrl} alt={sc.name} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/40">
                                  <div role="button" onClick={e => { e.stopPropagation(); setImgPreviewUrl(sc.imageUrl); }} className="text-white text-base cursor-pointer">🔍</div>
                                </div>
                              </div>
                              <div className="bg-black/60 px-1 py-1"><p className="text-xs text-gray-200 truncate text-center">{sc.name}</p></div>
                              {sel && <div className="absolute top-1 right-1 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">✓</div>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* 物品 */}
                  {(drama?.items||[]).filter((item:any)=>item.imageUrl).length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-orange-300 mb-2">物品</p>
                      <div className="grid grid-cols-5 gap-2">
                        {(drama.items||[]).filter((item:any)=>item.imageUrl).map((item:any) => {
                          const sel = curRefs.some(r => r.url === item.imageUrl);
                          return (
                            <button key={item.id} onClick={() => {
                              if (sel) setShotRefs(refPanelShotId, curRefs.filter(r => r.url !== item.imageUrl));
                              else if (curRefs.length < 6) setShotRefs(refPanelShotId, [...curRefs, {url: item.imageUrl, label: item.name, type: 'item'}]);
                            }} className={`relative rounded-xl overflow-hidden border-2 transition-all ${sel ? 'border-violet-400 ring-1 ring-violet-400/40' : 'border-white/5 hover:border-violet-500/50'}`}>
                              <div className="aspect-square bg-white/5 relative group/img">
                                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/40">
                                  <div role="button" onClick={e => { e.stopPropagation(); setImgPreviewUrl(item.imageUrl); }} className="text-white text-base cursor-pointer">🔍</div>
                                </div>
                              </div>
                              <div className="bg-black/60 px-1 py-1"><p className="text-xs text-gray-200 truncate text-center">{item.name}</p></div>
                              {sel && <div className="absolute top-1 right-1 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">✓</div>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {!(drama?.characters||[]).some((c:any)=>c.imageUrl) && !(drama?.scenes||[]).some((s:any)=>s.imageUrl) && !(drama?.items||[]).some((i:any)=>i.imageUrl) && (
                    <p className="text-sm text-gray-500">暂无可用资产图，请先在角色/场景/物品管理中生成图片</p>
                  )}
                  <input ref={shotRefFileInputRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => {
                      Array.from(e.target.files||[]).forEach(file => {
                        setShotRefImages(prev => {
                          const cur = prev[refPanelShotId!] || [];
                          if (cur.length >= 6) return prev;
                          const reader = new FileReader();
                          reader.onload = () => setShotRefs(refPanelShotId!, [...(shotRefImages[refPanelShotId!]||[]).slice(0,5), {url: reader.result as string, label: file.name, type: 'upload'}]);
                          reader.readAsDataURL(file);
                          return prev;
                        });
                      });
                      e.target.value = '';
                    }} />
                </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── 参考图大图预览 ── */}
        {imgPreviewUrl && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-zoom-out"
            onClick={() => setImgPreviewUrl(null)}>
            <img src={imgPreviewUrl} alt="" className="max-w-[88vw] max-h-[88vh] object-contain rounded-2xl shadow-2xl border border-white/10" onClick={e => e.stopPropagation()} />
            <button onClick={() => setImgPreviewUrl(null)}
              className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-lg transition-all">✕</button>
          </div>
        )}

        {/* 图片大图 Lightbox */}
        {viewingImage && (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/92 backdrop-blur-md" onClick={() => setViewingImage(null)}>
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-3 bg-gradient-to-b from-black/70 to-transparent z-10" onClick={e => e.stopPropagation()}>
              <div>
                <span className="text-sm font-semibold text-white">镜头 #{viewingImage.shotNumber}</span>
                {viewingImage.sceneDescription && <p className="text-xs text-gray-400 mt-0.5 max-w-lg line-clamp-1">{viewingImage.sceneDescription}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-all"
                  onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(window.location.origin + viewingImage.imageUrl).catch(() => {}); }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  复制图片链接
                </button>
                <button onClick={e => { e.stopPropagation(); openEdit(viewingImage); setViewingImage(null); }}
                  className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-all">
                  ✏️ 编辑提示词
                </button>
                <button onClick={() => setViewingImage(null)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-all">✕</button>
              </div>
            </div>
            <img src={viewingImage.imageUrl} alt="" className="max-w-[92vw] max-h-[88vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
            {viewingImage.imagePrompt && (
              <div className="absolute bottom-0 left-0 right-0 px-5 py-3 bg-gradient-to-t from-black/80 to-transparent" onClick={e => e.stopPropagation()}>
                <p className="text-[11px] text-sky-300/80 line-clamp-2 italic">{viewingImage.imagePrompt}</p>
              </div>
            )}
          </div>
        )}

        {/* 编辑弹窗 */}
        {editingShot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm" onClick={() => setEditingShot(null)}>
            <div className="w-full max-w-5xl mx-4 max-h-[92vh] bg-slate-950/98 border border-violet-500/20 rounded-2xl shadow-2xl cinema-modal-scrollbar cinema-glow-border flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <style>{`
                .cinema-modal-scrollbar::-webkit-scrollbar {
                  width: 5px;
                  height: 5px;
                }
                .cinema-modal-scrollbar::-webkit-scrollbar-track {
                  background: rgba(15, 23, 42, 0.1);
                  border-radius: 99px;
                }
                .cinema-modal-scrollbar::-webkit-scrollbar-thumb {
                  background: rgba(139, 92, 246, 0.25);
                  border-radius: 99px;
                }
                .cinema-modal-scrollbar::-webkit-scrollbar-thumb:hover {
                  background: rgba(139, 92, 246, 0.5);
                }
                .cinema-glow-border {
                  box-shadow: 0 0 50px -10px rgba(139, 92, 246, 0.15);
                }
              `}</style>
              
              {/* 顶栏 */}
              <div className="sticky top-0 bg-slate-950/90 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between z-40">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${mode === 'image' ? 'bg-sky-500/20 text-sky-300' : 'bg-violet-500/20 text-violet-300'}`}>
                    {mode === 'image' ? '🖼️' : '🎥'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-white">{mode === 'image' ? '分镜图片提示词' : '分镜视频提示词'}</p>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-violet-500/15 border border-violet-500/25 text-violet-300 font-mono font-bold tracking-wider scale-95 origin-left">
                        SHOT {String(editingShot.shotNumber).padStart(2, '0')}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">场景详情与AI生成提示词配置</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { let txt = mode === 'image' ? editForm.imagePrompt : editForm.videoPrompt; try { const vj = JSON.parse(txt); txt = vj.prompt || txt; } catch {} navigator.clipboard.writeText(txt); }}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg flex items-center gap-1.5 transition-all bg-white/[0.02]">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    复制提示词
                  </button>
                  <button onClick={() => setEditingShot(null)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white transition-colors">✕</button>
                </div>
              </div>

              {/* ── 🌟 16:9 比例电影级双面板左右布局开始 ── */}
              <div className="flex-grow flex flex-col lg:flex-row overflow-hidden" style={{ height: 'calc(92vh - 140px)' }}>
                
                {/* ── 📝 左半面板：故事背景与分镜细节 (Left Column: 54% width) ── */}
                <div className="w-full lg:w-[54%] p-6 space-y-5 overflow-y-auto cinema-modal-scrollbar border-b lg:border-b-0 lg:border-r border-white/5">
                  {/* 标签 */}
                <div className="flex flex-wrap gap-1.5">
                  {[editingShot.shotType, editingShot.cameraAngle, drama.genre, drama.style].filter(Boolean).map((tag: string, i: number) => (
                    <span key={i} className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border tracking-wide shadow-sm ${mode === 'image' ? 'bg-sky-500/10 text-sky-300 border-sky-500/20' : 'bg-violet-500/10 text-violet-300 border-violet-500/20'}`}>{translateTag(tag)}</span>
                  ))}
                </div>

                {/* 描述 */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl px-4 py-3 focus-within:border-violet-500/25 transition-all">
                  <span className="text-[13px] font-black text-slate-300 tracking-wider uppercase block mb-2">场景画面描述 SCENE DESCRIPTION</span>
                  <textarea value={editForm.sceneDescription} onChange={e => setEditForm((f: any) => ({...f, sceneDescription: e.target.value}))}
                    rows={5} placeholder="输入画面场景描述..."
                    className="w-full bg-transparent text-[15px] font-semibold leading-relaxed text-slate-100 resize-none focus:outline-none placeholder:text-slate-700 cinema-modal-scrollbar" />
                </div>

                {/* 对白（折叠） */}
                {(editForm.dialogue || editingShot.dialogue) && (
                  <div className="bg-amber-500/[0.01] border border-amber-500/10 rounded-xl px-4 py-3 focus-within:border-amber-500/20 transition-all">
                    <span className="text-[13px] font-black text-amber-400 tracking-wider uppercase block mb-2">对白配音 DIALOGUE VOICE</span>
                    <textarea value={editForm.dialogue} onChange={e => setEditForm((f: any) => ({...f, dialogue: e.target.value}))}
                      rows={4} placeholder="输入该镜头下的配音或角色对白..."
                      className="w-full bg-transparent text-[15px] font-bold leading-relaxed text-amber-200/90 resize-none focus:outline-none placeholder:text-amber-900/40 cinema-modal-scrollbar" />
                  </div>
                )}

                {/* 🎬 仅视频模式：展现 4 运镜卡片及配音试听 ── */}
                {mode === 'video' && (() => {
                  const base = { startFrame: '', endFrame: '', cameraMovement: '', characterAction: '', prompt: '' };
                  let vp: any = { ...base };
                  if (editForm.videoPrompt) {
                    let parseSuccess = false;
                    try {
                      const parsed = JSON.parse(editForm.videoPrompt);
                      if (parsed.startFrame || parsed.cameraMovement || parsed.prompt) {
                        vp = { ...base, ...parsed };
                        parseSuccess = true;
                      }
                    } catch {}

                    if (!parseSuccess) {
                      const getFieldByRegex = (jsonStr: string, field: string): string => {
                        const regex = new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,|\\s*})`, 'g');
                        const m = regex.exec(jsonStr);
                        if (m && m[1]) {
                          return m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
                        }
                        return '';
                      };
                      const regStart = getFieldByRegex(editForm.videoPrompt, 'startFrame');
                      const regEnd = getFieldByRegex(editForm.videoPrompt, 'endFrame');
                      const regCam = getFieldByRegex(editForm.videoPrompt, 'cameraMovement');
                      const regChar = getFieldByRegex(editForm.videoPrompt, 'characterAction');
                      const regPrompt = getFieldByRegex(editForm.videoPrompt, 'prompt');

                      if (regStart || regEnd || regCam || regChar || regPrompt) {
                        vp = {
                          startFrame: regStart,
                          endFrame: regEnd,
                          cameraMovement: regCam,
                          characterAction: regChar,
                          prompt: regPrompt || editForm.videoPrompt
                        };
                      } else {
                        vp.prompt = editForm.videoPrompt;
                      }
                    }
                  }

                  const setVp = (key: string, val: string) => {
                    const updated = { ...vp, [key]: val };
                    setEditForm((f: any) => ({ ...f, videoPrompt: JSON.stringify(updated) }));
                  };

                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          { label: '起始画面 START FRAME', key: 'startFrame' },
                          { label: '结束画面 END FRAME', key: 'endFrame' },
                          { label: '镜头运动 CAMERA MOVEMENT', key: 'cameraMovement' },
                          { label: '角色动作 CHARACTER ACTION', key: 'characterAction' },
                        ] as {label:string;key:string}[]).map(({ label, key }) => (
                          <div key={key} className="bg-slate-950/50 border border-violet-500/10 hover:border-violet-500/25 focus-within:border-violet-500/35 hover:bg-slate-950/70 focus-within:bg-slate-950/80 rounded-xl p-3 transition-all shadow-sm">
                            <p className="text-[13px] text-violet-300 font-black tracking-widest uppercase mb-1.5">{label}</p>
                            <textarea value={vp[key] || ''} onChange={e => setVp(key, e.target.value)}
                              rows={2.5} placeholder={`${label}描述...`}
                              className="w-full bg-transparent text-sm font-semibold text-violet-100/90 resize-none focus:outline-none leading-relaxed placeholder:text-violet-900/30 cinema-modal-scrollbar" />
                          </div>
                        ))}
                      </div>

                      {/* 角色对话配音列表 */}
                      {editForm.dialogue && (
                        <div className="bg-slate-950/30 border border-slate-900 rounded-xl p-4 shadow-inner">
                          <p className="text-[13px] text-violet-300 font-black tracking-wider uppercase mb-3 border-b border-violet-500/10 pb-1.5">对白配音预览 PREVIEW VOICE OVER</p>
                          <div className="space-y-1.5">
                            {editForm.dialogue.split('\n').filter(Boolean).map((line: string, i: number) => {
                              const m = line.match(/^([^：:]+)[：:](.+)$/);
                              return m ? (
                                <p key={i} className="text-sm flex items-center gap-1.5 py-1 border-b border-white/[0.02] last:border-b-0">
                                  <span className="text-amber-400 font-bold shrink-0 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/15 scale-95">{m[1]}</span>
                                  <span className="text-slate-200 leading-relaxed font-semibold">{m[2]}</span>
                                </p>
                              ) : <p key={i} className="text-sm text-gray-300 leading-relaxed py-1 font-semibold">{line}</p>;
                            })}
                          </div>

                          {/* 配音试听展现区 */}
                          {(() => {
                            let dubbedList: any[] = [];
                            if (editingShot.audioUrl && editingShot.audioUrl.startsWith('[')) {
                              try { dubbedList = JSON.parse(editingShot.audioUrl); } catch {}
                            } else if (editingShot.audioUrl) {
                              dubbedList = [{ character: '旁白', text: editForm.dialogue || '', audioUrl: editingShot.audioUrl }];
                            }
                            const withAudio = dubbedList.filter((x: any) => x.audioUrl);
                            if (withAudio.length === 0) return null;

                            return (
                              <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                                <p className="text-[11px] text-amber-400 font-semibold flex items-center gap-1">🔊 角色对白配音试听</p>
                                <div className="space-y-1.5">
                                  {withAudio.map((item: any, idx: number) => (
                                    <div key={idx} className="flex items-center justify-between bg-black/30 px-3 py-1.5 rounded-lg text-xs">
                                      <div className="flex items-center gap-1 min-w-[70px] shrink-0">
                                        <span className="text-amber-300 font-medium">{item.character}:</span>
                                      </div>
                                      <span className="text-gray-400 truncate grow text-[11px] px-2">{item.text}</span>
                                      <audio src={item.audioUrl} controls className="h-6 w-36 shrink-0" />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* ── 🎨 右半面板：AI 提示词实时编辑与高亮预览工作区 (Right Column: 46% width) ── */}
              <div className="w-full lg:w-[46%] p-6 space-y-5 overflow-y-auto cinema-modal-scrollbar bg-slate-950/20">
                {/* 提示词 */}
                {mode === 'image' ? (
                  <div className="space-y-4">
                    {/* ✍️ 100% 纯净可读的文本编辑层，彻底解决两层重叠无法编辑的bug */}
                    <div className="relative w-full bg-slate-900/60 border border-sky-500/25 focus-within:border-sky-500/50 rounded-xl p-3.5 transition-all">
                      <span className="text-[13px] font-black text-sky-400 tracking-wider uppercase block mb-2">提示词编辑区 PROMPT WORKSPACE</span>
                      <textarea
                        value={editForm.imagePrompt || ''}
                        onChange={e => handleTextareaChange(e.target.value, 'image', e.target.selectionStart)}
                        onKeyUp={e => handleTextareaChange((e.target as HTMLTextAreaElement).value, 'image', (e.target as HTMLTextAreaElement).selectionStart)}
                        onClick={e => handleTextareaChange((e.target as HTMLTextAreaElement).value, 'image', (e.target as HTMLTextAreaElement).selectionStart)}
                        rows={12}
                        placeholder="输入图片提示词，打 @ 可呼出资产联想菜单..."
                        className="w-full bg-transparent text-[15px] font-semibold leading-relaxed text-slate-100 focus:outline-none placeholder:text-slate-700 cinema-modal-scrollbar min-h-[220px]"
                      />

                      {/* ── 🌟 @提及 自动检索弹窗 ── */}
                      {atMenu.show && atMenu.type === 'image' && (
                        <div className="absolute z-30 top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto bg-[#0d1425] border-2 border-sky-400 rounded-xl shadow-[0_0_25px_rgba(56,189,248,0.3)] p-2 space-y-1 backdrop-blur-md cinema-modal-scrollbar animate-fade-in">
                          <p className="text-[10px] font-bold text-sky-400/60 tracking-wider px-2.5 pb-1 uppercase border-b border-sky-500/10 mb-1">选择要提及的资产 SELECT ASSET</p>
                          {(() => {
                            const filtered: any[] = [];
                            const q = atMenu.query.toLowerCase();
                            const assetMap = new Map();
                            if (drama) {
                              (drama.characters || []).forEach((c: any) => assetMap.set(c.name, { type: 'character', color: 'bg-pink-500/20 text-pink-300 border-pink-500/30', avatar: c.imageUrl || '👤' }));
                              (drama.scenes || []).forEach((s: any) => assetMap.set(s.name, { type: 'scene', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', avatar: s.imageUrl || '🏔️' }));
                              (drama.items || []).forEach((i: any) => assetMap.set(i.name, { type: 'item', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', avatar: i.imageUrl || '🔑' }));
                            }
                            Array.from(assetMap.entries()).forEach(([name, asset]) => {
                              if (!q || name.toLowerCase().includes(q)) {
                                filtered.push({ name, ...asset });
                              }
                            });
                            if (filtered.length === 0) return <div className="text-xs text-gray-400 text-center py-3 italic">未找到匹配的资产名</div>;
                            return filtered.map((item, idx) => (
                              <button key={idx} type="button"
                                onClick={() => insertSelectedAsset(item.name, 'image')}
                                className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-slate-100 hover:bg-sky-500/20 hover:text-white border border-transparent hover:border-sky-500/20 flex items-center gap-2.5 transition-all cursor-pointer scale-98 active:scale-[0.97]"
                              >
                                {item.avatar && (item.avatar.startsWith('http') || item.avatar.startsWith('/')) ? (
                                  <img src={item.avatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0 ring-1 ring-sky-500/20" />
                                ) : (
                                  <span className="shrink-0 text-sm">{item.avatar || '🏷️'}</span>
                                )}
                                <span className="grow truncate font-bold text-slate-200 group-hover:text-white">{item.name}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-md border tracking-wider scale-90 ${item.color}`}>
                                  {item.type === 'character' ? '角色' : item.type === 'scene' ? '场景' : '物品'}
                                </span>
                              </button>
                            ));
                          })()}
                        </div>
                      )}
                    </div>

                    {/* 🌟 实时高亮视觉效果预览区 */}
                    <div className="bg-sky-950/15 border border-sky-500/15 rounded-xl p-4 space-y-2 shadow-inner">
                      <span className="text-[13px] font-black text-sky-400 tracking-wider uppercase block mb-1.5">图片提示词效果预览 LIVE HIGHLIGHT PREVIEW</span>
                      <div className="text-[15px] font-semibold leading-relaxed text-sky-100/90 whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto cinema-modal-scrollbar">
                        {(() => {
                          let text = editForm.imagePrompt || '';
                          if (text.startsWith('{')) {
                            try {
                              const parsed = JSON.parse(text);
                              text = parsed.imagePrompt || parsed.prompt || text;
                            } catch {}
                          }
                          if (!text) return <span className="text-gray-600 italic text-sm font-semibold">暂无提示词内容...</span>;

                          const assetMap = new Map<string, { type: 'character' | 'scene' | 'item'; color: string; avatar?: string }>();
                          if (drama) {
                            (drama.characters || []).forEach((c: any) => assetMap.set(c.name, { type: 'character', color: 'bg-pink-500/20 text-pink-300 border-pink-500/30', avatar: c.imageUrl || '👤' }));
                            (drama.scenes || []).forEach((s: any) => assetMap.set(s.name, { type: 'scene', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', avatar: s.imageUrl || '🏔️' }));
                            (drama.items || []).forEach((i: any) => assetMap.set(i.name, { type: 'item', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', avatar: i.imageUrl || '🔑' }));
                          }

                          const sortedAssetNames = Array.from(assetMap.keys()).filter(Boolean).sort((a, b) => b.length - a.length);
                          for (const name of sortedAssetNames) {
                            const escaped = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                            const regex = new RegExp(`(?<!@)${escaped}`, 'g');
                            text = text.replace(regex, `@${name}`);
                          }

                          const escapeRegex = (str: string) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                          const regexPattern = sortedAssetNames.length > 0
                            ? `(@(?:${sortedAssetNames.map(escapeRegex).join('|')}))`
                            : '(@[^\\s,，。\\.！？!？@（）()\\[\\]{}、;:："\'“”“‘’]+)';
                          const parts = text.split(new RegExp(regexPattern, 'g'));

                          return parts.map((part: string, index: number) => {
                            if (part.startsWith('@')) {
                              const name = part.slice(1);
                              const asset = assetMap.get(name);
                              if (asset) {
                                const isUrl = asset.avatar && (asset.avatar.startsWith('http') || asset.avatar.startsWith('/'));
                                return (
                                  <span key={index} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border ${asset.color} text-sm mx-0.5 font-bold vertical-middle align-baseline shadow-sm`}>
                                    {isUrl ? (
                                      <img src={asset.avatar} alt={name} className="w-4 h-4 rounded-full object-cover shrink-0" />
                                    ) : (
                                      <span className="shrink-0">{asset.avatar || '🏷️'}</span>
                                    )}
                                    @{name}
                                  </span>
                                );
                              }
                            }
                            return <span key={index} className="text-sky-100/90">{part}</span>;
                          });
                        })()}
                      </div>
                    </div>

                    {/* 反向提示词 */}
                    <div className="bg-red-950/[0.02] border border-red-500/10 rounded-xl px-4 py-3 focus-within:border-red-500/25 transition-all">
                      <span className="text-[13px] font-black text-red-400 tracking-wider uppercase block mb-1.5">反向提示词 NEGATIVE PROMPT</span>
                      <textarea value={editForm.negativePrompt} onChange={e => setEditForm((f: any) => ({...f, negativePrompt: e.target.value}))}
                        rows={2} placeholder="模糊, 变形, 低质量, 水印, 文字, 多余肢体"
                        className="w-full bg-transparent text-sm font-semibold leading-relaxed text-red-200/60 resize-none focus:outline-none placeholder:text-red-900/30 cinema-modal-scrollbar" />
                    </div>
                  </div>
                ) : (() => {
                  const base = { startFrame: '', endFrame: '', cameraMovement: '', characterAction: '', prompt: '' };
                  let vp: any = { ...base };
                  if (editForm.videoPrompt) {
                    let parseSuccess = false;
                    try {
                      const parsed = JSON.parse(editForm.videoPrompt);
                      if (parsed.prompt || parsed.startFrame) {
                        vp = { ...base, ...parsed };
                        parseSuccess = true;
                      }
                    } catch {}
                    if (!parseSuccess) {
                      const getFieldByRegex = (jsonStr: string, field: string): string => {
                        const regex = new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,|\\s*})`, 'g');
                        const m = regex.exec(jsonStr);
                        return m && m[1] ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim() : '';
                      };
                      vp.prompt = getFieldByRegex(editForm.videoPrompt, 'prompt') || editForm.videoPrompt;
                    }
                  }

                  return (
                    <div className="space-y-4">
                      {/* ✍️ 100% 纯净可读的文本编辑层，彻底解决两层重叠无法编辑的bug */}
                      <div className="relative w-full bg-slate-900/60 border border-violet-500/25 focus-within:border-violet-500/50 rounded-xl p-3.5 transition-all">
                        <span className="text-[13px] font-black text-violet-400 tracking-wider uppercase block mb-2">提示词编辑区 PROMPT WORKSPACE</span>
                        <textarea
                          value={vp.prompt || ''}
                          onChange={e => handleTextareaChange(e.target.value, 'video', e.target.selectionStart)}
                          onKeyUp={e => handleTextareaChange((e.target as HTMLTextAreaElement).value, 'video', (e.target as HTMLTextAreaElement).selectionStart)}
                          onClick={e => handleTextareaChange((e.target as HTMLTextAreaElement).value, 'video', (e.target as HTMLTextAreaElement).selectionStart)}
                          rows={12}
                          placeholder="输入视频运镜提示词，打 @ 可呼出资产联想菜单..."
                          className="w-full bg-transparent text-[15px] font-semibold leading-relaxed text-slate-100 focus:outline-none placeholder:text-slate-700 cinema-modal-scrollbar min-h-[220px]"
                        />

                        {/* ── 🌟 @提及 自动检索弹窗 ── */}
                        {atMenu.show && atMenu.type === 'video' && (
                          <div className="absolute z-30 top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto bg-[#0d1425] border-2 border-violet-400 rounded-xl shadow-[0_0_25px_rgba(167,139,250,0.3)] p-2 space-y-1 backdrop-blur-md cinema-modal-scrollbar animate-fade-in">
                            <p className="text-[10px] font-bold text-violet-400/60 tracking-wider px-2.5 pb-1 uppercase border-b border-violet-500/10 mb-1">选择要提及的资产 SELECT ASSET</p>
                            {(() => {
                              const filtered: any[] = [];
                              const q = atMenu.query.toLowerCase();
                              const assetMap = new Map();
                              if (drama) {
                                (drama.characters || []).forEach((c: any) => assetMap.set(c.name, { type: 'character', color: 'bg-pink-500/20 text-pink-300 border-pink-500/30', avatar: c.imageUrl || '👤' }));
                                (drama.scenes || []).forEach((s: any) => assetMap.set(s.name, { type: 'scene', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', avatar: s.imageUrl || '🏔️' }));
                                (drama.items || []).forEach((i: any) => assetMap.set(i.name, { type: 'item', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', avatar: i.imageUrl || '🔑' }));
                              }
                              Array.from(assetMap.entries()).forEach(([name, asset]) => {
                                if (!q || name.toLowerCase().includes(q)) {
                                  filtered.push({ name, ...asset });
                                }
                              });
                              if (filtered.length === 0) return <div className="text-xs text-gray-400 text-center py-3 italic">未找到匹配的资产名</div>;
                              return filtered.map((item, idx) => (
                                <button key={idx} type="button"
                                  onClick={() => insertSelectedAsset(item.name, 'video')}
                                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-slate-100 hover:bg-violet-500/20 hover:text-white border border-transparent hover:border-violet-500/20 flex items-center gap-2.5 transition-all cursor-pointer scale-98 active:scale-[0.97]"
                                >
                                  {item.avatar && (item.avatar.startsWith('http') || item.avatar.startsWith('/')) ? (
                                    <img src={item.avatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0 ring-1 ring-violet-500/20" />
                                  ) : (
                                    <span className="shrink-0 text-sm">{item.avatar || '🏷️'}</span>
                                  )}
                                  <span className="grow truncate font-bold text-slate-200 group-hover:text-white">{item.name}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-md border tracking-wider scale-90 ${item.color}`}>
                                    {item.type === 'character' ? '角色' : item.type === 'scene' ? '场景' : '物品'}
                                  </span>
                                </button>
                              ));
                            })()}
                          </div>
                        )}
                      </div>

                      {/* 🌟 实时高亮视觉效果预览区 */}
                      <div className="bg-violet-950/15 border border-violet-500/15 rounded-xl p-4 space-y-2 shadow-inner">
                        <span className="text-[13px] font-black text-violet-400 tracking-wider uppercase block mb-1.5">视频提示词效果预览 LIVE HIGHLIGHT PREVIEW</span>
                        <div className="text-[15px] font-semibold leading-relaxed text-violet-100/90 whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto cinema-modal-scrollbar">
                          {(() => {
                            let text = vp.prompt || '';
                            if (!text) return <span className="text-gray-600 italic text-sm font-semibold">暂无提示词内容...</span>;

                            const assetMap = new Map<string, { type: 'character' | 'scene' | 'item'; color: string; avatar?: string }>();
                            if (drama) {
                              (drama.characters || []).forEach((c: any) => assetMap.set(c.name, { type: 'character', color: 'bg-pink-500/20 text-pink-300 border-pink-500/30', avatar: c.imageUrl || '👤' }));
                              (drama.scenes || []).forEach((s: any) => assetMap.set(s.name, { type: 'scene', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', avatar: s.imageUrl || '🏔️' }));
                              (drama.items || []).forEach((i: any) => assetMap.set(i.name, { type: 'item', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', avatar: i.imageUrl || '🔑' }));
                            }

                            const sortedAssetNames = Array.from(assetMap.keys()).filter(Boolean).sort((a, b) => b.length - a.length);
                            for (const name of sortedAssetNames) {
                              const escaped = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                              const regex = new RegExp(`(?<!@)${escaped}`, 'g');
                              text = text.replace(regex, `@${name}`);
                            }

                            const escapeRegex = (str: string) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                            const regexPattern = sortedAssetNames.length > 0
                              ? `(@(?:${sortedAssetNames.map(escapeRegex).join('|')}))`
                              : '(@[^\\s,，。\\.！？!？@（）()\\[\\]{}、;:："\'“”“‘’]+)';
                            const parts = text.split(new RegExp(regexPattern, 'g'));

                            return parts.map((part: string, index: number) => {
                              if (part.startsWith('@')) {
                                const name = part.slice(1);
                                const asset = assetMap.get(name);
                                if (asset) {
                                  const isUrl = asset.avatar && (asset.avatar.startsWith('http') || asset.avatar.startsWith('/'));
                                  return (
                                    <span key={index} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border ${asset.color} text-sm mx-0.5 font-bold vertical-middle align-baseline shadow-sm`}>
                                      {isUrl ? (
                                        <img src={asset.avatar} alt={name} className="w-4 h-4 rounded-full object-cover shrink-0" />
                                      ) : (
                                        <span className="shrink-0">{asset.avatar || '🏷️'}</span>
                                      )}
                                      @{name}
                                    </span>
                                  );
                                }
                              }
                              return <span key={index} className="text-violet-100/90">{part}</span>;
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              </div>

              {/* 底部悬浮控制台 */}
              <div className="sticky bottom-0 bg-slate-950/95 backdrop-blur-md px-6 py-4 border-t border-white/5 flex items-center justify-end gap-3 z-40">
                <button type="button" onClick={() => setEditingShot(null)} className="px-5 py-2.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 border border-slate-800 rounded-xl transition-all font-medium">取消</button>
                <button type="button" onClick={saveEdit} disabled={savingShot}
                  className={`px-6 py-2.5 text-xs font-semibold rounded-xl text-white transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-lg ${
                    mode === 'image' 
                      ? 'bg-gradient-to-r from-sky-600 to-blue-600 shadow-sky-500/10 hover:shadow-sky-500/25 hover:brightness-110 active:scale-[0.98]' 
                      : 'bg-gradient-to-r from-violet-600 to-indigo-600 shadow-violet-500/10 hover:shadow-violet-500/25 hover:brightness-110 active:scale-[0.98]'
                  }`}>
                  {savingShot ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      保存中…
                    </>
                  ) : '保存配置'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 对白配音系统弹窗 */}
        {dubbingShotId && (() => {
          const shot = shots.find((s: any) => s.id === dubbingShotId);
          if (!shot) return null;

          const lines = parseDialogueLines(shot.dialogue || '');
          const characters = Array.from(new Set(lines.map(l => l.character)));
          const activeConfig = dubbingCharacterVoices[dubbingCharacter] || {
            provider: dubbingActiveTab,
            voiceId: dubbingActiveTab === 'edge-tts' ? 'zh-CN-XiaoxiaoNeural' : 'default',
            customAudioUrl: '',
            customAudioName: '',
            emotion: '与语音参考相同',
            voiceDesc: ''
          };

          const handleSelectTemplate = (template: any) => {
            setDubbingCharacterVoices(prev => ({
              ...prev,
              [dubbingCharacter]: {
                provider: 'index-tts',
                voiceId: template.id,
                voiceDesc: template.description
              }
            }));
            setShowTemplateModal(false);
          };

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setDubbingShotId(null)}>
              <div className="w-full max-w-4xl mx-4 bg-[#0d1526] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                
                {/* 顶栏 */}
                <div className="bg-[#0d1526]/95 border-b border-white/5 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center text-base text-amber-400">
                      🎙️
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">对白配音系统</p>
                      <p className="text-xs text-gray-500">场景 {shot.shotNumber}</p>
                    </div>
                  </div>
                  <button onClick={() => setDubbingShotId(null)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white transition-colors">✕</button>
                </div>

                {/* 主体双列布局 */}
                <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* 左列：语音管理与音色配置 */}
                  <div className="space-y-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">角色音色配置</p>
                    
                    {/* 角色选择器 */}
                    <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="text-xs text-gray-400 shrink-0">正在配置:</span>
                      <select value={dubbingCharacter} onChange={e => setDubbingCharacter(e.target.value)}
                        className="bg-transparent border-0 font-medium text-amber-300 focus:outline-none shrink-0 grow">
                        {characters.map(char => (
                          <option key={char} value={char} className="bg-[#0d1526] text-white">{char}</option>
                        ))}
                      </select>
                    </div>

                    {/* TTS 引擎 Tabs (Image 2 style) */}
                    <div className="flex gap-1.5 bg-black/30 p-1 rounded-xl border border-white/5">
                      {([
                        { label: 'EdgeTTS', key: 'edge-tts' },
                        { label: 'IndexTTS', key: 'index-tts' },
                        { label: 'GPT-SoVITS', key: 'gpt-sovits' }
                      ]).map(p => {
                        const isSelected = (dubbingActiveTab === p.key);
                        return (
                          <button key={p.key} onClick={() => {
                            setDubbingActiveTab(p.key as any);
                            setDubbingCharacterVoices(prev => ({
                              ...prev,
                              [dubbingCharacter]: {
                                ...(prev[dubbingCharacter] || { voiceId: p.key === 'edge-tts' ? 'zh-CN-XiaoxiaoNeural' : 'default', emotion: '与语音参考相同', voiceDesc: '' }),
                                provider: p.key
                              }
                            }));
                          }}
                            className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${isSelected ? 'bg-violet-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                            {p.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* 配置卡片面板 */}
                    <div className="bg-white/3 border border-white/5 rounded-2xl p-4 space-y-4">
                      
                      {/* 动作按钮组 */}
                      <div className="flex items-center gap-2">
                        <button onClick={() => setShowTemplateModal(true)}
                          className="px-3 py-1.5 text-xs bg-violet-600/80 hover:bg-violet-500 text-violet-100 rounded-lg flex items-center gap-1 font-medium transition-all">
                          📂 添加模板语音
                        </button>
                        <label className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/15 text-gray-300 rounded-lg flex items-center gap-1 font-medium cursor-pointer transition-all">
                          📤 自己上传音色
                          <input type="file" accept="audio/*" className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const formData = new FormData();
                              formData.append('file', file);
                              formData.append('subDir', 'voices');
                              formData.append('dramaId', dramaId);
                              try {
                                const res = await fetch('/api/storage/upload', {
                                  method: 'POST',
                                  headers: { Authorization: `Bearer ${getToken()}` },
                                  body: formData
                                });
                                const data = await res.json();
                                if (data.code === 0 && data.data) {
                                  setDubbingCharacterVoices(prev => ({
                                    ...prev,
                                    [dubbingCharacter]: {
                                      provider: dubbingActiveTab,
                                      voiceId: 'custom',
                                      customAudioUrl: data.data,
                                      customAudioName: file.name
                                    }
                                  }));
                                } else { alert(data.msg || '上传失败'); }
                              } catch (err) { console.error(err); alert('上传出错'); }
                            }} />
                        </label>
                      </div>

                      {/* 当前角色展示 */}
                      <div className="border-t border-white/5 pt-4 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-amber-400 font-bold text-sm">🎙️ {dubbingCharacter}</span>
                          <span className="text-violet-400 font-semibold bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">{dubbingActiveTab === 'edge-tts' ? 'Edge-TTS' : dubbingActiveTab === 'index-tts' ? 'Index-TTS' : 'GPT-SoVITS'}</span>
                        </div>

                        {/* 音色描述 */}
                        <div className="space-y-1.5">
                          <p className="text-xs text-gray-400">音色描述</p>
                          <textarea value={activeConfig.voiceDesc || ''} onChange={e => setDubbingCharacterVoices(prev => ({ ...prev, [dubbingCharacter]: { ...activeConfig, voiceDesc: e.target.value } }))}
                            rows={2} placeholder="描述音色特征（如：年轻女性，声音甜美清脆，适合活泼少女角色）..."
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white leading-relaxed resize-none focus:outline-none focus:border-white/30" />
                        </div>

                        {/* 参考音频 */}
                        <div className="space-y-1.5">
                          <p className="text-xs text-gray-400">参考音频</p>
                          <div className="flex gap-2">
                            <input type="text" readOnly value={activeConfig.voiceId === 'custom' ? (activeConfig.customAudioName || activeConfig.customAudioUrl || '自定义音频文件') : (INDEX_TTS_TEMPLATES.find(t => t.id === activeConfig.voiceId)?.name || activeConfig.voiceId || '默认音色')}
                              className="bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-300 grow focus:outline-none" />
                          </div>
                        </div>

                        {/* 情感控制 */}
                        <div className="space-y-1.5">
                          <p className="text-xs text-gray-400">情感控制</p>
                          <select value={activeConfig.emotion || '与语音参考相同'} onChange={e => setDubbingCharacterVoices(prev => ({ ...prev, [dubbingCharacter]: { ...activeConfig, emotion: e.target.value } }))}
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none">
                            <option value="与语音参考相同" className="bg-[#0d1526]">与语音参考相同</option>
                            <option value="使用情感参考音频" className="bg-[#0d1526]">使用情感参考音频</option>
                            <option value="使用情感向量" className="bg-[#0d1526]">使用情感向量</option>
                            <option value="使用文本描述" className="bg-[#0d1526]">使用文本描述</option>
                          </select>
                        </div>

                        {/* IndexTTS 专属配置 (API地址与停顿参数) */}
                        {dubbingActiveTab === 'index-tts' && (
                          <div className="border-t border-white/5 pt-3 mt-3 space-y-3">
                            <p className="text-xs text-violet-300 font-bold">IndexTTS 设置</p>
                            
                            {/* API地址 */}
                            <div className="space-y-1.5">
                              <p className="text-[11px] text-gray-400">IndexTTS API地址</p>
                              <input type="text" value={indexTtsApiUrl} onChange={e => handleIndexTtsApiUrlChange(e.target.value)}
                                placeholder="http://127.0.0.1:7860"
                                className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none placeholder:text-gray-600" />
                            </div>

                            {/* 初始停顿 */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] text-gray-400">
                                <span>减少IndexTTS语音初始停顿</span>
                                <span className="text-violet-300">{indexTtsStartPause}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <input type="range" min="0" max="1000" step="10" value={indexTtsStartPause} onChange={e => handleIndexTtsStartPauseChange(parseInt(e.target.value))}
                                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-violet-500" />
                                <span className="text-xs text-gray-400 bg-black/30 px-2 py-0.5 rounded shrink-0 w-10 text-center">{indexTtsStartPause}</span>
                              </div>
                            </div>

                            {/* 末尾停顿 */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] text-gray-400">
                                <span>减少IndexTTS语音末尾停顿</span>
                                <span className="text-violet-300">{indexTtsEndPause}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <input type="range" min="0" max="1000" step="10" value={indexTtsEndPause} onChange={e => handleIndexTtsEndPauseChange(parseInt(e.target.value))}
                                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-violet-500" />
                                <span className="text-xs text-gray-400 bg-black/30 px-2 py-0.5 rounded shrink-0 w-10 text-center">{indexTtsEndPause}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* EdgeTTS 专属配置 (API地址) */}
                        {dubbingActiveTab === 'edge-tts' && (
                          <div className="border-t border-white/5 pt-3 mt-3 space-y-3">
                            <p className="text-xs text-violet-300 font-bold">EdgeTTS 设置</p>
                            
                            {/* API地址 */}
                            <div className="space-y-1.5">
                              <p className="text-[11px] text-gray-400">EdgeTTS API地址</p>
                              <input type="text" value={edgeTtsApiUrl} onChange={e => handleEdgeTtsApiUrlChange(e.target.value)}
                                placeholder="http://127.0.0.1:5003"
                                className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none placeholder:text-gray-600" />
                            </div>
                          </div>
                        )}

                        {/* GPT-SoVITS 专属配置 (API地址) */}
                        {dubbingActiveTab === 'gpt-sovits' && (
                          <div className="border-t border-white/5 pt-3 mt-3 space-y-3">
                            <p className="text-xs text-violet-300 font-bold">GPT-SoVITS 设置</p>
                            
                            {/* API地址 */}
                            <div className="space-y-1.5">
                              <p className="text-[11px] text-gray-400">GPT-SoVITS API地址</p>
                              <input type="text" value={gptSovitsApiUrl} onChange={e => handleGptSovitsApiUrlChange(e.target.value)}
                                placeholder="http://127.0.0.1:9880"
                                className="w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none placeholder:text-gray-600" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 试听测试区 */}
                      <div className="border-t border-white/5 pt-4 space-y-3 bg-black/20 -mx-4 -mb-4 p-4 rounded-b-2xl">
                        <div className="flex gap-2">
                          <input type="text" value={trialText} onChange={e => setTrialText(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-100 grow focus:outline-none" />
                          <button onClick={handleTrialListen} disabled={trialling}
                            className="px-4 py-2 text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-xl font-medium transition-all shrink-0">
                            {trialling ? '生成中...' : '试听'}
                          </button>
                        </div>
                        {trialAudioUrl && (
                          <div className="flex items-center gap-2 bg-black/40 px-3 py-2 rounded-xl border border-white/5">
                            <span className="text-[10px] text-violet-400 font-bold shrink-0">试听播放:</span>
                            <audio src={trialAudioUrl} controls className="h-5 grow scale-95" />
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* 右列：根据对白配音 */}
                  <div className="space-y-4 flex flex-col h-full">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">分镜对白逐行配音</p>
                      <button onClick={() => handleGenerateAllDubs(lines)}
                        className="text-xs text-violet-300 hover:text-white bg-violet-500/10 hover:bg-violet-500/20 px-2.5 py-1 rounded-lg border border-violet-500/20 transition-all font-semibold">
                        🔊 一键生成全部配音
                      </button>
                    </div>

                    <div className="flex-1 space-y-3 pr-1 overflow-y-auto max-h-[50vh]">
                      {lines.length === 0 ? (
                        <div className="text-center py-10 text-xs text-gray-500 italic">该分镜暂无对白，请在分镜信息中先编辑对白。</div>
                      ) : (
                        lines.map((line, idx) => {
                          const config = dubbingCharacterVoices[line.character] || { provider: 'edge-tts', voiceId: 'zh-CN-XiaoxiaoNeural' };
                          const currentAudio = dubbedAudios[idx];
                          const isLineGen = generatingLineIndex === idx;

                          return (
                            <div key={idx} className="bg-white/3 border border-white/5 rounded-xl p-3.5 space-y-3 transition-all hover:bg-white/5">
                              {/* 角色与当前配置展示 */}
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-amber-300">{line.character}</span>
                                <span className="text-[10px] text-gray-400 italic">
                                  使用: {config.provider === 'edge-tts' ? 'Edge-TTS' : (INDEX_TTS_TEMPLATES.find(t => t.id === config.voiceId)?.name || config.voiceId || '默认')}
                                </span>
                              </div>

                              {/* 对白文本 */}
                              <p className="text-xs text-gray-300 bg-black/20 p-2.5 rounded-lg border border-white/5 leading-relaxed">{line.text}</p>

                              {/* 状态与配音操作 */}
                              <div className="flex items-center justify-between gap-3 pt-1">
                                {currentAudio ? (
                                  <audio src={currentAudio} controls className="h-5 grow max-w-[200px]" />
                                ) : (
                                  <span className="text-[10px] text-gray-500 italic">⚠️ 暂未配音</span>
                                )}

                                <button onClick={() => handleGenerateLineDub(line.text, idx, line.character)}
                                  disabled={isLineGen}
                                  className="px-3 py-1.5 text-xs bg-amber-600/80 hover:bg-amber-500 disabled:opacity-40 text-amber-100 rounded-lg font-medium shrink-0 flex items-center gap-1 transition-all">
                                  {isLineGen ? '🔊 正在生成...' : currentAudio ? '🔁 重新配音' : '🔊 生成配音'}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                </div>

                {/* 底栏 */}
                <div className="bg-black/30 border-t border-white/5 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
                  <button onClick={() => setDubbingShotId(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">取消</button>
                  <button onClick={() => handleSaveDubbing(lines)} disabled={savingDubbing}
                    className="px-6 py-2 text-sm font-medium rounded-xl text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-all">
                    {savingDubbing ? '正在保存...' : '保存配音配置'}
                  </button>
                </div>

              </div>
              
              {/* 选择 IndexTTS 模板语音弹窗 */}
              {showTemplateModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowTemplateModal(false)}>
                  <div className="w-full max-w-2xl mx-4 bg-[#0d1526] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-[#0d1526]/95 border-b border-white/5 px-5 py-4 flex items-center justify-between">
                      <span className="text-sm font-bold text-white">选择 IndexTTS 模板语音</span>
                      <button onClick={() => setShowTemplateModal(false)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white transition-colors">✕</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 grid grid-cols-4 gap-4 bg-black/20">
                      {INDEX_TTS_TEMPLATES.map(item => (
                        <div key={item.id} onClick={() => handleSelectTemplate(item)}
                          className="bg-[#131d31] border border-white/5 hover:border-violet-500/40 hover:bg-[#1a2842] cursor-pointer rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center transition-all select-none group">
                          <span className="text-4xl group-hover:scale-110 transition-transform">{item.avatar}</span>
                          <p className="text-xs font-bold text-white group-hover:text-violet-300 transition-colors">{item.name}</p>
                          <p className="text-[10px] text-gray-500 line-clamp-1">{item.description}</p>
                        </div>
                      ))}
                    </div>
                    <div className="bg-black/30 border-t border-white/5 px-5 py-3.5 flex justify-end">
                      <button onClick={() => setShowTemplateModal(false)}
                        className="px-4 py-2 text-xs bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-all">
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          );
        })()}
        </>
      ) : (
        <div className="text-center py-16 text-gray-500">
          <span className="text-4xl block mb-3">🎬</span>
          <p className="text-sm">{selectedEpisode ? `该分集暂无分镜，点击“生成${mode === 'image' ? '图片' : '视频'}提示词”自动创建` : '请先选择一个分集'}</p>
        </div>
        );
      })()}
    </div>
  );
}

// ======================== 设置 ========================
function SettingsTab({ drama, dramaId, getToken, onRefresh }: any) {
  const [form, setForm] = useState({
    title: drama.title, description: drama.description || "", genre: drama.genre || "",
    totalEpisodes: drama.totalEpisodes, style: drama.style || "", platform: drama.platform || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/short-dramas/${dramaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(form),
      });
      onRefresh();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <h3 className="text-sm font-semibold text-white">⚙️ 短剧设置</h3>
      <div className="space-y-4 p-6 rounded-xl bg-white/5 border border-white/10">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-1.5">标题</label>
          <input type="text" className="w-full px-4 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-1.5">简介</label>
          <textarea rows={3} className="w-full px-4 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/30" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1.5">类型</label>
            <input type="text" className="w-full px-3 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white text-sm focus:outline-none" value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1.5">总集数</label>
            <input type="number" className="w-full px-3 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white text-sm focus:outline-none" value={form.totalEpisodes} onChange={e => setForm(f => ({ ...f, totalEpisodes: parseInt(e.target.value) || 0 }))} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1.5">风格</label>
            <input type="text" className="w-full px-3 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white text-sm focus:outline-none" value={form.style} onChange={e => setForm(f => ({ ...f, style: e.target.value }))} placeholder="写实/动画/混合" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1.5">平台</label>
            <input type="text" className="w-full px-3 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white text-sm focus:outline-none" value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} placeholder="抖音/快手/小红书" />
          </div>
        </div>
        <div className="pt-4 border-t border-white/10">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl disabled:opacity-50 transition-all">
            {saving ? "保存中..." : "保存设置"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ======================== 剪映导出系统 ========================
function JianyingExportTab({ drama, selectedEpisode, onSelectEpisode, shots: selectedShots, shotsLoading, getToken }: any) {
  const [username, setUsername] = useState("Administrator");
  const [detectedPath, setDetectedPath] = useState("");
  const [customPath, setCustomPath] = useState("");
  const [pathExists, setPathExists] = useState(false);
  
  const [exportScope, setExportScope] = useState<'episode' | 'full'>('episode');
  const [draftName, setDraftName] = useState("");
  const [exporting, setExporting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // 1. 初始化自动检测本地剪映路径
  useEffect(() => {
    async function detectLocalPath() {
      try {
        const res = await fetch("/api/short-dramas/jianying-path");
        const data = await res.json();
        if (data.success && data.data) {
          const p = data.data.detectedPath || "";
          setDetectedPath(p);
          setCustomPath(p);
          setPathExists(data.data.exists);
          if (data.data.username) {
            setUsername(data.data.username);
          }
        }
      } catch (e) {
        console.error("自动检测剪映保存位置失败:", e);
      }
    }
    detectLocalPath();
  }, []);

  // 2. 根据所选导出范围与集数，自动更新草稿默认项目名称 (解决 episodeNumber 的 undefined 问题)
  useEffect(() => {
    if (drama) {
      if (exportScope === 'episode' && selectedEpisode) {
        setDraftName(`${drama.title}_第${selectedEpisode.episodeNumber || selectedEpisode.index || 1}集`);
      } else {
        setDraftName(`${drama.title}_全集整部`);
      }
    }
  }, [selectedEpisode, drama, exportScope]);

  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setLogs(prev => [...prev, `[${ts}] ${msg}`]);
  };

  const handleExport = async () => {
    if (exportScope === 'episode' && !selectedEpisode) {
      alert("请先选择需要导出的剧集分集！");
      return;
    }

    setExporting(true);
    setLogs([]);
    addLog(`🚀 开始初始化【剪映原生草稿包】多轨导出任务...`);
    addLog(`📁 草稿名称：${draftName}`);
    addLog(`🎬 导出范围：${exportScope === 'episode' ? `当前单集（第 ${selectedEpisode?.episodeNumber || selectedEpisode?.index || 1} 集）` : "整部剧集所有分集"}`);

    const cleanDraftPath = (customPath || detectedPath || `C:/Users/${username}/AppData/Local/JianyingPro/User Data/Projects/com.lanying.editor.draft`).replace(/\\/g, "/").replace(/\/+$/, "");
    addLog(`🔍 当前剪映草稿存放路径：${cleanDraftPath}`);

    try {
      const zip = new JSZip();
      // 创建对应短剧草稿名字的子文件夹，保证解压后路径完美契合
      const draftFolder = zip.folder(draftName);
      if (!draftFolder) throw new Error("无法在压缩包中创建草稿文件夹！");

      // 拉取需要导出的分镜素材数据
      let exportShots: any[] = [];
      if (exportScope === 'episode') {
        addLog(`📊 正在装载当前选中集（共 ${selectedShots.length} 个分镜）...`);
        exportShots = [...selectedShots];
      } else {
        addLog(`📊 正在拉取整部短剧（共 ${drama.episodes.length} 集）的所有分镜数据...`);
        for (const ep of drama.episodes) {
          addLog(`  正在拉取第 ${ep.episodeNumber} 集的分镜数据...`);
          try {
            const res = await fetch(`/api/short-dramas/${drama.id}/storyboards?episodeId=${ep.id}`, {
              headers: { Authorization: `Bearer ${getToken()}` }
            });
            const d = await res.json();
            if (d.success && d.data) {
              exportShots.push(...d.data);
            }
          } catch (e: any) {
            addLog(`  ⚠️ 拉取第 ${ep.episodeNumber} 集的分镜失败: ${e.message}`);
          }
        }
      }

      if (exportShots.length === 0) {
        throw new Error("无可用的分镜素材，请先生成对应内容！");
      }

      // --- 动态识别首个素材的真实视频/图片尺寸与宽高比 ---
      let canvasWidth = 1080;
      let canvasHeight = 1920;
      let canvasRatio = "9:16";

      const getMediaSize = (url: string, isVideo: boolean): Promise<{ width: number; height: number }> => {
        return new Promise((resolve) => {
          if (isVideo) {
            const video = document.createElement('video');
            video.crossOrigin = "anonymous";
            video.src = url;
            video.onloadedmetadata = () => {
              resolve({ width: video.videoWidth || 1080, height: video.videoHeight || 1920 });
            };
            video.onerror = () => resolve({ width: 1080, height: 1920 });
            setTimeout(() => resolve({ width: 1080, height: 1920 }), 2500); // 3秒超时防止卡死
          } else {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = url;
            img.onload = () => {
              resolve({ width: img.naturalWidth || 1080, height: img.naturalHeight || 1920 });
            };
            img.onerror = () => resolve({ width: 1080, height: 1920 });
            setTimeout(() => resolve({ width: 1080, height: 1920 }), 2500);
          }
        });
      };

      addLog(`🔍 正在扫描分析首个分镜素材，智能判定项目分辨率规格...`);
      const firstShotWithMedia = exportShots.find(s => s.videoUrl || s.imageUrl);
      if (firstShotWithMedia) {
        const mediaUrl = firstShotWithMedia.videoUrl || firstShotWithMedia.imageUrl;
        const isVideo = !!firstShotWithMedia.videoUrl;
        addLog(`  读取尺寸中：${mediaUrl.slice(0, 45)}...`);
        try {
          const size = await getMediaSize(mediaUrl, isVideo);
          canvasWidth = size.width;
          canvasHeight = size.height;
          
          const aspect = canvasWidth / canvasHeight;
          if (Math.abs(aspect - (9/16)) < 0.05) canvasRatio = "9:16";
          else if (Math.abs(aspect - (16/9)) < 0.05) canvasRatio = "16:9";
          else if (Math.abs(aspect - 1.0) < 0.05) canvasRatio = "1:1";
          else if (Math.abs(aspect - (4/3)) < 0.05) canvasRatio = "4:3";
          else if (Math.abs(aspect - (3/4)) < 0.05) canvasRatio = "3:4";
          else if (canvasWidth > canvasHeight) canvasRatio = "16:9";
          else canvasRatio = "9:16";

          addLog(`  ✓ 智能判定成功！画面尺寸：${canvasWidth} x ${canvasHeight} | 自适应宽高比设为：${canvasRatio}`);
        } catch {
          addLog(`  ⚠️ 探测超时或失败，采用行业短剧黄金降级尺寸：1080 x 1920 (9:16)`);
        }
      } else {
        addLog(`  💡 暂无任何媒体素材，自适应初始化画布尺寸：1080 x 1920 (9:16)`);
      }

      addLog(`✨ 成功装载 ${exportShots.length} 个镜头。开始进行剪映多轨时间轴毫秒级对准运算...`);

      // 时间轴核心运算 (单位: 微秒 us)
      let currentTimeUs = 0;
      const materialsVideos: any[] = [];
      const materialsAudios: any[] = [];
      const materialsTexts: any[] = [];
      const materialsSpeeds: any[] = [];
      const materialsAudioFades: any[] = [];

      const videoSegments: any[] = [];
      const text1Segments: any[] = []; // 场景画面描述文字
      const text2Segments: any[] = []; // 角色对白文本文字
      const audioSegments: any[] = []; // 对白逐行配音音频

      for (let i = 0; i < exportShots.length; i++) {
        const s = exportShots[i];
        const index = i + 1;
        const durationSec = s.duration || 5;
        const durationUs = durationSec * 1000000;

        addLog(`  → [分镜 #${index}] 时长: ${durationSec}秒 | 字数: ${(s.voiceover || s.dialogue || "").length} 字`);

        // --- 轨道 1: 分镜图片 / 分镜视频 ---
        const mediaUrl = s.videoUrl || s.imageUrl;
        let filename = "";
        let hasMedia = false;
        
        if (mediaUrl) {
          const extension = s.videoUrl ? "mp4" : "png";
          filename = `shot_${index}_media.${extension}`;
          hasMedia = true;

          // 尝试在客户端异步拉取媒体资源并打包到 ZIP 中
          try {
            addLog(`    [下载] 正在尝试拉取 镜头#${index} 媒体资源...`);
            const res = await fetch(mediaUrl, { mode: 'cors' });
            if (res.ok) {
              const blob = await res.blob();
              draftFolder.file(filename, blob);
              addLog(`    [打包] ✓ 镜头#${index} 媒体打包成功 (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
            } else {
              throw new Error(`HTTP ${res.status}`);
            }
          } catch (e: any) {
            addLog(`    [提醒] ⚠️ 镜头#${index} 因跨域(CORS)限制无法打包，草稿将直链在线URL：${mediaUrl.slice(0, 45)}...`);
            filename = mediaUrl; // 跨域回退使用在线地址
          }
        }

        const videoMatId = `mat-video-${s.id}`;
        materialsVideos.push({
          "id": videoMatId,
          "type": s.videoUrl ? "video" : "photo",
          "path": hasMedia && !filename.startsWith("http") 
            ? `${cleanDraftPath}/${draftName}/${filename}`
            : filename || "",
          "duration": durationUs,
          "width": canvasWidth,
          "height": canvasHeight,
          "fps": 30,
          "local_material_id": videoMatId,
          "extra_info": `镜头#${index}`
        });

        // 默认速度资产
        const speedMatId = `speed-${s.id}`;
        materialsSpeeds.push({
          "id": speedMatId,
          "type": "speed",
          "speed": 1.0
        });

        videoSegments.push({
          "id": `seg-video-${s.id}`,
          "material_id": videoMatId,
          "target_timerange": { "start": currentTimeUs, "duration": durationUs },
          "source_timerange": { "start": 0, "duration": durationUs },
          "extra_material_refs": [speedMatId],
          "speed": 1.0,
          "volume": 1.0,
          "visible": true
        });

        // --- 轨道 2: 场景画面描述文字 (白色, Heiti, 描黑边, 尺寸7.0) ---
        const promptText = s.sceneDescription || s.imagePrompt || "";
        const text1MatId = `mat-text1-${s.id}`;
        
        materialsTexts.push({
          "id": text1MatId,
          "type": "text",
          "content": JSON.stringify({
            "text": promptText,
            "styles": [
              {
                "range": [0, promptText.length],
                "fill": { "content": { "solid": { "color": [1.0, 1.0, 1.0] } } }, // 纯白
                "size": 7.0,
                "bold": false
              }
            ]
          }),
          "font_name": "",
          "font_size": 7.0,
          "text_color": "#FFFFFFFF",
          "border_color": "#000000FF",
          "border_width": 3.0,
          "has_shadow": false,
          "text_alignment": 1,
          "vertical": false
        });

        text1Segments.push({
          "id": `seg-text1-${s.id}`,
          "material_id": text1MatId,
          "target_timerange": { "start": currentTimeUs, "duration": durationUs },
          "source_timerange": { "start": 0, "duration": durationUs },
          "transform": {
            "scale": { "x": 1.0, "y": 1.0 },
            "translation": { "x": 0.0, "y": -0.55 }
          }
        });

        // --- 轨道 3: 对白字幕文字 (黄金色, Heiti, 描黑边, 加粗, 尺寸8.5) ---
        const dialogueText = s.voiceover || s.dialogue || "";
        const text2MatId = `mat-text2-${s.id}`;
        
        materialsTexts.push({
          "id": text2MatId,
          "type": "text",
          "content": JSON.stringify({
            "text": dialogueText,
            "styles": [
              {
                "range": [0, dialogueText.length],
                "fill": { "content": { "solid": { "color": [1.0, 0.84, 0.0] } } }, // 黄金台词色
                "size": 8.5,
                "bold": true
              }
            ]
          }),
          "font_name": "",
          "font_size": 8.5,
          "text_color": "#FFD700FF",
          "border_color": "#000000FF",
          "border_width": 3.5,
          "has_shadow": false,
          "text_alignment": 1,
          "vertical": false
        });

        text2Segments.push({
          "id": `seg-text2-${s.id}`,
          "material_id": text2MatId,
          "target_timerange": { "start": currentTimeUs, "duration": durationUs },
          "source_timerange": { "start": 0, "duration": durationUs },
          "transform": {
            "scale": { "x": 1.0, "y": 1.0 },
            "translation": { "x": 0.0, "y": -0.75 }
          }
        });

        // --- 轨道 4: 对白逐行配音音频 ---
        if (s.audioUrl) {
          const audioFilename = `shot_${index}_audio.mp3`;
          let hasAudio = false;

          try {
            addLog(`    [下载] 正在尝试拉取 镜头#${index} 语音配音...`);
            const res = await fetch(s.audioUrl, { mode: 'cors' });
            if (res.ok) {
              const blob = await res.blob();
              draftFolder.file(audioFilename, blob);
              addLog(`    [打包] ✓ 镜头#${index} 音频打包成功 (${(blob.size / 1024).toFixed(1)} KB)`);
              hasAudio = true;
            } else {
              throw new Error(`HTTP ${res.status}`);
            }
          } catch (e: any) {
            addLog(`    [提醒] ⚠️ 镜头#${index} 音频因CORS限制无法打包，草稿中将指向在线地址...`);
          }

          const audioMatId = `mat-audio-${s.id}`;
          materialsAudios.push({
            "id": audioMatId,
            "type": "audio",
            "path": hasAudio
              ? `${cleanDraftPath}/${draftName}/${audioFilename}`
              : s.audioUrl,
            "duration": durationUs,
            "local_material_id": audioMatId
          });

          // 默认音频淡入淡出资产
          const fadeMatId = `fade-${s.id}`;
          materialsAudioFades.push({
            "id": fadeMatId,
            "type": "audio_fade",
            "fade_in_duration": 0,
            "fade_out_duration": 0
          });

          audioSegments.push({
            "id": `seg-audio-${s.id}`,
            "material_id": audioMatId,
            "target_timerange": { "start": currentTimeUs, "duration": durationUs },
            "source_timerange": { "start": 0, "duration": durationUs },
            "extra_material_refs": [fadeMatId],
            "volume": 1.0
          });
        }

        // 时间轴向右推进
        currentTimeUs += durationUs;
      }

      // 组装并格式化 draft_content.json
      addLog(`🧱 正在整合组装最终的 draft_content.json 主时间轴数据...`);
      const draftContent = {
        "id": `jy-draft-${Date.now()}`,
        "name": draftName,
        "duration": currentTimeUs,
        "fps": 30,
        "canvas_config": {
          "width": canvasWidth,
          "height": canvasHeight,
          "ratio": canvasRatio
        },
        "platform": {
          "app_source": "lv",
          "app_version": "9.0.0",
          "os": "windows"
        },
        "tracks": [
          { "id": "track-video-storyboards", "type": "video", "segments": videoSegments },
          { "id": "track-text-prompts", "type": "text", "segments": text1Segments },
          { "id": "track-text-dialogues", "type": "text", "segments": text2Segments },
          { "id": "track-audio-voiceovers", "type": "audio", "segments": audioSegments }
        ].filter(t => t.segments.length > 0),
        "materials": {
          "videos": materialsVideos,
          "audios": materialsAudios,
          "texts": materialsTexts,
          "speeds": materialsSpeeds,
          "audio_fades": materialsAudioFades
        }
      };

      // 组装并格式化 draft_meta_info.json
      const draftMeta = {
        "id": draftContent.id,
        "draft_name": draftName,
        "draft_fold_path": `${cleanDraftPath}/${draftName}`,
        "draft_type": "strong",
        "create_time": Date.now(),
        "update_time": Date.now(),
        "draft_materials": [],
        "draft_remore_material": []
      };

      // 写入 JSON 文件到 ZIP 中的子文件夹内
      draftFolder.file("draft_content.json", JSON.stringify(draftContent, null, 2));
      draftFolder.file("draft_meta_info.json", JSON.stringify(draftMeta, null, 2));

      // 写入说明文档到 ZIP 中
      const readmeText = `🎬【创世纪联盟智能写作】剪映原生草稿导入说明文档 🎬

导出项目名称: ${draftName}
计算总镜头数: ${exportShots.length} 个
时间轴总长度: ${(currentTimeUs / 1000000).toFixed(1)} 秒
剪映保存路径: ${cleanDraftPath}/${draftName}

========================= 导入核心步骤 =========================

第一步：一键定位剪映草稿箱
1. 打开 Windows 文件资源管理器（快捷键 Win + R）
2. 在运行窗口中，复制并粘贴下面的路径并点击确定：
   ${cleanDraftPath}

第二步：一键拖入解压
1. 直接将本压缩包内的文件夹【${draftName}】整部解压，或者拖拽到上面的剪映草稿目录（com.lanying.editor.draft）下即可。
2. 解压完成后，确保您能在草稿文件夹内看到：
   └─ com.lanying.editor.draft/
      └─ ${draftName}/
         ├─ draft_content.json
         ├─ draft_meta_info.json
         ├─ shot_1_media.mp4
         └─ ... 其他图片/音视频素材

第三步：重新打开剪映
1. 启动（若已打开，请先重启）您的【剪映专业版】电脑版软件。
2. 您的草稿箱列表中将瞬间刷出并出现一个名为“${draftName}”的完整双语字幕音频轨道草稿！
3. 双击直接点开，尽享多轨智能剪辑快感！

感谢您使用创世纪联盟智能写作平台，期待您产出优秀的视频爆款！✨
`;
      zip.file("1-导入说明_解压此包至剪映草稿箱.txt", readmeText);

      addLog(`📦 正在生成最终的 ZIP 压缩包 (内部已自动对齐短剧专属项目文件夹)...`);
      const content = await zip.generateAsync({ type: "blob" });

      addLog(`💾 正在向浏览器推送下载草稿包文件...`);
      const url = window.URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${draftName}_剪映一键导入包.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      addLog(`✓ 恭喜！【剪映一键草稿包】已成功打包并下载完成！`);
    } catch (e: any) {
      console.error(e);
      addLog(`✗ 导出失败: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>🎬 剪映一键草稿导出系统</span>
            <span className="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded font-normal uppercase">CapCut/JianYing Draft Importer</span>
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            将短剧多轨道（画面描述字幕、对白字幕、分镜原画及AI配音）一键打包为剪映原生草稿文件夹，解压即剪！
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧配置栏 */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-violet-500/20 via-violet-500 to-violet-500/20" />
            
            <h3 className="text-sm font-bold text-gray-200 flex items-center gap-1.5 pb-2 border-b border-white/5">
              <span>⚙️ 导出配置</span>
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">导出范围</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setExportScope('episode')}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                      exportScope === 'episode'
                        ? "bg-violet-600/20 border-violet-500 text-violet-300 shadow-md shadow-violet-500/10"
                        : "bg-white/5 text-gray-400 border-white/5 hover:bg-white/10"
                    }`}
                  >
                    当前选中单集
                  </button>
                  <button
                    onClick={() => setExportScope('full')}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                      exportScope === 'full'
                        ? "bg-violet-600/20 border-violet-500 text-violet-300 shadow-md shadow-violet-500/10"
                        : "bg-white/5 text-gray-400 border-white/5 hover:bg-white/10"
                    }`}
                  >
                    整部所有剧集
                  </button>
                </div>
              </div>

              {exportScope === 'episode' && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5">选择集数</label>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1 bg-black/20 rounded-lg">
                    {drama.episodes.map((ep: any) => (
                      <button
                        key={ep.id}
                        onClick={() => onSelectEpisode(ep)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                          selectedEpisode?.id === ep.id
                            ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                            : "bg-white/5 text-gray-400 hover:bg-white/10 border border-white/8"
                        }`}
                      >
                        第{ep.episodeNumber || ep.index || 1}集
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">
                  自动检查：本地剪映草稿箱保存路径
                </label>
                <input
                  type="text"
                  value={customPath}
                  onChange={e => setCustomPath(e.target.value)}
                  placeholder="正在自动检查..."
                  className="w-full text-xs font-semibold bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-all placeholder:text-gray-600"
                />
                <div className="mt-1.5 flex items-center justify-between text-[10px]">
                  <span className="text-gray-500">
                    {pathExists ? "✓ 系统已成功为您检测到本地剪映保存位置" : "⚠ 未自动扫到目录，可手动修改路径"}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded font-bold ${pathExists ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                    {pathExists ? "已连接" : "待确认"}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">草稿项目名称（即解压后文件夹名）</label>
                <input
                  type="text"
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  placeholder="请输入草稿文件夹名称"
                  className="w-full text-xs font-semibold bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-violet-500 transition-all"
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={handleExport}
                  disabled={exporting || shotsLoading || (exportScope === 'episode' && !selectedEpisode)}
                  className="w-full py-3.5 text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-violet-900/30 active:scale-98"
                >
                  {exporting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      正在打包全剧资源并对齐轨道...
                    </>
                  ) : (
                    <>🎁 一键打包导出整部/分集剪映草稿包 (.zip)</>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* 执行日志 */}
          {logs.length > 0 && (
            <div className="p-4 rounded-2xl bg-black/60 border border-white/10 font-mono text-[10px] text-gray-300 space-y-1 max-h-60 overflow-y-auto shadow-inner">
              <div className="text-[9px] text-gray-500 pb-1.5 border-b border-white/5 mb-1.5 font-sans font-bold uppercase flex justify-between">
                <span>📋 导出日志流水线</span>
                <span>Zip Pack Log</span>
              </div>
              {logs.map((log, idx) => (
                <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右侧原理轨道预览 */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-2xl bg-[#1e133a]/30 border border-violet-500/10 space-y-5 shadow-xl relative overflow-hidden">
            <h3 className="text-sm font-bold text-violet-300 flex items-center gap-1.5 pb-2 border-b border-white/5">
              <span>🎯 剪映多轨道完美映射关系（无缝对齐）</span>
            </h3>

            <div className="space-y-3.5 text-xs">
              <div className="p-3.5 rounded-xl bg-white/4 border border-white/8 flex items-start gap-3">
                <span className="text-base bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-lg font-bold">轨道 1</span>
                <div>
                  <h4 className="font-bold text-gray-200">🎬 视频层（分镜图片 / 视频媒体）</h4>
                  <p className="text-[11px] text-gray-400 mt-1">
                    系统将自动对齐每个镜头的**时长**，如果是动态分镜视频则导入视频，如果是图片则作为固定帧导入，自动平铺铺满。
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/4 border border-white/8 flex items-start gap-3">
                <span className="text-base bg-green-500/20 text-green-300 px-2.5 py-1 rounded-lg font-bold font-mono">轨道 2</span>
                <div>
                  <h4 className="font-bold text-gray-200">📝 文本字幕层（场景描述画面 prompt 提示词）</h4>
                  <p className="text-[11px] text-gray-400 mt-1 flex flex-col gap-1">
                    <span>自动将分镜中的画面描述文字提取成**独立白色字幕文本段**，与当前镜头时长 1:1 贴合。</span>
                    <span className="text-emerald-400 font-bold font-mono">符合要求：黑体(Heiti)、描黑边(3.0)、大小(7.0px)</span>
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/4 border border-white/8 flex items-start gap-3">
                <span className="text-base bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-lg font-bold font-mono">轨道 3</span>
                <div>
                  <h4 className="font-bold text-gray-200">✍️ 文本字幕层（角色配音对白字幕）</h4>
                  <p className="text-[11px] text-gray-400 mt-1 flex flex-col gap-1">
                    <span>自动将该镜头的对白台词生成**金色加粗字幕段**，与镜头时间轴无缝贴合。</span>
                    <span className="text-amber-400 font-bold font-mono">符合要求：黑体(Heiti)、描黑边(3.5)、加粗、大小(8.5px)</span>
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/4 border border-white/8 flex items-start gap-3">
                <span className="text-base bg-red-500/20 text-red-300 px-2.5 py-1 rounded-lg font-bold font-mono">轨道 4</span>
                <div>
                  <h4 className="font-bold text-gray-200">🎵 音频层（逐镜头对白原声音频）</h4>
                  <p className="text-[11px] text-gray-400 mt-1">
                    如果您生成了分镜的**AI配音**，系统会自动把 `.mp3` 配音音频文件导入到音频轨道，并自动与其金色台词字幕完全对齐播放。
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-xs flex items-start gap-2.5 leading-relaxed">
              <span className="text-base">💡</span>
              <p>
                **贴心提醒**：
                有些大视频/大音频素材可能因为后台服务器配置了 CDN 防盗链或不支持 CORS 跨域，在客户端打包时会自动转成**在线连接**。您将压缩包解压入草稿夹后直接打开剪映，即使部分素材是空的，它们在时间轴上的**文本字幕、时长以及对白配音文本轨道依然处于完美对齐状态**，您可以直接往该位置拖入自己的素材进行剪辑！
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
