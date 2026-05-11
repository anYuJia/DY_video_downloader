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
      <DialogContent className="max-w-[400px]">
        <DialogHeader className="flex-row items-start gap-4 space-y-0">
          <div className={cn("mt-1 rounded-full p-1", iconColor)}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <DialogTitle className="text-[1.05rem]">{config.title}</DialogTitle>
            <DialogDescription className="mt-2 text-[0.82rem] leading-relaxed">
              {config.description}
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-6 gap-2">
          {config.onCancel && (
            <Button
              variant="outline"
              onClick={() => {
                config.onCancel?.();
                hideAlert();
              }}
              className="flex-1 rounded-[12px]"
            >
              {config.cancelLabel || "取消"}
            </Button>
          )}
          <Button
            variant={config.variant === "danger" ? "danger" : "default"}
            onClick={() => {
              config.onAction?.();
              hideAlert();
            }}
            className="flex-1 rounded-[12px]"
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-background/60 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="flex flex-col items-center"
          >
            <div className="relative mb-6">
              {/* Spinning outer ring */}
              <div className="h-16 w-16 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
              {/* Inner glowing core */}
              <div className="absolute inset-0 m-auto h-8 w-8 rounded-full bg-accent/20 blur-xl animate-pulse" />
            </div>
            
            <p className="text-[0.95rem] font-bold text-text tracking-wide">
              {message}
            </p>
            <p className="mt-2 text-[0.75rem] text-text-muted">
              请稍候，程序正在全速运行中
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
