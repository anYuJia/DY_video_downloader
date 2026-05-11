import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAlertStore, useLoaderStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

const variantIcons = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
  danger: AlertCircle,
};

const variantColors = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  error: "text-danger",
  danger: "text-danger",
};

export function GlobalAlert() {
  const { isOpen, config, hideAlert } = useAlertStore();

  if (!config) return null;

  const Icon = variantIcons[config.variant || "info"];
  const iconColor = variantColors[config.variant || "info"];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && hideAlert()}>
      <DialogContent className="max-w-[420px] glass-premium">
        <DialogHeader className="flex-row items-start gap-5 space-y-0 pt-2">
          <motion.div
            initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
            className={cn(
              "mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-surface-raised shadow-sm",
              iconColor
            )}
          >
            <Icon className="h-6 w-6" />
          </motion.div>
          <div className="flex-1 min-w-0 pt-0.5">
            <DialogTitle className="text-[1.1rem] font-bold tracking-tight">
              {config.title}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="mt-2.5 text-[0.85rem] leading-relaxed text-text-secondary">
                {config.description}
              </div>
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-8 gap-2.5 sm:flex-row">
          {config.onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                config.onCancel?.();
                hideAlert();
              }}
              className="h-11 flex-1 rounded-[14px] font-bold"
            >
              {config.cancelLabel || "取消"}
            </Button>
          )}
          <Button
            type="button"
            variant={config.variant === "danger" ? "danger" : "default"}
            onClick={() => {
              config.onAction?.();
              hideAlert();
            }}
            className="h-11 flex-1 rounded-[14px] font-bold shadow-md active:scale-[0.98] transition-transform"
          >
            {config.actionLabel || "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GlobalLoader() {
  const { isLoading, message } = useLoaderStore();

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          role="status"
          aria-live="polite"
          aria-busy="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-background/40 backdrop-blur-[32px]"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="relative flex flex-col items-center rounded-[20px] bg-surface-solid/85 px-8 py-7 shadow-[0_28px_80px_rgba(0,0,0,0.38),0_0_0_1px_var(--color-border)]"
          >
            <div className="relative mb-8 h-20 w-20">
              {/* Complex multilayer spinner */}
              <div className="absolute inset-0 rounded-full border-[3px] border-white/5" />
              <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-accent animate-[loader-spin-custom_1.5s_linear_infinite]" />
              <div className="absolute inset-2 rounded-full border-[2px] border-transparent border-b-info opacity-60 animate-[loader-spin-custom_2s_linear_infinite_reverse]" />
              
              {/* Inner glowing pulse */}
              <div className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-accent shadow-[0_0_15px_var(--color-accent)] animate-pulse" />
            </div>
            
            <h2 className="text-[1.2rem] font-black text-text tracking-tight mb-2">
              {message || "正在处理"}
            </h2>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border">
              <span className="flex h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[0.72rem] font-bold text-text-muted uppercase tracking-widest">
                请稍候
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
