"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/get-token";
import { broadcastDataChange, onDataChange } from "@/lib/data-sync";

interface ScriptItem {
  id: string;
  novelId: string;
  novelTitle: string;
  dramaId: string | null;
  status: string;
  chapterCount: number;
  hasScreenplay: boolean;
  hasImagePrompts: boolean;
  hasVideoPrompts: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export default function ScriptsPage() {
  const router = useRouter();
  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchScripts = () => {
    const token = getToken();
    if (!token) { router.push("/auth/login"); return; }
    fetch("/api/scripts", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setScripts(data.data || []);
        } else {
          console.error('[Scripts] API返回失败:', data);
          setError(data.error || '获取剧本列表失败');
        }
      })
      .catch(e => {
        console.error('[Scripts] 请求失败:', e);
        setError(e.message || '网络错误');
      })
      .finally(() => setLoading(false));
  };

  const handleDelete = async (e: React.MouseEvent, scriptId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确定要删除这个剧本吗？')) return;
    setDeleting(scriptId);
    try {
      const token = getToken();
      const res = await fetch(`/api/novel/script?scriptId=${scriptId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        broadcastDataChange({ type: 'script', action: 'delete', id: scriptId });
        setScripts(prev => prev.filter(s => s.id !== scriptId));
      } else {
        alert(data.error || '删除失败');
      }
    } catch (e: any) {
      alert(e.message || '删除失败');
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    fetchScripts();
  }, []);

  useEffect(() => {
    const cleanup = onDataChange((e) => {
      if (e.type === 'script' || e.type === 'novel') fetchScripts();
    });
    return cleanup;
  }, []);

  const statusMap: Record<string, { label: string; color: string }> = {
    draft: { label: "草稿", color: "bg-gray-500/20 text-gray-400" },
    generating: { label: "生成中", color: "bg-blue-500/20 text-blue-400" },
    completed: { label: "已完成", color: "bg-green-500/20 text-green-400" },
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #0d1b2a 100%)' }}>
      {/* 背景装饰 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-600/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-orange-600/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-0 w-64 h-64 bg-yellow-600/6 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 backdrop-blur-xl" style={{ background: 'rgba(15,12,41,0.8)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/novel-generator" className="flex items-center gap-2 text-gray-400 hover:text-purple-400 transition-colors text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              创作中心
            </Link>
            <Link href="/my-novels" className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/15 border border-purple-500/25 text-purple-400 rounded-lg hover:bg-purple-500/25 transition-colors text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              我的小说
            </Link>
            <Link href="/short-dramas" className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/15 border border-violet-500/25 text-violet-400 rounded-lg hover:bg-violet-500/25 transition-colors text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              短剧制作
            </Link>
          </div>
          <div className="flex items-center gap-1 px-4 py-2 rounded-xl border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
            <span className="text-white font-bold text-sm">创世纪联盟</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/member" className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 transition-colors text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              会员中心
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-10">
        {/* 页面标题区 */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-500/30 border border-amber-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">我的剧本</h1>
            </div>
            <p className="text-gray-500 text-sm ml-1">共 {scripts.length} 部剧本 · 基于小说生成的剧本工坊</p>
          </div>
          <Link
            href="/my-novels"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white text-sm transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/20"
            style={{ background: 'linear-gradient(135deg, #d97706, #ea580c)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            从小说生成剧本
          </Link>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-500/15 text-red-400 border border-red-500/20 text-sm">
            获取剧本列表出错: {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full" />
          </div>
        ) : scripts.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🎬</div>
            <h3 className="text-xl font-bold text-white mb-2">暂无剧本</h3>
            <p className="text-gray-400 mb-6">先创作小说，然后在小说库中生成剧本</p>
            <Link href="/my-novels" className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl font-medium hover:from-amber-600 hover:to-orange-700 transition-all">
              前往小说库
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scripts.map(s => {
              const st = statusMap[s.status] || statusMap.draft;
              return (
                <Link
                  key={s.id}
                  href={`/script?novelId=${s.novelId}`}
                  className="group relative rounded-2xl border border-white/10 hover:border-amber-500/40 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-300 overflow-hidden"
                >
                  {/* 顶部渐变条 */}
                  <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                  <div className="p-5">
                    {/* 小说标题 */}
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-white font-bold text-lg leading-tight line-clamp-1 group-hover:text-amber-300 transition-colors">
                        {s.novelTitle ? `《${s.novelTitle}》` : '未知小说'}
                      </h3>
                      <span className={`shrink-0 ml-2 px-2 py-0.5 text-[10px] rounded-full font-medium ${st.color}`}>
                        {st.label}
                      </span>
                    </div>

                    {/* 统计 */}
                    <div className="flex items-center gap-3 mb-4 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        {s.chapterCount} 章
                      </span>
                      {s.hasScreenplay && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          剧本
                        </span>
                      )}
                      {s.hasImagePrompts && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                          图片提示词
                        </span>
                      )}
                      {s.hasVideoPrompts && (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                          视频提示词
                        </span>
                      )}
                    </div>

                    {/* 一站式状态 */}
                    <div className="flex items-center gap-1 mb-3 text-[9px]">
                      <span className="px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">小说 ✓</span>
                      <span className="text-gray-600">→</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">剧本 ✓</span>
                      <span className="text-gray-600">→</span>
                      <span className={`px-1.5 py-0.5 rounded-full ${s.dramaId ? 'bg-violet-500/20 text-violet-400' : 'bg-gray-500/15 text-gray-600'}`}>
                        短剧 {s.dramaId ? '✓' : ''}
                      </span>
                    </div>

                    {/* 底部信息 */}
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <div className="flex items-center gap-2">
                        <span>{new Date(s.createdAt).toLocaleDateString('zh-CN')}</span>
                        {s.dramaId && (
                          <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); window.location.href = `/short-dramas/${s.dramaId}`; }}
                            className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 text-[9px] transition-colors cursor-pointer">
                            进入短剧
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleDelete(e, s.id)}
                          disabled={deleting === s.id}
                          className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 hover:bg-red-500/30 text-[9px] opacity-0 group-hover:opacity-100 transition-all"
                        >
                          {deleting === s.id ? '删除中...' : '删除'}
                        </button>
                        <span className="text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          打开工坊
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
