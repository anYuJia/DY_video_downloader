import { useEffect, useRef } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster, useToast } from '@/components/ui/toast';
import { AppShell } from '@/components/layout/app-shell';
import { useAppStore, useLogStore } from '@/stores/app-store';
import { useSocket } from '@/lib/socket';
import { useKeyboard } from '@/hooks/use-keyboard';
import { checkUpdate, getConfig, initClient, verifyCookie } from '@/lib/tauri';
import { useRecommendedStore } from '@/stores/recommended-store';

export default function App() {
  const setCookieLoggedIn = useAppStore((s) => s.setCookieLoggedIn);
  const { toast } = useToast();
  const lastCookieInvalidLogAt = useRef(0);

  useEffect(() => {
    const handleCookieInvalid = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail || {};
      const message = detail.message || 'Cookie 已失效，请重新登录';
      setCookieLoggedIn(false);

      const now = Date.now();
      if (now - lastCookieInvalidLogAt.current > 3000) {
        lastCookieInvalidLogAt.current = now;
        useLogStore.getState().addLog(message, 'warning');
        toast(message, 'warning', '登录失效');
      }
    };

    window.addEventListener('dy-cookie-invalid', handleCookieInvalid);
    return () => window.removeEventListener('dy-cookie-invalid', handleCookieInvalid);
  }, [setCookieLoggedIn, toast]);

  useEffect(() => {
    let disposed = false;
    let prefetchTimer: number | null = null;

    const bootstrap = async () => {
      try {
        await initClient();
      } catch (error) {
        if (!disposed) {
          useLogStore
            .getState()
            .addLog(error instanceof Error ? error.message : '初始化客户端失败', 'error');
        }
      }

      // Check for updates
      try {
        const update = await checkUpdate();
        if (!disposed && update.has_update) {
          toast(
            `发现新版本 v${update.version}，请前往设置或 GitHub 下载更新。`,
            'info',
            '有新版本可用'
          );
          useLogStore.getState().addLog(`发现新版本: ${update.version}`, 'info');
        }
      } catch {
        // Silent fail for update check
      }

      try {
        const config = await getConfig();
        if (disposed) return;

        if (config.cookie_set) {
          try {
            const status = await verifyCookie();
            if (disposed) return;

            setCookieLoggedIn(status.valid, status.user_name || undefined);

            if (status.valid) {
              prefetchTimer = window.setTimeout(() => {
                void useRecommendedStore.getState().loadFeed();
              }, 1200);
            } else {
              useLogStore.getState().addLog(status.message || 'Cookie 可能已失效', 'warning');
            }
          } catch (error) {
            if (!disposed) {
              setCookieLoggedIn(false);
              useLogStore
                .getState()
                .addLog(error instanceof Error ? error.message : 'Cookie 校验失败', 'warning');
            }
          }
        } else {
          setCookieLoggedIn(false);
        }
      } catch {
        if (!disposed) {
          setCookieLoggedIn(false);
        }
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
      if (prefetchTimer) {
        window.clearTimeout(prefetchTimer);
      }
    };
  }, [setCookieLoggedIn, toast]);

  useSocket();
  useKeyboard();

  return (
    <TooltipProvider delayDuration={300}>
      <AppShell />
      <Toaster />
    </TooltipProvider>
  );
}
