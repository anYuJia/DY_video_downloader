import { create } from "zustand";
import {
  getUserDetail,
  getUserVideos,
  openVerifyBrowser,
  searchUser,
  type UserInfo,
  type VideoInfo,
} from "@/lib/tauri";
import { useAppStore, useLogStore } from "@/stores/app-store";
import { useToastStore } from "@/components/ui/toast";

const PAGE_SIZE = 18;

let latestSearchRequestId = 0;
let latestUserRequestId = 0;
let latestVideoRequestId = 0;
let latestLoadMoreRequestId = 0;

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
  search: (keyword: string) => Promise<void>;
  selectUser: (user: UserInfo) => Promise<void>;
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
};

function mergeUserInfo(base: UserInfo, incoming: UserInfo): UserInfo {
  const keepString = (next: string | undefined, previous: string | undefined) =>
    next && next.trim() ? next : previous || "";
  const keepNumber = (next: number | undefined, previous: number | undefined) =>
    next && next > 0 ? next : previous || 0;
  const uniqueId = incoming.unique_id && incoming.unique_id !== incoming.sec_uid
    ? incoming.unique_id
    : base.unique_id;

  return {
    ...base,
    ...incoming,
    uid: keepString(incoming.uid, base.uid),
    sec_uid: keepString(incoming.sec_uid, base.sec_uid),
    nickname: keepString(incoming.nickname, base.nickname),
    avatar_thumb: keepString(incoming.avatar_thumb, base.avatar_thumb),
    avatar_medium: keepString(incoming.avatar_medium, base.avatar_medium),
    avatar_larger: keepString(incoming.avatar_larger, base.avatar_larger),
    signature: keepString(incoming.signature, base.signature),
    unique_id: keepString(uniqueId, base.unique_id),
    follower_count: keepNumber(incoming.follower_count, base.follower_count),
    following_count: keepNumber(incoming.following_count, base.following_count),
    total_favorited: keepNumber(incoming.total_favorited, base.total_favorited),
    aweme_count: keepNumber(incoming.aweme_count, base.aweme_count),
    favoriting_count: keepNumber(incoming.favoriting_count, base.favoriting_count),
  };
}

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

function isSameUser(left: UserInfo, right: UserInfo): boolean {
  if (left.sec_uid && right.sec_uid) return left.sec_uid === right.sec_uid;
  if (left.uid && right.uid) return left.uid === right.uid;
  return Boolean(left.nickname && right.nickname && left.nickname === right.nickname);
}

function shouldEnrichSearchUser(user: UserInfo): boolean {
  return Boolean(user.sec_uid && (!user.aweme_count || user.aweme_count <= 0));
}

function mergeDetailedUserIntoSearchState(
  current: SearchStoreState,
  target: UserInfo,
  detail: UserInfo
): Partial<SearchStoreState> {
  const users = current.users.map((user) =>
    isSameUser(user, target) ? mergeUserInfo(user, detail) : user
  );
  const currentUser =
    current.currentUser && isSameUser(current.currentUser, target)
      ? mergeUserInfo(current.currentUser, detail)
      : current.currentUser;

  return { users, currentUser };
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
    });

    addLog(`搜索用户: ${query}`, "info");

    try {
      const enrichSearchUserStats = (baseUsers: UserInfo[]) => {
        const candidates = baseUsers.filter(shouldEnrichSearchUser).slice(0, 10);
        if (candidates.length === 0) return;

        void (async () => {
          for (let index = 0; index < candidates.length; index += 3) {
            const batch = candidates.slice(index, index + 3);
            await Promise.allSettled(
              batch.map(async (user) => {
                const detail = await getUserDetail(user.sec_uid, user.nickname);
                if (requestId !== latestSearchRequestId || !detail.success || !detail.user) return;
                set((current) => mergeDetailedUserIntoSearchState(current, user, detail.user!));
              })
            );
          }
        })();
      };

      const result = await searchUser(query);
      if (requestId !== latestSearchRequestId) return;

      if (result.need_verify) {
        void openVerifyBrowser(result.verify_url)
          .then((verifyResult) => addLog(verifyResult.message, verifyResult.success ? "info" : "warning"))
          .catch(() => addLog("无法打开应用内验证窗口，请用桌面模式启动后重试", "warning"));
        const message = result.message || "需要完成抖音验证";
        set({ searching: false, error: message });
        addLog(message, "warning");
        return;
      }

      if (!result.success) {
        const message = formatSearchErrorMessage(result.message);
        set({ searching: false, error: message });
        addLog(message, "error");
        return;
      }

      if (result.type === "single" && result.user) {
        set({
          searching: false,
          users: [],
          currentUser: result.user,
          videos: [],
          cursor: 0,
          hasMore: false,
          error: null,
        });
        addLog(`已匹配用户: ${result.user.nickname}`, "success");
        enrichSearchUserStats([result.user]);
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
      });
      addLog(`找到 ${users.length} 个候选用户`, users.length > 0 ? "success" : "warning");
      enrichSearchUserStats(users);
    } catch (error) {
      if (requestId !== latestSearchRequestId) return;
      const message = formatSearchErrorMessage(error instanceof Error ? error.message : undefined);
      set({ searching: false, error: message });
      addLog(message, "error");
    }
  },

  selectUser: async (user) => {
    const requestId = ++latestUserRequestId;
    latestVideoRequestId += 1;
    latestLoadMoreRequestId += 1;
    const addLog = useLogStore.getState().addLog;

    set({
      loadingUser: true,
      currentUser: user,
      users: [],
      videos: [],
      cursor: 0,
      hasMore: false,
      error: null,
    });
    addLog(`加载用户详情: ${user.nickname}`, "info");

    try {
      const detail = await getUserDetail(user.sec_uid, user.nickname);
      if (requestId !== latestUserRequestId) return;

      if (detail.need_verify) {
        void openVerifyBrowser(detail.verify_url)
          .then((verifyResult) => addLog(verifyResult.message, verifyResult.success ? "info" : "warning"))
          .catch(() => addLog("无法打开应用内验证窗口，请用桌面模式启动后重试", "warning"));
        const message = detail.message || "需要完成抖音验证";
        set({ loadingUser: false, error: message, currentUser: user });
        addLog(message, "warning");
        return;
      }

      if (!detail.success || !detail.user) {
        const message = detail.message || "获取用户详情失败";
        set({ loadingUser: false, error: message, currentUser: user });
        addLog(message, "error");
        return;
      }

      const mergedUser = mergeUserInfo(user, detail.user);
      set({
        loadingUser: false,
        currentUser: mergedUser,
        error: null,
      });
      addLog(`已载入 ${mergedUser.nickname} 的详情`, "success");
    } catch (error) {
      if (requestId !== latestUserRequestId) return;
      const message = error instanceof Error ? error.message : "获取用户详情失败";
      set({ loadingUser: false, error: message, currentUser: user });
      addLog(message, "error");
    }
  },

  loadVideos: async () => {
    const state = get();
    if (!state.currentUser || state.loadingVideos) return;

    const requestId = ++latestVideoRequestId;
    latestLoadMoreRequestId += 1;
    const secUid = state.currentUser.sec_uid;
    const addLog = useLogStore.getState().addLog;
    const keepExistingVideos = state.videos.length > 0;
    set({
      loadingVideos: true,
      loadingMore: false,
      ...(keepExistingVideos ? {} : { videos: [], cursor: 0, hasMore: false }),
      error: null,
    });
    addLog(`加载作品列表: ${state.currentUser.nickname}`, "info");

    try {
      const result = await getUserVideos(secUid, PAGE_SIZE, 0);
      if (requestId !== latestVideoRequestId || get().currentUser?.sec_uid !== secUid) return;

      if (result.need_verify) {
        void openVerifyBrowser(result.verify_url)
          .then((verifyResult) => addLog(verifyResult.message, verifyResult.success ? "info" : "warning"))
          .catch(() => addLog("无法打开应用内验证窗口，请用桌面模式启动后重试", "warning"));
        const message = result.message || "需要完成抖音验证后再加载作品";
        set({ loadingVideos: false, error: message });
        addLog(message, "warning");
        return;
      }

      if (!result.success) {
        const message = result.message || "获取作品列表失败";
        set({ loadingVideos: false, error: message });
        addLog(message, "error");
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
    } catch (error) {
      if (requestId !== latestVideoRequestId) return;
      const message = error instanceof Error ? error.message : "获取作品列表失败";
      set({ loadingVideos: false, error: message });
      addLog(message, "error");
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
        void openVerifyBrowser(result.verify_url)
          .then((verifyResult) => addLog(verifyResult.message, verifyResult.success ? "info" : "warning"))
          .catch(() => addLog("无法打开应用内验证窗口，请用桌面模式启动后重试", "warning"));
        const message = result.message || "需要完成抖音验证后再加载更多作品";
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
