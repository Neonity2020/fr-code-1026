import { useId } from "react";
import { cn } from "~/lib/utils";

export type SidebarStageBackdropVariant = "dev" | "nightly";

export function SidebarStageBackdrop({
  variant = "nightly",
  className,
}: {
  variant?: SidebarStageBackdropVariant;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <NightlyBackdrop />
      <span className="absolute inset-0 bg-gradient-to-r from-slate-950/38 via-slate-950/12 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 h-px bg-white/14" />
    </span>
  );
}

function NightlyBackdrop() {
  const id = useId().replace(/:/g, "");
  const skyId = `${id}-nightly-sky`;
  const glowId = `${id}-nightly-glow`;
  const duskId = `${id}-nightly-dusk`;

  return (
    <svg
      viewBox="0 0 320 40"
      preserveAspectRatio="xMidYMid slice"
      className="size-full [shape-rendering:geometricPrecision]"
    >
      <defs>
        <linearGradient id={skyId} x1="0" y1="0" x2="320" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#070a14" />
          <stop offset="0.45" stopColor="#0f152a" />
          <stop offset="0.82" stopColor="#1b1c38" />
          <stop offset="1" stopColor="#281d3d" />
        </linearGradient>
        <radialGradient
          id={glowId}
          cx="0"
          cy="0"
          r="1"
          gradientTransform="translate(274 9) rotate(150) scale(110 36)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#a78bfa" stopOpacity="0.32" />
          <stop offset="0.55" stopColor="#6366f1" stopOpacity="0.12" />
          <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={duskId} x1="0" y1="22" x2="0" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f59e0b" stopOpacity="0" />
          <stop offset="1" stopColor="#f59e0b" stopOpacity="0.12" />
        </linearGradient>
      </defs>

      <rect width="320" height="40" fill={`url(#${skyId})`} />
      <rect width="320" height="40" fill={`url(#${glowId})`} />
      <rect width="320" height="40" fill={`url(#${duskId})`} />

      <g fill="#f8fafc">
        <circle cx="18" cy="10" r="0.8" fillOpacity="0.55" />
        <circle cx="43" cy="24" r="0.65" fillOpacity="0.35" />
        <circle cx="67" cy="8" r="1" fillOpacity="0.7" />
        <circle cx="96" cy="18" r="0.7" fillOpacity="0.45" />
        <circle cx="118" cy="11" r="0.65" fillOpacity="0.35" />
        <circle cx="151" cy="7" r="0.95" fillOpacity="0.65" />
        <circle cx="173" cy="22" r="0.65" fillOpacity="0.4" />
        <circle cx="198" cy="12" r="1.15" fillOpacity="0.82" />
        <circle cx="222" cy="26" r="0.7" fillOpacity="0.42" />
        <circle cx="241" cy="9" r="0.8" fillOpacity="0.6" />
        <circle cx="301" cy="15" r="0.85" fillOpacity="0.62" />
        <circle cx="312" cy="27" r="0.65" fillOpacity="0.4" />
      </g>

      <path
        d="M198 8.8 L198.75 11.25 L201.2 12 L198.75 12.75 L198 15.2 L197.25 12.75 L194.8 12 L197.25 11.25 Z"
        fill="#e0e7ff"
        fillOpacity="0.85"
      />
      <path
        d="M67 5.6 L67.45 7.55 L69.4 8 L67.45 8.45 L67 10.4 L66.55 8.45 L64.6 8 L66.55 7.55 Z"
        fill="#fde68a"
        fillOpacity="0.75"
      />

      <path
        d="M277.5 7.5 A7.5 7.5 0 1 0 286.5 18.2 A6.2 6.2 0 1 1 277.5 7.5 Z"
        fill="#fef3c7"
        fillOpacity="0.88"
      />

      <path
        d="M0 35 Q48 29 98 33 T204 31 T320 33 L320 40 L0 40 Z"
        fill="#05070f"
        fillOpacity="0.58"
      />
    </svg>
  );
}
