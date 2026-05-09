import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";

// ═══════════════════════════════════════════════
// Keyboard Shortcuts Hook
// ═══════════════════════════════════════════════

export function useKeyboard() {
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const setCommandMode = useAppStore((s) => s.setCommandMode);
  const setView = useAppStore((s) => s.setView);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const toggleBottomBar = useAppStore((s) => s.toggleBottomBar);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Cmd+K — Command palette
      if (isMeta && e.key === "k") {
        e.preventDefault();
        setCommandMode("search");
        setCommandOpen(true);
        return;
      }

      // Cmd+L — Link input
      if (isMeta && e.key === "l") {
        e.preventDefault();
        setCommandMode("link");
        setCommandOpen(true);
        return;
      }

      // Cmd+, — Settings
      if (isMeta && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }

      // Cmd+J — Toggle bottom bar
      if (isMeta && e.key === "j") {
        e.preventDefault();
        toggleBottomBar();
        return;
      }

      // Escape — Close overlays
      if (e.key === "Escape") {
        const store = useAppStore.getState();
        if (store.commandOpen) {
          setCommandOpen(false);
          return;
        }
        if (store.settingsOpen) {
          setSettingsOpen(false);
          return;
        }
      }

      // Cmd+1-5 — Quick nav
      if (isMeta && ["1", "2", "3", "4", "5"].includes(e.key)) {
        e.preventDefault();
        const views = ["home", "search", "recommended", "downloads", "home"] as const;
        const idx = parseInt(e.key) - 1;
        if (views[idx]) {
          if (idx === 1) {
            setCommandMode("search");
            setCommandOpen(true);
          } else {
            setView(views[idx]);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setCommandOpen, setCommandMode, setView, setSettingsOpen, toggleBottomBar]);
}
