"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getCategoryLabel } from "@/lib/category";
import { getToken as getAuthToken } from "@/lib/get-token";
import { broadcastDataChange, onDataChange } from "@/lib/data-sync";

const cleanCharName = (name: string) =>
  name ? name.replace(/\s*[—–\-]+\s*【.*$/, '').replace(/\s*【.*$/, '').trim() : name;

interface AdminNovel {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  currentChapters: number;
  totalChapters: number;
  ownerName: string;
  ownerEmail: string;
  scriptId: string | null;
  dramaId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface NovelPlot {
  id: string;
  mainPlot: string | null;
  emotionalCurve: string | null;
  keyConflicts: string | null;
}

interface NovelChapterHook {
  id: string;
  chapterNumber: number;
  title: string | null;
  hook: string | null;
  status: string | null;
}

interface NovelCharacter {
  id: string;
  name: string;
  role: string | null;
  description: string | null;
  personality: string | null;
  appearance: string | null;
  background: string | null;
  relationships: string | null;
}

interface NovelScene {
  id: string;
  name: string;
  description: string | null;
  atmosphere: string | null;
  relatedChapters: string | null;
}

interface NovelItem {
  id: string;
  name: string;
  description: string | null;
  significance: string | null;
  relatedChapters: string | null;
}

interface NovelCharacterRelationship { id: string; fromCharacter: string; toCharacter: string; relationship: string | null; sortOrder: number; }

interface NovelDetails {
  plot: NovelPlot | null;
  hooks: NovelChapterHook[];
  characters: NovelCharacter[];
  scenes: NovelScene[];
  items: NovelItem[];
  relationships: NovelCharacterRelationship[];
}

export default function AdminNovelsPage() {
  const router = useRouter();
  const [novels, setNovels] = useState<AdminNovel[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const [editModal, setEditModal] = useState<{ visible: boolean; novel: AdminNovel | null }>({ visible: false, novel: null });
  const [editForm, setEditForm] = useState({ title: "", description: "", status: "", totalChapters: 0, currentChapters: 0 });
  const [saving, setSaving] = useState(false);

  const [detailModal, setDetailModal] = useState<{ visible: boolean; novel: AdminNovel | null }>({ visible: false, novel: null });
  const [novelDetails, setNovelDetails] = useState<NovelDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'info' | 'plot' | 'hooks' | 'characters' | 'relationships' | 'scenes' | 'items' | 'chapters'>('info');

  const [detailEditEntity, setDetailEditEntity] = useState<{ type: 'character' | 'scene' | 'item'; data: any } | null>(null);
  const [detailEditForm, setDetailEditForm] = useState<any>({});
  const [detailEditSaving, setDetailEditSaving] = useState(false);
  const [resyncingChars, setResyncingChars] = useState(false);

  const getToken = useCallback(() => getAuthToken(), []);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [novelChapters, setNovelChapters] = useState<any[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [editingChapterIdx, setEditingChapterIdx] = useState<number | null>(null);
  const [editingChapterContent, setEditingChapterContent] = useState('');
  const [savingChapter, setSavingChapter] = useState(false);

  const fetchNovels = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/admin/novels?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      console.log('[Admin Novels Page] API响应:', JSON.stringify(data).slice(0, 500));
      if (data.success) {
        setNovels(data.data.novels || []);
        setPagination(data.data.pagination);
      } else {
        console.error('[Admin Novels Page] API返回失败:', data);
        setError(data.error || `API返回失败 (${res.status})`);
      }
    } catch (err: any) {
      console.error("获取小说列表失败:", err);
      setError(err.message || "网络错误");
    } finally {
      setLoading(false);
    }
  }, [getToken, router, page, search, statusFilter]);

  useEffect(() => {
    fetchNovels();
  }, [fetchNovels]);

  const refreshNovelDetails = useCallback(async (novelId: string) => {
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/novels/${novelId}/details`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setNovelDetails(data.data);
    } catch (e) { console.error('刷新小说详情失败:', e); }
  }, [getToken]);

  useEffect(() => {
    const cleanup = onDataChange((e) => {
      if (e.type === 'novel') {
        fetchNovels();
        if (detailModal.visible && detailModal.novel?.id && e.id && detailModal.novel.id === e.id) refreshNovelDetails(e.id!);
      }
    });
    return cleanup;
  }, [fetchNovels, detailModal, refreshNovelDetails]);

  const openEditModal = (novel: AdminNovel) => {
    setEditForm({
      title: novel.title,
      description: novel.description || "",
      status: novel.status,
      totalChapters: novel.totalChapters,
      currentChapters: novel.currentChapters,
    });
    setEditModal({ visible: true, novel });
  };

  const handleSave = async () => {
    if (!editModal.novel) return;
    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/novels/${editModal.novel.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.success) {
        setEditModal({ visible: false, novel: null });
        fetchNovels();
      }
    } catch (error) {
      console.error("保存失败:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (novel: AdminNovel) => {
    if (!confirm(`确定要删除小说《${novel.title}》吗？此操作不可恢复！`)) return;
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/novels/${novel.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        broadcastDataChange({ type: 'novel', action: 'delete', id: novel.id });
        fetchNovels();
      }
    } catch (error) {
      console.error("删除失败:", error);
    }
  };

  const handleBatchDelete = async () => {
    const toDelete = [...selectedIds];
    if (!toDelete.length) return;
    if (!confirm(`确定要删除选中的 ${toDelete.length} 部小说吗？此操作不可恢复！`)) return;
    setBatchDeleting(true);
    try {
      const token = getToken();
      for (const id of toDelete) {
        try { await fetch(`/api/admin/novels/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); } catch {}
      }
      broadcastDataChange({ type: 'novel', action: 'delete', id: toDelete[0] });
      setSelectedIds(new Set());
      fetchNovels();
    } finally { setBatchDeleting(false); }
  };

  const fetchNovelChapters = async (novelId: string) => {
    setChaptersLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/novels/${novelId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setNovelChapters(Array.isArray(data.data.chapters) ? data.data.chapters : []);
    } catch (e) { console.error('获取章节失败:', e); }
    finally { setChaptersLoading(false); }
  };

  const handleChapterSave = async () => {
    if (editingChapterIdx === null || !detailModal.novel) return;
    setSavingChapter(true);
    try {
      const token = getToken();
      const updated = [...novelChapters];
      updated[editingChapterIdx] = { ...updated[editingChapterIdx], content: editingChapterContent };
      const res = await fetch(`/api/admin/novels/${detailModal.novel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chapters: updated }),
      });
      const result = await res.json();
      if (result.success) { setNovelChapters(updated); setEditingChapterIdx(null); }
    } finally { setSavingChapter(false); }
  };

  const openDetailModal = async (novel: AdminNovel) => {
    setDetailModal({ visible: true, novel });
    setDetailTab('info');
    setNovelDetails(null);
    setNovelChapters([]);
    setEditingChapterIdx(null);
    setDetailsLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/novels/${novel.id}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setNovelDetails(data.data);
      }
    } catch (e) {
      console.error('获取小说详情失败:', e);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleNovelDetailSave = async () => {
    if (!detailEditEntity || !detailModal.novel) return;
    setDetailEditSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/novels/${detailModal.novel.id}/details`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: detailEditEntity.type, entityId: detailEditEntity.data.id, data: detailEditForm }),
      });
      const result = await res.json();
      if (result.success) {
        broadcastDataChange({ type: 'novel', action: 'update', id: detailModal.novel.id });
        await refreshNovelDetails(detailModal.novel.id);
        setDetailEditEntity(null);
      }
    } finally { setDetailEditSaving(false); }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: "bg-green-100 text-green-800 ring-1 ring-green-200",
      generating: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
      draft: "bg-white/10 text-gray-300 ring-1 ring-white/20",
    };
    const labelMap: Record<string, string> = {
      completed: "已完成",
      generating: "生成中",
      draft: "草稿",
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${map[status] || "bg-white/10 text-gray-300"}`}>
        {labelMap[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* 搜索和筛选 */}
      <div className="backdrop-blur-xl rounded-2xl p-5 border border-white/10" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="搜索小说标题或简介..."
              className="w-full pl-10 pr-10 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white/5 text-white placeholder-gray-500 transition-all"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
            {search && (
              <button
                onClick={() => { setSearch(""); setPage(1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <select
            className="px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white/5 text-gray-300 transition-all text-sm"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">全部状态</option>
            <option value="completed">已完成</option>
            <option value="generating">生成中</option>
            <option value="draft">草稿</option>
          </select>
        </div>
      </div>

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-purple-500/20" style={{ background: 'rgba(124,58,237,0.06)' }}>
          <span className="text-sm text-gray-300 font-medium">已选 {selectedIds.size} 部小说</span>
          <div className="flex-1" />
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-all">取消选择</button>
          <button onClick={handleBatchDelete} disabled={batchDeleting} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 disabled:opacity-50 transition-all">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            {batchDeleting ? '删除中...' : `删除选中 (${selectedIds.size})`}
          </button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/15 text-red-400 border border-red-500/20 text-sm flex items-center justify-between">
          <span>获取小说数据失败: {error}</span>
          <button onClick={fetchNovels} className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs transition-colors">重试</button>
        </div>
      )}

      {/* 小说列表 */}
      <div className="backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <th className="w-10 px-3 py-4 text-center">
                  <input type="checkbox" checked={novels.length > 0 && selectedIds.size === novels.length} onChange={(e) => setSelectedIds(e.target.checked ? new Set(novels.map(n => n.id)) : new Set())} className="w-4 h-4 rounded accent-purple-500 cursor-pointer" />
                </th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">标题</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">作者</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">分类</th>
                <th className="text-center px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">章节</th>
                <th className="text-center px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                <th className="text-center px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">打通状态</th>
                <th className="text-right px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">更新时间</th>
                <th className="text-center px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full" />
                      <span className="text-sm text-gray-400">加载中...</span>
                    </div>
                  </td>
                </tr>
              ) : novels.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      <span className="text-sm text-gray-400">暂无小说</span>
                    </div>
                  </td>
                </tr>
              ) : (
                novels.map((novel, index) => (
                  <tr key={novel.id} className={`border-b border-white/5 transition-colors duration-150 ${selectedIds.has(novel.id) ? 'bg-purple-500/10' : 'hover:bg-white/5'}`}>
                    <td className="px-3 py-4 w-10 text-center">
                      <input type="checkbox" checked={selectedIds.has(novel.id)} onChange={() => setSelectedIds(prev => { const next = new Set(prev); if (next.has(novel.id)) next.delete(novel.id); else next.add(novel.id); return next; })} className="w-4 h-4 rounded accent-purple-500 cursor-pointer" />
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => openDetailModal(novel)}
                        className="text-blue-600 hover:text-blue-800 font-medium text-sm text-left hover:underline transition-all"
                      >
                        《{novel.title}》
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {novel.ownerName?.[0] || "?"}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-200">{novel.ownerName}</div>
                          <div className="text-xs text-gray-400">{novel.ownerEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 bg-white/10 text-gray-300 rounded-lg text-xs font-medium">
                        {getCategoryLabel(novel.category)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="text-sm font-medium text-gray-200">
                        {novel.currentChapters}
                        <span className="text-gray-400 mx-0.5">/</span>
                        {novel.totalChapters}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">{getStatusBadge(novel.status)}</td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-[9px]">
                        <span className="px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">小说✓</span>
                        <span className="text-gray-600">→</span>
                        <span className={`px-1 py-0.5 rounded ${novel.scriptId ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/15 text-gray-600'}`}>
                          剧本{novel.scriptId ? '✓' : ''}
                        </span>
                        <span className="text-gray-600">→</span>
                        <span className={`px-1 py-0.5 rounded ${novel.dramaId ? 'bg-violet-500/20 text-violet-400' : 'bg-gray-500/15 text-gray-600'}`}>
                          短剧{novel.dramaId ? '✓' : ''}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-500 text-right whitespace-nowrap">
                      {new Date(novel.updatedAt).toLocaleDateString("zh-CN")}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(novel)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 hover:text-blue-700 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(novel)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 hover:text-red-700 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-white/10 bg-white/3">
            <span className="text-sm text-gray-500">
              共 <span className="font-medium text-white">{pagination.total}</span> 部小说
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="inline-flex items-center gap-1 px-3.5 py-2 text-sm border border-white/15 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10 hover:border-white/25 transition-all bg-white/5 text-gray-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                上一页
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                  const start = Math.max(1, page - 2);
                  const pageNum = start + i;
                  if (pageNum > pagination.totalPages) return null;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 text-sm rounded-lg transition-all ${
                        pageNum === page
                          ? "bg-purple-600 text-white shadow-sm shadow-purple-500/20"
                          : "text-gray-400 hover:bg-white/10"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="inline-flex items-center gap-1 px-3.5 py-2 text-sm border border-white/15 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10 hover:border-white/25 transition-all bg-white/5 text-gray-300"
              >
                下一页
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 编辑弹窗 */}
      {editModal.visible && editModal.novel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditModal({ visible: false, novel: null })}>
          <div className="backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 animate-in border border-white/10" style={{ background: 'rgba(15,12,41,0.95)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">编辑小说 —《{editModal.novel.title}》</h3>
              <button
                onClick={() => setEditModal({ visible: false, novel: null })}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1.5">标题</label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white/5 text-white transition-all"
                  value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1.5">简介</label>
                <textarea
                  rows={3}
                  className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white/5 text-white transition-all resize-none"
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">状态</label>
                  <select
                    className="w-full px-3 py-2.5 border border-white/15 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white/5 transition-all"
                    value={editForm.status}
                    onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  >
                    <option value="draft">草稿</option>
                    <option value="generating">生成中</option>
                    <option value="completed">已完成</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">总章节</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-2.5 border border-white/15 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white/5 transition-all"
                    value={editForm.totalChapters}
                    onChange={e => setEditForm(f => ({ ...f, totalChapters: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">已生成</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white/5 text-white transition-all"
                    value={editForm.currentChapters}
                    onChange={e => setEditForm(f => ({ ...f, currentChapters: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-white/10">
              <button
                onClick={() => setEditModal({ visible: false, novel: null })}
                className="px-5 py-2.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 shadow-sm shadow-blue-500/20 transition-all"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    保存中...
                  </span>
                ) : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 详情内编辑覆盖层 */}
      {detailEditEntity && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && setDetailEditEntity(null)}>
          <div className="bg-[#1a1040] border border-white/15 rounded-2xl p-6 w-full max-w-[480px] max-h-[80vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">✏️ 编辑{detailEditEntity.type === 'character' ? '角色' : detailEditEntity.type === 'scene' ? '场景' : '物品'}</h3>
              <button onClick={() => setDetailEditEntity(null)} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
            </div>
            {detailEditEntity.type === 'character' && (<>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-xs text-gray-400">角色名 *</label><input type="text" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-violet-500" value={detailEditForm.name || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, name: e.target.value }))} /></div>
                <div className="space-y-1"><label className="text-xs text-gray-400">角色类型</label><select className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-[#1a1040] text-white focus:outline-none" value={detailEditForm.role || 'supporting'} onChange={e => setDetailEditForm((f: any) => ({ ...f, role: e.target.value }))}><option value="protagonist">主角</option><option value="antagonist">反派</option><option value="supporting">配角</option></select></div>
              </div>
              <div className="space-y-1"><label className="text-xs text-gray-400">角色描述</label><textarea rows={4} className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none focus:border-violet-500" placeholder="介绍角色背景、身份、故事..." value={detailEditForm.description || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, description: e.target.value }))} /></div>
              <div className="space-y-1"><label className="text-xs text-gray-400">性格特点</label><input type="text" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-violet-500" value={detailEditForm.personality || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, personality: e.target.value }))} /></div>
              <div className="space-y-1"><label className="text-xs text-gray-400">外貌描述</label><textarea rows={2} className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none focus:border-violet-500" value={detailEditForm.appearance || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, appearance: e.target.value }))} /></div>
              <div className="space-y-1"><label className="text-xs text-gray-400">背景故事</label><textarea rows={2} className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none focus:border-violet-500" value={detailEditForm.background || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, background: e.target.value }))} /></div>
            </>)}
            {detailEditEntity.type === 'scene' && (<>
              <div className="space-y-1"><label className="text-xs text-gray-400">场景名称 *</label><input type="text" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-emerald-500" value={detailEditForm.name || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1"><label className="text-xs text-gray-400">场景描述</label><textarea rows={4} className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none focus:border-emerald-500" value={detailEditForm.description || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, description: e.target.value }))} /></div>
              <div className="space-y-1"><label className="text-xs text-gray-400">氛围/基调</label><input type="text" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-emerald-500" value={detailEditForm.atmosphere || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, atmosphere: e.target.value }))} /></div>
            </>)}
            {detailEditEntity.type === 'item' && (<>
              <div className="space-y-1"><label className="text-xs text-gray-400">物品名称 *</label><input type="text" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-amber-500" value={detailEditForm.name || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-1"><label className="text-xs text-gray-400">物品描述</label><textarea rows={4} className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none focus:border-amber-500" value={detailEditForm.description || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, description: e.target.value }))} /></div>
              <div className="space-y-1"><label className="text-xs text-gray-400">重要性/象征意义</label><input type="text" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-amber-500" value={detailEditForm.significance || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, significance: e.target.value }))} /></div>
            </>)}
            <div className="flex gap-2 justify-end pt-2 border-t border-white/10">
              <button onClick={() => setDetailEditEntity(null)} className="px-4 py-2 text-xs text-gray-400 hover:text-white border border-white/10 rounded-lg transition-colors">取消</button>
              <button onClick={handleNovelDetailSave} disabled={detailEditSaving} className="px-5 py-2 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-all">{detailEditSaving ? '保存中…' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      {detailModal.visible && detailModal.novel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDetailModal({ visible: false, novel: null })}>
          <div className="backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto border border-white/10" style={{ background: 'rgba(15,12,41,0.95)' }} onClick={e => e.stopPropagation()}>
            {/* 头部 */}
            <div className="sticky top-0 border-b border-white/10 rounded-t-2xl px-6 py-4 flex items-center justify-between" style={{ background: 'rgba(15,12,41,0.98)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center text-white text-lg font-bold">
                  {detailModal.novel.title[0]}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">《{detailModal.novel.title}》</h3>
                  <p className="text-xs text-gray-400">ID: {detailModal.novel.id.slice(0, 8)}...</p>
                </div>
              </div>
              <button
                onClick={() => setDetailModal({ visible: false, novel: null })}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 详情 Tab 导航 */}
            <div className="flex gap-1 px-6 pt-4 pb-0 overflow-x-auto">
              {[
                { key: 'info' as const, label: '基本信息', icon: '📋' },
                { key: 'plot' as const, label: '剧情', icon: '📖' },
                { key: 'hooks' as const, label: '章节钩子', icon: '🪝', count: novelDetails?.hooks?.length },
                { key: 'characters' as const, label: '角色', icon: '👤', count: novelDetails?.characters?.length },
                { key: 'relationships' as const, label: '关系', icon: '🔗', count: novelDetails?.relationships?.length },
                { key: 'scenes' as const, label: '场景', icon: '🏞️', count: novelDetails?.scenes?.length },
                { key: 'items' as const, label: '物品', icon: '💎', count: novelDetails?.items?.length },
                { key: 'chapters' as const, label: '章节内容', icon: '📝' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => {
                    setDetailTab(t.key);
                    if (t.key === 'chapters' && detailModal.novel && novelChapters.length === 0 && !chaptersLoading) {
                      fetchNovelChapters(detailModal.novel.id);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                    detailTab === t.key
                      ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  {t.count !== undefined && t.count > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-white/10 rounded-full">{t.count}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-6">
              {/* 基本信息 Tab */}
              {detailTab === 'info' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                      <div className="text-xs text-blue-500 font-medium mb-1">作者</div>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {detailModal.novel.ownerName?.[0] || "?"}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-200">{detailModal.novel.ownerName}</div>
                          <div className="text-xs text-gray-400">{detailModal.novel.ownerEmail}</div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                      <div className="text-xs text-purple-500 font-medium mb-1">分类</div>
                      <div className="text-sm font-medium text-gray-200">{getCategoryLabel(detailModal.novel.category)}</div>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                      <div className="text-xs text-green-500 font-medium mb-1">状态</div>
                      <div>{getStatusBadge(detailModal.novel.status)}</div>
                    </div>
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                      <div className="text-xs text-amber-500 font-medium mb-1">章节进度</div>
                      <div className="text-sm font-medium text-gray-200">
                        {detailModal.novel.currentChapters}
                        <span className="text-gray-400 mx-1">/</span>
                        {detailModal.novel.totalChapters}
                        <span className="text-gray-400 text-xs ml-1">章</span>
                      </div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <div className="text-xs text-gray-500 font-medium mb-1">创建时间</div>
                      <div className="text-sm text-gray-300">{new Date(detailModal.novel.createdAt).toLocaleString("zh-CN")}</div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <div className="text-xs text-gray-500 font-medium mb-1">更新时间</div>
                      <div className="text-sm text-gray-300">{new Date(detailModal.novel.updatedAt).toLocaleString("zh-CN")}</div>
                    </div>
                  </div>
                  {detailModal.novel.description && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-300 mb-2">简介</h4>
                      <p className="text-sm text-gray-400 bg-white/5 rounded-xl p-4 leading-relaxed">{detailModal.novel.description}</p>
                    </div>
                  )}
                </>
              )}

              {/* 剧情 Tab */}
              {detailTab === 'plot' && (
                <div className="space-y-4">
                  {detailsLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" /></div>
                  ) : novelDetails?.plot ? (
                    <>
                      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <div className="text-xs text-purple-400 font-medium mb-2">主线剧情</div>
                        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{novelDetails.plot.mainPlot || '暂无'}</p>
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <div className="text-xs text-blue-400 font-medium mb-2">情感曲线</div>
                        <p className="text-sm text-gray-300">{novelDetails.plot.emotionalCurve || '暂无'}</p>
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <div className="text-xs text-red-400 font-medium mb-2">关键冲突</div>
                        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{novelDetails.plot.keyConflicts || '暂无'}</p>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">暂无剧情数据</div>
                  )}
                </div>
              )}

              {/* 章节钩子 Tab */}
              {detailTab === 'hooks' && (
                <div className="space-y-2">
                  {detailsLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" /></div>
                  ) : novelDetails?.hooks && novelDetails.hooks.length > 0 ? (
                    novelDetails.hooks.map(h => (
                      <div key={h.id} className="flex gap-3 items-start bg-white/5 border border-white/10 rounded-xl p-3">
                        <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-purple-600/20 text-purple-300 text-xs font-bold">
                          {h.chapterNumber}
                        </span>
                        <div className="flex-1 min-w-0">
                          {h.title && <div className="text-xs text-gray-400 mb-0.5">{h.title}</div>}
                          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{(h.hook || '暂无钩子').replace(/\\n/g, '\n')}</p>
                        </div>
                        <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full ${
                          h.status === 'generated' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                        }`}>{h.status}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">暂无章节钩子数据</div>
                  )}
                </div>
              )}

              {/* 角色 Tab */}
              {detailTab === 'characters' && (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <button
                      onClick={async () => {
                        if (!detailModal.novel || resyncingChars) return;
                        setResyncingChars(true);
                        try {
                          const token = getToken();
                          const res = await fetch(`/api/admin/novels/${detailModal.novel.id}/resync-characters`, {
                            method: 'POST', headers: { Authorization: `Bearer ${token}` },
                          });
                          const data = await res.json();
                          if (data.success) {
                            await refreshNovelDetails(detailModal.novel.id);
                            alert(data.message);
                          } else {
                            alert('同步失败：' + (data.message || '未知错误'));
                          }
                        } catch { alert('请求失败'); }
                        finally { setResyncingChars(false); }
                      }}
                      disabled={resyncingChars}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600/20 text-violet-300 border border-violet-500/30 rounded-lg hover:bg-violet-600/30 disabled:opacity-50 transition-all"
                    >
                      {resyncingChars ? <span className="animate-spin w-3 h-3 border border-violet-300 border-t-transparent rounded-full" /> : '🔄'}
                      重新同步角色
                    </button>
                  </div>
                  {detailsLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" /></div>
                  ) : novelDetails?.characters && novelDetails.characters.length > 0 ? (
                    novelDetails.characters.map(c => (
                      <div key={c.id} onClick={() => { setDetailEditEntity({ type: 'character', data: c }); setDetailEditForm({ name: c.name || '', role: c.role || 'supporting', description: c.description || '', personality: c.personality || '', appearance: c.appearance || '', background: (c as any).background || '' }); }} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-violet-500/40 hover:bg-violet-500/5 cursor-pointer transition-all group">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-bold text-white">{cleanCharName(c.name)}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                            c.role === 'protagonist' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-400'
                          }`}>{c.role === 'protagonist' ? '主角' : c.role === 'antagonist' ? '反派' : '配角'}</span>
                        </div>
                        {c.description && <p className="text-sm text-gray-400 leading-relaxed">{c.description}</p>}
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {c.personality && <div className="text-xs"><span className="text-gray-500">性格：</span><span className="text-gray-300">{c.personality}</span></div>}
                          {c.appearance && <div className="text-xs"><span className="text-gray-500">外貌：</span><span className="text-gray-300">{c.appearance}</span></div>}
                          {c.background && <div className="text-xs col-span-2"><span className="text-gray-500">背景：</span><span className="text-gray-300">{c.background}</span></div>}
                          {c.relationships && <div className="text-xs col-span-2"><span className="text-gray-500">关系：</span><span className="text-gray-300">{c.relationships}</span></div>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">暂无角色数据</div>
                  )}
                </div>
              )}

              {/* 角色关系 Tab */}
              {detailTab === 'relationships' && (
                <div className="space-y-2">
                  {detailsLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" /></div>
                  ) : novelDetails?.relationships && novelDetails.relationships.length > 0 ? (
                    novelDetails.relationships.map((r, i) => (
                      <div key={r.id || i} className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-sm font-bold text-amber-400">{r.fromCharacter}</span>
                          <span className="text-gray-500 text-sm">→</span>
                          <span className="text-sm font-bold text-violet-400">{r.toCharacter}</span>
                        </div>
                        {r.relationship && <p className="text-xs text-gray-400 leading-relaxed">{r.relationship}</p>}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">暂无角色关系数据</div>
                  )}
                </div>
              )}

              {/* 场景 Tab */}
              {detailTab === 'scenes' && (
                <div className="space-y-3">
                  {detailsLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" /></div>
                  ) : novelDetails?.scenes && novelDetails.scenes.length > 0 ? (
                    novelDetails.scenes.map(s => (
                      <div key={s.id} onClick={() => { setDetailEditEntity({ type: 'scene', data: s }); setDetailEditForm({ name: s.name || '', description: s.description || '', atmosphere: s.atmosphere || '' }); }} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-emerald-500/40 hover:bg-emerald-500/5 cursor-pointer transition-all group">
                        <div className="text-sm font-bold text-white mb-1">{s.name}</div>
                        {s.description && <p className="text-sm text-gray-400 leading-relaxed">{s.description}</p>}
                        {s.atmosphere && <div className="text-xs mt-1"><span className="text-gray-500">氛围：</span><span className="text-gray-300">{s.atmosphere}</span></div>}
                        {s.relatedChapters && <div className="text-xs mt-1"><span className="text-gray-500">关联章节：</span><span className="text-gray-300">{s.relatedChapters}</span></div>}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">暂无场景数据</div>
                  )}
                </div>
              )}

              {/* 物品 Tab */}
              {detailTab === 'items' && (
                <div className="space-y-3">
                  {detailsLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" /></div>
                  ) : novelDetails?.items && novelDetails.items.length > 0 ? (
                    novelDetails.items.map(it => (
                      <div key={it.id} onClick={() => { setDetailEditEntity({ type: 'item', data: it }); setDetailEditForm({ name: it.name || '', description: it.description || '', significance: it.significance || '' }); }} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-amber-500/40 hover:bg-amber-500/5 cursor-pointer transition-all group">
                        <div className="text-sm font-bold text-white mb-1">{it.name}</div>
                        {it.description && <p className="text-sm text-gray-400 leading-relaxed">{it.description}</p>}
                        {it.significance && <div className="text-xs mt-1"><span className="text-gray-500">重要性：</span><span className="text-gray-300">{it.significance}</span></div>}
                        {it.relatedChapters && <div className="text-xs mt-1"><span className="text-gray-500">关联章节：</span><span className="text-gray-300">{it.relatedChapters}</span></div>}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">暂无物品数据</div>
                  )}
                </div>
              )}

              {/* 章节内容 Tab */}
              {detailTab === 'chapters' && (
                <div className="space-y-2">
                  {chaptersLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" /></div>
                  ) : novelChapters.length > 0 ? (
                    novelChapters.map((chapter: any, idx: number) => (
                      <div key={idx} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                        <div
                          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
                          onClick={() => {
                            if (editingChapterIdx === idx) { setEditingChapterIdx(null); }
                            else { setEditingChapterIdx(idx); setEditingChapterContent(chapter.content || ''); }
                          }}
                        >
                          <span className="text-sm font-medium text-gray-200">第{chapter.number || (idx + 1)}章：{chapter.title || '未命名'}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{chapter.content ? `${String(chapter.content).length}字` : '无内容'}</span>
                            <svg className={`w-4 h-4 text-gray-500 transition-transform ${editingChapterIdx === idx ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </div>
                        </div>
                        {editingChapterIdx === idx && (
                          <div className="px-4 pb-4 space-y-3 border-t border-white/10">
                            <textarea
                              rows={12}
                              className="w-full px-3 py-2 mt-3 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none focus:border-purple-500"
                              value={editingChapterContent}
                              onChange={e => setEditingChapterContent(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingChapterIdx(null)} className="px-3 py-1.5 text-xs text-gray-400 border border-white/10 rounded-lg hover:text-white transition-colors">取消</button>
                              <button onClick={handleChapterSave} disabled={savingChapter} className="px-4 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-all">
                                {savingChapter ? '保存中...' : '保存章节'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">暂无章节内容，请点击上方"章节内容"标签加载</div>
                  )}
                </div>
              )}
            </div>

            {/* 底部操作 */}
            <div className="sticky bottom-0 border-t border-white/10 rounded-b-2xl px-6 py-4 flex justify-end gap-3" style={{ background: 'rgba(15,12,41,0.98)' }}>
              <button
                onClick={() => setDetailModal({ visible: false, novel: null })}
                className="px-5 py-2.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  const novel = detailModal.novel!;
                  setDetailModal({ visible: false, novel: null });
                  openEditModal(novel);
                }}
                className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 shadow-sm shadow-blue-500/20 transition-all"
              >
                编辑
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}