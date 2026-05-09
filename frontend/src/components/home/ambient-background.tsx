import { memo } from "react";

/**
 * Subtle animated gradient orbs that float behind the hero content.
 * Pure CSS — zero JS runtime cost.
 */
export const AmbientBackground = memo(function AmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Primary accent orb — top-right */}
      <div
        className="absolute -top-[20%] -right-[10%] w-[520px] h-[520px] rounded-full opacity-[0.07] animate-[orb-drift_18s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)",
        }}
      />
      {/* Secondary purple orb — bottom-left */}
      <div
        className="absolute -bottom-[15%] -left-[8%] w-[420px] h-[420px] rounded-full opacity-[0.05] animate-[orb-drift_22s_ease-in-out_infinite_reverse]"
        style={{
          background:
            "radial-gradient(circle, var(--color-info) 0%, transparent 70%)",
        }}
      />
      {/* Small teal accent — center-left */}
      <div
        className="absolute top-[35%] -left-[5%] w-[260px] h-[260px] rounded-full opacity-[0.04] animate-[orb-drift_14s_ease-in-out_infinite_2s]"
        style={{
          background:
            "radial-gradient(circle, var(--color-success) 0%, transparent 70%)",
        }}
      />
    </div>
  );
});
