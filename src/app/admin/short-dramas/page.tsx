"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getToken as getAuthToken } from "@/lib/get-token";
import { getCategoryLabel } from "@/lib/category";
import { broadcastDataChange, onDataChange } from "@/lib/data-sync";

// ======================== 风格设置弹窗 ========================
type AdminStyleType = 'character' | 'scene' | 'item';
interface AdminStyleConfig { prePrompt: string; postPrompt: string; referenceImages: string[]; }
const ADMIN_STYLE_META: Record<AdminStyleType, { label: string; desc: string }> = {
  character: { label: '角色风格设置', desc: '设置本作品的角色生成风格，这些设置将应用于所有角色生成' },
  scene:     { label: '场景风格设置', desc: '设置本作品的场景生成风格，这些设置将应用于所有场景生成' },
  item:      { label: '物品风格设置', desc: '设置本作品的物品生成风格，这些设置将应用于所有物品生成' },
};
function AdminStyleModal({ type, style, onSave, onClose }: { type: AdminStyleType; style: AdminStyleConfig; onSave: (s: AdminStyleConfig) => Promise<void>; onClose: () => void }) {
  const meta = ADMIN_STYLE_META[type];
  const [form, setForm] = useState<AdminStyleConfig>({ prePrompt: style.prePrompt || '', postPrompt: style.postPrompt || '', referenceImages: [...(style.referenceImages || [])].slice(0, 4).concat(Array(4).fill('')).slice(0, 4) });
  const [saving, setSaving] = useState(false);
  const fileRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const handleFile = (idx: number, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const imgs = [...form.referenceImages];
      imgs[idx] = e.target?.result as string;
      setForm(f => ({ ...f, referenceImages: imgs }));
    };
    reader.readAsDataURL(file);
  };
  const removeImg = (idx: number) => {
    const imgs = [...form.referenceImages];
    imgs[idx] = '';
    setForm(f => ({ ...f, referenceImages: imgs }));
  };
  const handleSave = async () => { setSaving(true); try { await onSave(form); onClose(); } finally { setSaving(false); } };
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={e => e.target === e.currentTarget && onClose()}>
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
            {[0,1,2,3].map(idx => (
              <div key={idx} className="relative aspect-square rounded-xl border-2 border-dashed border-white/15 bg-white/3 flex items-center justify-center cursor-pointer hover:border-white/30 overflow-hidden group" onClick={() => fileRefs[idx].current?.click()}>
                {form.referenceImages[idx] ? (
                  <><img src={form.referenceImages[idx]} alt="" className="w-full h-full object-cover" /><button onClick={e => { e.stopPropagation(); removeImg(idx); }} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button></>
                ) : (
                  <span className="text-gray-500 text-xs">参考图{idx+1}</span>
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

const cleanCharName = (name: string) =>
  name ? name.replace(/\s*[—–\-]+\s*【.*$/, '').replace(/\s*【.*$/, '').trim() : name;

interface ShortDrama {
  id: string;
  novelId: string | null;
  userId: string;
  title: string;
  description: string | null;
  genre: string | null;
  targetAudience: string | null;
  totalEpisodes: number;
  currentEpisodes: number;
  episodeDuration: number | null;
  status: string;
  tags: string | null;
  style: string | null;
  platform: string | null;
  ownerName: string;
  ownerEmail: string;
  novelTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Episode {
  id: string;
  episodeNumber: number;
  title: string | null;
  synopsis: string | null;
  screenplay: string | null;
  scenes: string | null;
  dialogues: string | null;
  directions: string | null;
  imagePrompts: string | null;
  videoPrompts: string | null;
  duration: number | null;
  status: string;
  sourceChapter: number | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminShortDramasPage() {
  const router = useRouter();
  const [dramas, setDramas] = useState<ShortDrama[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // Detail modal
  const [detailModal, setDetailModal] = useState<{ visible: boolean; drama: ShortDrama | null }>({ visible: false, drama: null });
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'info' | 'episodes' | 'characters' | 'scenes' | 'items' | 'image-storyboards' | 'video-storyboards' | 'tasks'>('info');

  // Edit modal
  const [editModal, setEditModal] = useState<{ visible: boolean; drama: ShortDrama | null }>({ visible: false, drama: null });
  const [editForm, setEditForm] = useState({ title: "", description: "", genre: "", status: "", totalEpisodes: 0, episodeDuration: 60, platform: "", style: "" });
  const [saving, setSaving] = useState(false);

  const [detailEditEntity, setDetailEditEntity] = useState<{ type: 'character' | 'scene' | 'item'; data: any } | null>(null);
  const [detailEditForm, setDetailEditForm] = useState<any>({});
  const [detailEditSaving, setDetailEditSaving] = useState(false);

  const [storyboardEpisodeId, setStoryboardEpisodeId] = useState<string | null>(null);
  const [storyboardGenerating, setStoryboardGenerating] = useState<'image' | 'video' | null>(null);
  const [storyboardMsg, setStoryboardMsg] = useState<string | null>(null);
  const [aiConfigs, setAiConfigs] = useState<{ id: string; name: string }[]>([]);
  const [storyboardConfigId, setStoryboardConfigId] = useState<string>('');

  const [novelSettings, setNovelSettings] = useState<Record<string, any> | null>(null);
  const [novelSettingsTab, setNovelSettingsTab] = useState<'characters' | 'relationships' | 'scenes' | 'items'>('characters');
  const [showNovelSettings, setShowNovelSettings] = useState(false);

  // Create modal
  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", description: "", genre: "", totalEpisodes: 10, episodeDuration: 60, platform: "", style: "", novelId: "" });
  const [creating, setCreating] = useState(false);

  const getToken = useCallback(() => getAuthToken(), []);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    fetch('/api/ai/configs', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.data)) {
          const text = d.data.filter((c: any) => !c.modelType || c.modelType === 'text');
          setAiConfigs(text.map((c: any) => ({ id: c.id, name: c.name || c.model || c.id })));
          if (text.length > 0 && !storyboardConfigId) setStoryboardConfigId(text[0].id);
        }
      }).catch(() => {});
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [styleModal, setStyleModal] = useState<AdminStyleType | null>(null);
  const parseStyle = (raw: string | null | undefined): AdminStyleConfig => { try { return raw ? JSON.parse(raw) : { prePrompt: '', postPrompt: '', referenceImages: [] }; } catch { return { prePrompt: '', postPrompt: '', referenceImages: [] }; } };
  const saveStyle = async (type: AdminStyleType, s: AdminStyleConfig) => {
    const dramaId = detailModal.drama?.id;
    if (!dramaId) return;
    const key = type === 'character' ? 'characterStyle' : type === 'scene' ? 'sceneStyle' : 'itemStyle';
    await fetch(`/api/short-dramas/${dramaId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ [key]: JSON.stringify(s) }) });
    const res = await fetch(`/api/admin/short-dramas/${dramaId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const d = await res.json(); if (d.success) setDetailData(d.data);
  };

  const fetchDramas = useCallback(async () => {
    const token = getToken();
    if (!token) { router.push("/auth/login"); return; }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/admin/short-dramas?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      console.log('[Admin Short-Dramas Page] API响应:', JSON.stringify(data).slice(0, 500));
      if (data.success) {
        setDramas(data.data.dramas || []);
        setPagination(data.data.pagination);
      } else {
        console.error('[Admin Short-Dramas Page] API返回失败:', data);
        setError(data.error || `API返回失败 (${res.status})`);
      }
    } catch (err: any) {
      console.error("获取短剧列表失败:", err);
      setError(err.message || "网络错误");
    } finally {
      setLoading(false);
    }
  }, [getToken, router, page, search, statusFilter]);

  useEffect(() => { fetchDramas(); }, [fetchDramas]);

  const refreshDetail = useCallback(async (dramaId: string) => {
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/short-dramas/${dramaId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setDetailData(data.data);
    } catch (e) { console.error('刷新短剧详情失败:', e); }
  }, [getToken]);

  useEffect(() => {
    const cleanup = onDataChange((e) => {
      if (e.type === 'short-drama' || e.type === 'novel') {
        fetchDramas();
        if (detailModal.visible && detailModal.drama?.id && e.id && detailModal.drama.id === e.id) refreshDetail(e.id!);
      }
    });
    return cleanup;
  }, [fetchDramas, detailModal, refreshDetail]);

  // 页面加载自动同步一次（后台静默执行）
  const autoSyncRef = useRef(false);
  useEffect(() => {
    if (!autoSyncRef.current) {
      autoSyncRef.current = true;
      const token = getToken();
      if (token) {
        fetch('/api/admin/sync-dramas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ syncAll: true }),
        }).then(r => r.json()).then(data => {
          if (data.success && data.data?.created > 0) {
            setSyncMsg(`自动同步：新建${data.data.created}部短剧`);
            fetchDramas();
          }
        }).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = async (drama: ShortDrama) => {
    setDetailModal({ visible: true, drama });
    setDetailTab('info');
    setDetailData(null);
    setDetailLoading(true);
    setNovelSettings(null);
    setShowNovelSettings(false);
    try {
      const token = getToken();
      const [dramaRes, novelRes] = await Promise.all([
        fetch(`/api/admin/short-dramas/${drama.id}`, { headers: { Authorization: `Bearer ${token}` } }),
        drama.novelId ? fetch(`/api/admin/novels/${drama.novelId}/details`, { headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve(null),
      ]);
      const dramaData = await dramaRes.json();
      if (dramaData.success) setDetailData(dramaData.data);
      if (novelRes) {
        const novelData = await novelRes.json();
        if (novelData.success) setNovelSettings(novelData.data);
      }
    } catch (e) {
      console.error('获取短剧详情失败:', e);
    } finally {
      setDetailLoading(false);
    }
  };

  const openEdit = (drama: ShortDrama) => {
    setEditForm({
      title: drama.title,
      description: drama.description || "",
      genre: getCategoryLabel(drama.genre || '') || drama.genre || "",
      status: drama.status,
      totalEpisodes: drama.totalEpisodes,
      episodeDuration: drama.episodeDuration || 60,
      platform: drama.platform || "",
      style: drama.style || "",
    });
    setEditModal({ visible: true, drama });
  };

  const handleSave = async () => {
    if (!editModal.drama) return;
    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/short-dramas/${editModal.drama.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.success) {
        setEditModal({ visible: false, drama: null });
        fetchDramas();
      }
    } catch (error) {
      console.error("保存失败:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.title) return;
    setCreating(true);
    try {
      const token = getToken();
      const res = await fetch('/api/admin/short-dramas', {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (data.success) {
        setCreateModal(false);
        setCreateForm({ title: "", description: "", genre: "", totalEpisodes: 10, episodeDuration: 60, platform: "", style: "", novelId: "" });
        fetchDramas();
      }
    } catch (error) {
      console.error("创建失败:", error);
    } finally {
      setCreating(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 部短剧吗？此操作不可恢复！`)) return;
    setBatchDeleting(true);
    try {
      const token = getToken();
      await Promise.all(Array.from(selectedIds).map(id =>
        fetch(`/api/admin/short-dramas/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      ));
      setSelectedIds(new Set());
      setSelectMode(false);
      broadcastDataChange({ type: 'short-drama', action: 'delete', id: 'batch' });
      fetchDramas();
    } catch (err) {
      console.error('批量删除失败:', err);
    } finally {
      setBatchDeleting(false);
    }
  };

  const handleDelete = async (drama: ShortDrama) => {
    if (!confirm(`确定要删除短剧《${drama.title}》吗？此操作会同时删除所有分集！`)) return;
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/short-dramas/${drama.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        broadcastDataChange({ type: 'short-drama', action: 'delete', id: drama.id });
        fetchDramas();
      }
    } catch (error) {
      console.error("删除失败:", error);
    }
  };

  const handleDetailSave = async () => {
    if (!detailEditEntity || !detailModal.drama) return;
    setDetailEditSaving(true);
    try {
      // 如果是角色编辑，将独立外貌子字段组合为 appearance 字符串
      let saveForm: any = { ...detailEditForm };
      if (detailEditEntity.type === 'character') {
        const parts: string[] = [];
        if (saveForm.appearanceHairColor) parts.push(`发色：${saveForm.appearanceHairColor}`);
        if (saveForm.appearanceHairstyle) parts.push(`发型：${saveForm.appearanceHairstyle}`);
        if (saveForm.appearanceEyes) parts.push(`眼睛：${saveForm.appearanceEyes}`);
        if (saveForm.appearanceUpper) parts.push(`上身：${saveForm.appearanceUpper}`);
        if (saveForm.appearanceLower) parts.push(`下身：${saveForm.appearanceLower}`);
        saveForm.appearance = parts.join('｜');
        delete saveForm.appearanceHairColor;
        delete saveForm.appearanceHairstyle;
        delete saveForm.appearanceEyes;
        delete saveForm.appearanceUpper;
        delete saveForm.appearanceLower;
      }
      const token = getToken();
      const { type, data } = detailEditEntity;
      const urlMap = { character: 'characters', scene: 'scenes', item: 'items' } as const;
      const keyMap = { character: 'characterId', scene: 'sceneId', item: 'itemId' } as const;
      const res = await fetch(`/api/short-dramas/${detailModal.drama.id}/${urlMap[type]}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [keyMap[type]]: data.id, ...saveForm }),
      });
      const result = await res.json();
      if (result.success) {
        broadcastDataChange({ type: 'short-drama', action: 'update', id: detailModal.drama.id });
        await refreshDetail(detailModal.drama.id);
        setDetailEditEntity(null);
      }
    } finally { setDetailEditSaving(false); }
  };

  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const handleSyncAll = async () => {
    const token = getToken();
    if (!token) return;
    setSyncLoading(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/admin/sync-dramas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ syncAll: true }),
      });
      const data = await res.json();
      if (data.success) {
        const d = data.data;
        setSyncMsg(`同步完成！共${d.totalNovels}部小说，新建${d.created}部短剧${d.skipped > 0 ? `，已有${d.skipped}` : ''}${d.failed > 0 ? `，失败${d.failed}` : ''}`);
        fetchDramas();
      } else {
        setSyncMsg(`同步失败: ${data.error || '未知错误'}`);
      }
    } catch (e: any) {
      setSyncMsg(`同步出错: ${e.message || '网络错误'}`);
    } finally {
      setSyncLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: "bg-green-100 text-green-800 ring-1 ring-green-200",
      generating: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
      draft: "bg-white/10 text-gray-300 ring-1 ring-white/20",
      published: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
    };
    const labelMap: Record<string, string> = {
      completed: "已完成",
      generating: "生成中",
      draft: "草稿",
      published: "已发布",
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${map[status] || "bg-white/10 text-gray-300"}`}>
        {labelMap[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* 顶部操作栏 */}
      <div className="backdrop-blur-xl rounded-2xl p-5 border border-white/10" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="搜索短剧标题..."
              className="w-full pl-10 pr-10 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white/5 text-white placeholder-gray-500 transition-all"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            className="px-4 py-2.5 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 bg-white/5 text-gray-300 text-sm"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="generating">生成中</option>
            <option value="completed">已完成</option>
            <option value="published">已发布</option>
          </select>
          <button
            onClick={handleSyncAll}
            disabled={syncLoading}
            className="px-4 py-2.5 text-sm font-medium border border-emerald-500/30 text-emerald-400 rounded-xl hover:bg-emerald-500/10 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {syncLoading ? (
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            )}
            全站同步短剧
          </button>
          <button
            onClick={() => setCreateModal(true)}
            className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl hover:from-violet-700 hover:to-indigo-700 shadow-sm shadow-violet-500/20 transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            新建短剧
          </button>
          <button
            onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
            className={`px-4 py-2.5 text-sm font-medium border rounded-xl transition-all ${selectMode ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-white/5 border-white/15 text-gray-400 hover:text-gray-200'}`}
          >
            {selectMode ? '退出管理' : '批量管理'}
          </button>
        </div>
        {selectMode && selectedIds.size > 0 && (
          <div className="mt-3 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-purple-500/20" style={{ background: 'rgba(124,58,237,0.06)' }}>
            <span className="text-xs text-gray-400">已选 {selectedIds.size} 部短剧</span>
            <div className="flex-1" />
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">取消选择</button>
            <button
              onClick={handleBatchDelete}
              disabled={batchDeleting}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/20 text-red-400 hover:bg-red-500/25 transition-all disabled:opacity-50"
            >
              {batchDeleting ? '删除中...' : `删除选中 (${selectedIds.size})`}
            </button>
          </div>
        )}
      </div>

      {/* Sync message */}
      {syncMsg && (
        <div className={`p-3 rounded-xl text-xs flex items-center justify-between ${syncMsg.includes('失败') || syncMsg.includes('出错') ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'}`}>
          <span>{syncMsg}</span>
          <button onClick={() => setSyncMsg(null)} className="opacity-60 hover:opacity-100 ml-2">✕</button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/15 text-red-400 border border-red-500/20 text-sm flex items-center justify-between">
          <span>获取短剧数据失败: {error}</span>
          <button onClick={fetchDramas} className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs transition-colors">重试</button>
        </div>
      )}

      {/* 短剧列表 */}
      <div className="backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10" style={{ background: 'rgba(255,255,255,0.06)' }}>
                {selectMode && <th className="px-4 py-4 w-10"><input type="checkbox" checked={selectedIds.size === dramas.length && dramas.length > 0} onChange={(e) => setSelectedIds(e.target.checked ? new Set(dramas.map(d => d.id)) : new Set())} className="w-4 h-4 rounded accent-purple-500" /></th>}
                <th className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">标题</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">关联小说</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">作者</th>
                <th className="text-center px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">集数</th>
                <th className="text-center px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">每集时长</th>
                <th className="text-center px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                <th className="text-right px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">更新时间</th>
                <th className="text-center px-5 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={selectMode ? 9 : 8} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin w-8 h-8 border-3 border-violet-600 border-t-transparent rounded-full" />
                    <span className="text-sm text-gray-400">加载中...</span>
                  </div>
                </td></tr>
              ) : dramas.length === 0 ? (
                <tr><td colSpan={selectMode ? 9 : 8} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-4xl">🎥</span>
                    <span className="text-sm text-gray-400">暂无短剧</span>
                  </div>
                </td></tr>
              ) : (
                dramas.map((d) => (
                  <tr key={d.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors duration-150 ${selectMode && selectedIds.has(d.id) ? 'bg-purple-500/8' : ''}`}>
                    {selectMode && <td className="px-4 py-4 w-10"><input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => setSelectedIds(prev => { const next = new Set(prev); if (next.has(d.id)) next.delete(d.id); else next.add(d.id); return next; })} className="w-4 h-4 rounded accent-purple-500" /></td>}
                    <td className="px-5 py-4">
                      <button onClick={() => openDetail(d)} className="text-violet-400 hover:text-violet-300 font-medium text-sm text-left hover:underline transition-all">
                        《{d.title}》
                      </button>
                      {d.genre && <div className="text-xs text-gray-500 mt-0.5">{getCategoryLabel(d.genre)}</div>}
                    </td>
                    <td className="px-5 py-4">
                      {d.novelTitle ? (
                        <span className="text-xs text-amber-400 font-medium">《{d.novelTitle}》</span>
                      ) : (
                        <span className="text-xs text-gray-600">-</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-violet-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {d.ownerName?.[0] || "?"}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-200">{d.ownerName}</div>
                          <div className="text-xs text-gray-400">{d.ownerEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="text-sm font-medium text-gray-200">
                        {d.currentEpisodes}<span className="text-gray-400 mx-0.5">/</span>{d.totalEpisodes}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center text-sm text-gray-300">
                      {d.episodeDuration ? `${d.episodeDuration}s` : '-'}
                    </td>
                    <td className="px-5 py-4 text-center">{getStatusBadge(d.status)}</td>
                    <td className="px-5 py-4 text-sm text-gray-500 text-right whitespace-nowrap">
                      {d.updatedAt ? new Date(d.updatedAt).toLocaleDateString("zh-CN") : '-'}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEdit(d)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all">
                          编辑
                        </button>
                        <button onClick={() => handleDelete(d)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all">
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
            <span className="text-sm text-gray-500">共 <span className="font-medium text-white">{pagination.total}</span> 部短剧</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3.5 py-2 text-sm border border-white/15 rounded-xl disabled:opacity-40 hover:bg-white/10 bg-white/5 text-gray-300 transition-all">上一页</button>
              <button disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)} className="px-3.5 py-2 text-sm border border-white/15 rounded-xl disabled:opacity-40 hover:bg-white/10 bg-white/5 text-gray-300 transition-all">下一页</button>
            </div>
          </div>
        )}
      </div>

      {/* 详情内编辑覆盖层 */}
      {detailEditEntity && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && setDetailEditEntity(null)}>
          <div className="bg-[#1a1040] border border-white/15 rounded-2xl p-6 w-full max-w-[480px] max-h-[80vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">✏️ 编辑{detailEditEntity.type === 'character' ? '角色' : detailEditEntity.type === 'scene' ? '场景' : '物品'}</h3>
              <button onClick={() => setDetailEditEntity(null)} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
            </div>
            {detailEditEntity.type === 'character' && (<>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><label className="text-xs text-gray-400">角色名 *</label><input type="text" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-violet-500" value={detailEditForm.name || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, name: e.target.value }))} /></div>
                <div className="space-y-1"><label className="text-xs text-gray-400">性别</label><select className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-[#1a1040] text-white focus:outline-none focus:border-violet-500" value={detailEditForm.gender || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, gender: e.target.value }))}><option value="">未知</option><option value="男">男</option><option value="女">女</option></select></div>
                <div className="space-y-1"><label className="text-xs text-gray-400">角色类型</label><select className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-[#1a1040] text-white focus:outline-none" value={detailEditForm.role || 'supporting'} onChange={e => setDetailEditForm((f: any) => ({ ...f, role: e.target.value }))}><option value="protagonist">主角</option><option value="antagonist">反派</option><option value="supporting">配角</option></select></div>
              </div>
              <div className="space-y-1"><label className="text-xs text-gray-400">角色描述</label><textarea rows={4} className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white resize-none focus:outline-none focus:border-violet-500" placeholder="介绍角色背景、身份、故事..." value={detailEditForm.description || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, description: e.target.value }))} /></div>
              <div className="space-y-1"><label className="text-xs text-gray-400">性格特点</label><input type="text" className="w-full px-3 py-2 text-sm border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-violet-500" value={detailEditForm.personality || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, personality: e.target.value }))} /></div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">外貌特征</label>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-[10px] text-amber-300">发色</label><input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-amber-500" value={detailEditForm.appearanceHairColor || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, appearanceHairColor: e.target.value }))} /></div>
                  <div><label className="text-[10px] text-yellow-300">发型</label><input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-yellow-500" value={detailEditForm.appearanceHairstyle || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, appearanceHairstyle: e.target.value }))} /></div>
                  <div><label className="text-[10px] text-sky-300">眼睛</label><input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-sky-500" value={detailEditForm.appearanceEyes || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, appearanceEyes: e.target.value }))} /></div>
                  <div><label className="text-[10px] text-violet-300">上身</label><input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-violet-500" value={detailEditForm.appearanceUpper || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, appearanceUpper: e.target.value }))} /></div>
                  <div className="col-span-2"><label className="text-[10px] text-emerald-300">下身</label><input type="text" className="w-full px-2 py-1.5 text-xs border border-white/15 rounded-lg bg-white/5 text-white focus:outline-none focus:border-emerald-500" value={detailEditForm.appearanceLower || ''} onChange={e => setDetailEditForm((f: any) => ({ ...f, appearanceLower: e.target.value }))} /></div>
                </div>
              </div>
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
              <button onClick={handleDetailSave} disabled={detailEditSaving} className="px-5 py-2 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-all">{detailEditSaving ? '保存中…' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      {detailModal.visible && detailModal.drama && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDetailModal({ visible: false, drama: null })}>
          <div className="backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-y-auto border border-white/10" style={{ background: 'rgba(15,12,41,0.95)' }} onClick={e => e.stopPropagation()}>
            {/* 头部 */}
            <div className="sticky top-0 border-b border-white/10 rounded-t-2xl px-6 py-4 flex items-center justify-between" style={{ background: 'rgba(15,12,41,0.98)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-pink-500 rounded-xl flex items-center justify-center text-white text-lg">🎥</div>
                <div>
                  <h3 className="text-lg font-bold text-white">《{detailModal.drama.title}》</h3>
                  <p className="text-xs text-gray-400">{getCategoryLabel(detailModal.drama.genre || '') || '未分类'}</p>
                </div>
              </div>
              <button onClick={() => setDetailModal({ visible: false, drama: null })} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Tab 导航 */}
            <div className="flex gap-1 px-6 pt-4 pb-0">
              {[
                { key: 'info' as const, label: '基本信息', icon: '📋' },
                { key: 'episodes' as const, label: '分集', icon: '📺', count: detailData?.episodes?.length },
                { key: 'characters' as const, label: '角色', icon: '👤', count: detailData?.characters?.length },
                { key: 'scenes' as const, label: '场景', icon: '🏔️', count: detailData?.scenes?.length },
                { key: 'items' as const, label: '物品', icon: '🔑', count: detailData?.items?.length },
                { key: 'image-storyboards' as const, label: '图片分镜', icon: '🖼️', count: detailData?.shots?.filter((s: any) => s.imagePrompt)?.length },
                { key: 'video-storyboards' as const, label: '视频分镜', icon: '�', count: detailData?.shots?.filter((s: any) => s.videoPrompt)?.length },
                { key: 'tasks' as const, label: '任务', icon: '⏳', count: detailData?.tasks?.length },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setDetailTab(t.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                    detailTab === t.key
                      ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
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
              {detailTab === 'info' && (
                <>
                  {detailLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" /></div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                          <div className="text-xs text-violet-400 font-medium mb-1">作者</div>
                          <div className="text-sm text-gray-200">{detailModal.drama.ownerName}</div>
                        </div>
                        <div className="bg-pink-500/10 border border-pink-500/20 rounded-xl p-4">
                          <div className="text-xs text-pink-400 font-medium mb-1">状态</div>
                          <div>{getStatusBadge(detailModal.drama.status)}</div>
                        </div>
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                          <div className="text-xs text-blue-400 font-medium mb-1">集数进度</div>
                          <div className="text-sm font-medium text-gray-200">
                            {detailModal.drama.currentEpisodes}<span className="text-gray-400 mx-1">/</span>{detailModal.drama.totalEpisodes} 集
                          </div>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                          <div className="text-xs text-amber-400 font-medium mb-1">每集时长</div>
                          <div className="text-sm text-gray-200">{detailModal.drama.episodeDuration || 60}s</div>
                        </div>
                        {detailData?.novelTitle && (
                          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 col-span-2">
                            <div className="text-xs text-green-400 font-medium mb-1">关联小说</div>
                            <div className="text-sm text-gray-200">《{detailData.novelTitle}》</div>
                          </div>
                        )}
                        {detailModal.drama.platform && (
                          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <div className="text-xs text-gray-500 font-medium mb-1">发布平台</div>
                            <div className="text-sm text-gray-300">{detailModal.drama.platform}</div>
                          </div>
                        )}
                        {detailModal.drama.style && (
                          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <div className="text-xs text-gray-500 font-medium mb-1">风格</div>
                            <div className="text-sm text-gray-300">{detailModal.drama.style}</div>
                          </div>
                        )}
                      </div>
                      {detailModal.drama.description && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-300 mb-2">简介</h4>
                          <p className="text-sm text-gray-400 bg-white/5 rounded-xl p-4 leading-relaxed">{detailModal.drama.description}</p>
                        </div>
                      )}
                      {novelSettings && (() => {
                        const tabs = [
                          { key: 'characters' as const, label: `角色 (${novelSettings.characters?.length || 0})` },
                          { key: 'relationships' as const, label: `关系 (${novelSettings.relationships?.length || 0})` },
                          { key: 'scenes' as const, label: `场景 (${novelSettings.scenes?.length || 0})` },
                          { key: 'items' as const, label: `物品 (${novelSettings.items?.length || 0})` },
                        ];
                        return (
                          <div className="bg-white/3 border border-violet-500/15 rounded-xl overflow-hidden">
                            <button onClick={() => setShowNovelSettings(v => !v)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
                              <span className="text-sm font-bold text-violet-300 flex items-center gap-2">
                                <span className="text-xs">📖</span>
                                小说原著设定
                              </span>
                              <svg className={`w-4 h-4 text-gray-400 transition-transform ${showNovelSettings ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                            {showNovelSettings && (
                              <div className="border-t border-violet-500/15 p-4 space-y-3">
                                <div className="flex gap-1.5 flex-wrap">
                                  {tabs.map(t => (
                                    <button key={t.key} onClick={() => setNovelSettingsTab(t.key)}
                                      className={`px-2.5 py-1 text-[11px] rounded-lg transition-all ${novelSettingsTab === t.key ? 'bg-violet-600/40 text-violet-200 border border-violet-500/40' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                                      {t.label}
                                    </button>
                                  ))}
                                </div>
                                {novelSettingsTab === 'characters' && (
                                  <div className="space-y-2">
                                    {(novelSettings.characters?.length || 0) > 0 ? novelSettings.characters.map((c: any) => (
                                      <div key={c.id} className="bg-white/5 rounded-lg px-3 py-2">
                                        <div className="flex items-center gap-2 mb-0.5">
                                          <span className="text-xs font-bold text-white">{cleanCharName(c.name)}</span>
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.role === 'protagonist' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-400'}`}>{c.role === 'protagonist' ? '主角' : '配角'}</span>
                                        </div>
                                        {c.description && <p className="text-[11px] text-gray-400 line-clamp-2">{c.description}</p>}
                                      </div>
                                    )) : <p className="text-xs text-gray-500">暂无数据</p>}
                                  </div>
                                )}
                                {novelSettingsTab === 'relationships' && (
                                  <div className="space-y-2">
                                    {(novelSettings.relationships?.length || 0) > 0 ? novelSettings.relationships.map((r: any) => (
                                      <div key={r.id} className="bg-white/5 rounded-lg px-3 py-2">
                                        <div className="flex items-center gap-2 mb-0.5">
                                          <span className="text-xs font-bold text-amber-400">{r.fromCharacter}</span>
                                          <span className="text-gray-500">→</span>
                                          <span className="text-xs font-bold text-violet-400">{r.toCharacter}</span>
                                        </div>
                                        {r.relationship && <p className="text-[11px] text-gray-400 line-clamp-2">{r.relationship}</p>}
                                      </div>
                                    )) : <p className="text-xs text-gray-500">暂无数据</p>}
                                  </div>
                                )}
                                {novelSettingsTab === 'scenes' && (
                                  <div className="space-y-2">
                                    {(novelSettings.scenes?.length || 0) > 0 ? novelSettings.scenes.map((s: any) => (
                                      <div key={s.id} className="bg-white/5 rounded-lg px-3 py-2">
                                        <div className="text-xs font-bold text-emerald-400 mb-0.5">{s.name}</div>
                                        {s.description && <p className="text-[11px] text-gray-400 line-clamp-2">{s.description}</p>}
                                      </div>
                                    )) : <p className="text-xs text-gray-500">暂无数据</p>}
                                  </div>
                                )}
                                {novelSettingsTab === 'items' && (
                                  <div className="space-y-2">
                                    {(novelSettings.items?.length || 0) > 0 ? novelSettings.items.map((it: any) => (
                                      <div key={it.id} className="bg-white/5 rounded-lg px-3 py-2">
                                        <div className="text-xs font-bold text-sky-400 mb-0.5">{it.name}</div>
                                        {it.description && <p className="text-[11px] text-gray-400 line-clamp-2">{it.description}</p>}
                                      </div>
                                    )) : <p className="text-xs text-gray-500">暂无数据</p>}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </>
              )}

              {detailTab === 'episodes' && (
                <div className="space-y-2">
                  {detailLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" /></div>
                  ) : detailData?.episodes && detailData.episodes.length > 0 ? (
                    detailData.episodes.map((ep: Episode) => (
                      <div key={ep.id} className="flex gap-3 items-start bg-white/5 border border-white/10 rounded-xl p-4">
                        <span className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-violet-600/20 text-violet-300 text-sm font-bold">
                          {ep.episodeNumber}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-white">{ep.title || `第${ep.episodeNumber}集`}</span>
                            {ep.sourceChapter != null && Number(ep.sourceChapter) > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">来自第{ep.sourceChapter}章</span>}
                            {ep.duration && <span className="text-[10px] text-gray-500">{ep.duration}s</span>}
                          </div>
                          {ep.synopsis && <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{ep.synopsis}</p>}
                          <div className="flex gap-3 mt-2 text-[10px] text-gray-500">
                            {ep.screenplay && <span>剧本 ✓</span>}
                            {ep.scenes && <span>场景 ✓</span>}
                            {ep.dialogues && <span>对白 ✓</span>}
                            {ep.imagePrompts && <span>图片提示词 ✓</span>}
                            {ep.videoPrompts && <span>视频提示词 ✓</span>}
                          </div>
                        </div>
                        <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full ${
                          ep.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                        }`}>{ep.status === 'completed' ? '已完成' : ep.status === 'generating' ? '生成中' : '草稿'}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">暂无分集数据</div>
                  )}
                </div>
              )}

              {/* 角色列表 */}
              {detailTab === 'characters' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">共 {detailData?.characters?.length || 0} 个角色</span>
                    <div className="flex gap-2">
                      <button onClick={() => setStyleModal('character')} className="px-3 py-1.5 text-xs bg-violet-500/20 border border-violet-500/30 text-violet-400 rounded-lg hover:bg-violet-500/30 transition-all">🎨 风格设置</button>
                    {detailData?.characters?.length > 0 && (
                      <button onClick={async () => {
                        if (!confirm('确认清除全部角色？')) return;
                        await fetch(`/api/short-dramas/${detailModal.drama?.id}/characters`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ clearAll: true }) });
                        const res = await fetch(`/api/admin/short-dramas/${detailModal.drama?.id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
                        const d = await res.json(); if (d.success) setDetailData(d.data);
                      }} className="px-3 py-1.5 text-xs bg-red-700/70 text-white rounded-lg hover:bg-red-700 transition-all">
                        🗑️ 批量清除
                      </button>
                    )}
                    </div>
                  </div>
                  {detailLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" /></div>
                  ) : detailData?.characters && detailData.characters.length > 0 ? (() => {
                    const parseAppearanceField = (appearance: string, label: string): string => {
                      const regex = new RegExp(`${label}[：:]\\s*([^｜|]*)`);
                      const match = appearance.match(regex);
                      return match ? match[1].trim() : '';
                    };
                    const renderCharCard = (c: any) => {
                      // 如果 gender 为空但 personality 包含性别信息，自动提取
                      let gender = c.gender || '';
                      let personality = c.personality || '';
                      if (!gender && (personality === '男' || personality === '女')) {
                        gender = personality;
                        personality = '';
                      }
                      return (
                      <div key={c.id} onClick={() => { setDetailEditEntity({ type: 'character', data: c }); setDetailEditForm({ name: c.name || '', role: c.role || 'supporting', gender, description: c.description || '', personality, appearance: c.appearance || '', appearanceHairColor: parseAppearanceField(c.appearance || '', '发色'), appearanceHairstyle: parseAppearanceField(c.appearance || '', '发型'), appearanceEyes: parseAppearanceField(c.appearance || '', '眼睛'), appearanceUpper: parseAppearanceField(c.appearance || '', '上身'), appearanceLower: parseAppearanceField(c.appearance || '', '下身') }); }} className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-4 hover:border-violet-500/40 hover:bg-violet-500/5 cursor-pointer transition-all group">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400 to-pink-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 overflow-hidden">
                          {c.imageUrl ? <img src={c.imageUrl} alt="" className="w-full h-full object-cover" /> : cleanCharName(c.name)?.[0] || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white">{cleanCharName(c.name)}</span>
                            {c.gender && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.gender === '男' ? 'bg-blue-500/20 text-blue-400' : 'bg-pink-500/20 text-pink-400'}`}>{c.gender}</span>}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              c.role === 'protagonist' ? 'bg-amber-500/20 text-amber-400' :
                              c.role === 'antagonist' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'
                            }`}>{c.role === 'protagonist' ? '主角' : c.role === 'antagonist' ? '反派' : '配角'}</span>
                          </div>
                          {c.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{c.description}</p>}
                          {c.personality && <p className="text-[10px] text-violet-400/80 mt-0.5">性格: {c.personality}</p>}
                          {c.appearance && <p className="text-[10px] text-pink-400/80 mt-0.5 line-clamp-1">外貌: {c.appearance}</p>}
                          <div className="flex gap-2 mt-1 text-[10px] text-gray-500">
                            {c.voiceProvider && <span>🔊 {c.voiceProvider}</span>}
                            {c.imageUrl && <span>🖼️ 有形象图</span>}
                          </div>
                        </div>
                      </div>
                    );
                    };
                    const protagonists = detailData.characters.filter((c: any) => c.role === 'protagonist');
                    const antagonists = detailData.characters.filter((c: any) => c.role === 'antagonist');
                    const supporting = detailData.characters.filter((c: any) => c.role !== 'protagonist' && c.role !== 'antagonist');
                    return (
                      <div className="space-y-4">
                        {protagonists.length > 0 && (
                          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                            <div className="text-xs font-semibold text-amber-400">⭐ 主角 ({protagonists.length})</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{protagonists.map(renderCharCard)}</div>
                          </div>
                        )}
                        {antagonists.length > 0 && (
                          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                            <div className="text-xs font-semibold text-red-400">⚡ 反派 ({antagonists.length})</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{antagonists.map(renderCharCard)}</div>
                          </div>
                        )}
                        {supporting.length > 0 && (
                          <div className="rounded-xl border border-gray-500/20 bg-white/3 p-3 space-y-2">
                            <div className="text-xs font-semibold text-gray-400">👥 配角 ({supporting.length})</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{supporting.map(renderCharCard)}</div>
                          </div>
                        )}
                      </div>
                    );
                  })() : (
                    <div className="text-center py-8 text-gray-500 text-sm">暂无角色数据</div>
                  )}
                </div>
              )}

              {/* 场景列表 */}
              {detailTab === 'scenes' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">共 {detailData?.scenes?.length || 0} 个场景</span>
                    <div className="flex gap-2">
                      <button onClick={() => setStyleModal('scene')} className="px-3 py-1.5 text-xs bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-all">🎨 风格设置</button>
                    {detailData?.scenes?.length > 0 && (
                      <button onClick={async () => {
                        if (!confirm('确认清除全部场景？')) return;
                        await fetch(`/api/short-dramas/${detailModal.drama?.id}/scenes`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ clearAll: true }) });
                        const res = await fetch(`/api/admin/short-dramas/${detailModal.drama?.id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
                        const d = await res.json(); if (d.success) setDetailData(d.data);
                      }} className="px-3 py-1.5 text-xs bg-red-700/70 text-white rounded-lg hover:bg-red-700 transition-all">
                        🗑️ 批量清除
                      </button>
                    )}
                    </div>
                  </div>
                  {detailLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" /></div>
                  ) : detailData?.scenes && detailData.scenes.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {detailData.scenes.map((s: any, idx: number) => (
                        <div key={s.id} onClick={() => { setDetailEditEntity({ type: 'scene', data: s }); setDetailEditForm({ name: s.name || '', description: s.description || '', atmosphere: s.atmosphere || '' }); }} className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-4 hover:border-emerald-500/40 hover:bg-emerald-500/5 cursor-pointer transition-all group">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{idx + 1}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">{s.name}</span>
                              {s.atmosphere && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">{s.atmosphere}</span>}
                            </div>
                            {s.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{s.description}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">暂无场景数据</div>
                  )}
                </div>
              )}

              {/* 物品列表 */}
              {detailTab === 'items' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">共 {detailData?.items?.length || 0} 个物品</span>
                    <div className="flex gap-2">
                      <button onClick={() => setStyleModal('item')} className="px-3 py-1.5 text-xs bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-all">🎨 风格设置</button>
                    {detailData?.items?.length > 0 && (
                      <button onClick={async () => {
                        if (!confirm('确认清除全部物品？')) return;
                        await fetch(`/api/short-dramas/${detailModal.drama?.id}/items`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ clearAll: true }) });
                        const res = await fetch(`/api/admin/short-dramas/${detailModal.drama?.id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
                        const d = await res.json(); if (d.success) setDetailData(d.data);
                      }} className="px-3 py-1.5 text-xs bg-red-700/70 text-white rounded-lg hover:bg-red-700 transition-all">
                        🗑️ 批量清除
                      </button>
                    )}
                    </div>
                  </div>
                  {detailLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" /></div>
                  ) : detailData?.items && detailData.items.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {detailData.items.map((item: any, idx: number) => (
                        <div key={item.id} onClick={() => { setDetailEditEntity({ type: 'item', data: item }); setDetailEditForm({ name: item.name || '', description: item.description || '', significance: item.significance || '' }); }} className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-4 hover:border-amber-500/40 hover:bg-amber-500/5 cursor-pointer transition-all group">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{idx + 1}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">{item.name}</span>
                              {item.significance && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">{item.significance}</span>}
                            </div>
                            {item.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{item.description}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">暂无物品数据</div>
                  )}
                </div>
              )}

              {/* 分镜列表 */}
              {(detailTab === 'image-storyboards' || detailTab === 'video-storyboards') && (() => {
                const storyMode = detailTab === 'image-storyboards' ? 'image' : 'video';
                return (
                <div className="space-y-3">
                  {/* 分集选择 + 生成按钮 */}
                  {detailData?.episodes && detailData.episodes.length > 0 && (() => {
                    const curEpId = storyboardEpisodeId || detailData.episodes[0]?.id;
                    const curShots = detailData.shots?.filter((s: any) => s.episodeId === curEpId) || [];
                    const handleGen = async (type: 'image' | 'video') => {
                      if (!curEpId || !detailModal.drama) return;
                      if (!storyboardConfigId) { setStoryboardMsg('请先选择AI配置'); return; }
                      const dramId = detailModal.drama.id;
                      setStoryboardGenerating(type); setStoryboardMsg('生成中，请稍候…');
                      try {
                        const token = getToken();
                        const res = await fetch(`/api/short-dramas/${dramId}/generate`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ action: type === 'image' ? 'generate-image-prompt' : 'generate-video-prompt', episodeId: curEpId, configId: storyboardConfigId }),
                        });
                        const data = await res.json();
                        if (data.success) {
                          setStoryboardMsg('任务已提交，后台生成中…');
                          broadcastDataChange({ type: 'short-drama', action: 'update', id: dramId });
                          setTimeout(() => refreshDetail(dramId), 8000);
                        } else { setStoryboardMsg(data.error || '生成失败'); }
                      } catch (e: any) { setStoryboardMsg(e.message); }
                      finally { setStoryboardGenerating(null); }
                    };
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-400">选分集:</span>
                          {detailData.episodes.map((ep: any) => (
                            <button key={ep.id} onClick={() => setStoryboardEpisodeId(ep.id)}
                              className={`px-2.5 py-1 text-[11px] rounded-lg transition-all ${(storyboardEpisodeId || detailData.episodes[0]?.id) === ep.id ? 'bg-violet-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                              第{ep.episodeNumber}集
                            </button>
                          ))}
                          <span className="text-xs text-gray-600 ml-1">{curShots.length} 个分镜</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {aiConfigs.length > 0 && (
                            <select value={storyboardConfigId} onChange={e => setStoryboardConfigId(e.target.value)}
                              className="px-2 py-1 text-[11px] bg-white/5 border border-white/15 rounded-lg text-gray-300 focus:outline-none focus:border-violet-500">
                              <option value="">选择AI配置</option>
                              {aiConfigs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          )}
                          {storyMode === 'image' ? (
                            <button onClick={() => handleGen('image')} disabled={!!storyboardGenerating || !storyboardConfigId}
                              className="px-3 py-1.5 text-xs bg-sky-600/80 text-white rounded-lg hover:bg-sky-600 disabled:opacity-40 transition-all flex items-center gap-1">
                              {storyboardGenerating === 'image' ? <><span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />生成中…</> : '🖼️ 生成图片提示词'}
                            </button>
                          ) : (
                            <button onClick={() => handleGen('video')} disabled={!!storyboardGenerating || !storyboardConfigId}
                              className="px-3 py-1.5 text-xs bg-violet-600/80 text-white rounded-lg hover:bg-violet-600 disabled:opacity-40 transition-all flex items-center gap-1">
                              {storyboardGenerating === 'video' ? <><span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />生成中…</> : '🎥 生成视频提示词'}
                            </button>
                          )}
                          {storyboardMsg && <span className={`text-xs ${storyboardMsg.includes('失败') || storyboardMsg.includes('错误') ? 'text-red-400' : 'text-green-400 animate-pulse'}`}>{storyboardMsg}</span>}
                        </div>
                      </div>
                    );
                  })()}

                  {detailLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" /></div>
                  ) : (() => {
                    const visShots = (detailData?.shots || []).filter((s: any) => storyMode === 'image' ? s.imagePrompt : s.videoPrompt);
                    return visShots.length > 0 ? (
                    <>
                      <div className="flex gap-2 mb-3 text-xs text-gray-500 flex-wrap">
                        <span>共 {visShots.length} 个分镜有{storyMode === 'image' ? '图片' : '视频'}提示词</span>
                        <span>·</span>
                        <span className="text-gray-600">总分镜: {detailData?.shots?.length || 0}</span>
                      </div>
                      {visShots.slice(0, 30).map((s: any) => (
                        <div key={s.id} className="flex gap-3 items-start bg-white/5 border border-white/10 rounded-xl p-3">
                          <div className="w-20 h-14 rounded-lg bg-gray-800 flex-shrink-0 flex items-center justify-center overflow-hidden">
                            {s.imageUrl ? <img src={s.imageUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-gray-600 text-xs">#{s.shotNumber}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-bold text-white">镜头 #{s.shotNumber}</span>
                              {s.cameraAngle && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">{s.cameraAngle}</span>}
                              {s.duration && <span className="text-[10px] text-gray-500">{s.duration}s</span>}
                            </div>
                            {s.sceneDescription && <p className="text-xs text-gray-300 line-clamp-1">{s.sceneDescription}</p>}
                            {s.dialogue && <p className="text-[10px] text-amber-400/80 line-clamp-1">💬 {s.dialogue}</p>}
                            {storyMode === 'image'
                              ? s.imagePrompt && <p className="text-[10px] text-sky-400/80 line-clamp-2 italic font-medium border-l-2 border-sky-500/40 pl-1.5">🖼️ {s.imagePrompt}</p>
                              : s.videoPrompt && <p className="text-[10px] text-violet-400/80 line-clamp-2 italic font-medium border-l-2 border-violet-500/40 pl-1.5">🎥 {s.videoPrompt}</p>
                            }
                            <div className="flex gap-1.5 mt-1">
                              {s.imageUrl && <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="图片" />}
                              {s.videoUrl && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" title="视频" />}
                              {s.audioUrl && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="音频" />}
                            </div>
                          </div>
                        </div>
                      ))}
                      {visShots.length > 30 && (
                        <div className="text-center text-xs text-gray-500 py-2">仅显示前30个，共 {visShots.length} 个</div>
                      )}
                    </>
                    ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">暂无{storyMode === 'image' ? '图片' : '视频'}提示词，点击上方按鈕生成</div>
                    );
                  })()}
                </div>
                );
              })()}

              {/* 任务列表 */}
              {detailTab === 'tasks' && (
                <div className="space-y-2">
                  {detailLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" /></div>
                  ) : detailData?.tasks && detailData.tasks.length > 0 ? (
                    detailData.tasks.map((t: any) => (
                      <div key={t.id} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
                        <span className={`flex-shrink-0 w-2 h-2 rounded-full ${
                          t.status === 'completed' ? 'bg-green-400' :
                          t.status === 'failed' ? 'bg-red-400' :
                          t.status === 'running' ? 'bg-blue-400 animate-pulse' : 'bg-gray-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-white">{t.type}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              t.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                              t.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                              t.status === 'running' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                            }`}>{t.status === 'completed' ? '已完成' : t.status === 'failed' ? '失败' : t.status === 'running' ? '运行中' : '等待中'}</span>
                          </div>
                          {t.error && <p className="text-[10px] text-red-400 mt-0.5 line-clamp-1">{t.error}</p>}
                          {t.provider && <span className="text-[10px] text-gray-500">{t.provider} {t.model || ''}</span>}
                        </div>
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">{t.createdAt ? new Date(t.createdAt).toLocaleString("zh-CN") : ''}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">暂无任务记录</div>
                  )}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 border-t border-white/10 rounded-b-2xl px-6 py-4 flex justify-end gap-3" style={{ background: 'rgba(15,12,41,0.98)' }}>
              <button onClick={() => setDetailModal({ visible: false, drama: null })} className="px-5 py-2.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all">关闭</button>
              <button
                onClick={() => { const d = detailModal.drama!; setDetailModal({ visible: false, drama: null }); openEdit(d); }}
                className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl hover:from-violet-700 hover:to-indigo-700 shadow-sm shadow-violet-500/20 transition-all"
              >编辑</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {editModal.visible && editModal.drama && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditModal({ visible: false, drama: null })}>
          <div className="backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 border border-white/10" style={{ background: 'rgba(15,12,41,0.95)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-6">编辑短剧 —《{editModal.drama.title}》</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1.5">标题</label>
                <input type="text" className="w-full px-4 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/30" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1.5">简介</label>
                <textarea rows={3} className="w-full px-4 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/30" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">类型</label>
                  <input type="text" className="w-full px-3 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30" value={editForm.genre} onChange={e => setEditForm(f => ({ ...f, genre: e.target.value }))} placeholder="如：都市、悬疑" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">状态</label>
                  <select className="w-full px-3 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="draft">草稿</option>
                    <option value="generating">生成中</option>
                    <option value="completed">已完成</option>
                    <option value="published">已发布</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">总集数</label>
                  <input type="number" min={0} className="w-full px-3 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30" value={editForm.totalEpisodes} onChange={e => setEditForm(f => ({ ...f, totalEpisodes: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">每集时长(秒)</label>
                  <input type="number" min={1} className="w-full px-3 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30" value={editForm.episodeDuration} onChange={e => setEditForm(f => ({ ...f, episodeDuration: parseInt(e.target.value) || 60 }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">平台</label>
                  <input type="text" className="w-full px-3 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30" value={editForm.platform} onChange={e => setEditForm(f => ({ ...f, platform: e.target.value }))} placeholder="如：抖音、快手" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">风格</label>
                  <input type="text" className="w-full px-3 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30" value={editForm.style} onChange={e => setEditForm(f => ({ ...f, style: e.target.value }))} placeholder="如：写实、动画" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-white/10">
              <button onClick={() => setEditModal({ visible: false, drama: null })} className="px-5 py-2.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all">取消</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl disabled:opacity-50 shadow-sm transition-all">
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 风格设置弹窗 */}
      {styleModal && (
        <AdminStyleModal
          type={styleModal}
          style={parseStyle(styleModal === 'character' ? detailData?.characterStyle : styleModal === 'scene' ? detailData?.sceneStyle : detailData?.itemStyle)}
          onSave={s => saveStyle(styleModal, s)}
          onClose={() => setStyleModal(null)}
        />
      )}

      {/* 新建弹窗 */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setCreateModal(false)}>
          <div className="backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 border border-white/10" style={{ background: 'rgba(15,12,41,0.95)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-6">新建短剧</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1.5">标题 *</label>
                <input type="text" className="w-full px-4 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/30" value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} placeholder="输入短剧标题" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1.5">简介</label>
                <textarea rows={3} className="w-full px-4 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/30" value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">类型</label>
                  <input type="text" className="w-full px-3 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30" value={createForm.genre} onChange={e => setCreateForm(f => ({ ...f, genre: e.target.value }))} placeholder="如：都市、悬疑" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">总集数</label>
                  <input type="number" min={1} className="w-full px-3 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30" value={createForm.totalEpisodes} onChange={e => setCreateForm(f => ({ ...f, totalEpisodes: parseInt(e.target.value) || 10 }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">每集时长(秒)</label>
                  <input type="number" min={1} className="w-full px-3 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30" value={createForm.episodeDuration} onChange={e => setCreateForm(f => ({ ...f, episodeDuration: parseInt(e.target.value) || 60 }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">关联小说ID</label>
                  <input type="text" className="w-full px-3 py-2.5 border border-white/15 rounded-xl bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30" value={createForm.novelId} onChange={e => setCreateForm(f => ({ ...f, novelId: e.target.value }))} placeholder="可选" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-white/10">
              <button onClick={() => setCreateModal(false)} className="px-5 py-2.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all">取消</button>
              <button onClick={handleCreate} disabled={creating || !createForm.title} className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl disabled:opacity-50 shadow-sm transition-all">
                {creating ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
