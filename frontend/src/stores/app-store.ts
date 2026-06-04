import { create } from "zustand";
import type { AppState, ViewType, ThemeMode, DownloadTask, LogEntry } from "@/types";

// ═══════════════════════════════════════════════
// Global App Store
// ═══════════════════════════════════════════════

let themeWatcherInitialized = false;

export const useAppStore = create<AppState>((set) => ({
  currentView: "home",
  setView: (view: ViewType) => set({ currentView: view }),

  theme: "auto",
  setTheme: (theme: ThemeMode) => {
    set({ theme });
    try {
      localStorage.setItem("dy_theme", theme);
    } catch {
      // Ignore storage failures and still apply the selected theme.
    }
    applyTheme(theme);
  },

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  bottomBarExpanded: false,
  toggleBottomBar: () => set((s) => ({ bottomBarExpanded: !s.bottomBarExpanded })),
  setBottomBarExpanded: (expanded: boolean) => set({ bottomBarExpanded: expanded }),

  settingsOpen: false,
  setSettingsOpen: (open: boolean) => set({ settingsOpen: open }),

  commandOpen: false,
  setCommandOpen: (open: boolean) => set({ commandOpen: open }),

  commandMode: "search",
  setCommandMode: (mode) => set({ commandMode: mode }),

  cookieLoggedIn: false,
  cookieNickname: "",
  setCookieLoggedIn: (loggedIn: boolean, nickname?: string) =>
    set({ cookieLoggedIn: loggedIn, cookieNickname: nickname || "" }),

  friendUnreadCount: 0,
  setFriendUnreadCount: (count: number) => set({ friendUnreadCount: Math.max(0, count) }),
}));

// ── Alert Store ──

export interface AlertConfig {
  title: string;
  description: React.ReactNode;
  variant?: "info" | "success" | "warning" | "error" | "danger";
  actionLabel?: string;
  cancelLabel?: string;
  onAction?: () => void;
  onCancel?: () => void;
}

interface AlertStore {
  isOpen: boolean;
  config: AlertConfig | null;
  showAlert: (config: AlertConfig) => void;
  hideAlert: () => void;
}

export const useAlertStore = create<AlertStore>((set) => ({
  isOpen: false,
  config: null,
  showAlert: (config) => set({ isOpen: true, config }),
  hideAlert: () => set({ isOpen: false }),
}));

// ── Global Loader Store ──

interface LoaderStore {
  isLoading: boolean;
  message: string;
  startedAt: number;
  showLoader: (message?: string) => void;
  hideLoader: () => void;
}

export const useLoaderStore = create<LoaderStore>((set) => ({
  isLoading: false,
  message: "",
  startedAt: 0,
  showLoader: (message = "正在处理...") => set({ isLoading: true, message, startedAt: Date.now() }),
  hideLoader: () => set({ isLoading: false, message: "", startedAt: 0 }),
}));

// ── Verify Recovery Store ──

export interface VerifyRecoveryConfig {
  title?: string;
  message: string;
  actionLabel?: string;
  onResume: () => void;
}

interface VerifyRecoveryStore {
  isOpen: boolean;
  config: VerifyRecoveryConfig | null;
  showRecovery: (config: VerifyRecoveryConfig) => void;
  resume: () => void;
  dismiss: () => void;
}

export const useVerifyRecoveryStore = create<VerifyRecoveryStore>((set, get) => ({
  isOpen: false,
  config: null,
  showRecovery: (config) => set({ isOpen: true, config }),
  resume: () => {
    const action = get().config?.onResume;
    set({ isOpen: false, config: null });
    action?.();
  },
  dismiss: () => set({ isOpen: false, config: null }),
}));

// ── Download Store ──

interface DownloadStore {
  tasks: Record<string, DownloadTask>;
  activeCount: number;
  updateTask: (task: Partial<DownloadTask> & { id: string }) => void;
  replaceTaskId: (fromId: string, toId: string, patch?: Partial<DownloadTask>) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
}

const createEmptyTask = (id: string): DownloadTask => ({
  id,
  filename: "",
  progress: 0,
  speed: 0,
  status: "pending",
});

const countActiveTasks = (tasks: Record<string, DownloadTask>) =>
  Object.values(tasks).filter(
    (t) => t.status === "downloading" || t.status === "pending"
  ).length;

const deriveTaskProgress = (task: DownloadTask, patch: Partial<DownloadTask>) => {
  if (!task.isBatch || !task.fileTotal || task.fileTotal <= 0 || task.fileIndex === undefined) {
    return task.progress;
  }
  if (patch.progress !== undefined && !(patch.progress === 0 && task.fileIndex > 0)) {
    return task.progress;
  }
  return Math.max(0, Math.min(100, (task.fileIndex / task.fileTotal) * 100));
};

export const useDownloadStore = create<DownloadStore>((set) => ({
  tasks: {},
  activeCount: 0,
  updateTask: (task) =>
    set((s) => {
      const existing = s.tasks[task.id] || createEmptyTask(task.id);
      const definedPatch = Object.fromEntries(
        Object.entries(task).filter(([, value]) => value !== undefined && value !== "")
      ) as Partial<DownloadTask> & { id: string };
      const merged = { ...existing, ...definedPatch };
      const updated = { ...merged, progress: deriveTaskProgress(merged, definedPatch) };
      const newTasks = { ...s.tasks, [task.id]: updated };
      return { tasks: newTasks, activeCount: countActiveTasks(newTasks) };
    }),
  replaceTaskId: (fromId, toId, patch = {}) =>
    set((s) => {
      if (fromId === toId) {
        const existing = s.tasks[toId] || createEmptyTask(toId);
        const tasks = { ...s.tasks, [toId]: { ...existing, ...patch, id: toId } };
        return { tasks, activeCount: countActiveTasks(tasks) };
      }

      const source = s.tasks[fromId];
      const target = s.tasks[toId];
      const replacement = {
        ...(source || createEmptyTask(toId)),
        ...target,
        ...patch,
        id: toId,
      };

      const tasks: Record<string, DownloadTask> = {};
      let inserted = false;

      Object.entries(s.tasks).forEach(([id, task]) => {
        if (id === fromId) {
          tasks[toId] = replacement;
          inserted = true;
          return;
        }
        if (id === toId) {
          if (!inserted) {
            tasks[toId] = replacement;
            inserted = true;
          }
          return;
        }
        tasks[id] = task;
      });

      if (!inserted) {
        tasks[toId] = replacement;
      }

      return { tasks, activeCount: countActiveTasks(tasks) };
    }),
  removeTask: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.tasks;
      return { tasks: rest, activeCount: countActiveTasks(rest) };
    }),
  clearCompleted: () =>
    set((s) => {
      const tasks = Object.fromEntries(
        Object.entries(s.tasks).filter(
          ([, t]) => t.status !== "completed" && t.status !== "cancelled" && t.status !== "error"
        )
      );
      return { tasks, activeCount: countActiveTasks(tasks) };
    }),
}));

// ── Log Store ──

interface LogStore {
  logs: LogEntry[];
  nextId: number;
  addLog: (message: string, type: LogEntry["type"]) => void;
  clearLogs: () => void;
}

export const useLogStore = create<LogStore>((set) => ({
  logs: [],
  nextId: 1,
  addLog: (message, type) =>
    set((s) => ({
      logs: [...s.logs.slice(-200), { id: s.nextId, message, type, timestamp: Date.now() }],
      nextId: s.nextId + 1,
    })),
  clearLogs: () => set({ logs: [], nextId: 1 }),
}));

// ── Theme Helper ──

function applyTheme(theme: ThemeMode) {
  if (theme === "auto") {
    const isLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    document.documentElement.dataset.theme = isLight ? "light" : "";
  } else if (theme === "light") {
    document.documentElement.dataset.theme = "light";
  } else {
    delete document.documentElement.dataset.theme;
  }
}

export function initTheme() {
  let saved: ThemeMode = "auto";
  try {
    saved = (localStorage.getItem("dy_theme") as ThemeMode) || "auto";
  } catch {
    // Ignore storage failures and fall back to auto theme.
  }

  useAppStore.getState().setTheme(saved);

  if (themeWatcherInitialized) return;
  themeWatcherInitialized = true;

  const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
  const handleThemeChange = () => {
    if (useAppStore.getState().theme === "auto") {
      applyTheme("auto");
    }
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleThemeChange);
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(handleThemeChange);
  }
}
