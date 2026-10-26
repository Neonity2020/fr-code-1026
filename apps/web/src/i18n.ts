import { useAppStore, type AppLocale, type SettingsSectionId } from "@pi-web/client-runtime";
import type { PiThinkingLevel } from "@pi-web/protocol";

export type { AppLocale };

export const LOCALE_OPTIONS: ReadonlyArray<{ value: AppLocale; label: string; nativeLabel: string }> =
  [
    { value: "zh-CN", label: "简体中文", nativeLabel: "简体中文" },
    { value: "en", label: "English", nativeLabel: "English" },
  ];

export function getSettingsSectionLabel(section: SettingsSectionId, locale: AppLocale): string {
  const isZh = locale === "zh-CN";
  switch (section) {
    case "general":
      return isZh ? "通用" : "General";
    case "appearance":
      return isZh ? "外观与语言" : "Appearance";
    case "keybindings":
      return isZh ? "快捷键" : "Keybindings";
    case "snap-shots":
      return isZh ? "快照" : "SnapShots";
    case "providers":
      return isZh ? "模型服务" : "Providers";
    case "integrations":
      return isZh ? "集成" : "Integrations";
    case "scheduled-tasks":
      return isZh ? "定时任务" : "Scheduled Tasks";
    case "source-control":
      return isZh ? "版本控制" : "Source Control";
    case "storage":
      return isZh ? "存储" : "Storage";
    case "connections":
      return isZh ? "连接" : "Connections";
    case "archived":
      return isZh ? "归档" : "Archive";
  }
}

export function getThinkingLevelLabel(level: PiThinkingLevel, locale: AppLocale): string {
  const isZh = locale === "zh-CN";
  switch (level) {
    case "off":
      return isZh ? "关闭" : "Off";
    case "minimal":
      return isZh ? "极低" : "Minimal";
    case "low":
      return isZh ? "低" : "Low";
    case "medium":
      return isZh ? "中" : "Medium";
    case "high":
      return isZh ? "高" : "High";
    case "xhigh":
      return isZh ? "超高" : "Extra High";
    case "max":
      return isZh ? "最高" : "Max";
  }
}

export function useI18n() {
  const locale = useAppStore((state) => state.locale);
  const setLocale = useAppStore((state) => state.setLocale);
  const isZh = locale === "zh-CN";

  return {
    locale,
    setLocale,
    isZh,
    tr: (zh: string, en: string) => (isZh ? zh : en),
  };
}
