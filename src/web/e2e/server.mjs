import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
const root = mkdtempSync(tmpdir() + "/beast-browser-");
writeFileSync(resolve("../../.local/browser/root.txt"), root);
const proc = spawn(
  process.env.DOTNET || "dotnet",
  [
    resolve("../BeastCloud.Server/bin/Debug/net10.0/BeastCloud.Server.dll"),
    "--contentRoot",
    resolve("../BeastCloud.Server"),
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      BEAST_ROOT: root,
      ASPNETCORE_ENVIRONMENT: "Development",
      ASPNETCORE_URLS: "http://127.0.0.1:5090",
    },
  },
);
function stop() {
  proc.kill();
  setTimeout(() => {
    rmSync(root, { recursive: true, force: true });
    process.exit();
  }, 500);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
proc.on("exit", () => process.exit());
