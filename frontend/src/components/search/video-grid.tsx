import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, Download, Grid3x3, Loader2, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VideoCard } from "./video-card";
import { VideoDetailModal } from "@/components/modals/video-detail";
import { FullscreenPlayer } from "@/components/player/fullscreen-player";
import { useDownloads } from "@/hooks/use-downloads";
import { useDownloadStore, useLogStore } from "@/stores/app-store";
import { useSearchStore } from "@/stores/search-store";
import { downloadUserVideos, type VideoInfo } from "@/lib/tauri";
import { videoAuthorToUserInfo } from "@/lib/video-author";

export function VideoGrid() {
  const currentUser = useSearchStore((s) => s.currentUser);
  const videos = useSearchStore((s) => s.videos);
  const loadingVideos = useSearchStore((s) => s.loadingVideos);
  const loadingMore = useSearchStore((s) => s.loadingMore);
  const hasMore = useSearchStore((s) => s.hasMore);
  const openUser = useSearchStore((s) => s.openUser);
  const loadVideos = useSearchStore((s) => s.loadVideos);
  const loadMore = useSearchStore((s) => s.loadMore);
  const { downloadVideo, downloadBatch } = useDownloads();
  const addLog = useLogStore((s) => s.addLog);
  const updateTask = useDownloadStore((s) => s.updateTask);
  const [detailVideo, setDetailVideo] = useState<VideoInfo | null>(null);
  const [playerIndex, setPlayerIndex] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [authorLoadingId, setAuthorLoadingId] = useState<string | null>(null);
  const [downloadingUser, setDownloadingUser] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const showPlaceholder = currentUser && !loadingVideos && videos.length === 0;
  const openPlayer = (video: VideoInfo) => {
    if (selectMode) {
      toggleSelected(video.aweme_id);
      return;
    }
    const index = videos.findIndex((item) => item.aweme_id === video.aweme_id);
    setPlayerIndex(index >= 0 ? index : 0);
  };
  const openAuthor = async (video: VideoInfo) => {
    const userInfo = videoAuthorToUserInfo(video);
    if (!userInfo || authorLoadingId) return;
    setAuthorLoadingId(video.aweme_id);
    try {
      await openUser(userInfo);
    } finally {
      setAuthorLoadingId(null);
    }
  };
  const selectedVideos = videos.filter((video) => selectedIds.has(video.aweme_id));
  const hasSelectedVideos = selectedVideos.length > 0;
  const downloadActionLabel = hasSelectedVideos ? `下载选中作品 (${selectedVideos.length})` : "下载全部作品";
  const downloadActionDisabled = hasSelectedVideos
    ? selectedVideos.length === 0
    : !currentUser?.sec_uid || downloadingUser;
  const toggleSelected = (awemeId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(awemeId)) next.delete(awemeId);
      else next.add(awemeId);
      return next;
    });
  };
  const toggleSelectMode = () => {
    setSelectMode((value) => {
      if (value) setSelectedIds(new Set());
      return !value;
    });
  };

  useEffect(() => {
    const validIds = new Set(videos.map((video) => video.aweme_id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [videos]);

  useEffect(() => {
    if (!hasMore || loadingVideos || loadingMore || videos.length === 0) return;
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root: null, rootMargin: "520px 0px", threshold: 0.01 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loadingMore, loadingVideos, videos.length]);

  const handleDownloadAction = async () => {
    if (hasSelectedVideos) {
      await downloadBatch(selectedVideos);
      return;
    }
    if (!currentUser || downloadingUser) return;

    setDownloadingUser(true);
    try {
      const result = await downloadUserVideos(
        currentUser.sec_uid,
        currentUser.nickname,
        currentUser.aweme_count || 0
      );
      if (!result.success) {
        addLog(result.message || "批量下载启动失败", "error");
        return;
      }
      if (result.task_id) {
        const totalVideos = result.total_videos ?? currentUser.aweme_count ?? 0;
        updateTask({
          id: result.task_id,
          filename: `${result.nickname || currentUser.nickname || "用户"} 全部作品`,
          progress: 0,
          status: "downloading",
          isBatch: true,
          mediaCount: totalVideos,
          fileTotal: totalVideos,
          fileIndex: 0,
          startTime: Date.now(),
          speed: 0,
        });
      }
      addLog(result.message || `开始下载 ${currentUser.nickname} 的作品`, "success");
    } catch (error) {
      addLog(error instanceof Error ? error.message : "批量下载启动失败", "error");
    } finally {
      setDownloadingUser(false);
    }
  };

  if (!currentUser) return null;

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Grid3x3 className="w-4 h-4 text-success" />
            <h3 className="text-[0.9rem] font-semibold text-text">作品列表</h3>
            <Badge variant="secondary">
              {loadingVideos && videos.length === 0 ? "加载中..." : `${videos.length} 个作品`}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadVideos()}
              disabled={loadingVideos}
            >
              {loadingVideos ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              重新加载
            </Button>
            <Button
              variant={hasSelectedVideos ? "success-outline" : "default"}
              size="sm"
              onClick={() => void handleDownloadAction()}
              disabled={downloadActionDisabled}
            >
              {downloadingUser && !hasSelectedVideos ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {downloadActionLabel}
            </Button>
            <Button
              variant={selectMode ? "default" : "outline"}
              size="sm"
              onClick={toggleSelectMode}
              disabled={videos.length === 0}
            >
              {selectMode ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              {selectMode ? "退出选择" : "选择作品"}
            </Button>
          </div>
        </div>

        {loadingVideos && videos.length === 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="h-[380px] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-solid/70"
              >
                <div className="h-[260px] bg-white/[0.05] animate-pulse" />
                <div className="h-[120px] p-3">
                  <div className="h-4 rounded bg-white/[0.05] animate-pulse mb-2" />
                  <div className="h-3 w-1/2 rounded bg-white/[0.05] animate-pulse mb-3" />
                  <div className="mt-auto grid grid-cols-3 gap-1.5">
                    <div className="h-7 rounded bg-white/[0.05] animate-pulse" />
                    <div className="h-7 rounded bg-white/[0.05] animate-pulse" />
                    <div className="h-7 rounded bg-white/[0.05] animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : showPlaceholder ? (
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center min-h-[400px] rounded-[var(--radius-xl)] bg-surface-solid/40 border border-border/50 p-12 text-center"
          >
            <p className="text-[0.86rem] text-text-secondary mb-1">
              开启你的精彩发现
            </p>
            <p className="text-[0.76rem] text-text-muted mb-4">
              尚未立即加载作品列表。点击下方按钮或从用户卡片中进入以开始浏览。
            </p>
            <Button variant="default" size="lg" className="gap-2 rounded-[14px] px-8" onClick={() => void loadVideos()}>
              <Grid3x3 className="w-3.5 h-3.5" />
              立即加载作品
            </Button>
          </motion.div>
        ) : (
          <>
          <motion.div
            className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3"
            initial={false}
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
          >
              {videos.map((video, index) => (
                <VideoCard
                  key={video.aweme_id}
                  video={video}
                  index={index}
                  onSelect={openPlayer}
                  onDetail={setDetailVideo}
                  onDownload={(item) => void downloadVideo(item)}
                  onAuthor={(item) => void openAuthor(item)}
                  authorLoading={authorLoadingId === video.aweme_id}
                  selected={selectedIds.has(video.aweme_id)}
                />
              ))}
            </motion.div>

            <div ref={loadMoreRef} className="h-px w-full" aria-hidden="true" />

            {hasMore && (
              <div className="flex justify-center mt-6">
                <Button
                  variant="outline"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="gap-2"
                >
                  {loadingMore ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {loadingMore ? "加载中..." : "加载更多"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <FullscreenPlayer
        videos={videos}
        initialIndex={playerIndex ?? 0}
        open={playerIndex !== null}
        onClose={() => setPlayerIndex(null)}
        onDownload={(video) => void downloadVideo(video)}
        onLoadMore={hasMore ? () => void loadMore() : undefined}
        onShowDetail={(video) => {
          setPlayerIndex(null);
          setDetailVideo(video);
        }}
        onAuthor={(video) => {
          setPlayerIndex(null);
          void openAuthor(video);
        }}
      />

      <VideoDetailModal
        video={detailVideo}
        open={Boolean(detailVideo)}
        onOpenChange={(open) => {
          if (!open) setDetailVideo(null);
        }}
        onDownload={(video) => void downloadVideo(video)}
      />
    </>
  );
}
