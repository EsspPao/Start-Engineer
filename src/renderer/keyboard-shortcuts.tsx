export type KeyboardShortcutHelpItem = {
  keys: string;
  label: string;
};

export const keyboardShortcutHelpItems: KeyboardShortcutHelpItem[] = [
  { keys: "方向键 / WASD", label: "在应用卡片之间移动选择" },
  { keys: "Enter", label: "启动未运行应用，或唤起运行中应用" },
  { keys: "Space", label: "切换当前应用是否加入一键启动" },
  { keys: "Esc", label: "关闭搜索、菜单、弹窗，或取消当前选择" },
  { keys: "Menu / Shift+F10", label: "打开当前应用更多菜单" },
  { keys: "F2", label: "重命名当前应用" },
  { keys: "Ctrl+↑/↓ / Ctrl+W/S", label: "切换上一个或下一个分组" },
  { keys: "Ctrl+1/2/3", label: "直接切换到第 1/2/3 个应用分组" },
  { keys: "Ctrl+F", label: "聚焦搜索框" }
];

export function KeyboardShortcutPanel() {
  return <div className="shortcut-help-grid">
    {keyboardShortcutHelpItems.map((item) => <div className="shortcut-help-row" key={item.keys}>
      <kbd>{item.keys}</kbd>
      <span>{item.label}</span>
    </div>)}
  </div>;
}
