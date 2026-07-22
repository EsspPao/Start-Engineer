import type { UiTheme } from "../shared/types";

export const themeOptions: Array<{ id: UiTheme; name: string; description: string; title?: string }> = [
  { id: "apple", name: "Apple Gallery", description: "银白玻璃与克制的苹果蓝" },
  { id: "fluent", name: "Fluent Workspace", description: "冷灰蓝玻璃与 Windows 蓝" },
  { id: "midnight", name: "Midnight Control", description: "深墨玻璃与青绿色焦点" },
  { id: "utility", name: "Modern Utility", description: "浅灰绿玻璃与自然绿色" },
  { id: "glass", name: "Refined Glass", description: "雾白青玻璃与松石绿色" },
  { id: "wallpaper", name: "Wallpaper Glass", description: "中性玻璃，让桌面壁纸成为主角", title: "窗口背景透出壁纸，控件会根据明暗模式调整对比度。" },
  { id: "clear", name: "Clear Desktop", description: "无模糊透明，让桌面壁纸直接透出", title: "参考 TranslucentTB Clear 效果：移除整屏底色与模糊，仅为交互状态保留轻量承载。" },
  { id: "system", name: "跟随 Windows", description: "浅色冷灰蓝，深色墨青" },
];
