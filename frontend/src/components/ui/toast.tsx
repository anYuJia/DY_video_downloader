import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cn } from "@/lib/utils";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { create } from "zustand";

// ═══════════════════════════════════════════════
// Toast Store
// ═══════════════════════════════════════════════

interface Toast {
  id: number;
  title?: string;
  message: string;
  type: "info" | "success" | "error" | "warning";
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  nextId: number;
  toast: (message: string, type?: Toast["type"], title?: string) => void;
  dismiss: (id: number) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  nextId: 1,
  toast: (message, type = "info", title) =>
    set((s) => ({
      toasts: [
        ...s.toasts.slice(-4),
        { id: s.nextId, message, type, title, duration: 4000 },
      ],
      nextId: s.nextId + 1,
    })),
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// ═══════════════════════════════════════════════
// Toast Components
// ═══════════════════════════════════════════════

const iconMap = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
};

const colorMap = {
  info: "text-info border-info/25 bg-info-soft",
  success: "text-success border-success/25 bg-success-soft",
  error: "text-danger border-danger/25 bg-danger-soft",
  warning: "text-warning border-warning/25 bg-warning-soft",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed bottom-4 right-4 z-[9000] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = iconMap[toast.type];

  React.useEffect(() => {
    const timer = setTimeout(onDismiss, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [onDismiss, toast.duration]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={cn(
        "flex items-start gap-3 p-3 rounded-[var(--radius-md)] border shadow-md bg-surface-solid backdrop-blur-xl",
        colorMap[toast.type]
      )}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {toast.title && (
          <div className="text-[0.8rem] font-semibold mb-0.5">{toast.title}</div>
        )}
        <div className="text-[0.78rem] opacity-90">{toast.message}</div>
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 w-5 h-5 rounded flex items-center justify-center opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  );
}

// Convenience hook
export function useToast() {
  const toast = useToastStore((s) => s.toast);
  return {
    toast,
    success: (message: string, title?: string) => toast(message, "success", title),
    error: (message: string, title?: string) => toast(message, "error", title),
    warning: (message: string, title?: string) => toast(message, "warning", title),
    info: (message: string, title?: string) => toast(message, "info", title),
  };
}
