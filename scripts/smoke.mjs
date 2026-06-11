import { spawn } from "node:child_process";

const child = spawn("npx", ["electron", "."], {
  shell: process.platform === "win32",
  env: { ...process.env, STAR_ENGINEER_SMOKE: "1" },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

const timeout = setTimeout(() => {
  child.kill();
  console.error(output || "Electron smoke test timed out.");
  process.exitCode = 1;
}, 15000);

child.on("exit", (code) => {
  clearTimeout(timeout);
  if (code === 0 && output.includes("STAR_ENGINEER_SMOKE_READY")) {
    console.log("Electron production smoke test passed.");
    return;
  }
  console.error(output || `Electron exited with code ${code}.`);
  process.exitCode = 1;
});
