import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import { App } from "./App";
import { applyThemePalette } from "./theme/themePalette";
import { transport } from "@pi-web/client-runtime";
import "./index.css";

// 默认 t3-chat 主题；light/dark 跟随系统（index.html 引导脚本先打 .dark class，
// 这里按同一条件把 appearance 传给调色板）。对齐 t3code useTheme 的行为。
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  applyThemePalette("t3-chat", prefersDark.matches ? "dark" : "light");
}
applyTheme();
prefersDark.addEventListener("change", applyTheme);

transport.start();

createRoot(document.getElementById("root")!).render(<App />);
