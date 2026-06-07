"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { novelApi, NovelListItem, adminNovelApi, AdminNovelListItem } from "@/lib/api/client";
import { getCategoryLabel } from "@/lib/category";
import AIConfigModal from "@/components/AIConfigModal";
import { getToken } from "@/lib/get-token";
import { broadcastDataChange, onDataChange } from "@/lib/data-sync";

interface UserInfo {
  id: string;
  username: string;
  nickname?: string;
  role?: string;
}

export default function MyNovelsPage() {
	const router = useRouter();
	const [novels, setNovels] = useState<(NovelListItem | AdminNovelListItem)[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [filter, setFilter] = useState<string>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [showAiConfigModal, setShowAiConfigModal] = useState(false);
	const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

	const [viewNovel, setViewNovel] = useState<any>(null);
	const [editingChapterIndex, setEditingChapterIndex] = useState<number | null>(null);
	const [editingChapterContent, setEditingChapterContent] = useState('');
	const [saving, setSaving] = useState(false);
	const [savingChapter, setSavingChapter] = useState(false);
	const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
	const isAdmin = userInfo?.role === 'admin';
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [selectMode, setSelectMode] = useState(false);
	const [batchDeleting, setBatchDeleting] = useState(false);
	const [selectedChapterIndices, setSelectedChapterIndices] = useState<Set<number>>(new Set());
	const [chapterSelectMode, setChapterSelectMode] = useState(false);
	const [deletingChapterIndex, setDeletingChapterIndex] = useState<number | null>(null);

	// 搜索过滤：按小说名、作者（管理员）、日期
	const filteredNovels = useMemo(() => {
		if (!searchQuery.trim()) return novels;
		const q = searchQuery.trim().toLowerCase();
		return novels.filter((novel: any) => {
			if (novel.title?.toLowerCase().includes(q)) return true;
			if (isAdmin) {
				if (novel.ownerName?.toLowerCase().includes(q)) return true;
				if (novel.ownerEmail?.toLowerCase().includes(q)) return true;
			}
			if (novel.updatedAt) {
				const dateStr = new Date(novel.updatedAt).toLocaleDateString('zh-CN');
				if (dateStr.includes(q)) return true;
			}
			return false;
		});
	}, [novels, searchQuery, isAdmin]);

	const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
		setToast({ message, type });
		setTimeout(() => setToast(null), 3000);
	};

	useEffect(() => {
		const token = getToken();
		const userStr = localStorage.getItem("user");
		if (token && userStr) {
			try {
				setUserInfo(JSON.parse(userStr));
			} catch {
				// ignore
			}
		}
	}, []);

	const fetchNovels = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			if (isAdmin) {
				const data = await adminNovelApi.getList({ limit: 100 });
				setNovels(data.novels);
			} else {
				const status = filter === "all" ? undefined : filter;
				const data = await novelApi.getList({ status, limit: 100 });
				setNovels(data.novels);
			}
		} catch (err: any) {
			if (err.message?.includes("请先登录")) {
				router.push("/auth/login");
				return;
			}
			setError(err.message || "获取小说列表失败");
		} finally {
			setLoading(false);
		}
	}, [filter, router, isAdmin]);

	useEffect(() => {
		fetchNovels();
	}, [fetchNovels]);

	useEffect(() => {
		const cleanup = onDataChange((e) => {
			if (e.type === 'novel' || e.type === 'script') fetchNovels();
		});
		return cleanup;
	}, [fetchNovels]);

	const handleDelete = async (id: string) => {
		if (!confirm("确定要删除这部小说吗？此操作不可撤销。")) {
			return;
		}
		setDeletingId(id);
		try {
			if (isAdmin) {
				const token = getToken();
				await fetch(`/api/admin/novels/${id}`, {
					method: 'DELETE',
					headers: { 'Authorization': `Bearer ${token}` }
				});
			} else {
				await novelApi.delete(id);
			}
			broadcastDataChange({ type: 'novel', action: 'delete', id });
			await fetchNovels();
		} catch (err: any) {
			alert(err.message || "删除失败");
		} finally {
			setDeletingId(null);
		}
	};

	// 查看小说详情
	const handleView = async (id: string) => {
		try {
			const novel = isAdmin ? await adminNovelApi.getById(id) : await novelApi.getById(id);
			setViewNovel(novel);
			setEditingChapterIndex(null);
			setEditingChapterContent('');
		} catch (err: any) {
			alert(err.message || "获取小说详情失败");
		}
	};

	// 开始编辑章节
	const handleStartEditChapter = (index: number) => {
		if (!viewNovel?.chapters?.[index]) return;
		setEditingChapterIndex(index);
		setEditingChapterContent(viewNovel.chapters[index].content || '');
	};

	// 取消编辑章节
	const handleCancelEditChapter = () => {
		setEditingChapterIndex(null);
		setEditingChapterContent('');
	};

	// 保存章节修改
	const handleSaveChapter = async () => {
		if (editingChapterIndex === null || !viewNovel) return;
		setSavingChapter(true);
		try {
			const newChapters = [...viewNovel.chapters];
			newChapters[editingChapterIndex] = {
				...newChapters[editingChapterIndex],
				content: editingChapterContent,
			};
			const updatedNovel = { ...viewNovel, chapters: newChapters };
			if (isAdmin) {
				const token = getToken();
				await fetch(`/api/admin/novels/${viewNovel.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
					body: JSON.stringify({ chapters: newChapters, currentChapters: newChapters.length }),
				});
			} else {
				await novelApi.update(viewNovel.id, { chapters: newChapters, currentChapters: newChapters.length });
			}
			setViewNovel(updatedNovel);
			setEditingChapterIndex(null);
			setEditingChapterContent('');
			showToast('章节内容已保存', 'success');
			await fetchNovels();
		} catch (err: any) {
			showToast(err.message || '保存失败', 'error');
		} finally {
			setSavingChapter(false);
		}
	};

	// 删除单个章节
	const handleDeleteSingleChapter = async (index: number) => {
		if (!viewNovel) return;
		if (!confirm(`确定要删除第${index + 1}章吗？此操作不可撤销。`)) return;
		setDeletingChapterIndex(index);
		try {
			const newChapters = viewNovel.chapters.filter((_: any, i: number) => i !== index);
			if (isAdmin) {
				const token = getToken();
				await fetch(`/api/admin/novels/${viewNovel.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ chapters: newChapters, currentChapters: newChapters.length }) });
			} else {
				await novelApi.update(viewNovel.id, { chapters: newChapters, currentChapters: newChapters.length });
			}
			setViewNovel({ ...viewNovel, chapters: newChapters });
			showToast('章节已删除', 'success');
			await fetchNovels();
		} catch (err: any) { showToast(err.message || '删除失败', 'error'); }
		finally { setDeletingChapterIndex(null); }
	};

	// 批量删除章节
	const handleBatchDeleteChapters = async () => {
		if (!viewNovel || selectedChapterIndices.size === 0) return;
		const count = selectedChapterIndices.size;
		if (!confirm(`确定要删除选中的 ${count} 章吗？此操作不可撤销。`)) return;
		try {
			const newChapters = viewNovel.chapters.filter((_: any, i: number) => !selectedChapterIndices.has(i));
			if (isAdmin) {
				const token = getToken();
				await fetch(`/api/admin/novels/${viewNovel.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ chapters: newChapters, currentChapters: newChapters.length }) });
			} else {
				await novelApi.update(viewNovel.id, { chapters: newChapters, currentChapters: newChapters.length });
			}
			setViewNovel({ ...viewNovel, chapters: newChapters });
			setSelectedChapterIndices(new Set());
			setChapterSelectMode(false);
			showToast(`已删除 ${count} 章`, 'success');
			await fetchNovels();
		} catch (err: any) { showToast(err.message || '批量删除失败', 'error'); }
	};

	// 保存整部小说修改
	const handleSaveNovel = async () => {
		if (!viewNovel) return;
		setSaving(true);
		try {
			if (isAdmin) {
				const token = getToken();
				await fetch(`/api/admin/novels/${viewNovel.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
					body: JSON.stringify({
						title: viewNovel.title,
						description: viewNovel.description,
						category: viewNovel.category,
						genderTarget: viewNovel.genderTarget,
						tone: viewNovel.tone,
						protagonist: viewNovel.protagonist,
						chapters: viewNovel.chapters,
						currentChapters: viewNovel.chapters?.length || 0,
					}),
				});
			} else {
				await novelApi.update(viewNovel.id, {
					title: viewNovel.title,
					description: viewNovel.description,
					category: viewNovel.category,
					genderTarget: viewNovel.genderTarget,
					tone: viewNovel.tone,
					protagonist: viewNovel.protagonist,
					chapters: viewNovel.chapters,
					currentChapters: viewNovel.chapters?.length || 0,
				});
			}
			showToast('小说已更新', 'success');
			await fetchNovels();
		} catch (err: any) {
			showToast(err.message || '保存失败', 'error');
		} finally {
			setSaving(false);
		}
	};

	const toggleSelect = (id: string) => {
		setSelectedIds(prev => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id); else next.add(id);
			return next;
		});
	};

	const handleBatchDelete = async (all = false) => {
		const toDelete = all ? filteredNovels.map((n: any) => n.id) : [...selectedIds];
		if (!toDelete.length) { showToast('请先选择要删除的小说', 'info'); return; }
		const label = all ? `全部 ${toDelete.length}` : `选中的 ${toDelete.length}`;
		if (!confirm(`确定要删除${label}部小说吗？此操作不可撤销。`)) return;
		setBatchDeleting(true);
		try {
			for (const id of toDelete) {
				try {
					if (isAdmin) {
						const token = getToken();
						await fetch(`/api/admin/novels/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
					} else {
						await novelApi.delete(id);
					}
				} catch {}
			}
			broadcastDataChange({ type: 'novel', action: 'delete', id: toDelete[0] });
			setSelectedIds(new Set());
			setSelectMode(false);
			await fetchNovels();
			showToast(`已删除 ${toDelete.length} 部小说`, 'success');
		} catch (err: any) {
			showToast(err.message || '批量删除失败', 'error');
		} finally {
			setBatchDeleting(false);
		}
	};

	const getStatusBadge = (status: string) => {
		const badges: Record<string, { bg: string; text: string; label: string }> = {
			draft: { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-300", label: "草稿" },
			generating: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400", label: "生成中" },
			completed: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-600 dark:text-green-400", label: "已完成" },
		};
		const badge = badges[status] || badges.draft;
		return (
			<span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
				{badge.label}
			</span>
		);
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString("zh-CN", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	return (
		<div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #0d1b2a 100%)' }}>
			{/* 背景装饰 */}
			<div className="fixed inset-0 pointer-events-none overflow-hidden">
				<div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/8 rounded-full blur-3xl" />
				<div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/8 rounded-full blur-3xl" />
				<div className="absolute top-1/2 left-0 w-64 h-64 bg-violet-600/6 rounded-full blur-3xl" />
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
						<Link href="/scripts" className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 border border-amber-500/25 text-amber-400 rounded-lg hover:bg-amber-500/25 transition-colors text-xs font-medium">
							<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
							</svg>
							我的剧本
						</Link>
						<Link href="/short-dramas" className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/15 border border-purple-500/25 text-purple-400 rounded-lg hover:bg-purple-500/25 transition-colors text-xs font-medium">
							<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
							短剧制作
						</Link>
						{isAdmin && (
							<Link href="/admin/members" className="flex items-center gap-1.5 px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-xs font-medium">
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
						<Link href="/member" className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 transition-colors text-sm">
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
							</svg>
							会员中心
						</Link>
						<button onClick={() => setShowAiConfigModal(true)} className="flex items-center gap-1.5 text-gray-400 hover:text-purple-400 transition-colors text-sm">
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
							API设置
						</button>
					</div>
				</div>
			</header>

			<main className="relative z-10 max-w-7xl mx-auto px-6 py-10">
				{/* 页面标题区 */}
				<div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10">
					<div>
						<div className="flex items-center gap-3 mb-2">
							<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/30 to-indigo-500/30 border border-purple-500/20 flex items-center justify-center">
								<svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
								</svg>
							</div>
							<h1 className="text-3xl font-bold text-white tracking-tight">我的小说库</h1>
						</div>
						<p className="text-gray-500 text-sm ml-1">{isAdmin ? '管理员模式 · 查看所有用户的创作' : `共 ${novels.length} 部作品 · 记录您的创作历程`}</p>
					</div>
					<div className="flex items-center gap-2">
						{!loading && novels.length > 0 && (
							<button
								onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
								className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm border transition-all ${
									selectMode
										? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
										: 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
								}`}
							>
								{selectMode ? (
									<><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>退出管理</>
								) : (
									<><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>管理删除</>
								)}
							</button>
						)}
						<Link
							href="/novel-generator"
							className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white text-sm transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/20"
							style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
						>
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
							</svg>
							创作新小说
						</Link>
					</div>
				</div>

				{/* 批量操作栏 */}
				{selectMode && !loading && (
					<div className="flex flex-wrap items-center gap-3 mb-5 px-4 py-3 rounded-xl border border-purple-500/20" style={{ background: 'rgba(124,58,237,0.06)' }}>
						<label className="flex items-center gap-2 cursor-pointer select-none">
							<input
								type="checkbox"
								checked={filteredNovels.length > 0 && selectedIds.size === filteredNovels.length}
								onChange={(e) => setSelectedIds(e.target.checked ? new Set(filteredNovels.map((n: any) => n.id)) : new Set())}
								className="w-4 h-4 rounded accent-purple-500"
							/>
							<span className="text-sm text-gray-300 font-medium">
								{selectedIds.size > 0 ? `已选 ${selectedIds.size} 部` : `全选 (${filteredNovels.length})`}
							</span>
						</label>
						<div className="flex-1" />
						{selectedIds.size > 0 && (
							<button
								onClick={() => handleBatchDelete(false)}
								disabled={batchDeleting}
								className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 disabled:opacity-50 transition-all"
							>
								<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
								{batchDeleting ? '删除中...' : `删除选中 (${selectedIds.size})`}
							</button>
						)}
						<button
							onClick={() => handleBatchDelete(true)}
							disabled={batchDeleting || filteredNovels.length === 0}
							className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-red-900/20 border border-red-700/30 text-red-300 hover:bg-red-900/30 disabled:opacity-40 transition-all"
						>
							{batchDeleting ? '删除中...' : `清空全部 (${filteredNovels.length})`}
						</button>
					</div>
				)}

				{/* 筛选 + 搜索栏 */}
				<div className="flex flex-col sm:flex-row gap-4 mb-8">
					<div className="flex gap-1.5 p-1.5 rounded-xl border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
						{[
							{ value: "all", label: "全部" },
							{ value: "draft", label: "草稿" },
							{ value: "generating", label: "生成中" },
							{ value: "completed", label: "完成" },
						].map((item) => (
							<button
								key={item.value}
								onClick={() => setFilter(item.value)}
								className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
									filter === item.value
										? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20"
										: "text-gray-400 hover:text-white hover:bg-white/5"
								}`}
							>
								{item.label}
							</button>
						))}
					</div>
					<div className="relative flex-1">
						<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
							<svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
							</svg>
						</div>
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder={isAdmin ? '搜索小说名、作者或日期...' : '搜索小说名...'}
							className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-white/8 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all"
							style={{ background: 'rgba(255,255,255,0.04)' }}
						/>
						{searchQuery && (
							<button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-300">
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						)}
					</div>
				</div>

				{searchQuery && !loading && (
					<p className="text-xs text-gray-500 mb-5">搜索 &quot;{searchQuery}&quot; · 找到 {filteredNovels.length} 部</p>
				)}

				{/* 加载状态 */}
				{loading && (
					<div className="flex flex-col items-center justify-center py-32 gap-4">
						<div className="relative w-12 h-12">
							<div className="absolute inset-0 rounded-full border-2 border-purple-500/20" />
							<div className="absolute inset-0 rounded-full border-2 border-t-purple-500 animate-spin" />
						</div>
						<p className="text-gray-500 text-sm">加载中...</p>
					</div>
				)}

				{/* 错误提示 */}
				{error && (
					<div className="border border-red-500/20 rounded-xl p-4 text-red-400 text-sm mb-6" style={{ background: 'rgba(239,68,68,0.08)' }}>
						{error}
					</div>
				)}

				{/* 小说列表 */}
				{!loading && !error && (
					<>
						{novels.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-32 gap-4">
								<div className="w-20 h-20 rounded-2xl border border-white/8 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
									<svg className="w-9 h-9 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
									</svg>
								</div>
								<div className="text-center">
									<p className="text-white font-semibold mb-1">还没有小说</p>
									<p className="text-gray-500 text-sm">开始创作您的第一部作品吧</p>
								</div>
								<Link href="/novel-generator" className="mt-2 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:scale-105" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
									<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
									开始创作
								</Link>
							</div>
						) : (
							<>
								{filteredNovels.length === 0 ? (
									<div className="flex flex-col items-center justify-center py-32 gap-4">
										<div className="w-16 h-16 rounded-2xl border border-white/8 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
											<svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
											</svg>
										</div>
										<div className="text-center">
											<p className="text-white font-semibold mb-1">未找到匹配结果</p>
											<p className="text-gray-500 text-sm">试试其他关键词</p>
										</div>
										<button onClick={() => setSearchQuery('')} className="px-5 py-2 rounded-xl text-purple-400 border border-purple-500/30 hover:bg-purple-500/10 transition-colors text-sm">清除搜索</button>
									</div>
								) : (
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
										{filteredNovels.map((novel: any) => {
											const progress = novel.totalChapters > 0 ? Math.round((novel.currentChapters / novel.totalChapters) * 100) : 0;
											const statusColors: Record<string, { dot: string; text: string; label: string }> = {
												draft: { dot: 'bg-gray-500', text: 'text-gray-400', label: '草稿' },
												generating: { dot: 'bg-blue-400 animate-pulse', text: 'text-blue-400', label: '生成中' },
												completed: { dot: 'bg-emerald-400', text: 'text-emerald-400', label: '已完成' },
											};
											const st = statusColors[novel.status] || statusColors.draft;
											return (
												<div
										key={novel.id}
										onClick={selectMode ? () => toggleSelect(novel.id) : undefined}
										className={`group relative rounded-2xl border overflow-hidden transition-all duration-300 ${
											selectMode && selectedIds.has(novel.id)
												? 'border-purple-500/60 shadow-lg shadow-purple-500/15 cursor-pointer'
												: selectMode
												? 'border-white/10 cursor-pointer hover:border-purple-500/30'
												: 'border-white/6 hover:border-purple-500/30 hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-0.5'
										}`}
										style={{ background: selectedIds.has(novel.id) ? 'linear-gradient(145deg, rgba(124,58,237,0.12) 0%, rgba(99,102,241,0.08) 100%)' : 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)' }}
									>
													{/* 顶部装饰条 */}
													<div className="h-0.5 w-full bg-gradient-to-r from-purple-500/0 via-purple-500/60 to-indigo-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />

													<div className="p-5">
														{/* 标题行 */}
														<div className="flex items-start justify-between mb-3">
															<div className="flex-1 min-w-0 pr-2">
																<h3 className="font-bold text-white text-base leading-tight mb-1.5 group-hover:text-purple-300 transition-colors truncate">
																	{novel.title ? `《${novel.title}》` : '未命名小说'}
																</h3>
																<div className="flex items-center gap-2 flex-wrap">
																	<span className={`flex items-center gap-1 text-[11px] font-medium ${st.text}`}>
																		<span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
																		{st.label}
																	</span>
																	{novel.category && (
																		<span className="px-2 py-0.5 rounded-full text-[11px] font-medium text-gray-400 border border-white/8" style={{ background: 'rgba(255,255,255,0.04)' }}>
																			{getCategoryLabel(novel.category)}
																		</span>
																	)}
																	<span className="px-2 py-0.5 rounded-full text-[11px] font-medium text-indigo-400 border border-indigo-500/20" style={{ background: 'rgba(99,102,241,0.08)' }}>
																		{novel.genderTarget === 'male' ? '男频' : '女频'}
																	</span>
																</div>
															</div>
															{selectMode ? (
																<div onClick={e => e.stopPropagation()} className="flex-shrink-0 p-1">
																	<input type="checkbox" checked={selectedIds.has(novel.id)} onChange={() => toggleSelect(novel.id)} className="w-4 h-4 rounded accent-purple-500 cursor-pointer" />
																</div>
															) : (
																<button
																	onClick={() => handleDelete(novel.id)}
																	disabled={deletingId === novel.id}
																	className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30 flex-shrink-0"
																>
																	<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
																	</svg>
																</button>
															)}
														</div>

														{/* 管理员显示作者 */}
														{isAdmin && novel.ownerName && (
															<p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
																<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
																{novel.ownerName}{novel.ownerEmail ? ` · ${novel.ownerEmail}` : ''}
															</p>
														)}

														{/* 简介 */}
														{novel.description && (
															<p className="text-xs text-gray-500 mb-3 line-clamp-2 leading-relaxed">{novel.description}</p>
														)}

														{/* 章节进度 */}
														<div className="mb-4">
															<div className="flex items-center justify-between mb-1.5">
																<span className="text-[11px] text-gray-500">章节进度</span>
																<span className="text-[11px] text-gray-400 font-mono">{novel.currentChapters}/{novel.totalChapters} 章</span>
															</div>
															<div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
																<div
																	className="h-full rounded-full transition-all duration-500"
																	style={{ width: `${progress}%`, background: progress >= 100 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #7c3aed, #6366f1)' }}
																/>
															</div>
														</div>

														{/* 更新时间 */}
														<div className="flex items-center gap-1 text-[11px] text-gray-600 mb-4">
															<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
															{formatDate(novel.updatedAt)}
														</div>

														{/* 一站式流程状态 */}
													<div className="flex items-center gap-1 mb-2 text-[9px]">
														<span className="px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">小说 ✓</span>
														<span className="text-gray-600">→</span>
														<span className={`px-1.5 py-0.5 rounded-full ${(novel as any).scriptId ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/15 text-gray-600'}`}>
															剧本 {(novel as any).scriptId ? '✓' : ''}
														</span>
														<span className="text-gray-600">→</span>
														<span className={`px-1.5 py-0.5 rounded-full ${(novel as any).dramaId ? 'bg-violet-500/20 text-violet-400' : 'bg-gray-500/15 text-gray-600'}`}>
															短剧 {(novel as any).dramaId ? '✓' : ''}
														</span>
													</div>

													{/* 操作按钮 */}
														<div className="grid grid-cols-4 gap-2">
															<button
																onClick={() => handleView(novel.id)}
																className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium text-purple-400 border border-purple-500/20 hover:bg-purple-500/15 hover:border-purple-500/40 transition-all"
																style={{ background: 'rgba(124,58,237,0.06)' }}
															>
																<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
																查看
															</button>
															<Link
																href={`/novel-generator?novelId=${novel.id}`}
																className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/15 hover:border-indigo-500/40 transition-all"
																style={{ background: 'rgba(99,102,241,0.06)' }}
															>
																<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
																编辑
															</Link>
															<Link
																href={`/script?novelId=${novel.id}`}
																className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium text-amber-400 border border-amber-500/20 hover:bg-amber-500/15 hover:border-amber-500/40 transition-all"
																style={{ background: 'rgba(245,158,11,0.06)' }}
															>
																<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.361a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
																剧本
															</Link>
															<Link
																href={(novel as any).dramaId ? `/short-dramas/${(novel as any).dramaId}` : `/short-dramas`}
																className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium text-violet-400 border border-violet-500/20 hover:bg-violet-500/15 hover:border-violet-500/40 transition-all"
																style={{ background: 'rgba(139,92,246,0.06)' }}
															>
																<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
																短剧
															</Link>
														</div>
													</div>
												</div>
											);
										})}
									</div>
								)}
							</>
						)}
					</>
				)}
			</main>

			{/* Toast 提示 */}
			{toast && (
				<div className={`fixed top-5 right-5 z-[100] flex items-center gap-2.5 px-5 py-3 rounded-xl border shadow-2xl text-sm font-medium transition-all duration-300 ${
					toast.type === 'success'
						? 'bg-emerald-900/80 border-emerald-500/30 text-emerald-300'
						: toast.type === 'error'
						? 'bg-red-900/80 border-red-500/30 text-red-300'
						: 'bg-slate-800/90 border-white/10 text-gray-200'
				}`}>
					<div className={`w-1.5 h-1.5 rounded-full ${toast.type === 'success' ? 'bg-emerald-400' : toast.type === 'error' ? 'bg-red-400' : 'bg-blue-400'}`} />
					{toast.message}
				</div>
			)}

			{/* 查看小说弹窗 */}
			{viewNovel && (
				<div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
					<div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/10 shadow-2xl flex flex-col" style={{ background: 'linear-gradient(145deg, #1a1535 0%, #0f0c29 100%)' }}>
						{/* 头部 */}
						<div className="px-7 py-5 border-b border-white/5 flex justify-between items-start flex-shrink-0" style={{ background: 'rgba(124,58,237,0.08)' }}>
							<div className="flex-1 min-w-0 pr-4">
								<h2 className="text-xl font-bold text-white mb-1">{viewNovel.title ? `《${viewNovel.title}》` : '未命名小说'}</h2>
								<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
									{isAdmin && viewNovel.ownerName && <span className="text-xs text-gray-400">{viewNovel.ownerName}</span>}
									<span className="text-xs text-gray-500">{viewNovel.genderTarget === 'male' ? '男频' : '女频'}</span>
									<span className="text-xs text-gray-500">{getCategoryLabel(viewNovel.category)}</span>
									<span className="text-xs text-gray-500">{viewNovel.currentChapters || viewNovel.chapters?.length || 0}/{viewNovel.totalChapters} 章</span>
									{viewNovel.status === 'completed' && <span className="text-xs text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />已完成</span>}
									{viewNovel.status === 'generating' && <span className="text-xs text-blue-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />生成中</span>}
								</div>
							</div>
							<button onClick={() => { setViewNovel(null); setEditingChapterIndex(null); }} className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
								<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
							</button>
						</div>

						{/* 内容区 */}
						<div className="p-7 overflow-y-auto flex-1">
							{/* 主题创意 */}
							{viewNovel.idea && (
								<div className="mb-5 p-4 rounded-xl border border-amber-500/15" style={{ background: 'rgba(245,158,11,0.06)' }}>
									<p className="text-xs font-medium text-amber-400 mb-2 flex items-center gap-1.5">
										<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
										主题创意
									</p>
									<p className="text-white text-sm font-semibold">{viewNovel.idea.theme || viewNovel.idea.title || ''}</p>
									<p className="text-gray-400 text-xs mt-1 leading-relaxed">{viewNovel.idea.concept || viewNovel.idea.description || ''}</p>
								</div>
							)}

							{/* 简介 */}
							{viewNovel.description && (
								<div className="mb-5">
									<p className="text-xs font-medium text-gray-500 mb-2">简介</p>
									<p className="text-gray-300 text-sm leading-relaxed">{viewNovel.description}</p>
								</div>
							)}

							{/* 主角 + 基调 */}
							<div className="grid grid-cols-2 gap-4 mb-5">
								{viewNovel.protagonist && (
									<div className="p-4 rounded-xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
										<p className="text-xs font-medium text-gray-500 mb-2">主角设定</p>
										<p className="text-gray-300 text-xs leading-relaxed">{viewNovel.protagonist}</p>
									</div>
								)}
								{viewNovel.tone && (
									<div className="p-4 rounded-xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
										<p className="text-xs font-medium text-gray-500 mb-2">基调风格</p>
										<div className="flex flex-wrap gap-1.5">
											{(Array.isArray(viewNovel.tone) ? viewNovel.tone : [viewNovel.tone]).map((t: any, i: number) => (
												<span key={i} className="px-2.5 py-1 rounded-full text-xs text-indigo-300 border border-indigo-500/20" style={{ background: 'rgba(99,102,241,0.1)' }}>{typeof t === 'string' ? t : t.label || t}</span>
											))}
										</div>
									</div>
								)}
							</div>

							{/* 结构分析 */}
							{viewNovel.structure && (
								<div className="mb-5 p-4 rounded-xl border border-cyan-500/15" style={{ background: 'rgba(6,182,212,0.05)' }}>
									<p className="text-xs font-medium text-cyan-400 mb-3 flex items-center gap-1.5">
										<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
										结构分析
									</p>
									{viewNovel.structure.mainPlot && <p className="text-gray-400 text-xs mb-3 leading-relaxed">{viewNovel.structure.mainPlot}</p>}
									{viewNovel.structure.chapterHooks && viewNovel.structure.chapterHooks.length > 0 && (
										<div className="space-y-1">
											{viewNovel.structure.chapterHooks.map((hook: string, i: number) => (
												<div key={i} className="flex items-start gap-2 text-xs">
													<span className="text-cyan-500 font-mono shrink-0 mt-0.5">Ch.{i+1}</span>
													<span className="text-gray-500 whitespace-pre-wrap">{hook.replace(/\\n/g, '\n')}</span>
												</div>
											))}
										</div>
									)}
								</div>
							)}

							{/* 章节内容 */}
							<div>
								<div className="flex items-center justify-between mb-3">
									<p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
										<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
										章节内容 · 共 {viewNovel.chapters?.length || 0} 章
									</p>
									{viewNovel.chapters && viewNovel.chapters.length > 0 && (
										<button
											onClick={() => { setChapterSelectMode(!chapterSelectMode); setSelectedChapterIndices(new Set()); }}
											className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${chapterSelectMode ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-white/5 border-white/8 text-gray-500 hover:text-gray-300'}`}
										>
											{chapterSelectMode ? '退出管理' : '管理'}
										</button>
									)}
								</div>
								{chapterSelectMode && viewNovel.chapters && viewNovel.chapters.length > 0 && (
									<div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-purple-500/20" style={{ background: 'rgba(124,58,237,0.06)' }}>
										<label className="flex items-center gap-1.5 cursor-pointer select-none">
											<input type="checkbox" checked={viewNovel.chapters.length > 0 && selectedChapterIndices.size === viewNovel.chapters.length} onChange={(e) => setSelectedChapterIndices(e.target.checked ? new Set(viewNovel.chapters.map((_: any, i: number) => i)) : new Set())} className="w-3.5 h-3.5 rounded accent-purple-500" />
											<span className="text-xs text-gray-400">{selectedChapterIndices.size > 0 ? `已选 ${selectedChapterIndices.size} 章` : '全选'}</span>
										</label>
										<div className="flex-1" />
										{selectedChapterIndices.size > 0 && (
											<button onClick={handleBatchDeleteChapters} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/20 text-red-400 hover:bg-red-500/25 transition-all">
												删除选中 ({selectedChapterIndices.size})
											</button>
										)}
									</div>
								)}
								{viewNovel.chapters && viewNovel.chapters.length > 0 ? (
									<div className="space-y-3">
										{viewNovel.chapters.map((chapter: any, index: number) => (
											<div key={index} className={`rounded-xl border overflow-hidden transition-all ${selectedChapterIndices.has(index) ? 'border-purple-500/40' : 'border-white/5'}`} style={{ background: selectedChapterIndices.has(index) ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.02)' }}>
												<div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
													<div className="flex items-center gap-2">
														{chapterSelectMode && (
															<input type="checkbox" checked={selectedChapterIndices.has(index)} onChange={() => setSelectedChapterIndices(prev => { const next = new Set(prev); if (next.has(index)) next.delete(index); else next.add(index); return next; })} className="w-3.5 h-3.5 rounded accent-purple-500 cursor-pointer" />
														)}
														<span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md">Ch.{index + 1}</span>
														<h4 className="font-medium text-white text-sm">{chapter.title || `第${index + 1}章`}</h4>
														<span className="text-xs text-gray-600">({chapter.content?.length || 0} 字)</span>
													</div>
													<div className="flex items-center gap-1.5">
														{editingChapterIndex !== index && (
															<button onClick={() => handleStartEditChapter(index)} className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 transition-all" style={{ background: 'rgba(16,185,129,0.05)' }}>
																<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
																编辑
															</button>
														)}
														{!chapterSelectMode && (
															<button onClick={() => handleDeleteSingleChapter(index)} disabled={deletingChapterIndex === index} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-500 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/10 border border-white/5 transition-all disabled:opacity-30">
																<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
																{deletingChapterIndex === index ? '...' : '删除'}
															</button>
														)}
													</div>
												</div>
												{editingChapterIndex === index ? (
													<div className="p-4 space-y-3">
														<div className="flex items-center justify-between">
															<span className="text-xs text-emerald-400">编辑第 {index + 1} 章</span>
															<span className="text-xs text-gray-500 font-mono">{editingChapterContent.length} 字</span>
														</div>
														<textarea
															value={editingChapterContent}
															onChange={(e) => setEditingChapterContent(e.target.value)}
															rows={10}
															className="w-full px-4 py-3 rounded-xl border border-emerald-500/20 text-gray-200 text-sm leading-7 resize-none focus:outline-none focus:border-emerald-500/40 transition-all"
															style={{ background: 'rgba(16,185,129,0.04)' }}
														/>
														<div className="flex gap-2 justify-end">
															<button onClick={handleCancelEditChapter} className="px-4 py-2 rounded-lg text-sm text-gray-400 border border-white/8 hover:bg-white/5 transition-colors">取消</button>
															<button onClick={handleSaveChapter} disabled={savingChapter} className="px-5 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50 flex items-center gap-2 transition-all" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
																{savingChapter ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />保存中...</> : '保存章节'}
															</button>
														</div>
													</div>
												) : (
													<div className="px-4 py-3 text-gray-400 text-xs leading-7 whitespace-pre-wrap max-h-52 overflow-y-auto">{chapter.content}</div>
												)}
											</div>
										))}
									</div>
								) : (
									<p className="text-center text-gray-600 py-10 text-sm">暂无章节内容</p>
								)}
							</div>
						</div>

						{/* 底部操作栏 */}
						<div className="px-7 py-4 border-t border-white/5 flex justify-between items-center flex-shrink-0" style={{ background: 'rgba(0,0,0,0.2)' }}>
							<span className="text-xs text-gray-600">更新于 {viewNovel.updatedAt ? new Date(viewNovel.updatedAt).toLocaleString('zh-CN') : '-'}</span>
							<div className="flex gap-2">
								<button onClick={() => { setViewNovel(null); setEditingChapterIndex(null); }} className="px-4 py-2 rounded-xl text-sm text-gray-400 border border-white/8 hover:bg-white/5 transition-colors">关闭</button>
								<button onClick={handleSaveNovel} disabled={saving} className="px-4 py-2 rounded-xl text-sm text-white border border-blue-500/20 disabled:opacity-50 flex items-center gap-2 transition-all hover:border-blue-500/40" style={{ background: 'rgba(59,130,246,0.15)' }}>
									{saving ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />保存中...</> : <><svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg><span className="text-blue-300">保存修改</span></>}
								</button>
								<button onClick={() => router.push(`/novel-generator?novelId=${viewNovel.id}`)} className="px-4 py-2 rounded-xl text-sm text-white font-medium transition-all hover:shadow-lg hover:shadow-purple-500/20 flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
									<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
									继续编辑
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* AI配置弹窗 */}
			{showAiConfigModal && (
				<AIConfigModal isOpen={showAiConfigModal} onClose={() => setShowAiConfigModal(false)} />
			)}
		</div>
	);
}