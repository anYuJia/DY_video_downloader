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
    let id = 0;
    set((s) => {
      id = s.nextId;
      return {
        nextId: s.nextId + 1,
        toasts: [{ id, message, type, title, action, duration: type === "loading" ? 0 : 4500 }],
      };
    });
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
    <div className="fixed inset-x-3 bottom-3 z-[8500] flex flex-col items-stretch gap-2 pointer-events-none sm:inset-x-auto sm:bottom-4 sm:right-4 sm:items-end">
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

  // Magnetic Stacking logic
  const reverseIndex = total - 1 - index;
  const scale = 1 - reverseIndex * 0.05;
  const yOffset = reverseIndex * -12; // Slide up
  const zIndex = total - reverseIndex;
  const opacity = 1 - reverseIndex * 0.15;

  return (
    <motion.div
      role={toast.type === "error" || toast.type === "warning" ? "alert" : "status"}
      aria-live={toast.type === "error" || toast.type === "warning" ? "assertive" : "polite"}
      aria-atomic="true"
      layout
      initial={{ opacity: 0, y: 24, scale: 0.9, filter: "blur(10px)" }}
      animate={{
        opacity,
        scale,
        y: yOffset,
        filter: "blur(0px)",
        transition: {
          type: "spring",
          stiffness: 400,
          damping: 32,
          mass: 0.8,
          layout: { duration: 0.2 }
        },
      }}
      exit={{ 
        opacity: 0, 
        x: 40, 
        scale: 0.9, 
        filter: "blur(10px)",
        transition: { duration: 0.2, ease: "easeIn" } 
      }}
      style={{ 
        zIndex,
        originX: 1,
        originY: 1,
      }}
      className={cn(
        "pointer-events-auto relative flex w-full flex-col overflow-hidden rounded-[14px] sm:w-[292px]",
        "bg-surface-solid/80 backdrop-blur-3xl shadow-[0_18px_36px_-16px_rgba(0,0,0,0.45)]",
        "border border-white/[0.08] transition-colors duration-300",
        toast.type === "loading" && "border-accent/30 shadow-[0_0_40px_-12px_rgba(254,44,85,0.2)]",
        toast.type === "success" && "border-success/30 shadow-[0_0_40px_-12px_rgba(34,197,94,0.15)]",
        toast.type === "error" && "border-danger/30 shadow-[0_0_40px_-12px_rgba(239,68,68,0.15)]"
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <div className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-surface-raised shadow-sm border border-white/[0.05]",
          colorMap[toast.type],
        )}>
          <Icon className={cn("h-3.5 w-3.5", toast.type === "loading" && "animate-spin")} />
        </div>
        
        <div className="flex-1 min-w-0">
          {toast.title && (
            <div className="mb-1 truncate text-[0.78rem] font-black leading-tight text-text tracking-tight">
              {toast.title}
            </div>
          )}
          <div className={cn(
            "text-[0.74rem] leading-[1.45] text-text-secondary line-clamp-3",
            !toast.title && "font-bold text-text text-[0.78rem]"
          )}>
            {toast.message}
          </div>

          {toast.action && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                aria-label={toast.action.label}
                onClick={(e) => {
                  e.stopPropagation();
                  toast.action?.onClick();
                  onDismiss();
                }}
                className="group relative flex h-7 items-center justify-center rounded-[8px] bg-accent px-3 text-[0.68rem] font-black text-white shadow-lg shadow-accent/20 active:scale-[0.96] transition-[background-color,color,box-shadow,transform,opacity]"
              >
                <span className="relative z-10">{toast.action.label}</span>
                <div className="absolute inset-0 rounded-[8px] bg-white opacity-0 group-hover:opacity-10 transition-opacity" />
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="关闭通知"
          onClick={onDismiss}
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-white/[0.05] active:scale-[0.96] transition-[background-color,color,transform,opacity]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Modern thin progress bar */}
      {typeof toast.duration === "number" && toast.duration > 0 && isPresent && (
        <div className="absolute bottom-0 left-0 w-full h-[3px] bg-white/[0.03]">
          <motion.div
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: toast.duration / 1000, ease: "linear" }}
            className={cn(
              "h-full rounded-r-full",
              toast.type === "info" && "bg-info",
              toast.type === "success" && "bg-success",
              toast.type === "error" && "bg-danger",
              toast.type === "warning" && "bg-warning",
              toast.type === "loading" && "bg-accent"
            )}
          />
        </div>
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
