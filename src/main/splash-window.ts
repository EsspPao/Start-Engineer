import type { BrowserWindowConstructorOptions } from "electron";

type MinimalWindow = {
  once: (event: "ready-to-show", handler: () => void) => void;
  webContents?: {
    once: (event: "did-fail-load", handler: () => void) => void;
  };
};

type MinimalSplashWindow = {
  isDestroyed: () => boolean;
  destroy: () => void;
};

export function splashWindowOptions(iconPath: string): BrowserWindowConstructorOptions {
  return {
    width: 420,
    height: 260,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    show: true,
    center: true,
    skipTaskbar: true,
    title: "Start Engineer",
    icon: iconPath,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
}

export function buildSplashHtml(iconUrl: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Start Engineer</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body {
      display: grid;
      place-items: center;
      color: #172033;
      background: transparent;
      font-family: "Segoe UI Variable", "Microsoft YaHei UI", "Segoe UI", system-ui, sans-serif;
      user-select: none;
    }
    .shell {
      display: grid;
      place-items: center;
      gap: 16px;
      width: 100%;
      height: 100%;
      border: 1px solid rgba(255,255,255,.72);
      border-radius: 24px;
      background:
        radial-gradient(circle at 18% 8%, rgba(184,226,58,.24), transparent 34%),
        radial-gradient(circle at 88% 20%, rgba(90,189,225,.18), transparent 36%),
        linear-gradient(135deg, rgba(255,253,248,.94), rgba(241,237,228,.92));
      box-shadow: 0 24px 70px rgba(28,35,31,.24), inset 0 1px 0 rgba(255,255,255,.78);
    }
    .brand {
      display: grid;
      justify-items: center;
      gap: 10px;
      transform: translateY(3px);
    }
    .mark {
      display: grid;
      place-items: center;
      width: 68px;
      height: 68px;
      border-radius: 18px;
      background: linear-gradient(145deg,#52c8ed,#6370f3 55%,#9361eb);
      box-shadow: 0 14px 30px rgba(58,79,158,.24), 0 0 0 1px rgba(255,255,255,.5) inset;
      animation: breathe 1800ms ease-in-out infinite;
    }
    .mark img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: inherit;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 760;
      letter-spacing: -.3px;
    }
    .loader {
      display: flex;
      gap: 7px;
      height: 10px;
      align-items: center;
    }
    .loader i {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: #93b92e;
      box-shadow: 0 0 14px rgba(147,185,46,.4);
      animation: pulse 900ms ease-in-out infinite;
    }
    .loader i:nth-child(2) { animation-delay: 120ms; }
    .loader i:nth-child(3) { animation-delay: 240ms; }
    @keyframes pulse {
      0%, 100% { opacity: .35; transform: translateY(0) scale(.82); }
      50% { opacity: 1; transform: translateY(-2px) scale(1); }
    }
    @keyframes breathe {
      0%, 100% { transform: scale(1); filter: saturate(1); }
      50% { transform: scale(1.035); filter: saturate(1.08); }
    }
    @media (prefers-reduced-motion: reduce) {
      .mark, .loader i { animation-duration: 1ms; }
    }
  </style>
</head>
<body>
  <main class="shell" aria-label="Start Engineer 正在启动">
    <section class="brand">
      <div class="mark"><img src="${iconUrl}" alt="" /></div>
      <h1>Start Engineer</h1>
      <div class="loader" aria-hidden="true"><i></i><i></i><i></i></div>
    </section>
  </main>
</body>
</html>`;
}

export function splashHtmlDataUrl(iconUrl: string) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildSplashHtml(iconUrl))}`;
}

export function destroySplash(splashWindow: MinimalSplashWindow | null | undefined) {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
}

export function wireSplashToMainWindow(mainWindow: MinimalWindow, splashWindow: MinimalSplashWindow | null, showMainWindow: () => void, showLoadFailure?: () => void) {
  mainWindow.once("ready-to-show", () => {
    showMainWindow();
    destroySplash(splashWindow);
  });
  mainWindow.webContents?.once("did-fail-load", () => {
    destroySplash(splashWindow);
    showLoadFailure?.();
  });
}
