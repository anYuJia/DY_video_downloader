// ═══════════════════════════════════════════════
// TypeScript Type Exports
// ═══════════════════════════════════════════════

export type ViewType = "home" | "search" | "user" | "link" | "recommended" | "downloads" | "liked" | "collected" | "liked-authors" | "friends-status" | "settings";

export type ThemeMode = "light" | "dark" | "auto";

export type DownloadStatus = "pending" | "downloading" | "completed" | "error" | "paused" | "cancelled";

export interface AppState {
  currentView: ViewType;
  setView: (view: ViewType) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  bottomBarExpanded: boolean;
  toggleBottomBar: () => void;
  setBottomBarExpanded: (expanded: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  commandMode: "search" | "link";
  setCommandMode: (mode: "search" | "link") => void;
  cookieLoggedIn: boolean;
  cookieNickname: string;
  setCookieLoggedIn: (loggedIn: boolean, nickname?: string) => void;
}

export interface DownloadTask {
  id: string;
  filename: string;
  progress: number;
  speed: number;
  status: DownloadStatus;
  isBatch?: boolean;
  awemeId?: string;
  currentAwemeId?: string;
  currentName?: string;
  savePath?: string;
  filePath?: string;
  mediaType?: string;
  mediaCount?: number;
  fileIndex?: number;
  fileTotal?: number;
  fileProgress?: number;
  completedCount?: number;
  skippedCount?: number;
  failedCount?: number;
  etaSeconds?: number;
  totalBytes?: number;
  downloadedBytes?: number;
  startTime?: number;
  finishedTime?: number;
  errorMessage?: string;
}

export interface LogEntry {
  id: number;
  message: string;
  type: "info" | "success" | "error" | "warning";
  timestamp: number;
}
