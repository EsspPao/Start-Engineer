import { spawnSync } from "node:child_process";

const imageName = "Start Engineer.exe";
const sleep = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);

function runningProcessIds() {
  const result = spawnSync("tasklist.exe", ["/FI", `IMAGENAME eq ${imageName}`, "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr?.trim() || "无法检查 Start Engineer 运行状态");
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.toLowerCase().startsWith(`"${imageName.toLowerCase()}"`)).map((line) => Number(line.match(/^"[^"]+","(\d+)"/)?.[1])).filter(Number.isFinite);
}

if (process.platform === "win32") {
  let processIds = runningProcessIds();
  if (processIds.length) {
    console.log(`[package] 检测到正在运行的 Start Engineer（PID: ${processIds.join(", ")}），正在关闭...`);
    spawnSync("taskkill.exe", ["/IM", imageName, "/T"], { encoding: "utf8", windowsHide: true });
    for (let attempt = 0; attempt < 20 && (processIds = runningProcessIds()).length; attempt += 1) sleep(150);
    if (processIds.length) {
      console.log(`[package] 正常关闭未完成，正在结束残留进程（PID: ${processIds.join(", ")}）...`);
      spawnSync("taskkill.exe", ["/F", "/IM", imageName, "/T"], { encoding: "utf8", windowsHide: true });
      for (let attempt = 0; attempt < 20 && (processIds = runningProcessIds()).length; attempt += 1) sleep(150);
    }
    if (processIds.length) {
      console.log("[package] 检测到高权限进程，正在请求管理员权限关闭...");
      const elevated = spawnSync("powershell.exe", ["-NoProfile", "-Command", `Start-Process -FilePath 'taskkill.exe' -ArgumentList '/F','/IM','${imageName}','/T' -Verb RunAs -Wait -WindowStyle Hidden`], { encoding: "utf8", windowsHide: true });
      if (elevated.status === 0) for (let attempt = 0; attempt < 20 && (processIds = runningProcessIds()).length; attempt += 1) sleep(150);
    }
    if (processIds.length) throw new Error(`Start Engineer 仍在运行，已取消打包（PID: ${processIds.join(", ")}）`);
    console.log("[package] Start Engineer 已关闭，可以安全打包。");
  } else {
    console.log("[package] Start Engineer 当前未运行。");
  }
}
