import * as React from "react";
import { cn } from "@/lib/utils";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle, Loader2 } from "lucide-react";
import { motion, AnimatePresence, useIsPresent } from "framer-motion";
import { create } from "zustand";

// ═══════════════════════════════════════════════
// Toast Store
// ═══════════════════════════════════════════════

export interface ToastAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost" | "danger";
}

interface Toast {
  id: number;
  title?: string;
  message: string;
  type: "info" | "success" | "error" | "warning" | "loading";
  duration?: number;
  action?: ToastAction;
}

interface ToastStore {
  toasts: Toast[];
  nextId: number;
  toast: (message: string, type?: Toast["type"], title?: string, action?: ToastAction) => number;
  dismiss: (id: number) => void;
  update: (id: number, patch: Partial<Toast>) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  nextId: 1,
  toast: (message, type = "info", title, action) => {
    const id = Date.now() + Math.random();
    set((s) => ({
      toasts: [
        ...s.toasts.slice(-4),
        { id, message, type, title, action, duration: type === "loading" ? 0 : 4500 },
      ],
    }));
    return id;
  },
  update: (id, patch) =>
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
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
  loading: Loader2,
};

const colorMap = {
  info: "border-info/20 text-info",
  success: "border-success/20 text-success",
  error: "border-danger/20 text-danger",
  warning: "border-warning/20 text-warning",
  loading: "border-accent/20 text-accent",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed bottom-6 right-6 z-[9000] flex flex-col items-end gap-3 pointer-events-none">
      <AnimatePresence mode="popLayout" initial={false}>
        {toasts.map((toast, index) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            index={index}
            total={toasts.length}
            onDismiss={() => dismiss(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
  index,
  total,
}: {
  toast: Toast;
  onDismiss: () => void;
  index: number;
  total: number;
}) {
  const Icon = iconMap[toast.type];
  const isPresent = useIsPresent();

  React.useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(onDismiss, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [onDismiss, toast.duration]);

  // Premium stacking logic: items slide up and scale down slightly as they get older
  const reverseIndex = total - 1 - index;
  const yOffset = reverseIndex * 12;
  const scale = 1 - reverseIndex * 0.04;
  const opacity = 1 - reverseIndex * 0.2;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20, scale: 0.9 }}
      animate={{
        opacity,
        x: 0,
        scale,
        y: -yOffset,
        transition: { type: "spring", stiffness: 450, damping: 35, mass: 1 },
      }}
      exit={{ opacity: 0, x: 20, scale: 0.8, transition: { duration: 0.15 } }}
      style={{ originX: 1, originY: 1 }}
      className={cn(
        "pointer-events-auto relative flex w-80 flex-col overflow-hidden rounded-[var(--radius-lg)] border bg-surface-solid/85 backdrop-blur-2xl shadow-[0_20px_40px_rgba(0,0,0,0.25)]",
        colorMap[toast.type]
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <div className={cn("mt-0.5 shrink-0", toast.type === "loading" && "animate-spin")}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        
        <div className="flex-1 min-w-0">
          {toast.title && (
            <div className="text-[0.85rem] font-bold leading-tight text-text mb-1 truncate">
              {toast.title}
            </div>
          )}
          <div className={cn(
            "text-[0.8rem] leading-relaxed text-text-secondary line-clamp-3",
            !toast.title && "font-medium text-text"
          )}>
            {toast.message}
          </div>

          {toast.action && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.action?.onClick();
                  onDismiss();
                }}
                className="rounded-[8px] bg-white/[0.08] px-3 py-1.5 text-[0.72rem] font-bold text-text hover:bg-white/[0.15] transition-colors"
              >
                {toast.action.label}
              </button>
            </div>
          )}
        </div>

        <button
          onClick={onDismiss}
          className="shrink-0 -mr-1 -mt-1 p-1.5 rounded-full text-text-muted hover:text-text hover:bg-white/[0.05] transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress bar for auto-dismissing toasts */}
      {typeof toast.duration === "number" && toast.duration > 0 && isPresent && (
        <motion.div
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: toast.duration / 1000, ease: "linear" }}
          className="absolute bottom-0 left-0 h-[2px] bg-current opacity-20"
        />
      )}
    </motion.div>
  );
}

// Convenience hook
export function useToast() {
  const toast = useToastStore((s) => s.toast);
  const update = useToastStore((s) => s.update);
  const dismiss = useToastStore((s) => s.dismiss);

  return {
    toast,
    update,
    dismiss,
    success: (message: string, title?: string, action?: ToastAction) => 
      toast(message, "success", title, action),
    error: (message: string, title?: string, action?: ToastAction) => 
      toast(message, "error", title, action),
    warning: (message: string, title?: string, action?: ToastAction) => 
      toast(message, "warning", title, action),
    info: (message: string, title?: string, action?: ToastAction) => 
      toast(message, "info", title, action),
    loading: (message: string, title?: string) => 
      toast(message, "loading", title),
  };
}

