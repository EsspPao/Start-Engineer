import type { UiTheme } from "../shared/types";

export const themeOptions: Array<{ id: UiTheme; name: string; description: string; title?: string }> = [
  { id: "apple", name: "Apple Gallery", description: "黑白画廊与克制的蓝色焦点" },
  { id: "fluent", name: "Fluent Workspace", description: "冷灰工作台与 Windows 蓝色焦点" },
  { id: "midnight", name: "Midnight Control", description: "近黑控制台与青绿状态提示" },
  { id: "utility", name: "Modern Utility", description: "深色工具栏、冷白画布与自然强调" },
  { id: "glass", name: "Refined Glass", description: "清透中性玻璃与多色状态层级" },
  { id: "wallpaper", name: "Wallpaper Glass", description: "自由壁纸与自适应中性玻璃", title: "窗口背景透出壁纸，可调整图片焦点、显示方式与玻璃对比度。" },
  { id: "system", name: "跟随 Windows", description: "浅色 Fluent，深色 Midnight" },
];
