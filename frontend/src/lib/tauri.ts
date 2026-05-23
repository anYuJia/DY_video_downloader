// ═══════════════════════════════════════════════
// Tauri IPC Wrappers
// ═══════════════════════════════════════════════

import { convertFileSrc } from "@tauri-apps/api/core";
import type {
  AppConfig,
  ApiResponse,
  BitRateInfo,
  CookieStatus,
  CollectedMixItem,
  CollectedMixesResponse,
  CollectedVideosResponse,
  DownloadFilesResult,
  DownloadProgress,
  HistoryItem,
  LikedAuthorsResponse,
  LikedVideosResponse,
  LinkParseResponse,
  MixVideosResponse,
  RecommendedResponse,
  SearchUserResponse,
  Statistics,
  UserDetailResponse,
  UserInfo,
  UserVideosResponse,
  VideoData,
  VideoDetailResponse,
  VideoInfo,
  VideoMediaUrl,
} from "./contracts";

export type * from "./contracts";

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type BrowserSocketListener = (payload: unknown) => void;
type BrowserSocket = {
  on: (event: string, listener: BrowserSocketListener) => void;
  off: (event: string, listener: BrowserSocketListener) => void;
  connected?: boolean;
};

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke?: TauriInvoke;
      };
      event?: {
        listen?: <T>(event: string, cb: (ev: { payload: T }) => void) => Promise<() => void>;
      };
    };
    io?: (options?: { transports?: string[] }) => BrowserSocket;
    SOCKET_TRANSPORTS?: string[];
  }
}

function isTauriRuntime() {
  return Boolean(window.__TAURI__?.core?.invoke);
}

function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const tauriInvoke = window.__TAURI__?.core?.invoke;

  if (!tauriInvoke) {
    return Promise.reject(new Error("Tauri API unavailable"));
  }

  return tauriInvoke<T>(command, args);
}

let browserSocket: BrowserSocket | null = null;

function getBrowserSocket() {
  if (isTauriRuntime()) return null;
  if (browserSocket) return browserSocket;
  if (typeof window.io !== "function") return null;

  browserSocket = window.io({
    transports:
      Array.isArray(window.SOCKET_TRANSPORTS) && window.SOCKET_TRANSPORTS.length > 0
        ? window.SOCKET_TRANSPORTS
        : ["websocket", "polling"],
  });

  return browserSocket;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : {};

  if (data && typeof data === "object" && (data as Record<string, unknown>).need_login) {
    const message = String(
      (data as Record<string, unknown>).message || "Cookie 已失效，请重新登录"
    ).trim();
    window.dispatchEvent(new CustomEvent("dy-cookie-invalid", { detail: { message } }));
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as Record<string, unknown>).message || "").trim()
        : "";
    throw new Error(message || `${response.status} ${response.statusText}`.trim());
  }

  return data as T;
}

export function mediaProxyUrl(url: string | null | undefined, mediaType = "image"): string {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;
  if (
    trimmed.startsWith("/") ||
    trimmed.includes("127.0.0.1:39143/api/media/proxy") ||
    trimmed.includes("127.0.0.1:39143/api/local-media")
  ) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return trimmed;
    const base = isTauriRuntime()
      ? "http://127.0.0.1:39143/api/media/proxy"
      : "/api/media/proxy";
    return `${base}?url=${encodeURIComponent(trimmed)}&media_type=${encodeURIComponent(mediaType)}`;
  } catch {
    return trimmed;
  }
}

export function localFileAssetUrl(path: string | null | undefined): string {
  const trimmed = (path || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (!isTauriRuntime()) {
    return `/api/local-media?path=${encodeURIComponent(trimmed)}`;
  }
  try {
    return convertFileSrc(trimmed);
  } catch {
    return "";
  }
}

type LikedVideoMediaUrl = VideoMediaUrl;

interface LikedVideoAuthorRaw {
  nickname?: string;
  sec_uid?: string;
  avatar_thumb?: string;
}

interface LikedVideoItemRaw {
  aweme_id?: string;
  desc?: string;
  create_time?: number;
  digg_count?: number;
  comment_count?: number;
  share_count?: number;
  cover_url?: string;
  media_type?: string;
  media_urls?: LikedVideoMediaUrl[];
  bgm_url?: string | null;
  author?: LikedVideoAuthorRaw;
}

function buildEmptyVideoData(): VideoData {
  return {
    preview_addr: null,
    play_addr: "",
    play_addr_h264: null,
    play_addr_lowbr: null,
    download_addr: null,
    cover: "",
    dynamic_cover: "",
    origin_cover: "",
    width: 0,
    height: 0,
    duration: 0,
    ratio: "",
    bit_rate: null,
  };
}

function buildEmptyStatistics(): Statistics {
  return {
    play_count: 0,
    digg_count: 0,
    comment_count: 0,
    share_count: 0,
    collect_count: 0,
    forward_count: 0,
  };
}

function extractUrl(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = extractUrl(item);
      if (url) return url;
    }
    return "";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return extractUrl(record.url || record.play_url || record.play_addr || record.download_addr || record.url_list);
  }
  return "";
}

function normalizeBitRates(value: unknown): BitRateInfo[] | null {
  if (!Array.isArray(value)) return null;

  const bitRates = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const playAddr = extractUrl(record.play_addr);
      const playAddrH264 = extractUrl(record.play_addr_h264);
      if (!playAddr && !playAddrH264) return null;
      return {
        gear_name: String(record.gear_name || ""),
        bit_rate: Number(record.bit_rate || 0),
        quality_type: Number(record.quality_type || 0),
        is_h265: Boolean(record.is_h265),
        data_size: Number(record.data_size || 0),
        width: Number(record.width || 0),
        height: Number(record.height || 0),
        play_addr: playAddr || null,
        play_addr_h264: playAddrH264 || null,
      };
    })
    .filter(Boolean) as BitRateInfo[];

  return bitRates.length > 0 ? bitRates : null;
}

function normalizeMediaType(type: unknown, fallback = "video"): string {
  const normalized = String(type || fallback).trim().toLowerCase();
  if (normalized === "livephoto") return "live_photo";
  if (normalized === "live-photo") return "live_photo";
  if (normalized === "image" || normalized === "live_photo" || normalized === "video") {
    return normalized;
  }
  return fallback;
}

function normalizeMediaUrls(value: unknown): VideoMediaUrl[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") {
        const url = extractUrl(item);
        return url ? { type: "video", url } : null;
      }
      if (typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const url = extractUrl(record.url || record.play_url || record.play_addr || record.url_list);
      if (!url) return null;
      return {
        type: normalizeMediaType(record.type),
        url,
      };
    })
    .filter(Boolean) as VideoMediaUrl[];
}

function uniqueMediaUrls(urls: VideoMediaUrl[]): VideoMediaUrl[] {
  const seen = new Set<string>();
  const items: VideoMediaUrl[] = [];

  for (const item of urls) {
    const url = (item.url || "").trim();
    if (!url || seen.has(`${item.type || "video"}::${url}`)) continue;
    seen.add(`${item.type || "video"}::${url}`);
    items.push({
      type: normalizeMediaType(item.type),
      url,
    });
  }

  return items;
}

function normalizeMediaUrlsFromVideo(
  explicitMediaUrls: VideoMediaUrl[],
  livePhotoUrls: string[],
  imageUrls: string[],
  fallbackVideoUrl: string,
  mediaType: string
): VideoMediaUrl[] {
  if (explicitMediaUrls.length > 0) {
    return uniqueMediaUrls(explicitMediaUrls);
  }

  const items: VideoMediaUrl[] = [];

  for (const url of livePhotoUrls) {
    if (!url.trim()) continue;
    items.push({ type: "live_photo", url });
  }

  for (const url of imageUrls) {
    if (!url.trim()) continue;
    items.push({ type: "image", url });
  }

  if (items.length === 0 && fallbackVideoUrl.trim()) {
    items.push({
      type: normalizeMediaType(mediaType, "video"),
      url: fallbackVideoUrl.trim(),
    });
  }

  return uniqueMediaUrls(items);
}

export function normalizeLikedVideo(item: unknown): VideoInfo | null {
  if (!item || typeof item !== "object") return null;

  const candidate = item as Partial<VideoInfo> & LikedVideoItemRaw;
  if (candidate.aweme_id && candidate.video && candidate.statistics) {
    const normalized = normalizeVideo(candidate);
    return normalized || (candidate as VideoInfo);
  }

  const mediaUrls = uniqueMediaUrls(normalizeMediaUrls(candidate.media_urls));
  const imageUrls = mediaUrls.filter((media) => media.type === "image").map((media) => media.url);
  const livePhotoUrls = mediaUrls.filter((media) => media.type === "live_photo").map((media) => media.url);
  const primaryVideoUrl = mediaUrls.find((media) => media.type === "video")?.url || "";
  const cover = candidate.cover_url || imageUrls[0] || "";
  const mediaType = String(candidate.media_type || (imageUrls.length > 0 ? "image" : "video"));
  const isImage = mediaType === "image" || mediaType === "mixed" || mediaType === "live_photo";

  return {
    aweme_id: candidate.aweme_id || "",
    desc: candidate.desc || "",
    create_time: candidate.create_time || 0,
    author: {
      uid: "",
      sec_uid: candidate.author?.sec_uid || "",
      nickname: candidate.author?.nickname || "",
      avatar_thumb: candidate.author?.avatar_thumb || "",
      avatar_medium: candidate.author?.avatar_thumb || "",
      signature: "",
      follower_count: 0,
      following_count: 0,
      aweme_count: 0,
      favoriting_count: 0,
      is_follow: false,
      verify_status: 0,
      unique_id: "",
    },
    video: {
      ...buildEmptyVideoData(),
      play_addr: primaryVideoUrl || livePhotoUrls[0] || "",
      download_addr: primaryVideoUrl || livePhotoUrls[0] || null,
      cover,
      dynamic_cover: cover,
      origin_cover: cover,
    },
    statistics: {
      ...buildEmptyStatistics(),
      digg_count: candidate.digg_count || 0,
      comment_count: candidate.comment_count || 0,
      share_count: candidate.share_count || 0,
    },
    image_urls: imageUrls.length > 0 ? imageUrls : null,
    images: imageUrls.length > 0 ? imageUrls : null,
    live_photo_urls: livePhotoUrls.length > 0 ? livePhotoUrls : null,
    live_photos: livePhotoUrls.length > 0 ? livePhotoUrls : null,
    has_live_photo: livePhotoUrls.length > 0,
    is_image: isImage,
    media_type: mediaType,
    media_urls: mediaUrls.length > 0 ? mediaUrls : null,
    bgm_url: candidate.bgm_url || null,
    cover_url: cover || null,
    music: candidate.bgm_url
      ? {
          title: "抖音原声",
          author: candidate.author?.nickname || "",
          play_url: candidate.bgm_url,
          cover,
          duration: 0,
        }
      : null,
  };
}

function normalizeCount(value: unknown): number {
  if (typeof value === "string") {
    const text = value.trim().replace(/,/g, "");
    const match = text.match(/^(\d+(?:\.\d+)?)([wW万kK千])?$/);
    if (match) {
      const unit = match[2]?.toLowerCase();
      const multiplier = unit === "w" || unit === "万" ? 10000 : unit === "k" || unit === "千" ? 1000 : 1;
      return Math.round(Number(match[1]) * multiplier);
    }
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeUser(user: unknown): UserInfo {
  const source = user && typeof user === "object" ? (user as Partial<UserInfo> & Record<string, unknown>) : {};
  return {
    uid: source.uid || "",
    sec_uid: source.sec_uid || "",
    nickname: source.nickname || "",
    avatar_thumb: source.avatar_thumb || source.avatar_medium || source.avatar_larger || "",
    avatar_medium: source.avatar_medium || source.avatar_thumb || source.avatar_larger || "",
    avatar_larger: source.avatar_larger || source.avatar_medium || source.avatar_thumb || "",
    signature: source.signature || "",
    follower_count: normalizeCount(source.follower_count),
    following_count: normalizeCount(source.following_count),
    total_favorited: normalizeCount(source.total_favorited),
    aweme_count: normalizeCount(source.aweme_count ?? source.aweme_count_str ?? source.aweme_count_text ?? source.work_count),
    favoriting_count: normalizeCount(source.favoriting_count),
    is_follow: source.is_follow || false,
    unique_id: source.unique_id || "",
    verify_status: source.verify_status || 0,
  };
}

export function normalizeVideo(video: unknown): VideoInfo | null {
  if (!video || typeof video !== "object") return null;

  const source = video as Record<string, unknown>;
  const author = normalizeUser(source.author || source.user || {});
  const stats = (source.statistics && typeof source.statistics === "object")
    ? (source.statistics as Partial<Statistics>)
    : {};
  const videoRecord = source.video && typeof source.video === "object" ? (source.video as Record<string, unknown>) : {};
  const topLevelMediaUrls = normalizeMediaUrls(source.media_urls);
  const nestedMediaUrls = normalizeMediaUrls(videoRecord.media_urls);
  const mediaUrls = uniqueMediaUrls(topLevelMediaUrls.length > 0 ? topLevelMediaUrls : nestedMediaUrls);
  const imageUrls = uniqueMediaUrls([
    ...(
      Array.isArray(source.image_urls)
        ? (source.image_urls as unknown[]).map((item) => extractUrl(item)).filter(Boolean)
        : Array.isArray(source.images)
          ? (source.images as unknown[]).map((item) => extractUrl(item)).filter(Boolean)
          : []
    ).map((url) => ({ type: "image", url })),
    ...mediaUrls.filter((item) => item.type === "image"),
  ]).map((item) => item.url);
  const livePhotoUrls = uniqueMediaUrls([
    ...(
      Array.isArray(source.live_photo_urls)
        ? (source.live_photo_urls as unknown[]).map((item) => extractUrl(item)).filter(Boolean)
        : Array.isArray(source.live_photos)
          ? (source.live_photos as unknown[]).map((item) => extractUrl(item)).filter(Boolean)
          : []
    ).map((url) => ({ type: "live_photo", url })),
    ...mediaUrls.filter((item) => item.type === "live_photo"),
  ]).map((item) => item.url);
  const primaryMediaUrl =
    mediaUrls.find((item) => item.type === "video")?.url ||
    mediaUrls.find((item) => item.type === "live_photo")?.url ||
    "";
  const cover = String(
    source.cover_url ||
      videoRecord.cover ||
      videoRecord.origin_cover ||
      videoRecord.dynamic_cover ||
      imageUrls[0] ||
      livePhotoUrls[0] ||
      ""
  );
  const playAddr = extractUrl(
    videoRecord.play_addr ||
    source.play_addr ||
    source.video_url ||
    source.url
  ) || primaryMediaUrl;
  const playAddrH264 = extractUrl(videoRecord.play_addr_h264 || source.play_addr_h264);
  const playAddrLowbr = extractUrl(videoRecord.play_addr_lowbr || source.play_addr_lowbr);
  const downloadAddr = extractUrl(videoRecord.download_addr || source.download_addr);
  const bitRates = normalizeBitRates(videoRecord.bit_rate || source.bit_rate);
  const previewAddr = extractUrl(
    source.preview_addr ||
      source.play_addr_lowbr ||
      source.play_addr_h264 ||
      videoRecord.preview_addr ||
      videoRecord.play_addr_lowbr ||
      videoRecord.play_addr_h264
  );
  const duration = Number(source.duration || videoRecord.duration || 0);
  const musicSource = source.music && typeof source.music === "object" ? (source.music as Record<string, unknown>) : null;
  const musicPlayUrl = extractUrl(
    source.bgm_url ||
      source.music_url ||
      source.music_play_url ||
      source.music_play_addr ||
      musicSource?.play_url
  );
  const mediaType = String(source.media_type || source.raw_media_type || (imageUrls.length > 0 ? "image" : "video"));
  const isImage = Boolean(source.is_image || mediaType === "image" || mediaType === "mixed" || mediaType === "live_photo" || imageUrls.length > 0);
  const rawMediaType =
    typeof source.raw_media_type === "string" || typeof source.raw_media_type === "number"
      ? source.raw_media_type
      : null;
  const normalizedMediaUrls = normalizeMediaUrlsFromVideo(
    mediaUrls,
    livePhotoUrls,
    imageUrls,
    playAddr || previewAddr || livePhotoUrls[0] || "",
    mediaType
  );

  return {
    aweme_id: String(source.aweme_id || ""),
    desc: String(source.desc || ""),
    create_time: Number(source.create_time || 0),
    author,
    video: {
      preview_addr: previewAddr || null,
      play_addr: playAddr || previewAddr || livePhotoUrls[0] || "",
      play_addr_h264: playAddrH264 || null,
      play_addr_lowbr: playAddrLowbr || null,
      download_addr: downloadAddr || playAddr || previewAddr || livePhotoUrls[0] || null,
      cover,
      dynamic_cover: String(source.dynamic_cover || cover),
      origin_cover: String(source.origin_cover || cover),
      width: Number(videoRecord.width || source.width || 0),
      height: Number(videoRecord.height || source.height || 0),
      duration,
      ratio: String(videoRecord.ratio || source.ratio || ""),
      bit_rate: bitRates,
    },
    statistics: {
      play_count: Number(stats.play_count || 0),
      digg_count: Number(source.digg_count || stats.digg_count || 0),
      comment_count: Number(source.comment_count || stats.comment_count || 0),
      share_count: Number(source.share_count || stats.share_count || 0),
      collect_count: Number(stats.collect_count || 0),
      forward_count: Number(stats.forward_count || 0),
    },
    image_urls: imageUrls.length > 0 ? imageUrls : null,
    images: imageUrls.length > 0 ? imageUrls : null,
    live_photo_urls: livePhotoUrls.length > 0 ? livePhotoUrls : null,
    live_photos: livePhotoUrls.length > 0 ? livePhotoUrls : null,
    has_live_photo: Boolean(source.has_live_photo || livePhotoUrls.length > 0),
    is_image: isImage,
    media_type: mediaType,
    raw_media_type: rawMediaType,
    media_urls: normalizedMediaUrls.length > 0 ? normalizedMediaUrls : null,
    bgm_url: musicPlayUrl || null,
    cover_url: cover || null,
    music: musicPlayUrl
      ? {
          title: String(musicSource?.title || source.music_title || ""),
          author: String(musicSource?.author || source.music_author || ""),
          play_url: musicPlayUrl,
          cover: String(musicSource?.cover || musicSource?.cover_thumb || ""),
          duration: Number(musicSource?.duration || source.music_duration || 0),
        }
      : null,
  };
}

export function normalizeVideos(videos: unknown): VideoInfo[] {
  if (!Array.isArray(videos)) return [];
  return videos.map(normalizeVideo).filter(Boolean) as VideoInfo[];
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

// ── Tauri / Browser event listener ──

type TauriUnlisten = () => void;
type EventHandler<T> = (payload: T) => void;

function mapCookieStatus(payload: unknown): CookieStatus {
  const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return {
    valid: Boolean(data.valid ?? data.success ?? false),
    user_name: ((data.user_name ?? data.nickname) || null) as string | null,
    user_id: (data.user_id ?? data.sec_uid ?? null) as string | null,
    expires_at: (data.expires_at ?? null) as number | null,
    message: String(data.message || ""),
  };
}

function mapHistoryItem(value: unknown): HistoryItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const path = String(item.path || item.file_path || "").trim();
  const awemeId = String(item.aweme_id || item.id || "").trim();
  const title = String(item.title || item.filename || item.desc || item.name || awemeId || "未命名作品").trim();
  const fileSize = Number(item.file_size ?? item.size ?? 0) || 0;
  const timestamp = Number(item.timestamp ?? item.modified_at ?? item.create_time ?? 0) || 0;
  const mediaType = String(item.media_type || item.file_type || item.extension || "").trim();
  return {
    id: awemeId || path || title,
    aweme_id: awemeId,
    filename: title,
    title,
    path,
    file_path: path,
    author: String(item.author || "").trim(),
    author_id: String(item.author_id || "").trim(),
    desc: title,
    size: fileSize,
    file_size: fileSize,
    timestamp,
    create_time: timestamp,
    file_type: mediaType,
    media_type: mediaType,
    cover: String(item.cover || "").trim(),
  };
}

function toFiniteNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeProgress(value: unknown, processed?: number, total?: number, currentProgress?: unknown) {
  const explicit = toFiniteNumber(value);
  if (explicit !== undefined) return Math.max(0, Math.min(100, explicit));
  const current = toFiniteNumber(currentProgress);
  if (total !== undefined && total > 0 && processed !== undefined) {
    const currentWeight = current !== undefined ? Math.max(0, Math.min(100, current)) / 100 : 0;
    return Math.max(0, Math.min(100, ((processed + currentWeight) / total) * 100));
  }
  return current !== undefined ? Math.max(0, Math.min(100, current)) : 0;
}

function normalizeBrowserTask(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const task = value as Record<string, unknown>;
  const id = String(task.id || task.task_id || "").trim();
  if (!id) return null;

  const status = String(task.status || "pending").trim().toLowerCase();
  const mappedStatus =
    status === "completed" ? "completed"
      : status === "downloading" ? "downloading"
      : status === "paused" ? "paused"
      : status === "cancelled" || status === "canceled" ? "cancelled"
      : status === "error" || status === "failed" ? "error"
      : "pending";
  const total = toFiniteNumber(task.total_videos ?? task.file_total ?? task.fileTotal ?? task.total_files);
  const processed = toFiniteNumber(task.processed ?? task.current_downloaded ?? task.file_index ?? task.fileIndex ?? task.completed_files);

  return {
    id,
    filename: String(task.filename || task.display_name || task.desc || id).trim(),
    progress: normalizeProgress(task.overall_progress, processed, total, task.progress),
    speed: Number(task.speed ?? task.speed_bps ?? 0) || 0,
    status: mappedStatus,
    isBatch: Boolean(task.isBatch ?? task.total_videos ?? task.fileTotal ?? task.total_files ?? false),
    awemeId: String(task.aweme_id || task.awemeId || "").trim() || undefined,
    currentAwemeId: String(task.current_aweme_id || task.currentAwemeId || "").trim() || undefined,
    currentName: String(task.current_name || task.currentName || "").trim() || undefined,
    savePath: String(task.save_path || task.savePath || "").trim() || undefined,
    filePath: String(task.file_path || task.filePath || "").trim() || undefined,
    mediaType: String(task.media_type || task.mediaType || "").trim() || undefined,
    mediaCount: toFiniteNumber(task.media_count ?? task.mediaCount ?? total),
    fileIndex: processed,
    fileTotal: total,
    fileProgress: Number(task.file_progress ?? task.fileProgress ?? 0) || undefined,
    completedCount: Number(task.completed_count ?? task.completedCount ?? 0) || undefined,
    skippedCount: Number(task.skipped_count ?? task.skippedCount ?? 0) || undefined,
    failedCount: Number(task.failed_count ?? task.failedCount ?? 0) || undefined,
    etaSeconds: Number(task.eta_seconds ?? task.etaSeconds ?? 0) || undefined,
    totalBytes: Number(task.total_bytes ?? task.totalBytes ?? 0) || undefined,
    downloadedBytes: Number(task.downloaded_bytes ?? task.downloadedBytes ?? 0) || undefined,
    startTime: Number(task.start_time ?? task.startTime ?? 0) || undefined,
    finishedTime: Number(task.finished_time ?? task.finishedTime ?? 0) || undefined,
    errorMessage: String(task.error_message || task.errorMessage || "").trim() || undefined,
  };
}

function normalizeBrowserDownloadProgress(payload: Record<string, unknown>) {
  const currentVideo = payload.current_video && typeof payload.current_video === "object"
    ? (payload.current_video as Record<string, unknown>)
    : {};
  const total = toFiniteNumber(payload.total_videos ?? payload.total);
  const processed = toFiniteNumber(payload.processed ?? payload.current_downloaded ?? payload.completed);

  return {
    task_id: String(payload.task_id || ""),
    progress: normalizeProgress(payload.overall_progress, processed, total, payload.progress ?? currentVideo.progress),
    overall_progress: normalizeProgress(payload.overall_progress, processed, total, payload.progress ?? currentVideo.progress),
    completed: Number(payload.current_downloaded ?? payload.completed ?? 0) || 0,
    current_downloaded: processed,
    total: Number(payload.total_videos ?? payload.total ?? 0) || 0,
    total_videos: total,
    processed,
    skipped: Number(payload.skipped ?? 0) || undefined,
    failed: Number(payload.failed ?? 0) || undefined,
    status: String(payload.status || "downloading"),
    desc: String(payload.desc || ""),
    display_name: String(payload.display_name || payload.desc || ""),
    file_index: Number(currentVideo.file_index ?? payload.file_index ?? 0) || undefined,
    file_total: Number(currentVideo.file_total ?? payload.file_total ?? 0) || undefined,
    file_progress: Number(currentVideo.progress ?? payload.file_progress ?? 0) || undefined,
    bytes_downloaded: Number(currentVideo.bytes_downloaded ?? payload.bytes_downloaded ?? 0) || undefined,
    bytes_total: Number(currentVideo.bytes_total ?? payload.bytes_total ?? 0) || undefined,
    speed_bps: Number(currentVideo.speed_bps ?? payload.speed_bps ?? 0) || undefined,
    eta_seconds: Number(payload.eta_seconds ?? currentVideo.eta_seconds ?? 0) || undefined,
    message: String(payload.message || currentVideo.message || ""),
  };
}

function normalizeDownloadInfoPayload(payload: Record<string, unknown>) {
  const total = toFiniteNumber(payload.total_videos);
  const processed = toFiniteNumber(payload.processed ?? payload.current_downloaded);
  return {
    task_id: String(payload.task_id || ""),
    progress: normalizeProgress(payload.overall_progress, processed, total),
    overall_progress: normalizeProgress(payload.overall_progress, processed, total),
    completed: Number(payload.current_downloaded ?? 0) || 0,
    current_downloaded: processed,
    total: Number(payload.total_videos ?? 0) || 0,
    total_videos: total,
    processed,
    skipped: Number(payload.skipped ?? 0) || undefined,
    failed: Number(payload.failed ?? 0) || undefined,
    status: "downloading",
    desc: String(payload.desc || ""),
    display_name: String(payload.display_name || payload.desc || ""),
    message: String(payload.message || ""),
  };
}

function getDownloadPayload(video: VideoInfo) {
  const normalized = normalizeVideo(video) || video;
  const authorName = normalized.author?.nickname || "未知作者";
  const mediaUrls = normalized.media_urls && normalized.media_urls.length > 0
    ? normalized.media_urls
    : [];
  return {
    aweme_id: normalized.aweme_id,
    desc: normalized.desc || "",
    media_urls: mediaUrls,
    raw_media_type: normalized.raw_media_type ?? normalized.media_type ?? "video",
    author_name: authorName,
  };
}

function shouldUseBrowserBridge() {
  return !isTauriRuntime();
}

export async function listenEvent<T>(event: string, handler: EventHandler<T>): Promise<TauriUnlisten> {
  const tauriListen = window.__TAURI__?.event?.listen;
  if (tauriListen) {
    return tauriListen(event, (ev) => handler(ev.payload as T));
  }

  const socket = getBrowserSocket();
  if (!socket) return () => {};

  const bindings: Array<{ event: string; listener: BrowserSocketListener }> = [];
  const bind = (socketEvent: string, transform: (payload: unknown) => T | null) => {
    const listener: BrowserSocketListener = (payload) => {
      const mapped = transform(payload);
      if (mapped !== null) handler(mapped);
    };
    socket.on(socketEvent, listener);
    bindings.push({ event: socketEvent, listener });
  };

  switch (event) {
    case "download-started":
      bind("download_started", (payload) => {
        const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        if (String(data.type || "") === "single_video") {
          return {
            task_id: String(data.task_id || ""),
            desc: String(data.desc || ""),
            display_name: String(data.display_name || data.desc || ""),
            type: String(data.type || ""),
            aweme_id: String(data.aweme_id || ""),
            media_type: String(data.media_type || ""),
            media_count: Number(data.media_count || 0) || 0,
          } as T;
        }
        return null;
      });
      break;
    case "batch-download-started":
      bind("download_started", (payload) => {
        const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        if (String(data.type || "") === "single_video") return null;
        return {
          task_id: String(data.task_id || ""),
          nickname: String(data.user || data.nickname || ""),
          total_videos: Number(data.total_videos || 0) || undefined,
          message: String(data.message || ""),
        } as T;
      });
      break;
    case "download-progress":
      bind("download_progress", (payload) => payload as T);
      bind("user_video_download_progress", (payload) => {
        const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        return normalizeBrowserDownloadProgress(data) as T;
      });
      bind("download_info", (payload) => {
        const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        return normalizeDownloadInfoPayload(data) as T;
      });
      break;
    case "download-log":
      bind("download_log", (payload) => {
        const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        return {
          task_id: String(data.task_id || ""),
          display_name: String(data.display_name || data.desc || ""),
          message: String(data.message || ""),
          timestamp: String(data.timestamp || ""),
        } as T;
      });
      break;
    case "download-failed":
      bind("download_failed", (payload) => {
        const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        return {
          task_id: String(data.task_id || ""),
          error: String(data.error || data.message || ""),
        } as T;
      });
      break;
    case "download-error":
      bind("download_error", (payload) => {
        const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        return {
          task_id: String(data.task_id || ""),
          message: String(data.message || data.error || ""),
        } as T;
      });
      break;
    case "download-cancelled":
      bind("download_cancelled", (payload) => payload as T);
      break;
    case "download-completed":
      bind("download_completed", (payload) => {
        const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        if (data.total_videos !== undefined && data.aweme_id === undefined) return null;
        return {
          task_id: String(data.task_id || ""),
          display_name: String(data.display_name || data.message || ""),
          message: String(data.message || ""),
          files: Array.isArray(data.files) ? data.files.map((item) => String(item)) : undefined,
          file_path: String(data.file_path || ""),
          save_path: String(data.save_path || ""),
          total_size: Number(data.total_size || 0) || undefined,
        } as T;
      });
      break;
    case "batch-download-completed":
      bind("download_completed", (payload) => {
        const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        if (data.total_videos === undefined && data.aweme_id !== undefined) return null;
        return {
          task_id: String(data.task_id || ""),
          total_videos: Number(data.total_videos || 0) || undefined,
          completed: Number(data.current_downloaded ?? data.completed ?? 0) || undefined,
          succeeded: Number(data.succeeded ?? 0) || undefined,
          skipped: Number(data.skipped ?? 0) || undefined,
          failed: Number(data.failed ?? 0) || undefined,
          processed: Number(data.processed ?? data.current_downloaded ?? data.completed ?? 0) || undefined,
          message: String(data.message || ""),
        } as T;
      });
      break;
    case "batch-download-cancelled":
      bind("download_cancelled", (payload) => {
        const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        return {
          task_id: String(data.task_id || ""),
          message: String(data.message || ""),
        } as T;
      });
      break;
    case "current-video-progress":
      bind("user_video_download_progress", (payload) => {
        const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        const currentVideo = data.current_video && typeof data.current_video === "object"
          ? (data.current_video as Record<string, unknown>)
          : {};
        return {
          task_id: String(data.task_id || ""),
          aweme_id: String(currentVideo.aweme_id || ""),
          name: String(currentVideo.desc || data.message || ""),
          progress: Number(currentVideo.progress ?? 0) || 0,
          speed_bps: Number(currentVideo.speed_bps ?? 0) || undefined,
          speed_mbps: Number(currentVideo.speed_mbps ?? 0) || undefined,
        } as T;
      });
      break;
    case "cookie-login-status":
      bind("cookie_login_status", (payload) => payload as T);
      break;
    default: {
      const fallback = event.replace(/-/g, "_");
      bind(fallback, (payload) => payload as T);
      break;
    }
  }

  return () => {
    bindings.forEach(({ event: socketEvent, listener }) => socket.off(socketEvent, listener));
  };
}

// ── React frontend browser bridge ──

export async function initClient(): Promise<{ success: boolean }> {
  if (shouldUseBrowserBridge()) return { success: true };
  return invoke("init_client");
}

export async function getAppVersion(): Promise<string> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<string | { version?: string }>("/api/get_app_version");
    return typeof result === "string" ? result : String(result?.version || "");
  }
  return invoke("get_app_version");
}

export async function checkUpdate(): Promise<{
  success: boolean;
  has_update: boolean;
  version?: string;
  current_version?: string;
  notes?: string;
  message?: string;
  html_url?: string;
  download_url?: string;
  asset_name?: string;
  asset_size?: number;
  portable?: boolean;
  install_mode?: string;
}> {
  if (shouldUseBrowserBridge()) {
    return requestJson("/api/check_update");
  }
  return invoke("check_update");
}

export async function downloadUpdate(): Promise<{
  success: boolean;
  message: string;
  mode?: string;
  portable?: boolean;
  install_mode?: string;
  restart_required?: boolean;
  download_url?: string;
  file_path?: string;
}> {
  if (shouldUseBrowserBridge()) {
    return requestJson("/api/download_update");
  }
  return invoke("download_update");
}

export async function restartApp(): Promise<void> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<{ success?: boolean; message?: string }>("/api/restart_app");
    if (result && result.success === false) {
      throw new Error(result.message || "重启失败");
    }
    return;
  }
  return invoke("restart_app");
}

export async function getConfig(): Promise<AppConfig> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<Record<string, unknown>>("/api/config");
    return {
      download_path: String(result.download_path || result.download_dir || ""),
      download_dir: String(result.download_dir || result.download_path || ""),
      filename_template: String(result.filename_template || "{title}_{aweme_id}"),
      max_concurrent: Number(result.max_concurrent || 3) || 3,
      download_quality: String(result.download_quality || "auto"),
      auto_create_folder: Boolean(result.auto_create_folder ?? true),
      folder_name_template: String(result.folder_name_template || "{author}"),
      save_metadata: Boolean(result.save_metadata ?? true),
      proxy: (result.proxy as string | null) ?? null,
      cookie: "",
      theme: String(result.theme || "dark"),
      language: String(result.language || "zh-CN"),
      cookie_set: Boolean(result.cookie_set ?? false),
    };
  }
  return invoke("get_config");
}

export async function saveConfig(config: Partial<AppConfig>): Promise<{ success: boolean; message: string }> {
  if (shouldUseBrowserBridge()) {
    const current = await getConfig().catch(() => ({} as Partial<AppConfig>));
    const payload: Record<string, unknown> = {
      download_dir: config.download_path ?? config.download_dir ?? current.download_path ?? current.download_dir ?? "",
      download_quality: config.download_quality ?? current.download_quality ?? "auto",
      max_concurrent: config.max_concurrent ?? current.max_concurrent ?? 3,
      filename_template: config.filename_template ?? current.filename_template ?? "{title}_{aweme_id}",
      folder_name_template: config.folder_name_template ?? current.folder_name_template ?? "{author}",
      auto_create_folder: config.auto_create_folder ?? current.auto_create_folder ?? true,
      proxy: config.proxy ?? current.proxy ?? null,
    };
    if (typeof config.cookie === "string") {
      payload.cookie = config.cookie;
    }
    return requestJson("/api/config", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  const current = await getConfig().catch(() => ({} as Partial<AppConfig>));
  const nextConfig: AppConfig = {
    download_path: config.download_path ?? config.download_dir ?? current.download_path ?? current.download_dir ?? "",
    filename_template: config.filename_template ?? current.filename_template ?? "{title}_{aweme_id}",
    max_concurrent: config.max_concurrent ?? current.max_concurrent ?? 3,
    download_quality: config.download_quality ?? current.download_quality ?? "auto",
    auto_create_folder: config.auto_create_folder ?? current.auto_create_folder ?? true,
    folder_name_template: config.folder_name_template ?? current.folder_name_template ?? "{author}",
    save_metadata: config.save_metadata ?? current.save_metadata ?? true,
    proxy: config.proxy ?? current.proxy ?? null,
    cookie: config.cookie ?? "",
    theme: config.theme ?? current.theme ?? "dark",
    language: config.language ?? current.language ?? "zh-CN",
  };
  return invoke("save_config", { config: nextConfig });
}

export async function selectDirectory(): Promise<string | null> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<{ success: boolean; path?: string; message?: string }>("/api/select_directory", {
      method: "POST",
    });
    if (result.success) {
      return result.path || null;
    }
    const message = result.message || "选择目录失败";
    if (/取消/.test(message)) {
      return null;
    }
    throw new Error(message);
  }
  return invoke("select_directory");
}

export async function searchUser(keyword: string): Promise<SearchUserResponse> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<SearchUserResponse>("/api/search_user", {
      method: "POST",
      body: JSON.stringify({ keyword }),
    });
    return {
      ...result,
      user: result.user ? normalizeUser(result.user) : undefined,
      users: Array.isArray(result.users) ? result.users.map(normalizeUser) : undefined,
    };
  }
  const result = await invoke<SearchUserResponse>("search_user", { keyword });
  return {
    ...result,
    user: result.user ? normalizeUser(result.user) : undefined,
    users: Array.isArray(result.users) ? result.users.map(normalizeUser) : undefined,
  };
}

export async function getUserDetail(secUid: string, nickname?: string): Promise<UserDetailResponse> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<UserDetailResponse>("/api/user_detail", {
      method: "POST",
      body: JSON.stringify({ sec_uid: secUid, nickname }),
    });
    return { ...result, user: result.user ? normalizeUser(result.user) : undefined };
  }
  const result = await invoke<UserDetailResponse>("get_user_detail", {
    secUid,
    sec_uid: secUid,
    nickname,
  });
  return {
    ...result,
    user: result.user ? normalizeUser(result.user) : undefined,
  };
}

export async function getUserVideos(secUid: string, count: number, cursor: number): Promise<UserVideosResponse> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<UserVideosResponse & { videos?: unknown[] }>("/api/user_videos", {
      method: "POST",
      body: JSON.stringify({ sec_uid: secUid, count, cursor }),
    });
    return {
      ...result,
      videos: normalizeVideos(result.videos),
    };
  }
  const result = await invoke<UserVideosResponse & { videos?: unknown[] }>("get_user_videos", {
    secUid,
    sec_uid: secUid,
    count,
    cursor,
  });
  return {
    ...result,
    videos: normalizeVideos(result.videos),
  };
}

export async function getVideoDetail(awemeId: string): Promise<VideoDetailResponse> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<VideoDetailResponse & { video?: unknown }>("/api/video_detail", {
      method: "POST",
      body: JSON.stringify({ aweme_id: awemeId }),
    });
    return {
      ...result,
      video: normalizeVideo(result.video) || undefined,
    };
  }
  const result = await invoke<VideoDetailResponse & { video?: unknown }>("get_video_detail", {
    awemeId,
    aweme_id: awemeId,
  });
  return {
    ...result,
    video: normalizeVideo(result.video) || undefined,
  };
}

export async function parseUrl(url: string): Promise<VideoInfo> {
  const result = await parseLink(url);
  return result.video || (normalizeVideo(result as unknown) as VideoInfo) || (result as unknown as VideoInfo);
}

export async function parseLink(link: string): Promise<LinkParseResponse> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<LinkParseResponse & { video?: unknown; videos?: unknown[]; user?: unknown }>("/api/parse_link", {
      method: "POST",
      body: JSON.stringify({ link }),
    });
    return {
      ...result,
      user: result.user ? normalizeUser(result.user) : undefined,
      video: normalizeVideo(result.video) || undefined,
      videos: normalizeVideos(result.videos),
    };
  }
  const result = await invoke<LinkParseResponse & { video?: unknown; videos?: unknown[]; user?: unknown }>("parse_link", { link });
  return {
    ...result,
    user: result.user ? normalizeUser(result.user) : undefined,
    video: normalizeVideo(result.video) || undefined,
    videos: normalizeVideos(result.videos),
  };
}

export async function downloadVideo(video: VideoInfo): Promise<ApiResponse & { task_id?: string }> {
  if (shouldUseBrowserBridge()) {
    const payload = getDownloadPayload(video);
    return requestJson("/api/download_single_video", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
  return invoke("download_video", { video });
}

export async function downloadUserVideos(
  secUid: string,
  nickname: string,
  awemeCount: number
): Promise<ApiResponse & { task_id?: string; total_videos?: number; nickname?: string }> {
  if (shouldUseBrowserBridge()) {
    return requestJson("/api/download_user_video", {
      method: "POST",
      body: JSON.stringify({
        sec_uid: secUid,
        nickname,
        aweme_count: awemeCount,
      }),
    });
  }
  return invoke("download_user_videos", {
    secUid,
    sec_uid: secUid,
    nickname,
    awemeCount,
    aweme_count: awemeCount,
  });
}

export async function downloadLikedVideos(count: number): Promise<{ success: boolean; message: string }> {
  if (shouldUseBrowserBridge()) {
    return requestJson("/api/download_liked", {
      method: "POST",
      body: JSON.stringify({ count }),
    });
  }
  return invoke("download_liked_videos", { count });
}

export async function downloadLikedAuthors(count: number): Promise<{ success: boolean; message: string }> {
  if (shouldUseBrowserBridge()) {
    return requestJson("/api/download_liked_authors", {
      method: "POST",
      body: JSON.stringify({ count }),
    });
  }
  return invoke("download_liked_authors", { count });
}

export async function addDownloadTask(video: VideoInfo, savePath?: string): Promise<string> {
  if (shouldUseBrowserBridge()) {
    const payload = getDownloadPayload(video);
    const result = await requestJson<ApiResponse & { task_id?: string }>("/api/download_single_video", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        save_path: savePath,
      }),
    });
    return result.task_id || video.aweme_id;
  }
  return invoke("add_download_task", { video, savePath, save_path: savePath });
}

export async function startDownload(taskId: string): Promise<void> {
  if (shouldUseBrowserBridge()) return;
  return invoke("start_download", { taskId, task_id: taskId });
}

export async function getDownloadTasks(): Promise<unknown[]> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<{ success: boolean; tasks?: unknown }>(
      "/api/tasks"
    );
    const tasks = result.tasks;
    if (Array.isArray(tasks)) return tasks;
    if (tasks && typeof tasks === "object") {
      return Object.values(tasks as Record<string, unknown>);
    }
    return [];
  }
  const result = await invoke<{ success: boolean; tasks?: unknown[] }>("get_download_tasks");
  return result.tasks || [];
}

export async function cancelDownloadTask(taskId: string): Promise<ApiResponse> {
  if (shouldUseBrowserBridge()) {
    return requestJson("/api/cancel_download", {
      method: "POST",
      body: JSON.stringify({ task_id: taskId }),
    });
  }
  return invoke("cancel_download_task", { taskId, task_id: taskId });
}

export async function removeDownloadTask(taskId: string): Promise<void> {
  if (shouldUseBrowserBridge()) return;
  return invoke("remove_download_task", { taskId, task_id: taskId });
}

export async function pauseDownload(taskId: string): Promise<ApiResponse> {
  if (shouldUseBrowserBridge()) {
    return requestJson("/api/pause_download", {
      method: "POST",
      body: JSON.stringify({ task_id: taskId }),
    });
  }
  return invoke("pause_download", { taskId, task_id: taskId });
}

export async function resumeDownload(taskId: string): Promise<ApiResponse> {
  if (shouldUseBrowserBridge()) {
    return requestJson("/api/resume_download", {
      method: "POST",
      body: JSON.stringify({ task_id: taskId }),
    });
  }
  return invoke("resume_download", { taskId, task_id: taskId });
}

export async function getRecommended(cursor: number, count: number): Promise<RecommendedResponse> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<RecommendedResponse & { videos?: unknown[] }>("/api/recommended_feed", {
      method: "POST",
      body: JSON.stringify({ cursor, count }),
    });
    return {
      ...result,
      videos: normalizeVideos(result.videos),
    };
  }
  const result = await invoke<RecommendedResponse & { videos?: unknown[] }>("get_recommended", { cursor, count });
  return {
    ...result,
    videos: normalizeVideos(result.videos),
  };
}

export async function getLikedVideos(
  count: number,
  secUid = "",
  cursor = 0
): Promise<LikedVideosResponse> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<LikedVideosResponse & { data?: unknown[] }>("/api/get_liked_videos", {
      method: "POST",
      body: JSON.stringify({ count, sec_uid: secUid, cursor }),
    });
    return {
      ...result,
      data: Array.isArray(result.data)
        ? (result.data.map(normalizeLikedVideo).filter(Boolean) as VideoInfo[])
        : [],
    };
  }
  const result = await invoke<LikedVideosResponse & { data?: unknown[] }>("get_liked_videos", {
    count,
    secUid,
    sec_uid: secUid,
    cursor,
  });

  return {
    ...result,
    data: Array.isArray(result.data)
      ? (result.data.map(normalizeLikedVideo).filter(Boolean) as VideoInfo[])
      : [],
  };
}

export async function getLikedAuthors(count: number): Promise<LikedAuthorsResponse> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<LikedAuthorsResponse & { data?: unknown[] }>("/api/get_liked_authors", {
      method: "POST",
      body: JSON.stringify({ count }),
    });
    return {
      ...result,
      data: Array.isArray(result.data) ? result.data.map(normalizeUser) : [],
    };
  }
  const result = await invoke<LikedAuthorsResponse & { data?: unknown[] }>("get_liked_authors", { count });
  return {
    ...result,
    data: Array.isArray(result.data) ? result.data.map(normalizeUser) : [],
  };
}

export async function getCollectedVideos(cursor: number, count: number): Promise<CollectedVideosResponse> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<CollectedVideosResponse & { data?: unknown[] }>("/api/get_collected_videos", {
      method: "POST",
      body: JSON.stringify({ cursor, count }),
    });
    return {
      ...result,
      data: Array.isArray(result.data)
        ? (result.data.map(normalizeLikedVideo).filter(Boolean) as VideoInfo[])
        : [],
    };
  }
  const result = await invoke<CollectedVideosResponse & { data?: unknown[] }>("get_collected_videos", {
    cursor,
    count,
  });
  return {
    ...result,
    data: Array.isArray(result.data)
      ? (result.data.map(normalizeLikedVideo).filter(Boolean) as VideoInfo[])
      : [],
  };
}

export async function getCollectedMixes(cursor: number, count: number): Promise<CollectedMixesResponse> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<CollectedMixesResponse & { data?: CollectedMixItem[] }>("/api/get_collected_mixes", {
      method: "POST",
      body: JSON.stringify({ cursor, count }),
    });
    return {
      ...result,
      data: Array.isArray(result.data) ? result.data : [],
    };
  }
  const result = await invoke<CollectedMixesResponse & { data?: CollectedMixItem[] }>("get_collected_mixes", {
    cursor,
    count,
  });
  return {
    ...result,
    data: Array.isArray(result.data) ? result.data : [],
  };
}

export async function getMixVideos(seriesId: string, cursor: number, count: number): Promise<MixVideosResponse> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<MixVideosResponse & { data?: unknown[] }>("/api/get_mix_videos", {
      method: "POST",
      body: JSON.stringify({ series_id: seriesId, cursor, count }),
    });
    return {
      ...result,
      data: Array.isArray(result.data)
        ? (result.data.map(normalizeLikedVideo).filter(Boolean) as VideoInfo[])
        : [],
    };
  }
  const result = await invoke<MixVideosResponse & { data?: unknown[] }>("get_mix_videos", {
    seriesId,
    series_id: seriesId,
    cursor,
    count,
  });
  return {
    ...result,
    data: Array.isArray(result.data) ? normalizeVideos(result.data) : [],
  };
}

export async function getComments(awemeId: string, count: number, cursor?: number): Promise<unknown> {
  if (shouldUseBrowserBridge()) {
    return requestJson("/api/get_comments", {
      method: "POST",
      body: JSON.stringify({ aweme_id: awemeId, count, cursor }),
    }).catch(() => []);
  }
  return invoke("get_comments", { awemeId, count, cursor });
}

export async function verifyCookie(): Promise<CookieStatus> {
  if (shouldUseBrowserBridge()) {
    return requestJson<CookieStatus>("/api/verify_cookie");
  }
  return invoke("verify_cookie");
}

export async function cookieBrowserLogin(timeout?: number, browser?: string): Promise<{ success: boolean; message: string }> {
  if (shouldUseBrowserBridge()) {
    return requestJson("/api/cookie/browser_login", {
      method: "POST",
      body: JSON.stringify({ timeout, browser }),
    });
  }
  return invoke("cookie_browser_login", { timeout, browser });
}

export async function cancelCookieBrowserLogin(): Promise<{ success: boolean; message: string }> {
  if (shouldUseBrowserBridge()) {
    return requestJson("/api/cookie/browser_login/cancel", { method: "POST" });
  }
  return invoke("cancel_cookie_browser_login");
}

type VerifyBrowserResponse = {
  success: boolean;
  message: string;
  open_url?: string;
};

export async function openVerifyBrowser(targetUrl?: string): Promise<VerifyBrowserResponse> {
  if (shouldUseBrowserBridge()) {
    try {
      return await requestJson<VerifyBrowserResponse>("/api/open_verify_browser", {
        method: "POST",
        body: JSON.stringify({ target_url: targetUrl }),
      });
    } catch (error) {
      return {
        success: false,
        message: getErrorMessage(error, "无法打开应用内验证窗口，请通过桌面版启动后重试"),
        open_url: targetUrl,
      };
    }
  }
  return invoke<VerifyBrowserResponse>("open_verify_browser", { targetUrl, target_url: targetUrl });
}

function normalizeHistoryItem(value: unknown): HistoryItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const path = String(item.path || item.file_path || "").trim();
  const awemeId = String(item.aweme_id || item.id || "").trim();
  const title = String(item.title || item.filename || item.desc || item.name || awemeId || "未命名作品").trim();
  const fileSize = Number(item.file_size ?? item.size ?? 0) || 0;
  const timestamp = Number(item.timestamp ?? item.modified_at ?? item.create_time ?? 0) || 0;
  const mediaType = String(item.media_type || item.file_type || item.extension || "").trim();

  return {
    id: awemeId || path || title,
    aweme_id: awemeId,
    filename: title,
    title,
    path,
    file_path: path,
    author: String(item.author || "").trim(),
    author_id: String(item.author_id || "").trim(),
    desc: title,
    size: fileSize,
    file_size: fileSize,
    timestamp,
    create_time: timestamp,
    file_type: mediaType,
    media_type: mediaType,
    cover: String(item.cover || "").trim(),
  };
}

export async function getHistory(): Promise<HistoryItem[]> {
  if (shouldUseBrowserBridge()) {
    const result = await requestJson<{ success: boolean; items?: unknown[] }>("/api/download_history");
    return (result.items || []).map(normalizeHistoryItem).filter(Boolean) as HistoryItem[];
  }
  const result = await invoke<{ success: boolean; items?: unknown[] }>("get_history");
  return (result.items || []).map(normalizeHistoryItem).filter(Boolean) as HistoryItem[];
}

function buildDownloadHistoryParams(
  options: {
    offset?: number;
    limit?: number;
    forceRefresh?: boolean;
    query?: string;
    mediaType?: string;
    sortBy?: string;
  } = {},
  forceRefresh = false
): URLSearchParams {
  const params = new URLSearchParams();
  if (forceRefresh || options.forceRefresh) params.set("refresh", "1");
  if (options.offset !== undefined) params.set("offset", String(options.offset));
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.query?.trim()) params.set("query", options.query.trim());
  if (options.mediaType) params.set("media_type", options.mediaType);
  if (options.sortBy) params.set("sort_by", options.sortBy);
  return params;
}

export async function listDownloadFiles(options?: {
  offset?: number;
  limit?: number;
  forceRefresh?: boolean;
  query?: string;
  mediaType?: string;
  sortBy?: string;
}): Promise<HistoryItem[]> {
  if (shouldUseBrowserBridge()) {
    const params = buildDownloadHistoryParams(options, true);
    const result = await requestJson<{ success: boolean; items?: unknown[] }>(`/api/download_history?${params.toString()}`);
    return (result.items || []).map(normalizeHistoryItem).filter(Boolean) as HistoryItem[];
  }
  const result = await invoke<{ success: boolean; items?: unknown[] }>("list_download_files", {
    offset: options?.offset,
    limit: options?.limit,
    forceRefresh: options?.forceRefresh,
    query: options?.query,
    mediaType: options?.mediaType,
    media_type: options?.mediaType,
    sortBy: options?.sortBy,
    sort_by: options?.sortBy,
  });
  return (result.items || []).map(normalizeHistoryItem).filter(Boolean) as HistoryItem[];
}

export async function listDownloadFilesPage(options: {
  offset?: number;
  limit?: number;
  forceRefresh?: boolean;
  query?: string;
  mediaType?: string;
  sortBy?: string;
} = {}): Promise<DownloadFilesResult> {
  if (shouldUseBrowserBridge()) {
    const params = buildDownloadHistoryParams(options, true);
    const result = await requestJson<{ success: boolean; items?: unknown[]; total?: number; total_size?: number; latest?: unknown }>(
      `/api/download_history?${params.toString()}`
    );
    return {
      items: (result.items || []).map(normalizeHistoryItem).filter(Boolean) as HistoryItem[],
      total: Number(result.total ?? 0) || 0,
      totalSize: Number(result.total_size ?? 0) || 0,
      latest: normalizeHistoryItem(result.latest) as HistoryItem | null,
    };
  }
  const result = await invoke<{ success: boolean; items?: unknown[]; total?: number; total_size?: number; latest?: unknown }>(
    "list_download_files",
    {
      offset: options.offset,
      limit: options.limit,
      forceRefresh: options.forceRefresh,
      query: options.query,
      mediaType: options.mediaType,
      media_type: options.mediaType,
      sortBy: options.sortBy,
      sort_by: options.sortBy,
    }
  );
  return {
    items: (result.items || []).map(normalizeHistoryItem).filter(Boolean) as HistoryItem[],
    total: Number(result.total ?? 0) || 0,
    totalSize: Number(result.total_size ?? 0) || 0,
    latest: normalizeHistoryItem(result.latest) as HistoryItem | null,
  };
}

export async function clearHistory(): Promise<void> {
  if (shouldUseBrowserBridge()) {
    const history = await getHistory().catch(() => []);
    const paths = history.map((item) => item.path).filter(Boolean);
    if (paths.length > 0) {
      await requestJson("/api/download_history/delete", {
        method: "POST",
        body: JSON.stringify({ paths }),
      });
    }
    return;
  }
  return invoke("clear_history");
}

export async function deleteHistory(id: string): Promise<void> {
  if (shouldUseBrowserBridge()) {
    const history = await getHistory().catch(() => []);
    const target = history.find((item) => item.id === id || item.aweme_id === id || item.path === id);
    if (target?.path) {
      await deleteFile(target.path);
    }
    return;
  }
  return invoke("delete_history", { awemeId: id, aweme_id: id });
}

export async function addHistory(entry: Omit<HistoryItem, "id">): Promise<void> {
  if (shouldUseBrowserBridge()) return;
  return invoke("add_history", { entry });
}

export async function openFile(path: string): Promise<void> {
  if (shouldUseBrowserBridge()) {
    await requestJson("/api/download_history/open", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
    return;
  }
  return invoke("open_file", { path });
}

export async function openDownloadDirectory(): Promise<void> {
  if (shouldUseBrowserBridge()) {
    await requestJson("/api/download_history/open_directory", { method: "POST" });
    return;
  }
  return invoke("open_download_directory");
}

export async function openFileLocation(path: string): Promise<void> {
  if (shouldUseBrowserBridge()) {
    await requestJson("/api/download_history/open_location", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
    return;
  }
  return invoke("open_file_location", { path });
}

export async function deleteFile(path: string): Promise<void> {
  if (shouldUseBrowserBridge()) {
    await requestJson("/api/download_history/delete", {
      method: "POST",
      body: JSON.stringify({ paths: [path] }),
    });
    return;
  }
  return invoke("delete_file", { path });
}
