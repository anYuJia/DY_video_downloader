import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Download,
  Music,
  Heart,
  MessageCircle,
  Share2,
  Link2,
  Copy,
  Check,
  Image as ImageIcon,
  PlayCircle,
  X,
} from "lucide-react";
import { cn, formatNumber, formatTime } from "@/lib/utils";
import { mediaProxyUrl, type VideoInfo } from "@/lib/tauri";
import {
  collectVideoMedia,
  getMediaProxyType,
  getVideoBgmUrl,
  getVideoCover,
  getVideoMediaLabel,
  isVideoLikeMedia,
} from "@/lib/video-media";

interface VideoDetailModalProps {
  video: VideoInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload?: (video: VideoInfo) => void;
}

export function VideoDetailModal({ video, open, onOpenChange, onDownload }: VideoDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"cover" | "media">("cover");
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [copiedLinkType, setCopiedLinkType] = useState<string | null>(null);

  useEffect(() => {
    if (!video) return;
    setActiveTab("cover");
    setCurrentMediaIndex(0);
    setCopiedLinkType(null);
  }, [video]);

  if (!video) return null;

  const mediaItems = collectVideoMedia(video);
  const currentMedia = mediaItems[currentMediaIndex] || mediaItems[0] || null;
  const coverRawUrl = getVideoCover(video);
  const coverUrl = mediaProxyUrl(coverRawUrl, "image");
  const hasMedia = mediaItems.length > 0;
  const stats = video.statistics;
  const author = video.author;
  const music = video.music;
  const musicUrl = getVideoBgmUrl(video);
  const mediaLabel = getVideoMediaLabel(video);

  const statItems = [
    { icon: Heart, label: "点赞", value: stats?.digg_count || 0, color: "text-accent" },
    { icon: MessageCircle, label: "评论", value: stats?.comment_count || 0, color: "text-cyan-400" },
    { icon: Share2, label: "分享", value: stats?.share_count || 0, color: "text-green-400" },
  ];

  const mediaLinks = uniqueDetailLinks([
    coverRawUrl && { label: "封面", url: coverRawUrl, type: "cover" },
    ...mediaItems.map((item, index) => ({
      label: `${mediaLabel} ${index + 1}`,
      url: item.url,
      type: `${item.type}-${index}`,
    })),
    musicUrl && { label: "BGM", url: musicUrl, type: "audio" },
  ]);
  const copyLink = (link: DetailLink) => {
    const write = navigator.clipboard?.writeText(link.url);
    if (!write) return;
    void write.then(() => {
      setCopiedLinkType(link.type);
      window.setTimeout(() => setCopiedLinkType((current) => (current === link.type ? null : current)), 1_200);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[920px] max-h-[calc(100vh-2rem)] p-0 overflow-hidden rounded-[var(--radius-xl)]">
        <div className="flex max-h-[calc(100vh-2rem)] min-w-0 flex-col overflow-hidden md:max-h-[80vh] md:flex-row">
          <div className="flex min-h-[260px] min-w-0 flex-col items-center overflow-hidden border-b border-border bg-surface/30 p-4 md:min-h-[300px] md:w-1/2 md:border-b-0 md:border-r md:p-5">
            {(coverUrl || hasMedia) && (
              <div className="flex max-w-full flex-wrap justify-center gap-1 mb-3">
                {coverUrl && (
                  <Button
                    variant={activeTab === "cover" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveTab("cover")}
                    className="h-7 shrink-0 text-[0.7rem] rounded-[6px]"
                  >
                    <ImageIcon className="w-3 h-3" />
                    封面
                  </Button>
                )}
                {hasMedia && (
                  <Button
                    variant={activeTab === "media" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveTab("media")}
                    className="h-7 shrink-0 text-[0.7rem] rounded-[6px]"
                  >
                    <PlayCircle className="w-3 h-3" />
                    媒体 ({mediaItems.length})
                  </Button>
                )}
              </div>
            )}

            <div className="flex w-full min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-black/20">
              {activeTab === "cover" && coverUrl ? (
                <img
                  src={coverUrl}
                  alt={video.desc}
                  className="max-h-[36vh] max-w-full rounded-[var(--radius-md)] object-contain md:max-h-[420px]"
                />
              ) : currentMedia ? (
                <div className="relative w-full h-full min-w-0 overflow-hidden flex items-center justify-center">
                  {isVideoLikeMedia(currentMedia) ? (
                    <video
                      src={mediaProxyUrl(currentMedia.url, getMediaProxyType(currentMedia))}
                      poster={mediaProxyUrl(currentMedia.poster || coverRawUrl, "image")}
                      controls
                      playsInline
                      className="max-h-[36vh] max-w-full rounded-[var(--radius-md)] md:max-h-[420px]"
                    />
                  ) : (
                    <img
                      src={mediaProxyUrl(currentMedia.url, "image")}
                      alt={`媒体 ${currentMediaIndex + 1}`}
                      className="max-h-[36vh] max-w-full rounded-[var(--radius-md)] object-contain md:max-h-[420px]"
                    />
                  )}

                  {mediaItems.length > 1 && (
                    <div className="absolute bottom-3 left-1/2 flex max-w-[90%] -translate-x-1/2 flex-wrap justify-center gap-0.5 rounded-full bg-black/35 px-1.5 py-1 backdrop-blur-md">
                      {mediaItems.map((item, index) => (
                        <button
                          key={`${item.type}-${item.url}-${index}`}
                          onClick={() => {
                            setActiveTab("media");
                            setCurrentMediaIndex(index);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-full cursor-pointer"
                          aria-label={`切换到第 ${index + 1} 个媒体`}
                        >
                          <span
                            className={cn(
                              "h-1.5 rounded-full transition-[width,background-color,transform]",
                              index === currentMediaIndex ? "w-4 bg-accent" : "w-1.5 bg-white/50 hover:bg-white/75"
                            )}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-4 text-center text-[0.8rem] text-white/55">
                  当前作品没有返回可预览媒体
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:w-1/2">
            <DialogHeader className="min-w-0 px-5 pt-4 pb-3 border-b border-border">
              <div className="flex min-w-0 items-center gap-2">
                <DialogTitle className="min-w-0 truncate text-[0.95rem]">作品详情</DialogTitle>
                <Badge variant="default" size="sm" className="shrink-0">{mediaLabel}</Badge>
              </div>
            </DialogHeader>

            <ScrollArea className="flex-1 min-h-0 min-w-0">
              <div className="min-w-0 p-5 flex flex-col gap-4">
                {author && (
                  <div className="flex min-w-0 items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3">
                    <img
                      src={mediaProxyUrl(author.avatar_thumb || author.avatar_medium, "image")}
                      alt={author.nickname}
                      className="w-10 h-10 rounded-full object-cover border-2 border-border-strong shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[0.85rem] font-semibold text-text truncate">
                        {author.nickname}
                      </div>
                      <div className="text-[0.72rem] text-text-muted truncate">
                        {formatTime(video.create_time)}
                      </div>
                    </div>
                  </div>
                )}

                <p className="text-[0.85rem] text-text-secondary leading-relaxed break-words">
                  {video.desc}
                </p>

                {stats && (
                  <div className="grid min-w-0 grid-cols-3 gap-2">
                    {statItems.map((stat) => (
                      <div
                        key={stat.label}
                        className="min-w-0 flex flex-col items-center gap-1 rounded-[var(--radius-md)] border border-border-strong bg-background-soft/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[border-color,background-color,box-shadow] hover:bg-surface-raised"
                      >
                        <stat.icon className={cn("w-4 h-4", stat.color)} />
                        <span className="max-w-full truncate text-[1.05rem] leading-tight font-extrabold text-text tabular-nums">
                          {formatNumber(stat.value)}
                        </span>
                        <span className="text-[0.66rem] font-semibold text-text-secondary uppercase tracking-wider">
                          {stat.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {mediaLinks.length > 0 && (
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5 text-[0.72rem] font-bold text-text-muted uppercase tracking-wider mb-2">
                      <Link2 className="w-3 h-3 shrink-0 text-accent" />
                      媒体链接
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      {mediaLinks.map((link) => (
                        <div
                          key={link.type}
                          className="group flex min-w-0 items-center gap-2 overflow-hidden px-3 py-2 rounded-[var(--radius-sm)] bg-surface border border-border hover:border-border-strong transition-[border-color,background-color]"
                        >
                          <Badge variant="secondary" size="sm" className="shrink-0">
                            {link.label}
                          </Badge>
                          <span className="block min-w-0 flex-1 truncate text-[0.72rem] text-text-secondary">
                            {link.url}
                          </span>
                          <button
                            onClick={() => copyLink(link)}
                            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[8px] px-2 text-[0.68rem] text-text-muted opacity-100 transition-[background-color,color,opacity] hover:bg-surface-raised hover:text-accent sm:opacity-0 sm:group-hover:opacity-100"
                            aria-label={`复制${link.label}链接`}
                          >
                            {copiedLinkType === link.type ? (
                              <>
                                <Check className="w-3 h-3" />
                                已复制
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                复制
                              </>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(music?.title || musicUrl) && (
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5 text-[0.72rem] font-bold text-text-muted uppercase tracking-wider mb-2">
                      <Music className="w-3 h-3 shrink-0 text-accent" />
                      音频 / BGM
                    </div>
                    <div className="min-w-0 overflow-hidden p-3 rounded-[var(--radius-md)] bg-surface border border-border">
                      <div className="truncate text-[0.8rem] font-medium text-text">
                        {music?.title || "抖音原声"}
                      </div>
                      {music?.author && (
                        <div className="truncate text-[0.72rem] text-text-muted">{music.author}</div>
                      )}
                      {musicUrl && (
                        <audio src={mediaProxyUrl(musicUrl, "audio")} controls className="mt-2 h-8 w-full min-w-0 max-w-full" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <DialogFooter className="mt-0 shrink-0 px-5 py-3 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                <X className="w-3.5 h-3.5" />
                关闭
              </Button>
              <Button variant="default" size="sm" onClick={() => onDownload?.(video)}>
                <Download className="w-3.5 h-3.5" />
                下载作品
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type DetailLink = {
  label: string;
  url: string;
  type: string;
};

function uniqueDetailLinks(items: Array<DetailLink | false | "" | null | undefined>): DetailLink[] {
  const seen = new Set<string>();
  const result: DetailLink[] = [];

  for (const item of items) {
    if (!item || !item.url.trim()) continue;
    const key = `${item.type}::${item.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}
