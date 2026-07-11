import type { UiTheme } from "../shared/types";

export const themeOptions: Array<{ id: UiTheme; name: string; description: string; title?: string }> = [
  { id: "apple", name: "Apple Gallery", description: "黑白画廊、蓝色胶囊与克制陈列" },
  { id: "fluent", name: "Fluent 任务中心", description: "清爽原生的 Windows 11 风格" },
  { id: "midnight", name: "Midnight Control", description: "高对比深色控制中心" },
  { id: "utility", name: "Modern Utility", description: "暖白、深色侧栏与亮绿强调" },
  { id: "glass", name: "Refined Glass", description: "克制的蓝紫玻璃质感" },
  { id: "wallpaper", name: "Wallpaper Glass", description: "壁纸融合玻璃", title: "窗口背景透出壁纸，适合隐藏桌面图标和自动隐藏任务栏的桌面启动面板。" },
  { id: "system", name: "跟随 Windows", description: "浅色 Utility，深色 Midnight" },
];
