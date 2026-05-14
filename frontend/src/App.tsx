import { useEffect, useRef } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";
import { AppShell } from "@/components/layout/app-shell";
import { GlobalAlert, GlobalLoader, GlobalVerifyRecovery } from "@/components/layout/global-feedback";
import { useAlertStore, useAppStore, useLoaderStore, useLogStore } from "@/stores/app-store";
import { useSocket } from "@/lib/socket";
import { useKeyboard } from "@/hooks/use-keyboard";
import { checkUpdate, getConfig, initClient, verifyCookie } from "@/lib/tauri";
import { useRecommendedStore } from "@/stores/recommended-store";

const BOOTSTRAP_STEP_TIMEOUT_MS = 8_000;
const BOOTSTRAP_NETWORK_TIMEOUT_MS = 6_000;
const BOOTSTRAP_COOKIE_TIMEOUT_MS = 10_000;

function withBootstrapTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = BOOTSTRAP_STEP_TIMEOUT_MS
): Promise<T> {
  let timer: number | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label}超时`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  });
}

export default function App() {
  const setCookieLoggedIn = useAppStore((s) => s.setCookieLoggedIn);
  const showAlert = useAlertStore((s) => s.showAlert);
  const { showLoader, hideLoader } = useLoaderStore();
  const lastCookieInvalidLogAt = useRef(0);

  useEffect(() => {
    const handleCookieInvalid = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail || {};
      const message = detail.message || "Cookie 已失效，请重新登录以继续使用搜索和推荐功能。";
      setCookieLoggedIn(false);

      const now = Date.now();
      if (now - lastCookieInvalidLogAt.current > 3000) {
        lastCookieInvalidLogAt.current = now;
        useLogStore.getState().addLog(message, "warning");
        
        showAlert({
          title: "登录已失效",
          variant: "warning",
          description: message,
          actionLabel: "前往设置",
          onAction: () => {
            useAppStore.getState().setView("settings");
          }
        });
      }
    };

    window.addEventListener("dy-cookie-invalid", handleCookieInvalid);
    return () => window.removeEventListener("dy-cookie-invalid", handleCookieInvalid);
  }, [setCookieLoggedIn, showAlert]);

  useEffect(() => {
    let disposed = false;
    let prefetchTimer: number | null = null;

    const checkForUpdatesInBackground = async () => {
      try {
        const update = await withBootstrapTimeout(
          checkUpdate(),
          "检查更新",
          BOOTSTRAP_NETWORK_TIMEOUT_MS
        );
        if (!disposed && update.has_update) {
          showAlert({
            title: "发现新版本",
            variant: "info",
            description: (
              <div>
                <p>程序有新版本可用: <span className="font-bold text-text">v{update.version}</span></p>
                {update.notes && (
                  <div className="mt-2 rounded-lg bg-surface-raised p-3 text-[0.72rem] font-mono text-text-secondary whitespace-pre-wrap max-h-[200px] overflow-y-auto border border-border/50">
                    {update.notes}
                  </div>
                )}
                <p className="mt-2 opacity-80">建议立即更新以获取最新功能和修复。</p>
              </div>
            ),
            actionLabel: "前往更新",
            onAction: () => {
              useAppStore.getState().setView("settings");
            }
          });
        }
      } catch {
        // Silent fail for update check.
      }
    };

    const bootstrap = async () => {
      showLoader("正在初始化引擎...");
      try {
        await withBootstrapTimeout(initClient(), "初始化客户端");
      } catch (error) {
        if (!disposed) {
          useLogStore
            .getState()
            .addLog(error instanceof Error ? error.message : "初始化客户端失败", "error");
        }
      }

      try {
        showLoader("正在读取配置...");
        const config = await withBootstrapTimeout(getConfig(), "读取配置");
        if (disposed) {
          hideLoader();
          return;
        }

        if (config.cookie_set) {
          try {
            showLoader("正在校验登录状态...");
            const status = await withBootstrapTimeout(
              verifyCookie(),
              "Cookie 校验",
              BOOTSTRAP_COOKIE_TIMEOUT_MS
            );
            if (disposed) {
              hideLoader();
              return;
            }

            setCookieLoggedIn(status.valid, status.user_name || undefined);

            if (status.valid) {
              prefetchTimer = window.setTimeout(() => {
                void useRecommendedStore.getState().loadFeed();
              }, 1200);
            } else {
              useLogStore.getState().addLog(status.message || "Cookie 可能已失效", "warning");
            }
          } catch (error) {
            if (!disposed) {
              setCookieLoggedIn(false);
              useLogStore
                .getState()
                .addLog(error instanceof Error ? error.message : "Cookie 校验失败", "warning");
            }
          }
        } else {
          setCookieLoggedIn(false);
        }
      } catch {
        if (!disposed) {
          setCookieLoggedIn(false);
        }
      } finally {
        hideLoader();
        void checkForUpdatesInBackground();
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
      if (prefetchTimer) {
        window.clearTimeout(prefetchTimer);
      }
    };
  }, [setCookieLoggedIn, showAlert, showLoader, hideLoader]);

  useSocket();
  useKeyboard();

  return (
    <TooltipProvider delayDuration={300}>
      <AppShell />
      <GlobalAlert />
      <GlobalVerifyRecovery />
      <GlobalLoader />
      <Toaster />
    </TooltipProvider>
  );
}
