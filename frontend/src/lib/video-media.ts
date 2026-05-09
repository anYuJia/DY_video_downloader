import type { VideoInfo, VideoMediaUrl } from "@/lib/tauri";

export type VideoMediaType = "video" | "image" | "live_photo";

export interface VideoMediaItem {
  type: VideoMediaType;
  url: string;
  poster?: string;
}

type VideoLikeSource = VideoInfo & {
  cover_url?: string | null;
  bgm_url?: string | null;
  images?: string[] | null;
  live_photos?: string[] | null;
  media_urls?: Array<VideoMediaUrl | string> | null;
  video?: VideoInfo["video"] & {
    media_urls?: Array<VideoMediaUrl | string> | null;
  };
};

export function normalizeVideoMediaType(type: unknown): VideoMediaType {
  if (type === 1 || type === "1") return "image";
  const normalized = String(type || "").trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "image" || normalized === "images" || normalized === "photo") return "image";
  if (normalized === "live_photo" || normalized === "livephoto" || normalized === "live") {
    return "live_photo";
  }
  return "video";
}

export function isVideoLikeMedia(media: VideoMediaItem | null | undefined): boolean {
  return media?.type === "video" || media?.type === "live_photo";
}

export function shouldUseSeparateBgm(media: VideoMediaItem | null | undefined): boolean {
  return media?.type === "image" || media?.type === "live_photo";
}

export function getMediaProxyType(media: VideoMediaItem | null | undefined): "video" | "image" {
  return media?.type === "image" ? "image" : "video";
}

export function collectVideoMedia(video: VideoInfo | null | undefined): VideoMediaItem[] {
  if (!video) return [];

  const source = video as VideoLikeSource;
  const videoData = source.video || {};
  const poster = getVideoCover(video);
  const rawMediaItems = collectRawMediaItems(source.media_urls || videoData.media_urls, poster);
  if (rawMediaItems.length > 0) {
    return rawMediaItems;
  }

  const previewUrl = readUrl(videoData.preview_addr);
  if (previewUrl) {
    return [{ type: "video", url: previewUrl, poster }];
  }

  const items: VideoMediaItem[] = [];
  const livePhotoUrls = readUrlList(source.live_photo_urls || source.live_photos);
  const imageUrls = readUrlList(source.image_urls || source.images);

  for (const url of livePhotoUrls) {
    items.push({ type: "live_photo", url, poster });
  }

  for (const url of imageUrls) {
    items.push({ type: "image", url });
  }

  const playUrl = readUrl(videoData.play_addr);
  const downloadUrl = readUrl(videoData.download_addr);
  const h264Url = readUrl(videoData.play_addr_h264);
  const lowbrUrl = readUrl(videoData.play_addr_lowbr);
  const mediaType = String(source.media_type || source.raw_media_type || "").toLowerCase();

  if (items.length === 0) {
    const candidateUrls = [downloadUrl, h264Url, playUrl, lowbrUrl, previewUrl].filter(Boolean);
    for (const url of candidateUrls) {
      items.push({
        type: source.has_live_photo || mediaType === "live_photo" ? "live_photo" : "video",
        url,
        poster,
      });
    }
  }

  if (items.length === 0 && poster && mediaType !== "video") {
    items.push({ type: "image", url: poster });
  }

  return uniqueMediaItems(items);
}

export function getVideoCover(video: VideoInfo | null | undefined): string {
  if (!video) return "";

  const source = video as VideoLikeSource;
  const videoData = source.video || {};
  const directCover = firstUrl([
    videoData.cover,
    videoData.origin_cover,
    videoData.dynamic_cover,
    source.cover_url,
  ]);
  if (directCover) return directCover;

  const imageCover = firstUrl([
    ...(source.image_urls || []),
    ...(source.images || []),
    ...collectRawMediaItems(source.media_urls || videoData.media_urls)
      .filter((item) => item.type === "image")
      .map((item) => item.url),
  ]);

  return imageCover;
}

export function getVideoBgmUrl(video: VideoInfo | null | undefined): string {
  if (!video) return "";
  const source = video as VideoLikeSource;
  return readUrl(video.music?.play_url || source.bgm_url);
}

export function getVideoDurationSeconds(video: VideoInfo | null | undefined): number {
  const duration = Number(video?.video?.duration || 0);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return duration > 1000 ? duration / 1000 : duration;
}

export function getVideoMediaLabel(video: VideoInfo | null | undefined): string {
  const items = collectVideoMedia(video);
  if (items.length === 0) return "未知";

  const imageCount = items.filter((item) => item.type === "image").length;
  const liveCount = items.filter((item) => item.type === "live_photo").length;
  const videoCount = items.filter((item) => item.type === "video").length;

  if ((imageCount > 0 || liveCount > 0) && videoCount > 0) return `混合 ${items.length}`;
  if (liveCount > 0 && imageCount > 0) return `混合 ${items.length}`;
  if (liveCount > 0) return liveCount > 1 ? `实况 ${liveCount}` : "实况";
  if (imageCount > 0) return imageCount > 1 ? `图集 ${imageCount}` : "图集";
  return "视频";
}

function collectRawMediaItems(value: unknown, poster?: string): VideoMediaItem[] {
  if (!Array.isArray(value)) return [];

  const items = value
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") {
        const url = readUrl(item);
        return url ? { type: inferMediaTypeFromUrl(url), url, poster } : null;
      }
      if (typeof item !== "object") return null;

      const record = item as Record<string, unknown>;
      const url = readUrl(
        record.url ||
          record.play_url ||
          record.play_addr ||
          record.download_addr ||
          record.url_list ||
          record.video ||
          record.image ||
          record.display_url
      );
      if (!url) return null;
      const explicitType = record.type ?? record.media_type ?? record.raw_media_type;

      return {
        type: explicitType ? normalizeVideoMediaType(explicitType) : inferMediaTypeFromUrl(url),
        url,
        poster,
      };
    })
    .filter(Boolean) as VideoMediaItem[];

  return uniqueMediaItems(items);
}

function uniqueMediaItems(items: VideoMediaItem[]): VideoMediaItem[] {
  const seen = new Set<string>();
  const result: VideoMediaItem[] = [];

  for (const item of items) {
    const url = item.url.trim();
    if (!url || seen.has(`${item.type}::${url}`)) continue;
    seen.add(`${item.type}::${url}`);
    result.push({ ...item, url });
  }

  return result;
}

function readUrl(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = readUrl(item);
      if (url) return url;
    }
    return "";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return readUrl(
      record.url ||
        record.play_url ||
        record.play_addr ||
        record.download_addr ||
        record.url_list ||
        record.uri ||
        record.video ||
        record.image ||
        record.display_url
    );
  }
  return "";
}

function readUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => readUrl(item)).filter(Boolean)));
}

function firstUrl(values: unknown[]): string {
  for (const value of values) {
    const url = readUrl(value);
    if (url) return url;
  }
  return "";
}

function inferMediaTypeFromUrl(url: string): VideoMediaType {
  const lower = url.toLowerCase();
  if (
    lower.includes(".jpg") ||
    lower.includes(".jpeg") ||
    lower.includes(".png") ||
    lower.includes(".webp") ||
    lower.includes("douyinpic") ||
    lower.includes("byteimg")
  ) {
    return "image";
  }
  return "video";
}
