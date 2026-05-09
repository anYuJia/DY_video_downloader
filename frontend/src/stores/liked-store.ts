import { create } from "zustand";
import {
  getErrorMessage,
  getLikedAuthors,
  getLikedVideos,
  openVerifyBrowser,
  type UserInfo,
  type VideoInfo,
} from "@/lib/tauri";
import {
  loadLikedAuthorsCache,
  loadLikedVideosCache,
  saveLikedAuthorsCache,
  saveLikedVideosCache,
} from "@/lib/liked-cache";
import { useLogStore } from "@/stores/app-store";

const DEFAULT_COUNT = 20;

interface LikedStoreState {
  videos: VideoInfo[];
  authors: UserInfo[];
  loadingVideos: boolean;
  loadingAuthors: boolean;
  videosLoaded: boolean;
  authorsLoaded: boolean;
  videosError: string | null;
  authorsError: string | null;
  loadVideos: (force?: boolean, count?: number) => Promise<void>;
  loadAuthors: (force?: boolean, count?: number) => Promise<void>;
}

export const useLikedStore = create<LikedStoreState>((set, get) => ({
  videos: [],
  authors: [],
  loadingVideos: false,
  loadingAuthors: false,
  videosLoaded: false,
  authorsLoaded: false,
  videosError: null,
  authorsError: null,

  loadVideos: async (force = false, count = DEFAULT_COUNT) => {
    const state = get();
    if (state.loadingVideos) return;
    if (!force && state.videosLoaded && state.videos.length > 0) return;

    const addLog = useLogStore.getState().addLog;
    const cachedVideos = loadLikedVideosCache();
    set({
      loadingVideos: true,
      videosError: null,
      ...(state.videos.length > 0 ? {} : cachedVideos.length > 0 ? { videos: cachedVideos } : { videos: [] }),
    });
    addLog("加载点赞视频...", "info");

    try {
      const result = await getLikedVideos(count);
      if (!result.success) {
        const message = result.message || "获取点赞视频失败";
        if (result.need_verify) {
          void openVerifyBrowser(result.verify_url)
            .then((verifyResult) => addLog(verifyResult.message, verifyResult.success ? "info" : "warning"))
            .catch(() => addLog("无法打开应用内验证窗口，请用桌面模式启动后重试", "warning"));
        }
        if (cachedVideos.length > 0) {
          set({
            videos: cachedVideos,
            loadingVideos: false,
            videosLoaded: true,
            videosError: null,
          });
          addLog(`点赞视频请求失败，已回退到本地缓存（${cachedVideos.length} 条）`, "warning");
          return;
        }
        set({
          loadingVideos: false,
          videosLoaded: true,
          videosError: message,
        });
        addLog(message, result.need_verify ? "warning" : "error");
        return;
      }

      const videos = result.data || [];
      saveLikedVideosCache(videos);
      set({
        videos,
        loadingVideos: false,
        videosLoaded: true,
        videosError: null,
      });
      addLog(`已加载 ${videos.length} 个点赞视频`, "success");
    } catch (error) {
      if (cachedVideos.length > 0) {
        set({
          videos: cachedVideos,
          loadingVideos: false,
          videosLoaded: true,
          videosError: null,
        });
        addLog(`点赞视频请求异常，已回退到本地缓存（${cachedVideos.length} 条）`, "warning");
        return;
      }

      const message = getErrorMessage(error, "获取点赞视频失败");
      set({
        loadingVideos: false,
        videosLoaded: true,
        videosError: message,
      });
      addLog(message, "error");
    }
  },

  loadAuthors: async (force = false, count = DEFAULT_COUNT) => {
    const state = get();
    if (state.loadingAuthors) return;
    if (!force && state.authorsLoaded && state.authors.length > 0) return;

    const addLog = useLogStore.getState().addLog;
    const cachedAuthors = loadLikedAuthorsCache();
    set({
      loadingAuthors: true,
      authorsError: null,
      ...(state.authors.length > 0 ? {} : cachedAuthors.length > 0 ? { authors: cachedAuthors } : { authors: [] }),
    });
    addLog("加载点赞作者...", "info");

    try {
      const result = await getLikedAuthors(count);
      if (!result.success) {
        const message = result.message || "获取点赞作者失败";
        if (result.need_verify) {
          void openVerifyBrowser(result.verify_url)
            .then((verifyResult) => addLog(verifyResult.message, verifyResult.success ? "info" : "warning"))
            .catch(() => addLog("无法打开应用内验证窗口，请用桌面模式启动后重试", "warning"));
        }
        if (cachedAuthors.length > 0) {
          set({
            authors: cachedAuthors,
            loadingAuthors: false,
            authorsLoaded: true,
            authorsError: null,
          });
          addLog(`点赞作者请求失败，已回退到本地缓存（${cachedAuthors.length} 条）`, "warning");
          return;
        }
        set({
          loadingAuthors: false,
          authorsLoaded: true,
          authorsError: message,
        });
        addLog(message, result.need_verify ? "warning" : "error");
        return;
      }

      const authors = result.data || [];
      saveLikedAuthorsCache(authors);
      set({
        authors,
        loadingAuthors: false,
        authorsLoaded: true,
        authorsError: null,
      });
      addLog(`已加载 ${authors.length} 个点赞作者`, "success");
    } catch (error) {
      if (cachedAuthors.length > 0) {
        set({
          authors: cachedAuthors,
          loadingAuthors: false,
          authorsLoaded: true,
          authorsError: null,
        });
        addLog(`点赞作者请求异常，已回退到本地缓存（${cachedAuthors.length} 条）`, "warning");
        return;
      }

      const message = getErrorMessage(error, "获取点赞作者失败");
      set({
        loadingAuthors: false,
        authorsLoaded: true,
        authorsError: message,
      });
      addLog(message, "error");
    }
  },
}));
