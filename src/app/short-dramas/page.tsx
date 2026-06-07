"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken as getAuthToken } from "@/lib/get-token";
import { getCategoryLabel } from "@/lib/category";
import { broadcastDataChange, onDataChange } from "@/lib/data-sync";

interface ShortDrama {
  id: string;
  novelId: string | null;
  scriptId: string | null;
  novelTitle: string | null;
  title: string;
  description: string | null;
  genre: string | null;
  totalEpisodes: number;
  currentEpisodes: number;
  status: string;
  style: string | null;
  platform: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function ShortDramasPage() {
  const router = useRouter();
  const [dramas, setDramas] = useState<ShortDrama[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const getToken = useCallback(() => getAuthToken(), []);

  const fetchDramas = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/short-dramas", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setDramas(data.data.dramas || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/short-dramas/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        const d = data.data;
        let msg = `同步完成！共${d.totalNovels}部小说，新建${d.created}部短剧${d.existed > 0 ? `，已有${d.existed}部` : ''}${d.failed > 0 ? `，失败${d.failed}` : ''}`;
        if (d.errors?.length > 0) msg += `\n错误详情: ${d.errors.join('; ')}`;
        setSyncMsg(msg);
        // 无论是否有新建都刷新列表
        fetchDramas();
      } else {
        setSyncMsg(`同步失败: ${data.error || '未知错误'}`);
      }
    } catch (e: any) {
      console.error('同步失败:', e);
      setSyncMsg(`同步出错: ${e.message || '网络错误'}`);
    }
    finally { setSyncing(false); }
  };

  useEffect(() => {
    fetchDramas();
  }, [fetchDramas]);

  useEffect(() => {
    const cleanup = onDataChange((e) => {
      if (e.type === 'short-drama' || e.type === 'novel') fetchDramas();
    });
    return cleanup;
  }, [fetchDramas]);

  // 页面加载自动同步一次
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!syncedRef.current) {
      syncedRef.current = true;
      handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (drama: ShortDrama) => {
    if (!confirm(`确定要删除《${drama.title}》吗？`)) return;
    try {
      await fetch(`/api/short-dramas/${drama.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      broadcastDataChange({ type: 'short-drama', action: 'delete', id: drama.id });
      fetchDramas();
    } catch (e) { console.error(e); }
  };

  const statusMap: Record<string, { label: string; color: string }> = {
    draft: { label: "草稿", color: "bg-gray-500/20 text-gray-400" },
    generating: { label: "生成中", color: "bg-blue-500/20 text-blue-400" },
    completed: { label: "已完成", color: "bg-green-500/20 text-green-400" },
    published: { label: "已发布", color: "bg-emerald-500/20 text-emerald-400" },
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #0d1b2a 100%)' }}>
      {/* 背景装饰 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-pink-600/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-0 w-64 h-64 bg-purple-600/6 rounded-full blur-3xl" />
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
            <Link href="/scripts" className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 border border-amber-500/25 text-amber-400 rounded-lg hover:bg-amber-500/25 transition-colors text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
              我的剧本
            </Link>
          </div>
          <div className="flex items-center gap-1 px-4 py-2 rounded-xl border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
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
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-pink-500/30 border border-violet-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">我的短剧</h1>
            </div>
            <p className="text-gray-500 text-sm ml-1">共 {dramas.length} 部短剧 · 智能驱动的短剧制作工作台</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl transition-all disabled:opacity-50 font-semibold"
            >
              {syncing ? <div className="w-3.5 h-3.5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" /> : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
              {syncing ? '同步中...' : '同步小说'}
            </button>
          </div>
        </div>

        {/* 同步提示 */}
        {syncMsg && (
          <div className={`mb-4 p-3 rounded-xl text-xs flex items-center justify-between ${syncMsg.includes('失败') || syncMsg.includes('出错') ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'}`}>
            <span>{syncMsg}</span>
            <button onClick={() => setSyncMsg(null)} className="opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* 短剧列表 */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full" />
          </div>
        ) : dramas.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🎥</div>
            <h3 className="text-lg font-semibold text-white mb-2">还没有短剧</h3>
            <p className="text-gray-400 mb-6">同步你的小说库，从小说到成片一键完成</p>
            <button onClick={handleSync} disabled={syncing} className="px-6 py-3 text-sm font-medium bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white rounded-xl shadow-lg shadow-violet-500/25 disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer transition-all">
              {syncing ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              {syncing ? '同步小说中...' : '一键同步小说创建短剧'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {dramas.map((d) => (
              <div key={d.id} className="group backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden hover:border-violet-500/30 transition-all duration-300" style={{ background: 'rgba(255,255,255,0.04)' }}>
                {/* 封面占位 */}
                <div className="h-36 bg-gradient-to-br from-violet-600/20 to-pink-600/20 flex items-center justify-center relative">
                  <span className="text-5xl opacity-60">🎬</span>
                  <div className="absolute top-3 right-3">
                    <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${statusMap[d.status]?.color || 'bg-gray-500/20 text-gray-400'}`}>
                      {statusMap[d.status]?.label || d.status}
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  <h3 className="text-base font-bold text-white truncate">《{d.title}》</h3>
                  {d.genre && <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 mt-1">{getCategoryLabel(d.genre)}</span>}
                  {d.description && <p className="text-xs text-gray-400 mt-2 line-clamp-2">{d.description}</p>}

                  {/* 关联信息 */}
                  {d.novelId && (
                    <div className="mt-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
                      <div className="text-[10px] text-amber-400/80 mb-1">关联小说</div>
                      <div className="text-xs text-white font-medium truncate">{d.novelTitle ? `《${d.novelTitle}》` : d.novelId}</div>
                      <div className="flex gap-1.5 mt-1.5">
                        <Link href={`/novel-generator?novelId=${d.novelId}`}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                          onClick={e => e.stopPropagation()}>
                          小说
                        </Link>
                        {d.scriptId ? (
                          <Link href={`/script?novelId=${d.novelId}`}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                            onClick={e => e.stopPropagation()}>
                            剧本
                          </Link>
                        ) : (
                          <Link href={`/script?novelId=${d.novelId}`}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-500 hover:bg-gray-500/30 transition-colors"
                            onClick={e => e.stopPropagation()}>
                            生成剧本
                          </Link>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    <span>📺 {d.currentEpisodes}/{d.totalEpisodes} 集</span>
                    {d.platform && <span>📱 {d.platform}</span>}
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
                    <Link
                      href={`/short-dramas/${d.id}`}
                      className="flex-1 text-center py-2 text-xs font-medium bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-all"
                    >
                      进入工作台
                    </Link>
                    <button
                      onClick={() => handleDelete(d)}
                      className="px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
