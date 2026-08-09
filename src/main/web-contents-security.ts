type NavigationEvent = { preventDefault: () => void };
type PermissionCallback = (allowed: boolean) => void;

type HardenableWebContents = {
  on: (event: "will-navigate", listener: (event: NavigationEvent) => void) => unknown;
  setWindowOpenHandler: (handler: () => { action: "deny" }) => unknown;
  session: {
    setPermissionRequestHandler: (
      handler: (webContents: unknown, permission: string, callback: PermissionCallback) => void
    ) => void;
  };
};

export function hardenWebContents(webContents: HardenableWebContents) {
  webContents.on("will-navigate", (event) => event.preventDefault());
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}
