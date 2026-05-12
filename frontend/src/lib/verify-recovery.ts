import { useToastStore } from "@/components/ui/toast";
import { openVerifyBrowser } from "@/lib/tauri";
import { useLogStore, useVerifyRecoveryStore } from "@/stores/app-store";

interface VerifyRecoveryOptions {
  verifyUrl?: string;
  message?: string;
  title?: string;
  actionLabel?: string;
  onResume: () => void;
}

export function requestVerifyRecovery({
  verifyUrl,
  message = "需要完成抖音验证",
  title = "需要验证",
  actionLabel = "已完成验证",
  onResume,
}: VerifyRecoveryOptions) {
  const addLog = useLogStore.getState().addLog;
  const toast = useToastStore.getState().toast;

  void openVerifyBrowser(verifyUrl)
    .then((result) => addLog(result.message, result.success ? "info" : "warning"))
    .catch(() => addLog("无法打开应用内验证窗口，请用桌面模式启动后重试", "warning"));

  useVerifyRecoveryStore.getState().showRecovery({
    title,
    message,
    actionLabel,
    onResume,
  });

  toast(message, "warning", title, {
    label: actionLabel,
    onClick: onResume,
  });
}
