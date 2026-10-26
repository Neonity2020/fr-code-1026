import { type SVGProps } from "react";
import { cn } from "~/lib/utils";

/**
 * FRWordmark — 几何粗体 "FR" 矢量字标，与原 T3Wordmark 等高（h-3 w-auto）
 * 配合右侧 "Code" 文本组成顶栏 "FR Code" 品牌标识。
 */
const FR_WORDMARK_PATH =
  "M0 0H84V24H28V50H74V74H28V122H0V0ZM98 0H154C176.5 0 192 14.5 192 38C192 55.5 181.5 69.2 164.5 73.6L196 122H164L136.5 76H126V122H98V0ZM126 23V53H151C160.2 53 165 47.4 165 38C165 28.6 160.2 23 151 23H126Z";

export function FRWordmark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 196 122"
      className={cn("h-3 w-auto shrink-0 fill-current", className)}
      {...props}
    >
      <path d={FR_WORDMARK_PATH} fillRule="evenodd" />
    </svg>
  );
}

export { FRWordmark as T3Wordmark };
