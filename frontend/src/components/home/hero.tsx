import { useAppStore } from "@/stores/app-store";
import { motion } from "framer-motion";
import {
  Search,
  Link2,
  Sparkles,
  FolderOpen,
  ArrowUpRight,
  Command,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AmbientBackground } from "./ambient-background";
import { QuickStats } from "./quick-stats";

interface Shortcut {
  icon: React.ElementType;
  label: string;
  desc: string;
  gradient: string;
  iconColor: string;
  glowColor: string;
  view?: string;
  command?: "search" | "link";
  kbd?: string;
}

const shortcuts: Shortcut[] = [
  {
    icon: Search,
    label: "搜索用户",
    desc: "通过用户名或抖音号查找创作者",
    gradient: "from-accent/20 via-accent/5 to-transparent",
    iconColor: "text-accent",
    glowColor: "shadow-[0_0_20px_rgba(254,44,85,0.15)]",
    command: "search",
    kbd: "⌘K",
  },
  {
    icon: Link2,
    label: "粘贴链接",
    desc: "解析分享链接，一键下载视频",
    gradient: "from-info/20 via-info/5 to-transparent",
    iconColor: "text-info",
    glowColor: "shadow-[0_0_20px_rgba(124,92,252,0.15)]",
    command: "link",
    kbd: "⌘L",
  },
  {
    icon: Sparkles,
    label: "推荐视频",
    desc: "浏览抖音推荐流内容",
    gradient: "from-purple-500/20 via-purple-500/5 to-transparent",
    iconColor: "text-purple-400",
    glowColor: "shadow-[0_0_20px_rgba(168,85,247,0.15)]",
    view: "recommended",
  },
  {
    icon: FolderOpen,
    label: "我的下载",
    desc: "管理已下载的视频和图片",
    gradient: "from-success/20 via-success/5 to-transparent",
    iconColor: "text-success",
    glowColor: "shadow-[0_0_20px_rgba(0,214,143,0.15)]",
    view: "downloads",
    kbd: "⌘4",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 320, damping: 26 },
  },
};

export function Hero() {
  const setView = useAppStore((s) => s.setView);
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const setCommandMode = useAppStore((s) => s.setCommandMode);

  const handleShortcut = (s: Shortcut) => {
    if (s.command) {
      setCommandMode(s.command);
      setCommandOpen(true);
    } else if (s.view) {
      setView(s.view as "recommended" | "downloads");
    }
  };

  return (
    <div className="relative flex items-center justify-center h-full px-8">
      <AmbientBackground />

      <motion.div
        className="relative z-10 w-full max-w-[560px] flex flex-col items-center"
        variants={container}
        initial={false}
        animate="show"
      >
        {/* Status pill */}
        <motion.div variants={item} className="mb-6">
          <span className="inline-flex items-center gap-2 px-3.5 h-7 rounded-full bg-success/8 border border-success/20 text-[0.68rem] font-semibold text-success">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            就绪
          </span>
        </motion.div>

        {/* Title — gradient text */}
        <motion.div variants={item} className="mb-2 flex items-center gap-2">
          <div className="h-9 w-9 overflow-visible rounded-[14px] bg-transparent drop-shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
            <img src="/animated_icon.svg" alt="Douyin Downloader" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-[1.35rem] font-[750] tracking-[-0.02em] text-center">
            <span className="bg-gradient-to-r from-text via-text to-text-secondary bg-clip-text">
              Douyin Downloader
            </span>
          </h1>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          variants={item}
          className="text-[0.82rem] text-text-muted text-center mb-8 max-w-[360px] leading-relaxed"
        >
          搜索用户、粘贴链接、浏览推荐
          <br />
          <span className="text-text-secondary">一站式视频解析与下载</span>
        </motion.p>

        {/* Shortcut Grid — 2x2, glassmorphism cards */}
        <motion.div
          variants={container}
          className="w-full grid grid-cols-2 gap-3"
        >
          {shortcuts.map((s) => (
            <motion.button
              key={s.label}
              variants={item}
              onClick={() => handleShortcut(s)}
              className={cn(
                "group relative flex flex-col gap-3 p-5 rounded-[var(--radius-xl)] text-left cursor-pointer overflow-hidden",
                "bg-surface-solid/50 backdrop-blur-sm",
                "border border-border",
                "hover:border-border-strong hover:bg-surface-raised",
                "hover:shadow-lg",
                "transition-[transform,box-shadow,border-color,background-color] duration-[var(--duration-base)] ease-[var(--ease-spring)]",
                s.glowColor
              )}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
            >
              {/* Gradient accent strip at top */}
              <div
                className={cn(
                  "absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300",
                  s.gradient.replace("/20", "/60").replace("to-transparent", "via-transparent to-transparent")
                )}
              />

              {/* Background gradient glow on hover */}
              <div
                className={cn(
                  "absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl",
                  s.gradient
                )}
              />

              {/* Icon + kbd row */}
              <div className="relative flex items-center justify-between w-full">
                <div
                  className={cn(
                    "w-11 h-11 rounded-[13px] flex items-center justify-center",
                    "bg-gradient-to-br",
                    s.gradient,
                    "border border-border/60 group-hover:border-border-strong",
                    "transition-[transform,border-color,background-color] duration-300"
                  )}
                >
                  <s.icon
                    className={cn(
                      "w-[22px] h-[22px] transition-transform duration-300 group-hover:scale-110",
                      s.iconColor
                    )}
                  />
                </div>
                {s.kbd && (
                  <kbd className="text-[0.58rem] font-mono px-1.5 py-0.5 rounded-[6px] bg-surface border border-border text-text-muted opacity-60 group-hover:opacity-100 transition-opacity">
                    {s.kbd}
                  </kbd>
                )}
              </div>

              {/* Text */}
              <div className="relative">
                <div className="flex items-center gap-1.5">
                  <span className="text-[0.88rem] font-semibold text-text">
                    {s.label}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-text-muted opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-300" />
                </div>
                <div className="text-[0.72rem] text-text-muted leading-snug mt-0.5">
                  {s.desc}
                </div>
              </div>
            </motion.button>
          ))}
        </motion.div>

        {/* Quick Stats */}
        <div className="w-full mt-6">
          <QuickStats />
        </div>

        {/* Keyboard hint */}
        <motion.div
          variants={item}
          className="mt-6 flex items-center gap-1.5 text-text-muted"
        >
          <kbd className="text-[0.58rem] font-mono px-1.5 py-0.5 rounded bg-surface border border-border">
            <Command className="w-2.5 h-2.5 inline" />
          </kbd>
          <span className="text-[0.65rem]">+</span>
          <kbd className="text-[0.58rem] font-mono px-1.5 py-0.5 rounded bg-surface border border-border">
            K
          </kbd>
          <span className="text-[0.65rem] ml-1">快速打开命令面板</span>
        </motion.div>
      </motion.div>
    </div>
  );
}
