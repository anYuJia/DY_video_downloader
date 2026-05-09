import { useEffect, useState } from "react";
import { AlertCircle, Download, Link2, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { VideoCard } from "@/components/search/video-card";
import { VideoDetailModal } from "@/components/modals/video-detail";
import { FullscreenPlayer } from "@/components/player/fullscreen-player";
import { useDownloads } from "@/hooks/use-downloads";
import { useLinkStore } from "@/stores/link-store";
import { mediaProxyUrl, type VideoInfo } from "@/lib/tauri";

export function LinkView() {
  const link = useLinkStore((s) => s.link);
  const parsing = useLinkStore((s) => s.parsing);
  const videos = useLinkStore((s) => s.videos);
  const user = useLinkStore((s) => s.user);
  const error = useLinkStore((s) => s.error);
  const parse = useLinkStore((s) => s.parse);
  const clear = useLinkStore((s) => s.clear);
  const { downloadVideo, downloadBatch } = useDownloads();
  const [inputValue, setInputValue] = useState(link);
  const [detailVideo, setDetailVideo] = useState<VideoInfo | null>(null);
  const [playerIndex, setPlayerIndex] = useState<number | null>(null);

  useEffect(() => {
    setInputValue(link);
  }, [link]);

  const handleParse = () => {
    void parse(inputValue);
  };

  const openPlayer = (video: VideoInfo) => {
    const index = videos.findIndex((item) => item.aweme_id === video.aweme_id);
    setPlayerIndex(index >= 0 ? index : 0);
  };

  return (
    <>
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-info" />
            <h3 className="text-[0.9rem] font-semibold text-text">粘贴链接</h3>
            {videos.length > 0 && <Badge variant="secondary">{videos.length} 个作品</Badge>}
          </div>
          {videos.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => void downloadBatch(videos)}>
              <Download className="h-3.5 w-3.5" />
              下载全部
            </Button>
          )}
        </div>

        <div className="mb-4 rounded-[18px] border border-border bg-surface-solid/75 p-4">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleParse();
              }}
              placeholder="粘贴抖音分享链接或完整视频 URL"
              className="h-10 flex-1"
            />
            {inputValue && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setInputValue("");
                  clear();
                }}
                title="清空"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button onClick={handleParse} disabled={parsing || !inputValue.trim()} className="h-10">
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {parsing ? "解析中" : "解析"}
            </Button>
          </div>
          {link && (
            <div className="mt-2 truncate text-[0.72rem] text-text-muted">
              当前链接：{link}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-[14px] border border-danger/20 bg-danger-soft px-4 py-3 text-[0.78rem] text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {user && (
          <div className="mb-4 rounded-[18px] border border-border bg-surface-solid/75 p-4">
            <div className="text-[0.78rem] font-bold uppercase tracking-wider text-text-muted mb-2">
              解析到用户
            </div>
            <div className="flex items-center gap-3">
              <img
                src={mediaProxyUrl(user.avatar_thumb || user.avatar_medium || user.avatar_larger, "image")}
                alt={user.nickname}
                className="h-12 w-12 rounded-full object-cover"
              />
              <div className="min-w-0">
                <div className="truncate text-[0.9rem] font-semibold text-text">{user.nickname}</div>
                <div className="truncate text-[0.72rem] text-text-muted">@{user.unique_id || user.sec_uid}</div>
              </div>
            </div>
          </div>
        )}

        {parsing && videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-info" />
            <p className="text-[0.9rem] text-text-secondary">正在解析链接...</p>
          </div>
        ) : videos.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {videos.map((video, index) => (
              <VideoCard
                key={video.aweme_id}
                video={video}
                index={index}
                onSelect={openPlayer}
                onDetail={setDetailVideo}
                onDownload={(item) => void downloadVideo(item)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[18px] border border-border bg-surface-solid/70 p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-info/10">
              <Link2 className="h-6 w-6 text-info" />
            </div>
            <p className="text-[0.9rem] font-semibold text-text">等待链接</p>
            <p className="mt-1 text-[0.78rem] text-text-muted">
              支持分享短链、视频链接、合集/图集链接。解析完成后可以播放、查看详情或下载。
            </p>
          </div>
        )}
      </div>

      <FullscreenPlayer
        videos={videos}
        initialIndex={playerIndex ?? 0}
        open={playerIndex !== null}
        onClose={() => setPlayerIndex(null)}
        onDownload={(video) => void downloadVideo(video)}
        onShowDetail={(video) => {
          setPlayerIndex(null);
          setDetailVideo(video);
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
