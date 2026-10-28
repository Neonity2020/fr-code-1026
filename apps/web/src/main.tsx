import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import { App } from "./App";
import { refreshAppearance } from "./theme/appearancePreference";
import { transport } from "@pi-web/client-runtime";
import "./index.css";

// 默认黑白主题；外观（浅色 / 深色 / 跟随系统）来自本地偏好，
// 系统配色变化时重新解析。对齐 t3code themeBoot / appearance 的行为。
refreshAppearance();
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
prefersDark.addEventListener("change", refreshAppearance);

transport.start();

createRoot(document.getElementById("root")!).render(<App />);
