/**
 * Lance scripts/smoke-test.ts sur une base SQLite neuve, creee dans un dossier
 * temporaire puis supprimee : la base de developpement n'est jamais touchee.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "suitehotel-smoke-"));
const env = { ...process.env, DATABASE_URL: `file:${join(dir, "smoke.db")}` };

try {
  execSync("npx prisma db push --skip-generate", { stdio: ["ignore", "ignore", "inherit"], env });
  execSync("npx tsx scripts/smoke-test.ts", {
    stdio: "inherit",
    env: { ...env, NODE_OPTIONS: "--conditions=react-server" },
  });
} catch {
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
