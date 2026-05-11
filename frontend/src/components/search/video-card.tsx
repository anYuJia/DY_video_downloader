import { motion } from "framer-motion";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Download, Eye, Play, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoCover } from "@/components/media/video-cover";
import { cn, formatTime } from "@/lib/utils";
import type { VideoInfo } from "@/lib/tauri";

interface VideoCardProps {
  video: VideoInfo;
  index?: number;
  onSelect?: (video: VideoInfo) => void;
  onDetail?: (video: VideoInfo) => void;
  onDownload?: (video: VideoInfo) => void;
  onAuthor?: (video: VideoInfo) => void;
  authorLoading?: boolean;
  selected?: boolean;
  animate?: boolean;
}

export function VideoCard({
  video,
  index = 0,
  onSelect,
  onDetail,
  onDownload,
  onAuthor,
  authorLoading,
  selected,
  animate = false,
}: VideoCardProps) {
  const Card = animate ? motion.div : "div";
  const authorLabel = video.author?.nickname ? `@${video.author.nickname}` : "";

  const handleCardClick = () => {
    onSelect?.(video);
  };

  const stopAndRun = (
    event: ReactMouseEvent,
    action: ((video: VideoInfo) => void) | undefined
  ) => {
    event.stopPropagation();
    action?.(video);
  };

  return (
    <Card
      {...(animate
        ? {
            initial: { opacity: 0, y: 12 },
            animate: { opacity: 1, y: 0 },
            transition: { delay: index * 0.05, type: "spring" as const, stiffness: 350, damping: 28 },
          }
        : {})}
      className={cn(
        "group relative h-[380px] cursor-pointer overflow-hidden rounded-[var(--radius-lg)] bg-surface-solid/90 shadow-sm",
        "border border-transparent transition-[box-shadow,border-color,background-color] duration-[var(--duration-base)] ease-[var(--ease-spring)]",
        "hover:border-border-strong hover:shadow-md",
        selected && "border-accent shadow-[var(--shadow-glow)]"
      )}
      style={{ breakInside: "avoid" }}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleCardClick();
        }
      }}
      tabIndex={0}
    >
      <VideoCover video={video} className="h-[260px]" />

      {/* Body */}
      <div className="flex h-[120px] flex-col p-3">
        <p className="mb-1 truncate text-[0.82rem] leading-snug text-text">
          {video.desc}
        </p>
        <span className="mb-auto min-w-0 truncate text-[0.7rem] text-text-muted">
          {[authorLabel, formatTime(video.create_time)].filter(Boolean).join(" · ")}
        </span>
        <div className="mt-2 flex gap-1.5 transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-spring)] sm:translate-y-1 sm:opacity-55 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 sm:group-focus-within:translate-y-0 sm:group-focus-within:opacity-100">
          <Button
            variant="outline"
            size="icon-sm"
            className="h-8 flex-1 rounded-[6px]"
            onClick={(event) => stopAndRun(event, onDownload)}
            title="下载"
            aria-label="下载作品"
          >
            <Download className="w-3 h-3" />
          </Button>
          {onDetail && (
            <Button
              variant="info-outline"
              size="icon-sm"
              className="h-8 flex-1 rounded-[6px]"
              onClick={(event) => stopAndRun(event, onDetail)}
              title="详情"
              aria-label="查看详情"
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          )}
          {onAuthor && video.author?.sec_uid && (
            <Button
              variant="outline"
              size="icon-sm"
              className="h-8 flex-1 rounded-[6px]"
              onClick={(event) => stopAndRun(event, onAuthor)}
              disabled={authorLoading}
              title="进入作者主页"
              aria-label="进入作者主页"
            >
              {authorLoading ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <UserRound className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          <Button
            variant="success-outline"
            size="icon-sm"
            className="h-8 flex-1 rounded-[6px]"
            onClick={(event) => stopAndRun(event, onSelect)}
            title="播放"
            aria-label="播放作品"
          >
            <Play className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
