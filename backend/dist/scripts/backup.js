"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
async function main() {
    const projectRoot = node_path_1.default.resolve(__dirname, "../..");
    const dbPath = node_path_1.default.join(projectRoot, "dev.db");
    const backupDir = node_path_1.default.join(projectRoot, "backups");
    await promises_1.default.mkdir(backupDir, { recursive: true });
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const outPath = node_path_1.default.join(backupDir, `dev-${stamp}.db`);
    await promises_1.default.copyFile(dbPath, outPath);
    console.log(`Backup created: ${outPath}`);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
