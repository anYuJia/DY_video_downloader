import { create } from "zustand";
import {
  getUserVideos,
  openVerifyBrowser,
  searchUser,
  verifyCookie,
  type UserInfo,
  type VideoInfo,
} from "@/lib/tauri";
import { useAlertStore, useAppStore, useLogStore } from "@/stores/app-store";
import { useToastStore } from "@/components/ui/toast";
import { saveRecentSearchUser } from "@/lib/recent-searches";
import { requestVerifyRecovery } from "@/lib/verify-recovery";

const PAGE_SIZE = 18;

// ... (utility functions)

function checkQuotaError(message: string | undefined): boolean {
  const text = (message || "").toLowerCase();
  return /无额度|次数限制|quota|limit|too many requests/i.test(text);
}

function showQuotaAlert(message: string) {
  useAlertStore.getState().showAlert({
    title: "达到使用限制",
    variant: "warning",
    description: `${message}\n\n当前的 API 调用额度已耗尽或触发了频率限制。这通常是由于短时间内请求过多导致的。请稍后再试，或检查你的网络代理及 Cookie 设置。`,
    actionLabel: "知道了",
  });
}

// ... (rest of the file)

let latestSearchRequestId = 0;
let latestUserRequestId = 0;
let latestVideoRequestId = 0;
let latestLoadMoreRequestId = 0;

interface PendingVerifySearch {
  keyword: string;
  message: string;
  verifyUrl?: string;
}

interface SearchStoreState {
  query: string;
  searching: boolean;
  loadingUser: boolean;
  loadingVideos: boolean;
  loadingMore: boolean;
  users: UserInfo[];
  currentUser: UserInfo | null;
  videos: VideoInfo[];
  cursor: number;
  hasMore: boolean;
  error: string | null;
  pendingVerifySearch: PendingVerifySearch | null;
  search: (keyword: string) => Promise<void>;
  resumeVerifySearch: () => Promise<void>;
  dismissVerifySearch: () => void;
  selectUser: (user: UserInfo) => Promise<void>;
  openUser: (user: UserInfo, options?: { loadVideos?: boolean }) => Promise<void>;
  loadVideos: () => Promise<void>;
  loadMore: () => Promise<void>;
  clear: () => void;
}

const initialState = {
  query: "",
  searching: false,
  loadingUser: false,
  loadingVideos: false,
  loadingMore: false,
  users: [] as UserInfo[],
  currentUser: null as UserInfo | null,
  videos: [] as VideoInfo[],
  cursor: 0,
  hasMore: false,
  error: null as string | null,
  pendingVerifySearch: null as PendingVerifySearch | null,
};

function formatSearchErrorMessage(message: string | undefined, fallback = "搜索失败"): string {
  const text = (message || "").trim();
  if (!text) return fallback;

  if (/error sending request for url/i.test(text)) {
    return `${fallback}：网络请求失败，请检查网络/代理或 Cookie 后重试`;
  }

  if (/https?:\/\/(?:www\.)?douyin\.com/i.test(text) && text.length > 180) {
    return `${fallback}：抖音接口请求失败，请稍后重试`;
  }

  return text.length > 240 ? `${text.slice(0, 180)}...` : text;
}

function openVerifyWindow(verifyUrl: string | undefined, addLog: (message: string, type: "info" | "success" | "warning" | "error") => void) {
  void openVerifyBrowser(verifyUrl)
    .then((result) => addLog(result.message, result.success ? "info" : "warning"))
    .catch(() => addLog("无法打开应用内验证窗口，请用桌面模式启动后重试", "warning"));
}

function uniqueVideos(existing: VideoInfo[], incoming: VideoInfo[]) {
  const seen = new Set(existing.map((video) => video.aweme_id).filter(Boolean));
  const next = [...existing];
  for (const video of incoming) {
    if (!video?.aweme_id || seen.has(video.aweme_id)) continue;
    seen.add(video.aweme_id);
    next.push(video);
  }
  return next;
}

export const useSearchStore = create<SearchStoreState>((set, get) => ({
  ...initialState,

  search: async (keyword) => {
    const query = keyword.trim();
    if (!query) {
      set({ error: "请输入搜索关键词" });
      return;
    }

    const requestId = ++latestSearchRequestId;
    latestUserRequestId += 1;
    latestVideoRequestId += 1;
    latestLoadMoreRequestId += 1;
    const addLog = useLogStore.getState().addLog;
    const toast = useToastStore.getState().toast;
    useAppStore.getState().setView("search");

    set({
      query,
      searching: true,
      loadingUser: false,
      loadingVideos: false,
      loadingMore: false,
      users: [],
      currentUser: null,
      videos: [],
      cursor: 0,
      hasMore: false,
      error: null,
      pendingVerifySearch: null,
    });

    addLog(`搜索用户: ${query}`, "info");
    const loadingToastId = toast(`正在搜索用户: ${query}`, "loading");

    try {
      const result = await searchUser(query);
      useToastStore.getState().dismiss(loadingToastId);
      if (requestId !== latestSearchRequestId) return;

      if (result.need_verify) {
        openVerifyWindow(result.verify_url, addLog);
        const message = result.message || "需要完成抖音验证";
        set({
          searching: false,
          error: message,
          pendingVerifySearch: {
            keyword: query,
            message,
            verifyUrl: result.verify_url,
          },
        });
        addLog(message, "warning");
        toast(message, "warning", "需要验证", {
          label: "已完成验证",
          onClick: () => void get().resumeVerifySearch(),
        });
        return;
      }

      if (!result.success) {
        const message = formatSearchErrorMessage(result.message);
        set({ searching: false, error: message, pendingVerifySearch: null });
        addLog(message, "error");
        
        if (checkQuotaError(message)) {
          showQuotaAlert(message);
        } else {
          toast(message, "error", "搜索失败");
        }
        return;
      }

      if (result.type === "single" && result.user) {
        saveRecentSearchUser(result.user);
        set({
          searching: false,
          users: [],
          currentUser: result.user,
          videos: [],
          cursor: 0,
          hasMore: false,
          error: null,
          pendingVerifySearch: null,
        });
        useAppStore.getState().setView("user");
        addLog(`已匹配用户: ${result.user.nickname}`, "success");
        toast(`已找到用户: ${result.user.nickname}`, "success");
        void get().loadVideos();
        return;
      }

      const users = result.users || [];
      set({
        searching: false,
        users,
        currentUser: null,
        videos: [],
        cursor: 0,
        hasMore: false,
        error: users.length > 0 ? null : "未找到用户",
        pendingVerifySearch: null,
      });
      const msg = `找到 ${users.length} 个候选用户`;
      addLog(msg, users.length > 0 ? "success" : "warning");
      toast(msg, users.length > 0 ? "success" : "warning");
    } catch (error) {
      useToastStore.getState().dismiss(loadingToastId);
      if (requestId !== latestSearchRequestId) return;
      const message = formatSearchErrorMessage(error instanceof Error ? error.message : undefined);
      set({ searching: false, error: message, pendingVerifySearch: null });
      addLog(message, "error");
      
      if (checkQuotaError(message)) {
        showQuotaAlert(message);
      } else {
        toast(message, "error", "搜索异常");
      }
    }
  },

  resumeVerifySearch: async () => {
    const pending = get().pendingVerifySearch;
    if (!pending || get().searching) return;

    try {
      const status = await verifyCookie();
      if (!status.valid) {
        if (status.need_verify) {
          const message = status.message || "验证尚未完成，请完成后重试";
          useLogStore.getState().addLog(message, "warning");
          useToastStore.getState().toast(message, "warning", "需要验证");
          return;
        }

        const message = status.message || "Cookie 已失效，请重新登录";
        window.dispatchEvent(new CustomEvent("dy-cookie-invalid", { detail: { message } }));
        return;
      }
    } catch {
      // 继续执行原有重试逻辑
    }

    await get().search(pending.keyword);
  },

  dismissVerifySearch: () => {
    set({ pendingVerifySearch: null, error: null });
  },

  selectUser: async (user) => {
    latestUserRequestId += 1;
    latestSearchRequestId += 1;
    latestVideoRequestId += 1;
    latestLoadMoreRequestId += 1;
    const addLog = useLogStore.getState().addLog;

    set({
      loadingUser: false,
      currentUser: user,
      users: [],
      videos: [],
      cursor: 0,
      hasMore: false,
      error: null,
    });
    saveRecentSearchUser(user);
    addLog(`已进入用户主页: ${user.nickname}`, "info");
  },

  openUser: async (user, options = {}) => {
    const selection = get().selectUser(user);
    useAppStore.getState().setView("user");
    await selection;
    if (options.loadVideos !== false) {
      await get().loadVideos();
    }
  },

  loadVideos: async () => {
    const state = get();
    if (!state.currentUser || state.loadingVideos) return;

    const requestId = ++latestVideoRequestId;
    latestLoadMoreRequestId += 1;
    const secUid = state.currentUser.sec_uid;
    const addLog = useLogStore.getState().addLog;
    const toast = useToastStore.getState().toast;
    const keepExistingVideos = state.videos.length > 0;
    set({
      loadingVideos: true,
      loadingMore: false,
      ...(keepExistingVideos ? {} : { videos: [], cursor: 0, hasMore: false }),
      error: null,
    });
    addLog(`加载作品列表: ${state.currentUser.nickname}`, "info");
    const loadingToastId = toast(`正在获取 ${state.currentUser.nickname} 的作品列表`, "loading");

    try {
      const result = await getUserVideos(secUid, PAGE_SIZE, 0);
      useToastStore.getState().dismiss(loadingToastId);
      if (requestId !== latestVideoRequestId || get().currentUser?.sec_uid !== secUid) return;

      if (result.need_verify) {
        const message = result.message || "需要完成抖音验证";
        requestVerifyRecovery({
          verifyUrl: result.verify_url,
          message,
          title: "作品列表需要验证",
          onResume: () => void get().loadVideos(),
        });
        set({ loadingVideos: false, error: message });
        addLog(message, "warning");
        return;
      }

      if (!result.success) {
        const message = result.message || "获取作品列表失败";
        set({ loadingVideos: false, error: message });
        addLog(message, "error");
        
        if (checkQuotaError(message)) {
          showQuotaAlert(message);
        } else {
          toast(message, "error", "加载失败");
        }
        return;
      }

      const videos = result.videos || [];
      set({
        loadingVideos: false,
        videos,
        cursor: result.cursor || 0,
        hasMore: result.has_more ?? false,
        error: null,
      });
      addLog(`已加载 ${videos.length} 个作品`, "success");
      toast(`成功加载 ${videos.length} 个作品`, "success");
    } catch (error) {
      useToastStore.getState().dismiss(loadingToastId);
      if (requestId !== latestVideoRequestId) return;
      const message = error instanceof Error ? error.message : "获取作品列表失败";
      set({ loadingVideos: false, error: message });
      addLog(message, "error");
      
      if (checkQuotaError(message)) {
        showQuotaAlert(message);
      } else {
        toast(message, "error", "加载异常");
      }
    }
  },

  loadMore: async () => {
    const state = get();
    if (!state.currentUser || !state.hasMore || state.loadingVideos || state.loadingMore) {
      return;
    }

    const addLog = useLogStore.getState().addLog;
    const requestId = ++latestLoadMoreRequestId;
    const secUid = state.currentUser.sec_uid;
    const cursor = state.cursor;
    set({ loadingMore: true, error: null });

    try {
      const result = await getUserVideos(secUid, PAGE_SIZE, cursor);
      if (requestId !== latestLoadMoreRequestId || get().currentUser?.sec_uid !== secUid) return;

      if (result.need_verify) {
        const message = result.message || "需要完成抖音验证";
        requestVerifyRecovery({
          verifyUrl: result.verify_url,
          message,
          title: "加载更多作品需要验证",
          onResume: () => void get().loadMore(),
        });
        set({ loadingMore: false, error: message });
        addLog(message, "warning");
        return;
      }

      if (!result.success) {
        const message = result.message || "加载更多失败";
        set({ loadingMore: false, error: message });
        addLog(message, "error");
        return;
      }

      set((current) => {
        const nextVideos = uniqueVideos(current.videos, result.videos || []);
        const addedCount = nextVideos.length - current.videos.length;
        return {
          loadingMore: false,
          videos: nextVideos,
          cursor: result.cursor || current.cursor,
          hasMore: addedCount > 0 && (result.has_more ?? false),
          error: null,
        };
      });
    } catch (error) {
      if (requestId !== latestLoadMoreRequestId || get().currentUser?.sec_uid !== secUid) return;
      const message = error instanceof Error ? error.message : "加载更多失败";
      set({ loadingMore: false, error: message });
      addLog(message, "error");
    }
  },

  clear: () => set({ ...initialState }),
}));
