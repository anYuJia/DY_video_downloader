import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore, useLogStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { motion } from "framer-motion";
import {
  Palette,
  Key,
  FolderOpen,
  Zap,
  Gauge,
  Info,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  X,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  cancelCookieBrowserLogin,
  checkUpdate,
  cookieBrowserLogin,
  downloadUpdate,
  getAppVersion,
  getConfig,
  initClient,
  listenEvent,
  restartApp,
  saveConfig,
  selectDirectory,
  verifyCookie,
} from "@/lib/tauri";
import type { ThemeMode } from "@/types";

type LoginStatus = "idle" | "starting" | "waiting" | "success" | "error" | "cancelled";
type UpdateStatus = "idle" | "checking" | "available" | "none" | "downloading" | "ready" | "error";
type UpdateInfo = {
  version?: string;
  current_version?: string;
  notes?: string;
  asset_name?: string;
  asset_size?: number;
  install_mode?: string;
  portable?: boolean;
};

export function SettingsView() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const cookieLoggedIn = useAppStore((s) => s.cookieLoggedIn);
  const cookieNickname = useAppStore((s) => s.cookieNickname);
  const setCookieLoggedIn = useAppStore((s) => s.setCookieLoggedIn);
  const addLog = useLogStore((s) => s.addLog);

  // Browser login flow state
  const [loginStatus, setLoginStatus] = useState<LoginStatus>("idle");
  const [loginMessage, setLoginMessage] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [browserType, setBrowserType] = useState("chrome");
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Manual cookie state
  const [cookieValue, setCookieValue] = useState("");
  const [cookieInputStatus, setCookieInputStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [savingCookie, setSavingCookie] = useState(false);

  // Config state
  const [downloadPath, setDownloadPath] = useState("");
  const [downloadQuality, setDownloadQuality] = useState("auto");
  const [maxConcurrent, setMaxConcurrent] = useState("3");
  const [savingSettings, setSavingSettings] = useState(false);

  // Update state
  const [appVersion, setAppVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateCanRestart, setUpdateCanRestart] = useState(false);

  const cleanup = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
  }, []);

  // On mount: check if cookie is already saved
  useEffect(() => {
    let disposed = false;
    getConfig()
      .then((config) => {
        if (disposed) return;
        setDownloadPath(config.download_path || config.download_dir || "");
        setDownloadQuality(config.download_quality || "auto");
        setMaxConcurrent(String(config.max_concurrent || 3));
        if (config.cookie_set) {
          setCookieLoggedIn(true);
        }
      })
      .catch(() => {});
    getAppVersion().then((version) => {
      if (!disposed) setAppVersion(version);
    }).catch(() => {});
    return () => {
      disposed = true;
      cleanup();
    };
  }, [cleanup, setCookieLoggedIn]);

  useEffect(() => {
    let disposed = false;
    let removeProgress: (() => void) | null = null;
    let removeFinished: (() => void) | null = null;
    let removeError: (() => void) | null = null;

    const setup = async () => {
      removeProgress = await listenEvent<{ progress?: number; downloaded?: number; total?: number }>(
        "update-download-progress",
        (payload) => {
          if (disposed) return;
          if (typeof payload.progress === "number") {
            setUpdateProgress(Math.max(0, Math.min(100, payload.progress)));
          }
        }
      );
      removeFinished = await listenEvent("update-download-finished", () => {
        if (disposed) return;
        setUpdateStatus("ready");
        setUpdateProgress(100);
        setUpdateMessage((current) => current || "更新已下载");
      });
      removeError = await listenEvent<{ message?: string }>("update-download-error", (payload) => {
        if (disposed) return;
        setUpdateStatus("error");
        setUpdateMessage(payload.message || "更新下载失败");
      });
    };

    void setup();

    return () => {
      disposed = true;
      removeProgress?.();
      removeFinished?.();
      removeError?.();
    };
  }, []);

  const startLogin = async () => {
    setLoginStatus("starting");
    setLoginMessage("正在启动浏览器...");

    try {
      unlistenRef.current = await listenEvent<{
        event: string;
        message?: string;
        cookie_set?: boolean;
      }>("cookie-login-status", ({ event, message, cookie_set }) => {
        switch (event) {
          case "pending":
            setLoginStatus("waiting");
            setLoginMessage(message || "请在弹出的浏览器中登录抖音账号");
            if (!countdownRef.current) {
              let remaining = 300;
              setCountdown(remaining);
              countdownRef.current = setInterval(() => {
                remaining--;
                setCountdown(remaining);
                if (remaining <= 0) {
                  cleanup();
                  setLoginStatus("error");
                  setLoginMessage("登录超时，请重试");
                }
              }, 1000);
            }
            break;
          case "success":
            cleanup();
            setLoginStatus("success");
            setLoginMessage(message || "Cookie 已自动保存");
            if (cookie_set) {
              // Parse nickname from message: "Cookie 获取成功！已登录为 XXX"
              const match = message?.match(/已登录为\s*(.+)/);
              setCookieLoggedIn(true, match?.[1] || "");
            }
            break;
          case "error":
          case "timeout":
            cleanup();
            setLoginStatus("error");
            setLoginMessage(message || "登录失败");
            break;
          case "cancelled":
            cleanup();
            setLoginStatus("cancelled");
            setLoginMessage("已取消");
            break;
        }
      });

      await cookieBrowserLogin(300, browserType);
    } catch (e) {
      cleanup();
      setLoginStatus("error");
      setLoginMessage(e instanceof Error ? e.message : "启动浏览器失败");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelCookieBrowserLogin();
    } catch {
      // Ignore
    }
    cleanup();
    setLoginStatus("cancelled");
    setLoginMessage("已取消");
  };

  const resetLogin = () => {
    cleanup();
    setLoginStatus("idle");
    setLoginMessage("");
    setCountdown(0);
  };

  const handleValidateCookie = () => {
    const trimmed = cookieValue.trim();
    if (!trimmed) {
      setCookieInputStatus("idle");
      return;
    }
    const pairs = Object.fromEntries(
      trimmed.split(";").map((p) => {
        const [k, ...v] = p.trim().split("=");
        return [k.trim(), v.join("=")];
      })
    );
    setCookieInputStatus(pairs["sessionid"] ? "valid" : "invalid");
  };

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const handleSaveCookie = async () => {
    const trimmed = cookieValue.trim();
    if (!trimmed) {
      setCookieInputStatus("invalid");
      return;
    }

    setSavingCookie(true);
    try {
      const result = await saveConfig({ cookie: trimmed });
      if (!result.success) {
        throw new Error(result.message || "保存 Cookie 失败");
      }
      const status = await verifyCookie().catch((error) => ({
        valid: false,
        user_name: null,
        message: error instanceof Error ? error.message : "Cookie 校验失败",
      }));
      setCookieLoggedIn(status.valid, status.user_name || undefined);
      setCookieInputStatus(status.valid ? "valid" : "invalid");
      setLoginMessage(status.message || "Cookie 已保存");
      addLog(status.valid ? "Cookie 已保存并通过校验" : "Cookie 已保存但校验失败", status.valid ? "success" : "warning");
      await initClient().catch(() => {});
    } catch (error) {
      addLog(error instanceof Error ? error.message : "保存 Cookie 失败", "error");
      setCookieInputStatus("invalid");
    } finally {
      setSavingCookie(false);
    }
  };

  const handleChooseDirectory = async () => {
    try {
      const path = await selectDirectory();
      if (path) {
        setDownloadPath(path);
      }
    } catch (error) {
      addLog(error instanceof Error ? error.message : "选择目录失败", "error");
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const result = await saveConfig({
        download_path: downloadPath,
        download_quality: downloadQuality,
        max_concurrent: Number(maxConcurrent) || 3,
        theme,
      });
      if (!result.success) {
        throw new Error(result.message || "保存设置失败");
      }
      await initClient().catch(() => {});
      addLog("设置已保存", "success");
    } catch (error) {
      addLog(error instanceof Error ? error.message : "保存设置失败", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCheckUpdate = async () => {
    setUpdateStatus("checking");
    setUpdateMessage("正在检查更新...");
    try {
      const result = await checkUpdate();
      if (!result.success) {
        setUpdateStatus("error");
        setUpdateMessage(result.message || "检查更新失败");
        return;
      }
      if (result.has_update) {
        setUpdateStatus("available");
        setUpdateInfo({
          version: result.version,
          current_version: result.current_version,
          notes: result.notes,
          asset_name: result.asset_name,
          asset_size: result.asset_size,
          install_mode: result.install_mode,
          portable: result.portable,
        });
        setUpdateCanRestart(false);
        setUpdateMessage(`发现新版本 ${result.version || ""}`.trim());
      } else {
        setUpdateStatus("none");
        setUpdateInfo(null);
        setUpdateCanRestart(false);
        setUpdateMessage("当前已是最新版本");
      }
    } catch (error) {
      setUpdateStatus("error");
      setUpdateMessage(error instanceof Error ? error.message : "检查更新失败");
    }
  };

  const handleDownloadUpdate = async () => {
    setUpdateStatus("downloading");
    setUpdateProgress(0);
    try {
      const result = await downloadUpdate();
      if (!result.success) {
        throw new Error(result.message || "更新下载失败");
      }
      const autoClosing = result.message.includes("自动关闭");
      if (!autoClosing) {
        setUpdateStatus("ready");
      }
      setUpdateCanRestart(!autoClosing && Boolean(result.restart_required ?? true));
      setUpdateMessage(result.message || "更新下载完成");
      setUpdateProgress(100);
    } catch (error) {
      setUpdateStatus("error");
      setUpdateCanRestart(false);
      setUpdateMessage(error instanceof Error ? error.message : "更新下载失败");
    }
  };

  const handleRestart = async () => {
    try {
      await restartApp();
    } catch (error) {
      addLog(error instanceof Error ? error.message : "重启失败", "error");
    }
  };

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
      className="p-8 max-w-[640px] mx-auto"
    >
      <h1 className="text-[1.4rem] font-bold text-text mb-1">设置</h1>
      <p className="text-[0.82rem] text-text-muted mb-8">
        配置应用偏好和下载选项
      </p>

      <div className="flex flex-col gap-6">
        {/* Cookie Section */}
        <SettingGroup icon={Key} label="Cookie 登录">
          {/* Already logged in */}
          {cookieLoggedIn && loginStatus === "idle" ? (
            <div className="rounded-[14px] bg-success/[0.05] p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-[12px] bg-success/10 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-success" />
                </div>
                <div className="flex-1">
                  <p className="text-[0.88rem] font-semibold text-success">
                    已登录
                  </p>
                  {cookieNickname && (
                    <p className="text-[0.78rem] text-text-muted mt-0.5">
                      {cookieNickname}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCookieLoggedIn(false);
                  resetLogin();
                }}
                className="h-9 rounded-[10px] text-text-muted hover:text-text gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                重新登录
              </Button>
            </div>
          ) : loginStatus === "idle" ? (
            /* Not logged in — show login card */
            <div className="rounded-[14px] bg-white/[0.03] p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-[12px] bg-accent/10 flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-[0.88rem] font-semibold text-text mb-1">
                    浏览器自动登录
                  </p>
                  <p className="text-[0.75rem] text-text-muted leading-relaxed">
                    打开浏览器窗口登录抖音，Cookie 将自动提取并保存
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-4">
                {["系统打开浏览器窗口", "在浏览器中登录抖音账号", "登录成功后 Cookie 自动保存"].map(
                  (step, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[0.6rem] font-bold text-text-muted">
                        {i + 1}
                      </span>
                      <span className="text-[0.78rem] text-text-secondary">
                        {step}
                      </span>
                    </div>
                  )
                )}
              </div>

              <div className="mb-4">
                <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wider text-text-muted">
                  浏览器类型
                </p>
                <Select value={browserType} onValueChange={setBrowserType}>
                  <SelectTrigger className="h-10 rounded-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chrome">Chrome</SelectItem>
                    <SelectItem value="edge">Edge</SelectItem>
                    <SelectItem value="chromium">Chromium</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={startLogin}
                className="w-full h-11 rounded-[12px] text-[0.88rem] font-bold gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                打开浏览器登录
              </Button>
            </div>
          ) : (
            /* Login in progress / result */
            <div className="rounded-[14px] bg-white/[0.03] p-5">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={cn(
                    "w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0",
                    (loginStatus === "starting" || loginStatus === "waiting") && "bg-info/10",
                    loginStatus === "success" && "bg-success/10",
                    loginStatus === "error" && "bg-danger/10",
                    loginStatus === "cancelled" && "bg-white/[0.06]"
                  )}
                >
                  {(loginStatus === "starting" || loginStatus === "waiting") && (
                    <Loader2 className="w-5 h-5 text-info animate-spin" />
                  )}
                  {loginStatus === "success" && (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  )}
                  {loginStatus === "error" && (
                    <XCircle className="w-5 h-5 text-danger" />
                  )}
                  {loginStatus === "cancelled" && (
                    <X className="w-5 h-5 text-text-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[0.88rem] font-semibold text-text">
                    {loginStatus === "starting" && "正在启动..."}
                    {loginStatus === "waiting" && "等待登录"}
                    {loginStatus === "success" && "登录成功"}
                    {loginStatus === "error" && "登录失败"}
                    {loginStatus === "cancelled" && "已取消"}
                  </p>
                  <p className="text-[0.75rem] text-text-muted mt-0.5">
                    {loginMessage}
                  </p>
                </div>
              </div>

              {loginStatus === "waiting" && countdown > 0 && (
                <div className="flex items-center justify-between px-3 py-2 rounded-[10px] bg-white/[0.04] mb-3">
                  <span className="text-[0.75rem] text-text-muted">剩余时间</span>
                  <span className="text-[0.82rem] font-mono font-semibold text-text tabular-nums">
                    {formatCountdown(countdown)}
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                {(loginStatus === "starting" || loginStatus === "waiting") && (
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    className="flex-1 h-10 rounded-[12px] text-danger hover:text-danger"
                  >
                    取消
                  </Button>
                )}
                {(loginStatus === "success" || loginStatus === "error" || loginStatus === "cancelled") && (
                  <Button
                    variant="outline"
                    onClick={resetLogin}
                    className="flex-1 h-10 rounded-[12px]"
                  >
                    {loginStatus === "success" ? "完成" : "重试"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Manual cookie input */}
          {!cookieLoggedIn && loginStatus === "idle" && (
            <div className="mt-4">
              <p className="text-[0.75rem] text-text-muted mb-2">
                或手动粘贴 Cookie
              </p>
              <Textarea
                value={cookieValue}
                onChange={(e) => {
                  setCookieValue(e.target.value);
                  setCookieInputStatus("idle");
                }}
                onBlur={handleValidateCookie}
                placeholder="从浏览器开发者工具复制抖音 Cookie..."
                rows={4}
              />
              {cookieInputStatus === "valid" && (
                <p className="text-[0.72rem] text-success mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Cookie 有效
                </p>
              )}
              {cookieInputStatus === "invalid" && (
                <p className="text-[0.72rem] text-danger mt-1.5 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> 缺少必要参数，请确认包含 sessionid
                </p>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveCookie}
                disabled={savingCookie || !cookieValue.trim()}
                className="mt-3 h-9 w-full rounded-[10px]"
              >
                {savingCookie ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                保存并校验 Cookie
              </Button>
              {loginMessage && (
                <p className="mt-2 text-[0.72rem] text-text-muted">{loginMessage}</p>
              )}
            </div>
          )}
        </SettingGroup>

        {/* Theme */}
        <SettingGroup icon={Palette} label="外观主题">
          <div className="flex gap-1.5 p-1 rounded-[12px] bg-white/[0.04]">
            {(
              [
                { value: "light", icon: Sun, label: "亮色" },
                { value: "dark", icon: Moon, label: "暗色" },
                { value: "auto", icon: Monitor, label: "系统" },
              ] as const
            ).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setTheme(value as ThemeMode)}
                className={cn(
                  "relative flex-1 flex items-center justify-center gap-2 h-10 rounded-[10px] text-[0.82rem] font-semibold transition-[background-color,color,box-shadow,transform,opacity] duration-200 cursor-pointer",
                  theme === value
                    ? "text-text"
                    : "text-text-muted hover:text-text-secondary"
                )}
              >
                {theme === value && (
                  <motion.div
                    layoutId="theme-tab-bg"
                    className="absolute inset-0 rounded-[10px] bg-accent/[0.12] shadow-[0_0_12px_rgba(254,44,85,0.08)]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className="relative w-4 h-4" />
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
        </SettingGroup>

        {/* Download Dir */}
        <SettingGroup icon={FolderOpen} label="下载目录">
          <div className="flex gap-2">
            <Input
              value={downloadPath}
              onChange={(event) => setDownloadPath(event.target.value)}
              placeholder="data/"
              className="flex-1 h-10"
            />
            <Button variant="outline" size="sm" onClick={handleChooseDirectory} className="h-10 shrink-0 px-4">
              <FolderOpen className="w-4 h-4" />
              选择
            </Button>
          </div>
          <p className="text-[0.75rem] text-text-muted mt-2">
            默认下载到应用 data/ 目录
          </p>
        </SettingGroup>

        {/* Quality */}
        <SettingGroup icon={Gauge} label="下载质量">
          <Select value={downloadQuality} onValueChange={setDownloadQuality}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">自动</SelectItem>
              <SelectItem value="highest">最高质量</SelectItem>
              <SelectItem value="h264">兼容优先 (H.264)</SelectItem>
              <SelectItem value="smallest">最小体积</SelectItem>
            </SelectContent>
          </Select>
        </SettingGroup>

        {/* Concurrency */}
        <SettingGroup icon={Zap} label="并发下载数">
          <Select value={maxConcurrent} onValueChange={setMaxConcurrent}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} 个{n === 3 ? " (推荐)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingGroup>

        {/* Save */}
        <Button
          variant="default"
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="w-full h-11 rounded-[12px] text-[0.88rem] font-bold"
        >
          {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          保存设置
        </Button>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* About */}
        <SettingGroup icon={Info} label="关于">
          <div className="flex items-center justify-between py-3 px-4 rounded-[12px] bg-white/[0.03]">
            <span className="text-[0.82rem] text-text-muted">当前版本</span>
            <span className="text-[0.82rem] text-text font-mono font-semibold">
              {appVersion ? `v${appVersion}` : "读取中"}
            </span>
          </div>
          {updateMessage && (
            <div
              className={cn(
                "mt-3 rounded-[12px] border px-3 py-2 text-[0.78rem]",
                updateStatus === "error"
                  ? "border-danger/20 bg-danger-soft text-danger"
                  : updateStatus === "available"
                    ? "border-info/20 bg-info/10 text-info"
                    : updateStatus === "ready"
                      ? "border-success/20 bg-success-soft text-success"
                      : "border-border bg-white/[0.03] text-text-muted"
              )}
            >
              {updateMessage}
            </div>
          )}
          {updateInfo?.notes && (
            <div className="mt-3 max-h-[160px] overflow-y-auto rounded-[12px] border border-border bg-white/[0.03] p-3 text-[0.76rem] leading-relaxed text-text-secondary whitespace-pre-wrap">
              {updateInfo.notes}
            </div>
          )}
          {updateInfo?.asset_name && updateStatus === "available" && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-[12px] border border-border bg-white/[0.03] px-3 py-2 text-[0.74rem] text-text-muted">
              <span className="min-w-0 truncate">{updateInfo.asset_name}</span>
              {formatBytes(updateInfo.asset_size) && (
                <span className="shrink-0 font-mono tabular-nums">{formatBytes(updateInfo.asset_size)}</span>
              )}
            </div>
          )}
          {updateStatus === "downloading" && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[0.72rem] text-text-muted">
                <span>下载进度</span>
                <span className="font-mono tabular-nums">{Math.round(updateProgress)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${updateProgress}%` }} />
              </div>
            </div>
          )}
          <Button
            variant="outline"
            onClick={handleCheckUpdate}
            disabled={updateStatus === "checking" || updateStatus === "downloading"}
            className="w-full h-10 rounded-[12px] mt-3"
          >
            <RefreshCw className={cn("w-4 h-4", updateStatus === "checking" && "animate-spin")} />
            {updateStatus === "checking" ? "检查中..." : "检查更新"}
          </Button>
          {updateStatus === "available" && (
            <Button
              variant="default"
              onClick={handleDownloadUpdate}
              className="mt-2 w-full h-10 rounded-[12px]"
            >
              <RefreshCw className="w-4 h-4" />
              下载更新
            </Button>
          )}
          {updateStatus === "ready" && updateCanRestart && (
            <Button
              variant="default"
              onClick={handleRestart}
              className="mt-2 w-full h-10 rounded-[12px]"
            >
              <RefreshCw className="w-4 h-4" />
              重启应用
            </Button>
          )}
        </SettingGroup>
      </div>
    </motion.div>
  );
}

function SettingGroup({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-[0.85rem] font-semibold text-text mb-3">
        <Icon className="w-4 h-4 text-text-muted" />
        {label}
      </label>
      {children}
    </div>
  );
}
