import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDownloadStore, useLogStore } from "@/stores/app-store";
import { TaskCard } from "./task-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertCircle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  FileImage,
  FileVideo,
  FolderOpen,
  Search,
  RefreshCw,
  Trash2,
  CheckSquare,
  Square,
  Play,
  Folder,
  Music2,
} from "lucide-react";
import { useDownloads } from "@/hooks/use-downloads";
import { useHistory } from "@/hooks/use-history";
import {
  deleteFile,
  listDownloadFilesPage,
  localFileAssetUrl,
  mediaProxyUrl,
  openFile,
  openFileLocation,
  type HistoryItem,
} from "@/lib/tauri";
import { cn, formatBytes } from "@/lib/utils";

const FILE_PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const;
type LocalMediaKind = "video" | "image" | "audio" | "media";

export function DownloadsView() {
  const tasks = useDownloadStore((s) => s.tasks);
  const clearCompleted = useDownloadStore((s) => s.clearCompleted);
  const addLog = useLogStore((s) => s.addLog);
  const {
    cancelDownload,
    pauseTask,
    resumeTask,
    removeTask,
    openDownloadsDirectory,
    openTaskLocation,
    syncTasks,
  } = useDownloads();
  const {
    items: historyItems,
    loading: historyLoading,
    loadHistory,
    deleteItem: deleteHistoryItem,
  } = useHistory();

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [diskFiles, setDiskFiles] = useState<HistoryItem[]>([]);
  const [diskTotal, setDiskTotal] = useState(0);
  const [diskLoading, setDiskLoading] = useState(false);
  const [filePage, setFilePage] = useState(1);
  const [filePageSize, setFilePageSize] = useState<number>(24);

  useEffect(() => {
    void syncTasks();
  }, [syncTasks]);

  const loadDiskFiles = useCallback(async (forceRefresh = false) => {
    setDiskLoading(true);
    try {
      const page = await listDownloadFilesPage({
        offset: (filePage - 1) * filePageSize,
        limit: filePageSize,
        forceRefresh,
      });
      setDiskFiles(page.items);
      setDiskTotal(page.total);
    } catch (error) {
      addLog(error instanceof Error ? error.message : "扫描下载目录失败", "error");
    } finally {
      setDiskLoading(false);
    }
  }, [addLog, filePage, filePageSize]);

  useEffect(() => {
    void loadDiskFiles();
  }, [loadDiskFiles]);

  const handleRefresh = useCallback(() => {
    void syncTasks();
    void loadHistory();
    void loadDiskFiles(true);
  }, [syncTasks, loadHistory, loadDiskFiles]);

  const handleOpenDir = useCallback(() => {
    void openDownloadsDirectory();
  }, [openDownloadsDirectory]);

  const taskMatchesFilters = useCallback((task: {
    filename?: string;
    awemeId?: string;
    savePath?: string;
    filePath?: string;
    mediaType?: string;
    totalBytes?: number;
    startTime?: number;
    finishedTime?: number;
  }) => {
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      const matched = [task.filename, task.awemeId, task.savePath, task.filePath]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      if (!matched) return false;
    }
    if (typeFilter !== "all" && !(task.mediaType || "").toLowerCase().includes(typeFilter)) {
      return false;
    }
    return true;
  }, [searchQuery, typeFilter]);

  const tasksList = useMemo(() => {
    const sorted = Object.values(tasks)
      .filter(taskMatchesFilters)
      .sort((a, b) => {
        if (sortBy === "date_asc") {
          return (a.startTime || a.finishedTime || 0) - (b.startTime || b.finishedTime || 0);
        }
        if (sortBy === "size_desc") {
          return (b.totalBytes || 0) - (a.totalBytes || 0);
        }
        if (sortBy === "size_asc") {
          return (a.totalBytes || 0) - (b.totalBytes || 0);
        }
        return (b.startTime || b.finishedTime || 0) - (a.startTime || a.finishedTime || 0);
      });
    return sorted;
  }, [tasks, taskMatchesFilters, sortBy]);

  const mergedFiles = useMemo(() => {
    const historyByPath = new Map(
      historyItems
        .filter((item) => item.path)
        .map((item) => [item.path, item] as const)
    );

    return diskFiles.map((file) => {
      const history = historyByPath.get(file.path);
      return {
        ...file,
        ...history,
        id: file.id || file.path,
        path: file.path,
        file_path: file.path,
        size: file.size || history?.size || 0,
        timestamp: history?.timestamp || file.timestamp,
      };
    });
  }, [diskFiles, historyItems]);

  const historyList = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return mergedFiles
      .filter((item) => {
        if (query) {
          const matched = [item.filename, item.title, item.author, item.aweme_id, item.path]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query));
          if (!matched) return false;
        }
        if (typeFilter !== "all" && getHistoryMediaKind(item) !== typeFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "date_asc") return (a.timestamp || 0) - (b.timestamp || 0);
        if (sortBy === "size_desc") return (b.size || 0) - (a.size || 0);
        if (sortBy === "size_asc") return (a.size || 0) - (b.size || 0);
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
  }, [mergedFiles, searchQuery, sortBy, typeFilter]);

  const totalFilePages = Math.max(1, Math.ceil((diskTotal || historyList.length) / filePageSize));
  const safeFilePage = Math.min(filePage, totalFilePages);
  const filePageStart = (safeFilePage - 1) * filePageSize;
  const totalFileItems = diskTotal || historyList.length;
  const filePageEnd = Math.min(filePageStart + historyList.length, totalFileItems);
  const paginatedHistoryList = historyList;
  const pageSelectedCount = paginatedHistoryList.filter((item) => selectedFiles.has(item.id)).length;
  const allPageSelected = paginatedHistoryList.length > 0 && pageSelectedCount === paginatedHistoryList.length;

  useEffect(() => {
    setFilePage(1);
  }, [searchQuery, sortBy, typeFilter, filePageSize]);

  useEffect(() => {
    if (filePage > totalFilePages) {
      setFilePage(totalFilePages);
    }
  }, [filePage, totalFilePages]);

  useEffect(() => {
    const validIds = new Set(paginatedHistoryList.map((item) => item.id));
    setSelectedFiles((current) => {
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [paginatedHistoryList]);

  const toggleSelectAll = useCallback(() => {
    setSelectedFiles((current) => {
      const next = new Set(current);
      if (allPageSelected) {
        paginatedHistoryList.forEach((item) => next.delete(item.id));
      } else {
        paginatedHistoryList.forEach((item) => next.add(item.id));
      }
      return next;
    });
  }, [allPageSelected, paginatedHistoryList]);

  const activeTasks = tasksList.filter(
    (t) => t.status === "downloading" || t.status === "pending" || t.status === "paused"
  );
  const completedTasks = tasksList.filter((t) => t.status === "completed" && (t.filePath || t.savePath));
  const stoppedTasks = tasksList.filter((t) => t.status === "error" || t.status === "cancelled");
  const transientTasks = tasksList.filter(
    (t) => t.status === "completed" && !t.filePath && !t.savePath
  );

  const handleOpenHistory = useCallback(async (item: HistoryItem) => {
    if (!item.path) return;
    try {
      await openFile(item.path);
    } catch (error) {
      try {
        await openFileLocation(item.path);
      } catch {
        addLog(error instanceof Error ? error.message : "打开文件失败，文件可能已经不存在", "error");
      }
    }
  }, [addLog]);

  const handleRevealHistory = useCallback(async (item: HistoryItem) => {
    if (!item.path) return;
    try {
      await openFileLocation(item.path);
    } catch (error) {
      addLog(error instanceof Error ? error.message : "打开文件位置失败，文件可能已经不存在", "error");
    }
  }, [addLog]);

  const handleDeleteHistory = useCallback(async (item: HistoryItem, removeFile = false) => {
    try {
      if (removeFile && item.path) {
        await deleteFile(item.path);
      }
      await deleteHistoryItem(item.aweme_id || item.id);
      setSelectedFiles((current) => {
        if (!current.has(item.id)) return current;
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      void loadHistory();
      void loadDiskFiles();
      addLog(removeFile ? "已删除文件和记录" : "已移除下载记录", "info");
    } catch (error) {
      addLog(error instanceof Error ? error.message : "删除失败", "error");
    }
  }, [addLog, deleteHistoryItem, loadDiskFiles, loadHistory]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-accent" />
          <h3 className="text-[0.9rem] font-semibold text-text">我的下载</h3>
          <Badge variant="secondary">{activeTasks.length} 个进行中</Badge>
          <Badge variant="outline">{totalFileItems} 个作品本地文件</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleOpenDir}>
            <Folder className="w-3.5 h-3.5" />
            打开目录
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-3.5 h-3.5" />
            同步
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <Input
            placeholder="搜索文件名、作者..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-[0.8rem]"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[120px] h-8 text-[0.8rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="video">视频</SelectItem>
            <SelectItem value="image">图片</SelectItem>
            <SelectItem value="audio">音频</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[120px] h-8 text-[0.8rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">最新优先</SelectItem>
            <SelectItem value="date_asc">最早优先</SelectItem>
            <SelectItem value="size_desc">最大优先</SelectItem>
            <SelectItem value="size_asc">最小优先</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Batch Actions */}
      {totalFileItems > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 px-2.5 h-8 rounded-[var(--radius-sm)] bg-surface border border-border text-[0.78rem] text-text-secondary hover:text-text cursor-pointer transition-[background-color,border-color,color,box-shadow,opacity]"
          >
            {allPageSelected ? (
              <CheckSquare className="w-3.5 h-3.5 text-accent" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            全选本页
          </button>
          {selectedFiles.size > 0 && (
            <>
              <Badge variant="default">{selectedFiles.size} 已选</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const first = historyList.find((item) => selectedFiles.has(item.id));
                  if (first) void handleOpenHistory(first);
                }}
              >
                <Play className="w-3 h-3" />
                打开
              </Button>
              <Button
                variant="danger-outline"
                size="sm"
                onClick={() => {
                  paginatedHistoryList
                    .filter((item) => selectedFiles.has(item.id))
                    .forEach((item) => void handleDeleteHistory(item, false));
                  setSelectedFiles(new Set());
                }}
              >
                <Trash2 className="w-3 h-3" />
                移除记录
              </Button>
            </>
          )}
          {(completedTasks.length > 0 || stoppedTasks.length > 0) && (
            <Button variant="ghost" size="sm" onClick={clearCompleted} className="ml-auto">
              清除已完成
            </Button>
          )}
        </div>
      )}

      {/* Active Tasks */}
      {activeTasks.length > 0 && (
        <div className="mb-4">
          <div className="text-[0.7rem] font-bold text-text-muted uppercase tracking-wider mb-2">
            进行中 ({activeTasks.length})
          </div>
          <div className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {activeTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onCancel={cancelDownload}
                  onPause={pauseTask}
                  onResume={resumeTask}
                  onOpen={openTaskLocation}
                  onRemove={removeTask}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <div className="mt-4">
          <div className="text-[0.7rem] font-bold text-text-muted uppercase tracking-wider mb-2">
            本次完成 ({completedTasks.length})
          </div>
          <div className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {completedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onOpen={openTaskLocation}
                  onRemove={removeTask}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {transientTasks.length > 0 && (
        <div className="mt-4 rounded-[14px] border border-warning/20 bg-warning-soft/15 px-4 py-3">
          <div className="flex items-start gap-2 text-[0.78rem] text-text-secondary">
            <AlertCircle className="w-4 h-4 shrink-0 text-warning mt-0.5" />
            <div>
              <div className="font-semibold text-warning mb-0.5">
                有 {transientTasks.length} 条旧任务没有文件路径
              </div>
              <div className="text-text-muted">
                这些是前端内存任务，不代表真实文件。已下载文件请以下方“本地文件”为准。
              </div>
            </div>
          </div>
        </div>
      )}

      {stoppedTasks.length > 0 && (
        <div className="mt-4">
          <div className="text-[0.7rem] font-bold text-text-muted uppercase tracking-wider mb-2">
            已停止 ({stoppedTasks.length})
          </div>
          <div className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {stoppedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onOpen={openTaskLocation}
                  onRemove={removeTask}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <FileVideo className="w-4 h-4 text-info" />
            <div className="text-[0.7rem] font-bold text-text-muted uppercase tracking-wider">
              作品本地文件 ({totalFileItems})
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(historyLoading || diskLoading) && (
              <span className="text-[0.72rem] text-text-muted">
                {diskLoading ? "扫描下载目录中..." : "同步历史中..."}
              </span>
            )}
            {totalFileItems > 0 && (
              <span className="text-[0.72rem] text-text-muted tabular-nums">
                {filePageStart + 1}-{filePageEnd} / {totalFileItems}
              </span>
            )}
            <Select
              value={String(filePageSize)}
              onValueChange={(value) => setFilePageSize(Number(value))}
            >
              <SelectTrigger className="w-[92px] h-8 text-[0.75rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILE_PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} / 页
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {totalFileItems > 0 ? (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {paginatedHistoryList.map((item) => (
                <HistoryFileCard
                  key={item.id}
                  item={item}
                  selected={selectedFiles.has(item.id)}
                  allowVideoPreview={filePageSize <= 24}
                  onToggle={() => {
                    setSelectedFiles((current) => {
                      const next = new Set(current);
                      if (next.has(item.id)) {
                        next.delete(item.id);
                      } else {
                        next.add(item.id);
                      }
                      return next;
                    });
                  }}
                  onOpen={() => void handleOpenHistory(item)}
                  onReveal={() => void handleRevealHistory(item)}
                  onRemoveRecord={() => void handleDeleteHistory(item, false)}
                  onDeleteFile={() => void handleDeleteHistory(item, true)}
                />
              ))}
            </div>
            <FilePagination
              page={safeFilePage}
              totalPages={totalFilePages}
              totalItems={totalFileItems}
              pageStart={filePageStart}
              pageEnd={filePageEnd}
              onPageChange={setFilePage}
            />
          </>
        ) : (
          <div className="rounded-[16px] border border-border bg-surface-solid/60 p-6 text-center">
            <p className="text-[0.85rem] text-text-secondary mb-1">
              没有找到本地作品文件
            </p>
            <p className="text-[0.76rem] text-text-muted">
              这里直接扫描下载目录，已过滤 .DS_Store、.downloaded 和非媒体文件。
            </p>
          </div>
        )}
      </div>

      {/* Empty State */}
      {tasksList.length === 0 && totalFileItems === 0 && (
        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-14 h-14 rounded-[18px] bg-surface border border-border flex items-center justify-center mb-4">
            <FolderOpen className="w-6 h-6 text-text-muted" />
          </div>
          <p className="text-[0.85rem] text-text-secondary mb-1">暂无下载任务</p>
          <p className="text-[0.8rem] text-text-muted">搜索用户或粘贴链接开始下载</p>
        </motion.div>
      )}
    </div>
  );
}

function HistoryFileCard({
  item,
  selected,
  onToggle,
  onOpen,
  onReveal,
  onRemoveRecord,
  onDeleteFile,
  allowVideoPreview,
}: {
  item: HistoryItem;
  selected: boolean;
  allowVideoPreview: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onReveal: () => void;
  onRemoveRecord: () => void;
  onDeleteFile: () => void;
}) {
  const filename = item.filename || item.title || item.id;
  const mediaKind = getHistoryMediaKind(item);
  const mediaType = formatMediaKindLabel(mediaKind);
  const createdAt = item.timestamp
    ? new Date(item.timestamp * 1000).toLocaleString()
    : "";

  return (
    <div
      className={cn(
        "group rounded-[18px] border bg-surface-solid/75 p-4 transition-[background-color,border-color,box-shadow]",
        selected
          ? "border-accent/45 bg-accent-soft/20 shadow-[0_0_0_1px_var(--color-accent-ring)]"
          : "border-border hover:border-border-strong hover:bg-surface-raised"
      )}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface border border-border text-text-muted hover:text-text transition-[background-color,color,border-color]"
          title={selected ? "取消选择" : "选择"}
        >
          {selected ? (
            <CheckSquare className="h-4 w-4 text-accent" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>

        <HistoryFileThumbnail
          item={item}
          mediaKind={mediaKind}
          filename={filename}
          allowVideoPreview={allowVideoPreview}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <MediaKindIcon kind={mediaKind} className="h-4 w-4 shrink-0 text-info" />
            <button
              onClick={onOpen}
              className="truncate text-left text-[0.86rem] font-semibold text-text hover:text-accent transition-colors"
              title={filename}
            >
              {filename}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-text-muted tabular-nums">
            <Badge variant="secondary" size="sm">{mediaType || "未知类型"}</Badge>
            <span>{formatBytes(item.size || 0)}</span>
            {createdAt && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                {createdAt}
              </span>
            )}
            {item.author && <span>@{item.author}</span>}
          </div>

          <div className="mt-2 truncate text-[0.66rem] text-text-muted" title={item.path}>
            {item.path || "历史记录没有文件路径"}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="default" size="sm" onClick={onOpen}>
          <Play className="h-3.5 w-3.5" />
          打开
        </Button>
        <Button variant="outline" size="sm" onClick={onReveal}>
          <FolderOpen className="h-3.5 w-3.5" />
          定位
        </Button>
        <Button variant="ghost" size="sm" onClick={onRemoveRecord}>
          <Eye className="h-3.5 w-3.5" />
          仅移除记录
        </Button>
        <Button variant="danger-outline" size="sm" onClick={onDeleteFile} className="ml-auto">
          <Trash2 className="h-3.5 w-3.5" />
          删除文件
        </Button>
      </div>
    </div>
  );
}

function HistoryFileThumbnail({
  item,
  mediaKind,
  filename,
  allowVideoPreview,
}: {
  item: HistoryItem;
  mediaKind: LocalMediaKind;
  filename: string;
  allowVideoPreview: boolean;
}) {
  const coverUrl = useMemo(() => (item.cover ? mediaProxyUrl(item.cover, "image") : ""), [item.cover]);
  const localUrl = useMemo(() => localFileAssetUrl(item.path), [item.path]);
  const videoUrl = useMemo(() => (localUrl ? `${localUrl}#t=0.1` : ""), [localUrl]);
  const [coverFailed, setCoverFailed] = useState(false);
  const [localFailed, setLocalFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setCoverFailed(false);
    setLocalFailed(false);
    setLoaded(false);
  }, [coverUrl, localUrl]);

  const showLocalImage = Boolean(mediaKind === "image" && localUrl && !localFailed);
  const showLocalVideo = Boolean(allowVideoPreview && mediaKind === "video" && videoUrl && !localFailed);
  const showCover = Boolean(!showLocalImage && !showLocalVideo && coverUrl && !coverFailed);
  const hasPreview = showCover || showLocalImage || showLocalVideo;

  return (
    <div className="relative h-24 w-[72px] shrink-0 overflow-hidden rounded-[14px] bg-background-soft shadow-[inset_0_0_0_1px_var(--image-outline)]">
      {hasPreview && !loaded && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(254,44,85,0.18),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]" />
      )}

      {showCover && (
        <img
          src={coverUrl}
          alt={`${filename} 封面`}
          className={cn(
            "h-full w-full object-cover transition-[opacity,transform] duration-[var(--duration-base)]",
            loaded ? "opacity-100" : "opacity-0"
          )}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setCoverFailed(true);
            setLoaded(false);
          }}
        />
      )}

      {showLocalImage && (
        <img
          src={localUrl}
          alt={`${filename} 预览`}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-[var(--duration-base)]",
            loaded ? "opacity-100" : "opacity-0"
          )}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLocalFailed(true);
            setLoaded(false);
          }}
        />
      )}

      {showLocalVideo && (
        <video
          src={videoUrl}
          muted
          playsInline
          preload="metadata"
          aria-label={`${filename} 预览`}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-[var(--duration-base)]",
            loaded ? "opacity-100" : "opacity-0"
          )}
          onLoadedMetadata={() => setLoaded(true)}
          onLoadedData={() => setLoaded(true)}
          onError={() => {
            setLocalFailed(true);
            setLoaded(false);
          }}
        />
      )}

      {!hasPreview && (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_25%,rgba(124,92,252,0.18),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-black/20 text-white/65 backdrop-blur-sm">
            <MediaKindIcon kind={mediaKind} className="h-5 w-5" />
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-7">
        <span className="text-[0.62rem] font-semibold text-white/90">
          {formatMediaKindLabel(mediaKind)}
        </span>
      </div>
    </div>
  );
}

function MediaKindIcon({ kind, className }: { kind: LocalMediaKind; className?: string }) {
  if (kind === "image") return <FileImage className={className} />;
  if (kind === "audio") return <Music2 className={className} />;
  return <FileVideo className={className} />;
}

function getHistoryMediaKind(item: HistoryItem): LocalMediaKind {
  const extensionKind = mediaKindFromExtension(getPathExtension(item.path || item.file_path || ""));
  if (extensionKind) return extensionKind;

  const raw = String(item.media_type || item.file_type || "").toLowerCase();
  if (raw.includes("image")) return "image";
  if (raw.includes("audio")) return "audio";
  if (raw.includes("video") || raw.includes("live_photo") || raw.includes("mixed")) return "video";
  return "media";
}

function mediaKindFromExtension(extension: string): LocalMediaKind | null {
  switch (extension.toLowerCase()) {
    case "mp4":
    case "mov":
    case "m4v":
    case "webm":
    case "mkv":
    case "avi":
    case "flv":
      return "video";
    case "jpg":
    case "jpeg":
    case "png":
    case "webp":
    case "gif":
    case "avif":
    case "heic":
    case "heif":
      return "image";
    case "mp3":
    case "m4a":
    case "aac":
    case "wav":
    case "flac":
    case "ogg":
      return "audio";
    default:
      return null;
  }
}

function getPathExtension(path: string): string {
  const filename = path.split(/[\\/]/).pop() || "";
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === filename.length - 1) return "";
  return filename.slice(dotIndex + 1);
}

function formatMediaKindLabel(kind: LocalMediaKind): string {
  if (kind === "video") return "视频";
  if (kind === "image") return "图片";
  if (kind === "audio") return "音频";
  return "媒体";
}

function FilePagination({
  page,
  totalPages,
  totalItems,
  pageStart,
  pageEnd,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageStart: number;
  pageEnd: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages = buildPageRange(page, totalPages);

  return (
    <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="text-[0.72rem] text-text-muted tabular-nums">
        显示 {pageStart + 1}-{pageEnd} / {totalItems}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-border bg-surface text-text-muted disabled:opacity-40 hover:bg-surface-raised transition-[background-color,color,box-shadow]"
          title="第一页"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-border bg-surface text-text-muted disabled:opacity-40 hover:bg-surface-raised transition-[background-color,color,box-shadow]"
          title="上一页"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {pages.map((entry, index) =>
          entry === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="px-2 text-text-muted text-[0.78rem]">
              ···
            </span>
          ) : (
            <button
              key={entry}
              onClick={() => onPageChange(entry)}
              className={cn(
                "min-w-8 h-8 px-2 rounded-[10px] border text-[0.78rem] font-semibold transition-[background-color,color,border-color,box-shadow]",
                page === entry
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : "border-border bg-surface text-text-muted hover:text-text hover:bg-surface-raised"
              )}
            >
              {entry}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-border bg-surface text-text-muted disabled:opacity-40 hover:bg-surface-raised transition-[background-color,color,box-shadow]"
          title="下一页"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-border bg-surface text-text-muted disabled:opacity-40 hover:bg-surface-raised transition-[background-color,color,box-shadow]"
          title="最后一页"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function buildPageRange(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, total, current]);
  for (let offset = -1; offset <= 1; offset += 1) {
    const page = current + offset;
    if (page > 1 && page < total) {
      pages.add(page);
    }
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const output: Array<number | "ellipsis"> = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const page = sorted[index];
    const previous = sorted[index - 1];
    if (index > 0 && page - previous > 1) {
      output.push("ellipsis");
    }
    output.push(page);
  }

  return output;
}
