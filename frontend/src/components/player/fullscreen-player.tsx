import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  Download,
  Heart,
  Info,
  Music,
  Pause,
  Play,
  Star,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { cn, formatDuration, formatNumber } from "@/lib/utils";
import { getVideoDetail, mediaProxyUrl, type VideoInfo } from "@/lib/tauri";
import {
  collectVideoMedia,
  getMediaProxyType,
  getVideoBgmUrl,
  isVideoLikeMedia,
  shouldUseSeparateBgm,
  type VideoMediaItem,
} from "@/lib/video-media";

interface FullscreenPlayerProps {
  videos: VideoInfo[];
  initialIndex?: number;
  initialMediaIndex?: number;
  open: boolean;
  onClose: () => void;
  onDownload?: (video: VideoInfo) => void;
  onLoadMore?: () => void;
  onShowDetail?: (video: VideoInfo) => void;
  onAuthor?: (video: VideoInfo) => void;
}

const IMAGE_DURATION_SECONDS = 1.5;
const LOAD_MORE_THRESHOLD = 3;
const PLAYER_VIDEO_MAX_AUTO_RETRIES = 1;
const PLAYER_VIDEO_BUFFERING_DELAY_MS = 450;
const PLAYER_VIDEO_LOAD_TIMEOUT_MS = 18_000;
const MAX_PRELOADED_MEDIA_NODES = 24;
const MEDIA_TRANSITION_DISTANCE = 34;
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const WHEEL_VIDEO_SWITCH_THRESHOLD = 80;
const WHEEL_VIDEO_SWITCH_LOCK_MS = 520;
const WHEEL_IDLE_RESET_MS = 160;

const mediaMotionVariants: Variants = {
  enter: (direction = 0) => ({
    opacity: 0,
    x: direction * MEDIA_TRANSITION_DISTANCE,
    scale: 0.992,
  }),
  center: {
    opacity: 1,
    x: 0,
    scale: 1,
  },
  exit: (direction = 0) => ({
    opacity: 0,
    x: direction * -MEDIA_TRANSITION_DISTANCE,
    scale: 0.992,
  }),
};

function playerMediaProxyUrl(url: string | null | undefined, mediaType: "video" | "image" | "audio", retryKey = 0): string {
  const proxied = mediaProxyUrl(url, mediaType);
  if (!proxied || retryKey <= 0) return proxied;
  return `${proxied}${proxied.includes("?") ? "&" : "?"}player_retry=${encodeURIComponent(String(retryKey))}`;
}

export function FullscreenPlayer({
  videos,
  initialIndex = 0,
  initialMediaIndex = 0,
  open,
  onClose,
  onDownload,
  onLoadMore,
  onShowDetail,
  onAuthor,
}: FullscreenPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [openPanel, setOpenPanel] = useState<"volume" | "rate" | "music" | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [showLoadStatus, setShowLoadStatus] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [bgmPlaying, setBgmPlaying] = useState(false);
  const [videoOverrides, setVideoOverrides] = useState<Record<string, VideoInfo>>({});
  const [mediaTransitionDirection, setMediaTransitionDirection] = useState(0);
  const [navigationNotice, setNavigationNotice] = useState("");
  const playerRootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgmRef = useRef<HTMLAudioElement>(null);
  const bgmSourceKeyRef = useRef("");
  const touchStart = useRef({ x: 0, y: 0 });
  const wheelLocked = useRef(false);
  const wheelAccumulatedDeltaRef = useRef(0);
  const loadMoreRequestedForLength = useRef(0);
  const imageAdvanceQueued = useRef(false);
  const desiredPlayingRef = useRef(true);
  const mediaSwitchingRef = useRef(false);
  const bgmManuallyPausedRef = useRef(false);
  const mediaSwitchReleaseRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const wheelResetTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const loadStatusTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const loadTimeoutTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const bufferingTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const navigationNoticeTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const autoRetryCountRef = useRef(0);
  const refreshingDetailRef = useRef(false);
  const refreshedDetailIdsRef = useRef(new Set<string>());
  const videoProgressRafRef = useRef<number | null>(null);
  const progressSampleRef = useRef(0);
  const preloadedMediaRef = useRef(new Set<string>());
  const preloadedNodesRef = useRef<Array<HTMLImageElement | HTMLVideoElement>>([]);

  const rawCurrentVideo = videos[currentIndex] || null;
  const currentVideo = rawCurrentVideo?.aweme_id
    ? videoOverrides[rawCurrentVideo.aweme_id] || rawCurrentVideo
    : rawCurrentVideo;
  const mediaItems = useMemo(
    () => (currentVideo ? collectVideoMedia(currentVideo) : []),
    [currentVideo]
  );
  const currentMedia = mediaItems[mediaIndex] || mediaItems[0] || null;
  const currentMediaSrc = currentMedia
    ? playerMediaProxyUrl(currentMedia.url, getMediaProxyType(currentMedia), reloadKey)
    : "";
  const currentPosterSrc = currentMedia?.poster
    ? playerMediaProxyUrl(currentMedia.poster, "image")
    : "";
  const mediaKey = currentMedia
    ? `${currentVideo?.aweme_id || "video"}-${mediaIndex}-${currentMedia.type}-${currentMedia.url}-${reloadKey}`
    : "empty";
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const hasMultipleMedia = mediaItems.length > 1;
  const initialVideoKey = videos[initialIndex]?.aweme_id || "";
  const authorAvatar =
    currentVideo?.author?.avatar_thumb || currentVideo?.author?.avatar_medium || "";
  const authorName =
    currentVideo?.author?.nickname || currentVideo?.author?.unique_id || "用户";
  const canOpenAuthor = Boolean(onAuthor && currentVideo?.author?.sec_uid);
  const likeCount = (currentVideo?.statistics?.digg_count || 0) + (liked ? 1 : 0);
  const favoriteBaseCount = currentVideo?.statistics?.collect_count || 0;
  const favoriteCount = favoriteBaseCount + (favorited ? 1 : 0);
  const musicUrl = getVideoBgmUrl(currentVideo);
  const bgmProxyUrl = musicUrl ? mediaProxyUrl(musicUrl, "audio") : "";
  const effectiveVolume = muted ? 0 : volume;
  const shouldUseBgmForCurrentMedia = Boolean(
    currentMedia &&
      musicUrl &&
      (shouldUseSeparateBgm(currentMedia) || hasMultipleMedia)
  );

  const stopVideoProgressLoop = useCallback(() => {
    if (videoProgressRafRef.current === null) return;
    window.cancelAnimationFrame(videoProgressRafRef.current);
    videoProgressRafRef.current = null;
  }, []);

  const clearLoadTimers = useCallback(() => {
    if (loadStatusTimerRef.current) {
      window.clearTimeout(loadStatusTimerRef.current);
      loadStatusTimerRef.current = null;
    }
    if (loadTimeoutTimerRef.current) {
      window.clearTimeout(loadTimeoutTimerRef.current);
      loadTimeoutTimerRef.current = null;
    }
    if (bufferingTimerRef.current) {
      window.clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null;
    }
  }, []);

  const startVideoProgressLoop = useCallback(() => {
    if (videoProgressRafRef.current !== null) return;

    const tick = () => {
      const node = videoRef.current;
      if (!node) {
        videoProgressRafRef.current = null;
        return;
      }

      const now = performance.now();
      if (now - progressSampleRef.current >= 50 || node.paused || node.ended) {
        progressSampleRef.current = now;
        setCurrentTime(node.currentTime || 0);
        setDuration(node.duration || 0);
      }

      if (!node.paused && !node.ended) {
        videoProgressRafRef.current = window.requestAnimationFrame(tick);
      } else {
        videoProgressRafRef.current = null;
      }
    };

    videoProgressRafRef.current = window.requestAnimationFrame(tick);
  }, []);

  const goToVideo = useCallback((index: number) => {
    if (index < 0 || index >= videos.length) return;
    desiredPlayingRef.current = true;
    mediaSwitchingRef.current = false;
    setMediaTransitionDirection(0);
    setCurrentIndex(index);
    setMediaIndex(0);
    setCurrentTime(0);
    setDuration(0);
    progressSampleRef.current = 0;
    setPlaying(false);
    setReloadKey((value) => value + 1);
  }, [videos.length]);

  const showNavigationNotice = useCallback((message: string) => {
    setNavigationNotice(message);
    if (navigationNoticeTimerRef.current) {
      window.clearTimeout(navigationNoticeTimerRef.current);
    }
    navigationNoticeTimerRef.current = window.setTimeout(() => {
      setNavigationNotice("");
      navigationNoticeTimerRef.current = null;
    }, 1400);
  }, []);

  const playNextVideo = useCallback(() => {
    if (currentIndex < videos.length - 1) {
      goToVideo(currentIndex + 1);
      return;
    }
    if (onLoadMore) {
      showNavigationNotice("正在加载更多视频...");
      onLoadMore();
      return;
    }
    showNavigationNotice("已经是最后一个视频");
  }, [currentIndex, goToVideo, onLoadMore, showNavigationNotice, videos.length]);

  const playPrevVideo = useCallback(() => {
    if (currentIndex > 0) {
      goToVideo(currentIndex - 1);
      return;
    }
    showNavigationNotice("已经是第一个视频");
  }, [currentIndex, goToVideo, showNavigationNotice]);

  const releaseMediaSwitchSoon = useCallback(() => {
    if (mediaSwitchReleaseRef.current) {
      window.clearTimeout(mediaSwitchReleaseRef.current);
    }
    mediaSwitchReleaseRef.current = window.setTimeout(() => {
      mediaSwitchingRef.current = false;
      mediaSwitchReleaseRef.current = null;
    }, 650);
  }, []);

  const switchToMedia = useCallback((index: number) => {
    if (mediaItems.length === 0) return;
    const safeIndex = ((index % mediaItems.length) + mediaItems.length) % mediaItems.length;
    const direction = resolveMediaDirection(mediaIndex, safeIndex, mediaItems.length);
    const shouldKeepPlaying = desiredPlayingRef.current || playing;
    desiredPlayingRef.current = shouldKeepPlaying;
    mediaSwitchingRef.current = true;
    if (mediaSwitchReleaseRef.current) {
      window.clearTimeout(mediaSwitchReleaseRef.current);
    }
    setMediaIndex(safeIndex);
    setMediaTransitionDirection(direction);
    setCurrentTime(0);
    setDuration(0);
    progressSampleRef.current = 0;
    setPlaying(shouldKeepPlaying);
    releaseMediaSwitchSoon();
  }, [mediaItems.length, playing, releaseMediaSwitchSoon]);

  const playNextMedia = useCallback(() => {
    if (mediaItems.length > 1) {
      switchToMedia(mediaIndex + 1);
      return;
    }
    playNextVideo();
  }, [mediaIndex, mediaItems.length, playNextVideo, switchToMedia]);

  const playPrevMedia = useCallback(() => {
    if (mediaItems.length > 1) {
      switchToMedia(mediaIndex - 1);
      return;
    }
    playPrevVideo();
  }, [mediaIndex, mediaItems.length, playPrevVideo, switchToMedia]);

  const advanceMediaSequence = useCallback(() => {
    if (mediaItems.length === 0) return;
    desiredPlayingRef.current = true;
    if (mediaItems.length > 1) {
      switchToMedia(mediaIndex + 1);
      return;
    }
    imageAdvanceQueued.current = false;
    setCurrentTime(0);
    setDuration(IMAGE_DURATION_SECONDS);
    setPlaying(true);
    setReloadKey((value) => value + 1);
  }, [mediaIndex, mediaItems.length, switchToMedia]);

  const requestAdvanceMediaSequence = useCallback(() => {
    window.requestAnimationFrame(() => {
      advanceMediaSequence();
    });
  }, [advanceMediaSequence]);

  const togglePlay = useCallback(() => {
    if (!currentMedia) return;
    if (!isVideoLikeMedia(currentMedia)) {
      setPlaying((value) => {
        desiredPlayingRef.current = !value;
        return !value;
      });
      return;
    }

    const node = videoRef.current;
    if (!node) return;
    if (node.paused) {
      desiredPlayingRef.current = true;
      void node.play().then(() => {
        setPlaying(true);
        startVideoProgressLoop();
      }).catch(() => setPlaying(false));
    } else {
      desiredPlayingRef.current = false;
      node.pause();
      setPlaying(false);
    }
  }, [currentMedia, startVideoProgressLoop]);

  const togglePanel = useCallback((panel: "volume" | "rate" | "music", event: ReactMouseEvent) => {
    event.stopPropagation();
    setOpenPanel((value) => (value === panel ? null : panel));
  }, []);

  const toggleMute = useCallback((event: ReactMouseEvent) => {
    event.stopPropagation();
    if (muted && volume === 0) {
      setVolume(50);
    }
    setMuted((value) => !value);
  }, [muted, volume]);

  const handleVolumeChange = useCallback((nextVolume: number) => {
    const safeVolume = Math.max(0, Math.min(100, nextVolume));
    setVolume(safeVolume);
    setMuted(safeVolume === 0);
  }, []);

  const handlePlaybackRateChange = useCallback((rate: number, event: ReactMouseEvent) => {
    event.stopPropagation();
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setOpenPanel(null);
  }, []);

  const ensureBgmSource = useCallback(() => {
    const audio = bgmRef.current;
    if (!audio || !bgmProxyUrl) return null;
    if (bgmSourceKeyRef.current !== bgmProxyUrl) {
      bgmSourceKeyRef.current = bgmProxyUrl;
      audio.src = bgmProxyUrl;
      audio.loop = true;
      audio.preload = "auto";
      audio.load();
    }
    audio.volume = effectiveVolume / 100;
    audio.muted = muted || volume === 0;
    return audio;
  }, [bgmProxyUrl, effectiveVolume, muted, volume]);

  const playBgm = useCallback(() => {
    if (bgmManuallyPausedRef.current) return;
    const audio = ensureBgmSource();
    if (!audio) return;
    if (!audio.paused) {
      setBgmPlaying(true);
      return;
    }
    void audio.play().then(() => setBgmPlaying(true)).catch(() => setBgmPlaying(false));
  }, [ensureBgmSource]);

  const pauseBgm = useCallback(() => {
    const audio = bgmRef.current;
    if (!audio) return;
    audio.pause();
    setBgmPlaying(false);
  }, []);

  const toggleBgm = useCallback((event: ReactMouseEvent) => {
    event.stopPropagation();
    const audio = ensureBgmSource();
    if (!audio) return;
    if (audio.paused) {
      bgmManuallyPausedRef.current = false;
      void audio.play().then(() => setBgmPlaying(true)).catch(() => setBgmPlaying(false));
    } else {
      bgmManuallyPausedRef.current = true;
      audio.pause();
      setBgmPlaying(false);
    }
  }, [ensureBgmSource]);

  const handleSeek = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nextTime = Math.max(0, Math.min(duration, ((event.clientX - rect.left) / rect.width) * duration));

    if (currentMedia && isVideoLikeMedia(currentMedia) && videoRef.current) {
      videoRef.current.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
  }, [currentMedia, duration]);

  const refreshCurrentVideoDetail = useCallback(async () => {
    const awemeId = currentVideo?.aweme_id;
    if (!awemeId || refreshingDetailRef.current || refreshedDetailIdsRef.current.has(awemeId)) {
      return false;
    }

    refreshingDetailRef.current = true;
    refreshedDetailIdsRef.current.add(awemeId);
    setLoadState("loading");
    setShowLoadStatus(true);

    try {
      const result = await getVideoDetail(awemeId);
      if (!result.success || !result.video) {
        return false;
      }

      setVideoOverrides((current) => ({
        ...current,
        [awemeId]: result.video as VideoInfo,
      }));
      setMediaIndex(0);
      setCurrentTime(0);
      setDuration(0);
      setReloadKey((value) => value + 1);
      return true;
    } catch {
      return false;
    } finally {
      refreshingDetailRef.current = false;
    }
  }, [currentVideo?.aweme_id]);

  const retryCurrentMedia = useCallback((event?: ReactMouseEvent, auto = false) => {
    event?.stopPropagation();
    if (!auto && currentVideo?.aweme_id) {
      refreshedDetailIdsRef.current.delete(currentVideo.aweme_id);
    }
    clearLoadTimers();
    autoRetryCountRef.current = auto ? autoRetryCountRef.current : 0;
    setLoadState("loading");
    setShowLoadStatus(true);
    setCurrentTime(0);
    setDuration(0);
    setReloadKey((value) => value + 1);
  }, [clearLoadTimers, currentVideo?.aweme_id]);

  const markMediaReady = useCallback(() => {
    clearLoadTimers();
    setLoadState("ready");
    setShowLoadStatus(false);
    mediaSwitchingRef.current = false;
  }, [clearLoadTimers]);

  const handleMediaFailure = useCallback(async () => {
    clearLoadTimers();
    stopVideoProgressLoop();
    mediaSwitchingRef.current = false;

    const mediaErrorCode = videoRef.current?.error?.code || 0;
    const canAutoRetry =
      (typeof navigator === "undefined" || navigator.onLine !== false) &&
      (mediaErrorCode === 0 || mediaErrorCode === 2 || mediaErrorCode === 4) &&
      autoRetryCountRef.current < PLAYER_VIDEO_MAX_AUTO_RETRIES;

    if (canAutoRetry) {
      autoRetryCountRef.current += 1;
      retryCurrentMedia(undefined, true);
      return;
    }

    const refreshed = await refreshCurrentVideoDetail();
    if (refreshed) return;

    setLoadState("error");
    setPlaying(false);
    setShowLoadStatus(true);
  }, [clearLoadTimers, refreshCurrentVideoDetail, retryCurrentMedia, stopVideoProgressLoop]);

  const scheduleLoadTimeout = useCallback(() => {
    if (loadTimeoutTimerRef.current) {
      window.clearTimeout(loadTimeoutTimerRef.current);
    }

    loadTimeoutTimerRef.current = window.setTimeout(() => {
      const node = videoRef.current;
      if (!currentMedia || !isVideoLikeMedia(currentMedia)) return;
      if (node && node.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
      void handleMediaFailure();
    }, PLAYER_VIDEO_LOAD_TIMEOUT_MS);
  }, [currentMedia, handleMediaFailure]);

  const showBufferingSoon = useCallback(() => {
    if (bufferingTimerRef.current) {
      window.clearTimeout(bufferingTimerRef.current);
    }
    bufferingTimerRef.current = window.setTimeout(() => {
      const node = videoRef.current;
      if (node && node.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
      setLoadState("loading");
      setShowLoadStatus(true);
    }, PLAYER_VIDEO_BUFFERING_DELAY_MS);
  }, []);

  const preloadMediaItem = useCallback((media: VideoMediaItem | null | undefined, full = false) => {
    if (!media) return;

    const proxiedUrl = mediaProxyUrl(media.url, getMediaProxyType(media));
    const key = `${media.type}::${proxiedUrl}`;
    if (!proxiedUrl || preloadedMediaRef.current.has(key)) return;
    preloadedMediaRef.current.add(key);

    if (media.type === "image") {
      const image = new Image();
      image.decoding = "async";
      image.loading = "eager";
      image.src = proxiedUrl;
      preloadedNodesRef.current.push(image);
    } else {
      const video = document.createElement("video");
      video.preload = full ? "auto" : "metadata";
      video.muted = true;
      video.playsInline = true;
      video.src = proxiedUrl;
      video.load();
      preloadedNodesRef.current.push(video);
    }

    while (preloadedNodesRef.current.length > MAX_PRELOADED_MEDIA_NODES) {
      const removed = preloadedNodesRef.current.shift();
      if (removed instanceof HTMLVideoElement) {
        removed.pause();
        removed.removeAttribute("src");
        removed.load();
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => {
      playerRootRef.current?.focus({ preventScroll: true });
    }, 0);

    const safeIndex = Math.min(Math.max(initialIndex, 0), Math.max(videos.length - 1, 0));
    const initialMediaCount = collectVideoMedia(videos[safeIndex]).length;
    const safeMediaIndex = Math.min(
      Math.max(initialMediaIndex, 0),
      Math.max(initialMediaCount - 1, 0)
    );
    desiredPlayingRef.current = true;
    mediaSwitchingRef.current = false;
    setMediaTransitionDirection(0);
    setCurrentIndex(safeIndex);
    setMediaIndex(safeMediaIndex);
    setCurrentTime(0);
    setDuration(0);
    progressSampleRef.current = 0;
    setPlaying(false);
    setReloadKey((value) => value + 1);
    return () => window.clearTimeout(focusTimer);
  }, [initialIndex, initialMediaIndex, initialVideoKey, open]);

  useEffect(() => {
    setLiked(false);
    setFavorited(false);
    setOpenPanel(null);
  }, [currentVideo?.aweme_id]);

  useEffect(() => {
    return () => {
      if (mediaSwitchReleaseRef.current) {
        window.clearTimeout(mediaSwitchReleaseRef.current);
      }
      if (wheelResetTimerRef.current) {
        window.clearTimeout(wheelResetTimerRef.current);
      }
      if (navigationNoticeTimerRef.current) {
        window.clearTimeout(navigationNoticeTimerRef.current);
      }
      clearLoadTimers();
      stopVideoProgressLoop();
      pauseBgm();
    };
  }, [clearLoadTimers, pauseBgm, stopVideoProgressLoop]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || videos.length === 0) return;
    if (currentIndex >= videos.length) {
      goToVideo(videos.length - 1);
    }
  }, [currentIndex, goToVideo, open, videos.length]);

  useEffect(() => {
    if (mediaIndex < mediaItems.length) return;
    setMediaIndex(0);
  }, [mediaIndex, mediaItems.length]);

  useEffect(() => {
    autoRetryCountRef.current = 0;
  }, [currentMedia?.url, currentVideo?.aweme_id, mediaIndex]);

  useEffect(() => {
    bgmManuallyPausedRef.current = false;
  }, [currentVideo?.aweme_id, musicUrl]);

  useEffect(() => {
    imageAdvanceQueued.current = false;
    setShowLoadStatus(false);
    clearLoadTimers();

    setCurrentTime(0);
    setDuration(currentMedia?.type === "image" ? IMAGE_DURATION_SECONDS : 0);
    progressSampleRef.current = 0;
    setLoadState(currentMedia ? "loading" : "error");
    setPlaying(Boolean(currentMedia && desiredPlayingRef.current));

    if (shouldUseBgmForCurrentMedia && desiredPlayingRef.current) {
      playBgm();
    } else if (!mediaSwitchingRef.current) {
      pauseBgm();
    }

    if (currentMedia && isVideoLikeMedia(currentMedia)) {
      loadStatusTimerRef.current = window.setTimeout(() => {
        setShowLoadStatus(true);
      }, PLAYER_VIDEO_BUFFERING_DELAY_MS);
      scheduleLoadTimeout();
      if (mediaItems.length > 1) {
        const nextIndex = (mediaIndex + 1) % mediaItems.length;
        preloadMediaItem(mediaItems[nextIndex], false);
      }
    }
  }, [clearLoadTimers, currentMedia, mediaIndex, mediaItems, mediaKey, pauseBgm, playBgm, preloadMediaItem, scheduleLoadTimeout, shouldUseBgmForCurrentMedia]);

  useEffect(() => {
    if (!open || !currentVideo || mediaItems.length > 0) return;
    void refreshCurrentVideoDetail().then((refreshed) => {
      if (refreshed) return;
      setLoadState("error");
      setShowLoadStatus(true);
    });
  }, [currentVideo, mediaItems.length, open, refreshCurrentVideoDetail]);

  useEffect(() => {
    if (!open || !onLoadMore || videos.length === 0) return;
    const remaining = videos.length - currentIndex - 1;
    if (remaining > LOAD_MORE_THRESHOLD) return;
    if (loadMoreRequestedForLength.current === videos.length) return;
    loadMoreRequestedForLength.current = videos.length;
    onLoadMore();
  }, [currentIndex, onLoadMore, open, videos.length]);

  useEffect(() => {
    preloadedMediaRef.current.clear();
    for (const node of preloadedNodesRef.current) {
      if (node instanceof HTMLVideoElement) {
        node.pause();
        node.removeAttribute("src");
        node.load();
      }
    }
    preloadedNodesRef.current = [];
  }, [currentVideo?.aweme_id]);

  useEffect(() => {
    if (!open || mediaItems.length <= 1 || loadState !== "ready") return;

    const orderedIndexes = Array.from(
      new Set([
        (mediaIndex + 1) % mediaItems.length,
        (mediaIndex - 1 + mediaItems.length) % mediaItems.length,
      ])
    ).filter((index) => index !== mediaIndex);
    let cancelled = false;
    const timers: number[] = [];

    orderedIndexes.forEach((index, order) => {
      const timer = window.setTimeout(() => {
        if (cancelled) return;
        preloadMediaItem(mediaItems[index], true);
      }, order * 140);
      timers.push(timer);
    });

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [loadState, mediaIndex, mediaItems, open, preloadMediaItem]);

  useEffect(() => {
    if (!open || !currentMedia || !isVideoLikeMedia(currentMedia)) return;
    const frame = window.requestAnimationFrame(() => {
      const node = videoRef.current;
      if (!node) return;
      node.currentTime = 0;
      if (!desiredPlayingRef.current) return;
      void node.play().then(() => {
        setPlaying(true);
        startVideoProgressLoop();
      }).catch(() => setPlaying(false));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentMedia, mediaKey, open, startVideoProgressLoop]);

  useEffect(() => {
    const wantsBgm =
      open &&
      currentMedia &&
      shouldUseBgmForCurrentMedia &&
      desiredPlayingRef.current &&
      loadState !== "error" &&
      (playing || mediaSwitchingRef.current || loadState === "loading" || currentMedia.type === "image" || hasMultipleMedia);

    if (wantsBgm) {
      playBgm();
      return;
    }

    if (!mediaSwitchingRef.current) {
      pauseBgm();
    }
  }, [currentMedia, hasMultipleMedia, loadState, open, pauseBgm, playBgm, playing, shouldUseBgmForCurrentMedia]);

  useEffect(() => {
    const audio = bgmRef.current;
    if (!audio) return;

    const handlePlay = () => setBgmPlaying(true);
    const handlePause = () => setBgmPlaying(false);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handlePause);
    audio.addEventListener("emptied", handlePause);
    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handlePause);
      audio.removeEventListener("emptied", handlePause);
    };
  }, []);

  useEffect(() => {
    const nextVolume = effectiveVolume / 100;
    const video = videoRef.current;
    if (video) {
      video.volume = nextVolume;
      video.muted = shouldUseBgmForCurrentMedia || muted || volume === 0;
      video.playbackRate = playbackRate;
    }

    const audio = bgmRef.current;
    if (audio) {
      audio.volume = nextVolume;
      audio.muted = muted || volume === 0;
    }
  }, [effectiveVolume, mediaKey, muted, playbackRate, shouldUseBgmForCurrentMedia, volume]);

  useEffect(() => {
    stopVideoProgressLoop();
    return stopVideoProgressLoop;
  }, [mediaKey, stopVideoProgressLoop]);

  useEffect(() => {
    if (!open || currentMedia?.type !== "image" || !playing) return;

    let frame = 0;
    let last = performance.now();
    const tick = (timestamp: number) => {
      const delta = Math.max(0, timestamp - last) / 1000;
      last = timestamp;

      setCurrentTime((value) => {
        const next = Math.min(IMAGE_DURATION_SECONDS, value + delta);
        if (next >= IMAGE_DURATION_SECONDS && !imageAdvanceQueued.current) {
          imageAdvanceQueued.current = true;
          requestAdvanceMediaSequence();
        }
        return next;
      });

      if (!imageAdvanceQueued.current) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [currentMedia?.type, mediaKey, open, playing, requestAdvanceMediaSequence]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      const key = event.key;
      const lowerKey = key.toLowerCase();
      const isEditableTarget = isKeyboardInputTarget(event.target);
      let handled = true;

      if (key === "Escape") {
        onClose();
      } else if (isEditableTarget) {
        handled = false;
      } else if (key === "ArrowUp" || lowerKey === "k") {
        playPrevVideo();
      } else if (key === "ArrowDown" || lowerKey === "j") {
        playNextVideo();
      } else if (key === "ArrowLeft") {
        playPrevMedia();
      } else if (key === "ArrowRight") {
        playNextMedia();
      } else if (key === " ") {
        togglePlay();
      } else {
        handled = false;
      }

      if (!handled) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [open, onClose, playNextMedia, playNextVideo, playPrevMedia, playPrevVideo, togglePlay]);

  const handleWheel = useCallback((event: ReactWheelEvent) => {
    event.preventDefault();
    if (wheelLocked.current) return;

    const normalizedDeltaY = normalizeWheelDelta(event);
    if (normalizedDeltaY === 0) return;

    const previousDelta = wheelAccumulatedDeltaRef.current;
    if (previousDelta !== 0 && Math.sign(previousDelta) !== Math.sign(normalizedDeltaY)) {
      wheelAccumulatedDeltaRef.current = 0;
    }
    wheelAccumulatedDeltaRef.current += normalizedDeltaY;

    if (wheelResetTimerRef.current) {
      window.clearTimeout(wheelResetTimerRef.current);
    }
    wheelResetTimerRef.current = window.setTimeout(() => {
      wheelAccumulatedDeltaRef.current = 0;
      wheelResetTimerRef.current = null;
    }, WHEEL_IDLE_RESET_MS);

    if (Math.abs(wheelAccumulatedDeltaRef.current) < WHEEL_VIDEO_SWITCH_THRESHOLD) return;

    const shouldPlayNext = wheelAccumulatedDeltaRef.current > 0;
    wheelAccumulatedDeltaRef.current = 0;
    wheelLocked.current = true;
    window.setTimeout(() => {
      wheelLocked.current = false;
    }, WHEEL_VIDEO_SWITCH_LOCK_MS);

    if (shouldPlayNext) playNextVideo();
    else playPrevVideo();
  }, [playNextVideo, playPrevVideo]);

  const handleTouchStart = (event: ReactTouchEvent) => {
    touchStart.current = {
      x: event.touches[0]?.clientX || 0,
      y: event.touches[0]?.clientY || 0,
    };
  };

  const handleTouchEnd = (event: ReactTouchEvent) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = touchStart.current.x - touch.clientX;
    const deltaY = touchStart.current.y - touch.clientY;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 54) {
      if (deltaX > 0) playNextMedia();
      else playPrevMedia();
      return;
    }

    if (Math.abs(deltaY) > 64) {
      if (deltaY > 0) playNextVideo();
      else playPrevVideo();
    }
  };

  return (
    <AnimatePresence>
      {open && currentVideo && (
        <motion.div
          ref={playerRootRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex flex-col overflow-hidden bg-black text-white"
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="absolute inset-x-0 top-0 z-30 flex items-center bg-gradient-to-b from-black/70 to-transparent px-5 py-4"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-[background-color,transform] hover:bg-white/20 active:scale-[0.96]"
              aria-label="关闭播放器"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center" onClick={togglePlay}>
            <AnimatePresence initial={false} custom={mediaTransitionDirection}>
              <motion.div
                key={mediaKey}
                custom={mediaTransitionDirection}
                variants={mediaMotionVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                className="absolute inset-0 flex items-center justify-center"
                style={{ willChange: "transform, opacity" }}
              >
                {currentMedia && isVideoLikeMedia(currentMedia) && (
                  <video
                    ref={videoRef}
                    src={currentMediaSrc}
                    poster={currentPosterSrc}
                    className="h-full max-h-full w-full max-w-full object-contain"
                    loop={!hasMultipleMedia}
                    playsInline
                    muted={shouldUseBgmForCurrentMedia || muted || volume === 0}
                    preload="auto"
                    onLoadStart={scheduleLoadTimeout}
                    onWaiting={showBufferingSoon}
                    onStalled={showBufferingSoon}
                    onLoadedMetadata={(event) => {
                      setDuration(event.currentTarget.duration || 0);
                      event.currentTarget.volume = effectiveVolume / 100;
                      event.currentTarget.muted = shouldUseBgmForCurrentMedia || muted || volume === 0;
                      event.currentTarget.playbackRate = playbackRate;
                    }}
                    onCanPlay={(event) => {
                      markMediaReady();
                      releaseMediaSwitchSoon();
                      if (shouldUseBgmForCurrentMedia && desiredPlayingRef.current) {
                        playBgm();
                      } else {
                        pauseBgm();
                      }
                      if (desiredPlayingRef.current && event.currentTarget.paused) {
                        void event.currentTarget.play().then(() => {
                          setPlaying(true);
                          startVideoProgressLoop();
                        }).catch(() => setPlaying(false));
                      } else if (desiredPlayingRef.current) {
                        setPlaying(true);
                        startVideoProgressLoop();
                      }
                    }}
                    onPlay={() => {
                      desiredPlayingRef.current = true;
                      setPlaying(true);
                      startVideoProgressLoop();
                    }}
                    onPause={() => {
                      stopVideoProgressLoop();
                      if (!mediaSwitchingRef.current) {
                        setPlaying(false);
                        desiredPlayingRef.current = false;
                      }
                    }}
                    onEnded={() => {
                      stopVideoProgressLoop();
                      advanceMediaSequence();
                    }}
                    onError={() => {
                      void handleMediaFailure();
                    }}
                  />
                )}

                {currentMedia?.type === "image" && (
                  <img
                    src={currentMediaSrc}
                    alt={currentVideo.desc || "图片"}
                    className="max-h-full max-w-full object-contain"
                    onLoad={() => {
                      markMediaReady();
                      releaseMediaSwitchSoon();
                      if (desiredPlayingRef.current) {
                        setPlaying(true);
                        if (shouldUseBgmForCurrentMedia) {
                          playBgm();
                        }
                      }
                    }}
                    onError={() => {
                      void handleMediaFailure();
                    }}
                  />
                )}

                {!currentMedia && (
                  <PlayerStatus
                    title="没有可播放的媒体"
                    message="当前作品没有返回视频或图片地址。"
                    onRetry={retryCurrentMedia}
                    state="error"
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {loadState === "loading" && showLoadStatus && currentMedia && isVideoLikeMedia(currentMedia) && (
              <PlayerStatus title="正在加载媒体..." message="正在通过本地代理拉取播放地址" />
            )}
            {loadState === "error" && currentMedia && (
              <PlayerStatus
                title="媒体加载失败"
                message="可以重试，或打开详情复制原始媒体链接。"
                state="error"
                onRetry={retryCurrentMedia}
              />
            )}

            {!playing && loadState === "ready" && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/15 shadow-[0_18px_52px_rgba(0,0,0,0.4)] backdrop-blur-md">
                  <Play className="ml-1 h-8 w-8 fill-white" />
                </div>
              </div>
            )}

            <AnimatePresence initial={false}>
              {navigationNotice && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.16 }}
                  className="pointer-events-none absolute left-1/2 top-[44%] z-20 -translate-x-1/2 rounded-full bg-black/58 px-4 py-2 text-[0.82rem] font-semibold text-white shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur-md"
                >
                  {navigationNotice}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div
            className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2 pb-1 pt-24 text-white"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex min-w-0 items-center justify-between gap-3">
              <button
                type="button"
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-full py-0.5 pr-2 transition-[background-color,opacity,transform]",
                  canOpenAuthor
                    ? "cursor-pointer hover:bg-white/10 active:scale-[0.98]"
                    : "cursor-default opacity-75"
                )}
                disabled={!canOpenAuthor}
                title={canOpenAuthor ? "进入作者主页" : "作者信息不可用"}
                aria-label={canOpenAuthor ? `进入 ${authorName} 主页` : "作者信息不可用"}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!currentVideo || !canOpenAuthor) return;
                  onAuthor?.(currentVideo);
                }}
              >
                <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full border-2 border-white/30 bg-white/10">
                  {authorAvatar ? (
                    <img
                      src={mediaProxyUrl(authorAvatar, "image")}
                      alt={authorName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-accent text-[0.72rem] font-bold text-white">
                      {authorName.slice(0, 1)}
                    </div>
                  )}
                </div>
                <span className="truncate text-[0.88rem] font-semibold drop-shadow-md">@{authorName}</span>
              </button>

              <div className="flex min-w-0 max-w-[66vw] items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <InlinePlayerButton
                  label="点赞"
                  count={likeCount}
                  active={liked}
                  activeClassName="fill-accent text-accent"
                  onClick={(event) => {
                    event.stopPropagation();
                    setLiked((value) => !value);
                  }}
                >
                  <Heart className={cn("h-4 w-4", liked && "fill-accent text-accent")} />
                </InlinePlayerButton>

                <InlinePlayerButton
                  label="收藏"
                  count={favoriteCount}
                  active={favorited}
                  activeClassName="fill-warning text-warning"
                  onClick={(event) => {
                    event.stopPropagation();
                    setFavorited((value) => !value);
                  }}
                >
                  <Star className={cn("h-4 w-4", favorited && "fill-warning text-warning")} />
                </InlinePlayerButton>

                <div className="relative shrink-0">
                  <PlayerIconButton
                    label="音量"
                    onClick={(event) => togglePanel("volume", event)}
                    active={openPanel === "volume"}
                  >
                    {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </PlayerIconButton>
                  <AnimatePresence>
                    {openPanel === "volume" && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.16 }}
                        className="absolute bottom-9 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#141414]/95 px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur-xl"
                        onClick={(event) => event.stopPropagation()}
                        onWheel={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={toggleMute}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:text-white/70"
                          aria-label={muted ? "取消静音" : "静音"}
                        >
                          {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={effectiveVolume}
                          onChange={(event) => handleVolumeChange(Number(event.currentTarget.value))}
                          className="h-1 w-[100px] cursor-pointer accent-accent"
                          aria-label="音量"
                        />
                        <span className="min-w-9 text-center text-[0.78rem] font-medium tabular-nums text-white/90">
                          {effectiveVolume}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="relative shrink-0">
                  <PlayerIconButton
                    label="倍速"
                    onClick={(event) => togglePanel("rate", event)}
                    active={openPanel === "rate"}
                  >
                    <span className="text-[0.78rem] font-semibold tabular-nums">{playbackRate}x</span>
                  </PlayerIconButton>
                  <AnimatePresence>
                    {openPanel === "rate" && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.16 }}
                        className="absolute bottom-9 left-1/2 z-40 flex max-w-[200px] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl bg-[#141414]/95 p-2 shadow-[0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur-xl"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {PLAYBACK_RATES.map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={(event) => handlePlaybackRateChange(rate, event)}
                            className={cn(
                              "rounded-lg px-2.5 py-1.5 text-[0.72rem] font-medium text-white/70 transition-colors hover:bg-white/12 hover:text-white",
                              rate === playbackRate && "bg-accent/20 text-accent"
                            )}
                          >
                            {rate}x
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <PlayerIconButton
                  label="下载作品"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDownload?.(currentVideo);
                  }}
                >
                  <Download className="h-4 w-4" />
                </PlayerIconButton>

                <div className="relative shrink-0">
                  <PlayerIconButton
                    label="背景音乐"
                    onClick={(event) => togglePanel("music", event)}
                    active={openPanel === "music"}
                  >
                    <Music className="h-4 w-4" />
                  </PlayerIconButton>
                  <AnimatePresence>
                    {openPanel === "music" && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.16 }}
                        className="absolute bottom-9 right-0 z-40 w-[min(260px,calc(100vw-24px))] rounded-xl bg-[#141414]/95 p-2 shadow-[0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur-xl"
                        onClick={(event) => event.stopPropagation()}
                        onWheel={(event) => event.stopPropagation()}
                      >
                        <div className="mb-2 min-w-0">
                          <div className="truncate text-[0.78rem] font-medium text-white">
                            {currentVideo.music?.title || "暂无背景音乐"}
                          </div>
                          {currentVideo.music?.author && (
                            <div className="truncate text-[0.68rem] text-white/45">
                              {currentVideo.music.author}
                            </div>
                          )}
                        </div>
                        {musicUrl ? (
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={toggleBgm}
                              className="flex h-8 items-center justify-center gap-1 rounded-md bg-accent/18 text-[0.72rem] font-semibold text-accent transition-colors hover:bg-accent/25"
                            >
                              {bgmPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                              {bgmPlaying ? "暂停 BGM" : "播放 BGM"}
                            </button>
                            <a
                              href={bgmProxyUrl}
                              download
                              className="flex h-8 items-center justify-center gap-1 rounded-md bg-white/[0.08] text-[0.72rem] font-semibold text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Download className="h-3.5 w-3.5" />
                              下载
                            </a>
                          </div>
                        ) : (
                          <div className="rounded-md bg-white/[0.06] px-2 py-2 text-[0.72rem] text-white/55">
                            当前作品没有返回音频地址
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {onShowDetail && (
                  <PlayerIconButton
                    label="查看详情"
                    onClick={(event) => {
                      event.stopPropagation();
                      onShowDetail(currentVideo);
                    }}
                  >
                    <Info className="h-4 w-4" />
                  </PlayerIconButton>
                )}
              </div>
            </div>

            <div className="mt-1.5">
              <ProgressBar
                duration={duration}
                currentTime={currentTime}
                progressPct={progressPct}
                mediaItems={mediaItems}
                mediaIndex={mediaIndex}
                onSeek={handleSeek}
                onSelectMedia={switchToMedia}
              />

              <p className="mt-1.5 line-clamp-2 text-[0.82rem] leading-[1.3] text-white/90 drop-shadow-md">
                {currentVideo.desc || "无描述"}
              </p>
            </div>
          </div>

          <audio ref={bgmRef} className="hidden" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ProgressBar({
  duration,
  currentTime,
  progressPct,
  mediaItems,
  mediaIndex,
  onSeek,
  onSelectMedia,
}: {
  duration: number;
  currentTime: number;
  progressPct: number;
  mediaItems: VideoMediaItem[];
  mediaIndex: number;
  onSeek: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onSelectMedia: (index: number) => void;
}) {
  if (mediaItems.length > 1) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {mediaItems.map((item, index) => {
            const fill = index < mediaIndex ? 100 : index === mediaIndex ? progressPct : 0;
            return (
              <button
                key={`${item.type}-${item.url}-${index}`}
                className="relative h-1.5 min-w-[18px] flex-1 overflow-hidden rounded-full bg-white/18"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectMedia(index);
                }}
                aria-label={`切换到第 ${index + 1} 个媒体`}
              >
                <span
                  className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-gradient-to-r from-white/90 to-accent transition-transform duration-100 ease-linear"
                  style={{ transform: `scaleX(${fill / 100})` }}
                />
              </button>
            );
          })}
        </div>
        <TimeLabel currentTime={currentTime} duration={duration} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div
        className="group relative h-[3px] flex-1 cursor-pointer rounded-full bg-white/20 transition-[height,background-color] hover:h-[5px] hover:bg-white/30"
        onClick={onSeek}
      >
        <div
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-accent transition-transform duration-100 ease-linear"
          style={{ transform: `scaleX(${progressPct / 100})` }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-md transition-opacity group-hover:opacity-100"
          style={{ left: `calc(${progressPct}% - 6px)` }}
        />
      </div>
      <TimeLabel currentTime={currentTime} duration={duration} />
    </div>
  );
}

function TimeLabel({ currentTime, duration }: { currentTime: number; duration: number }) {
  return (
    <div className="shrink-0 text-[0.68rem] font-medium tabular-nums text-white/72">
      {formatDuration(currentTime)} / {formatDuration(duration)}
    </div>
  );
}

function InlinePlayerButton({
  children,
  label,
  count,
  active,
  activeClassName,
  onClick,
}: {
  children: ReactNode;
  label: string;
  count: number;
  active?: boolean;
  activeClassName?: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-white transition-[background-color,transform,color] hover:scale-[1.08] hover:bg-white/10 active:scale-95",
          active && activeClassName
        )}
        aria-label={label}
        title={label}
      >
        {children}
      </button>
      <span className="text-[0.78rem] font-medium tabular-nums text-white/85 drop-shadow-md">
        {formatNumber(count)}
      </span>
    </div>
  );
}

function PlayerIconButton({
  children,
  label,
  active,
  onClick,
}: {
  children: ReactNode;
  label: string;
  active?: boolean;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-white transition-[background-color,transform,color] hover:scale-[1.08] hover:bg-white/10 active:scale-95",
        active && "bg-white/10"
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function PlayerStatus({
  title,
  message,
  state = "loading",
  onRetry,
}: {
  title: string;
  message: string;
  state?: "loading" | "error";
  onRetry?: (event: ReactMouseEvent) => void;
}) {
  return (
    <div className="absolute left-1/2 top-1/2 z-20 flex w-[min(360px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-[14px] border border-white/12 bg-black/45 px-5 py-4 text-center backdrop-blur-xl">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full",
          state === "error" ? "bg-warning-soft text-warning" : "bg-white/10 text-white"
        )}
      >
        {state === "error" ? <Info className="h-5 w-5" /> : <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />}
      </div>
      <div className="text-[0.9rem] font-semibold">{title}</div>
      <div className="text-[0.78rem] leading-relaxed text-white/68">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 h-8 rounded-[8px] border border-white/16 bg-white/10 px-3 text-[0.78rem] text-white transition-colors hover:bg-white/18"
        >
          重试
        </button>
      )}
    </div>
  );
}

function resolveMediaDirection(currentIndex: number, nextIndex: number, total: number): number {
  if (total <= 1 || currentIndex === nextIndex) return 0;
  const forwardDistance = (nextIndex - currentIndex + total) % total;
  const backwardDistance = (currentIndex - nextIndex + total) % total;
  return forwardDistance <= backwardDistance ? 1 : -1;
}

function normalizeWheelDelta(event: ReactWheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * window.innerHeight;
  return event.deltaY;
}

function isKeyboardInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}
