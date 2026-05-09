import { create } from "zustand";
import { getRecommended, openVerifyBrowser, type VideoInfo } from "@/lib/tauri";
import { useLogStore } from "@/stores/app-store";

const PAGE_SIZE = 20;
let latestFeedRequestId = 0;
let latestLoadMoreRequestId = 0;

interface RecommendedStoreState {
  videos: VideoInfo[];
  loading: boolean;
  loadingMore: boolean;
  cursor: number;
  hasMore: boolean;
  error: string | null;
  initialized: boolean;
  loadFeed: (count?: number, force?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

const uniqueVideos = (existing: VideoInfo[], incoming: VideoInfo[]) => {
  const seen = new Set(existing.map((video) => video.aweme_id));
  const next = [...existing];
  for (const video of incoming) {
    if (!video?.aweme_id || seen.has(video.aweme_id)) continue;
    seen.add(video.aweme_id);
    next.push(video);
  }
  return next;
};

export const useRecommendedStore = create<RecommendedStoreState>((set, get) => ({
  videos: [],
  loading: false,
  loadingMore: false,
  cursor: 0,
  hasMore: true,
  error: null,
  initialized: false,

  loadFeed: async (count = PAGE_SIZE, force = false) => {
    const state = get();
    if (state.loading || state.loadingMore) return;
    if (!force && state.initialized && state.videos.length > 0) return;

    const addLog = useLogStore.getState().addLog;
    const shouldKeepVideos = state.videos.length > 0;
    const requestId = ++latestFeedRequestId;
    latestLoadMoreRequestId += 1;

    set({
      loading: true,
      error: null,
      ...(shouldKeepVideos ? {} : { videos: [], cursor: 0, hasMore: true }),
    });

    addLog(shouldKeepVideos ? "刷新推荐视频..." : "加载推荐视频...", "info");

    try {
      const result = await getRecommended(0, count);
      if (requestId !== latestFeedRequestId) return;

      if (!result.success) {
        const message = result.message || "加载推荐视频失败";
        if (result.need_verify) {
          void openVerifyBrowser(result.verify_url)
            .then((verifyResult) => addLog(verifyResult.message, verifyResult.success ? "info" : "warning"))
            .catch(() => addLog("无法打开应用内验证窗口，请用桌面模式启动后重试", "warning"));
        }
        set((current) => ({
          loading: false,
          error: message,
          initialized: true,
          ...(current.videos.length > 0 ? {} : { videos: [] }),
        }));
        addLog(message, result.need_verify ? "warning" : "error");
        return;
      }

      const videos = result.videos || [];
      set({
        videos,
        loading: false,
        loadingMore: false,
        cursor: result.cursor || 0,
        hasMore: result.has_more ?? videos.length > 0,
        error: null,
        initialized: true,
      });
      addLog(`已加载 ${videos.length} 个推荐视频`, "success");
    } catch (error) {
      if (requestId !== latestFeedRequestId) return;
      const message = error instanceof Error ? error.message : "加载推荐视频失败";
      set((current) => ({
        loading: false,
        error: message,
        initialized: true,
        ...(current.videos.length > 0 ? {} : { videos: [] }),
      }));
      addLog(message, "error");
    }
  },

  loadMore: async () => {
    const state = get();
    if (state.loading || state.loadingMore || !state.hasMore) return;

    const requestId = ++latestLoadMoreRequestId;
    const cursor = state.cursor;
    set({ loadingMore: true, error: null });

    try {
      const result = await getRecommended(cursor, PAGE_SIZE);
      if (requestId !== latestLoadMoreRequestId) return;

      if (!result.success) {
        if (result.need_verify) {
          void openVerifyBrowser(result.verify_url)
            .then((verifyResult) => useLogStore.getState().addLog(verifyResult.message, verifyResult.success ? "info" : "warning"))
            .catch(() => useLogStore.getState().addLog("无法打开应用内验证窗口，请用桌面模式启动后重试", "warning"));
        }
        set({ loadingMore: false, error: result.message || "加载更多失败" });
        return;
      }

      set((current) => {
        const nextVideos = uniqueVideos(current.videos, result.videos || []);
        const addedCount = nextVideos.length - current.videos.length;
        return {
          loadingMore: false,
          videos: nextVideos,
          cursor: result.cursor || current.cursor,
          hasMore: addedCount > 0 && (result.has_more ?? ((result.videos?.length || 0) > 0)),
          error: null,
          initialized: true,
        };
      });
    } catch (error) {
      if (requestId !== latestLoadMoreRequestId) return;
      set({
        loadingMore: false,
        error: error instanceof Error ? error.message : "加载更多失败",
      });
    }
  },

  refresh: async () => {
    await get().loadFeed(PAGE_SIZE, true);
  },
}));
