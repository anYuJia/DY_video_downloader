import { memo } from "react";

export const AmbientBackground = memo(function AmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "linear-gradient(135deg, var(--color-background) 0%, var(--color-background-soft) 58%, rgba(254,44,85,0.055) 100%)",
        }}
      />
      <div
        className="absolute inset-x-8 top-8 h-px opacity-70"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--color-border-strong), transparent)",
        }}
      />
    </div>
  );
});
