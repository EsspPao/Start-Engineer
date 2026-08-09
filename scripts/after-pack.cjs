const { rm } = require("node:fs/promises");
const { isAbsolute, relative, resolve } = require("node:path");

module.exports = async function removeUnusedElectronFiles(context) {
  if (context.electronPlatformName && context.electronPlatformName !== "win32") {
    return;
  }

  const appOutDir = resolve(context.appOutDir);
  const targets = [
    resolve(appOutDir, "resources", "default_app.asar"),
    resolve(appOutDir, "resources", "app-update.yml"),
    resolve(appOutDir, "version")
  ];

  for (const target of targets) {
    const relativeTarget = relative(appOutDir, target);
    if (!relativeTarget || isAbsolute(relativeTarget) || relativeTarget.startsWith("..")) {
      throw new Error(`Refusing to remove a path outside the packaged application: ${target}`);
    }
    await rm(target, { force: true });
  }
};
