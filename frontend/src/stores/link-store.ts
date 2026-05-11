import { create } from "zustand";
import { getErrorMessage, parseLink, type UserInfo, type VideoInfo } from "@/lib/tauri";
import { useAppStore, useLogStore } from "@/stores/app-store";
import { useToastStore } from "@/components/ui/toast";

interface LinkStoreState {
  link: string;
  parsing: boolean;
  videos: VideoInfo[];
  user: UserInfo | null;
  error: string | null;
  parse: (link: string) => Promise<void>;
  clear: () => void;
}

export const useLinkStore = create<LinkStoreState>((set) => ({
  link: "",
  parsing: false,
  videos: [],
  user: null,
  error: null,

  parse: async (rawLink) => {
    const link = rawLink.trim();
    if (!link) {
      set({ error: "请粘贴抖音链接" });
      return;
    }

    const addLog = useLogStore.getState().addLog;
    const toast = useToastStore.getState().toast;
    useAppStore.getState().setView("link");
    set({ link, parsing: true, videos: [], user: null, error: null });
    addLog("解析链接...", "info");
    toast("正在解析链接...", "info");

    try {
      const result = await parseLink(link);
      if (!result.success) {
        const message = result.message || "链接解析失败";
        set({ parsing: false, error: message });
        addLog(message, "error");
        toast(message, "error", "解析失败");
        return;
      }

      const videos = result.videos?.length
        ? result.videos
        : result.video
          ? [result.video]
          : [];

      set({
        parsing: false,
        videos,
        user: result.user || null,
        error: videos.length > 0 || result.user ? null : "没有解析到可下载内容",
      });

      const msg = videos.length > 0
        ? `链接解析完成，获取到 ${videos.length} 个作品`
        : result.user
          ? `已找到用户: ${result.user.nickname}`
          : "链接解析完成";
      
      const type = videos.length > 0 || result.user ? "success" : "warning";
      addLog(msg, type);
      toast(msg, type, "解析完成");
    } catch (error) {
      const message = getErrorMessage(error, "链接解析失败");
      set({ parsing: false, error: message });
      addLog(message, "error");
      toast(message, "error", "解析异常");
    }
  },

  clear: () => set({ link: "", parsing: false, videos: [], user: null, error: null }),
}));
