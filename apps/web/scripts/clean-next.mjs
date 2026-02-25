import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const nextDir = resolve(process.cwd(), ".next");
if (existsSync(nextDir)) {
  rmSync(nextDir, { recursive: true, force: true });
  console.log(`[helios-web] cleaned ${nextDir}`);
} else {
  console.log(`[helios-web] no cache dir: ${nextDir}`);
}
