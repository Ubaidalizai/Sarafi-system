import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const projectRoot = path.resolve(__dirname, "../..");
  const dbPath = path.join(projectRoot, "dev.db");
  const backupDir = path.join(projectRoot, "backups");
  await fs.mkdir(backupDir, { recursive: true });

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(backupDir, `dev-${stamp}.db`);

  await fs.copyFile(dbPath, outPath);
  console.log(`Backup created: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

