import { spawn } from "node:child_process";

const electronEnv = {
  ...process.env,
  VITE_DEV_SERVER_URL: "http://127.0.0.1:5173"
};

const children = new Set();

const run = (command, args, options = {}) => {
  const child = spawn(command, args, {
    shell: process.platform === "win32",
    ...options
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
};

const stopAll = () => {
  for (const child of children) {
    child.kill();
  }
};

const electronBuild = run("npx", ["tsc", "-p", "tsconfig.electron.json", "--watch"], {
  env: electronEnv,
  stdio: "inherit"
});

let electron;
let stopped = false;

const startElectron = () => {
  if (electron || stopped) {
    return;
  }

  electron = run("npx", ["electron", "."], {
    env: electronEnv,
    stdio: "inherit"
  });

  electron.on("exit", () => {
    stopAll();
    process.exit(0);
  });
};

const vite = run("npx", ["vite", "--host", "127.0.0.1"], {
  env: electronEnv,
  stdio: "inherit"
});

const waitForVite = async () => {
  for (let attempt = 0; attempt < 200 && !stopped; attempt += 1) {
    try {
      const response = await fetch(electronEnv.VITE_DEV_SERVER_URL);
      if (response.ok) {
        startElectron();
        return;
      }
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

void waitForVite();

process.on("SIGINT", () => {
  stopped = true;
  stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopped = true;
  stopAll();
  process.exit(0);
});
