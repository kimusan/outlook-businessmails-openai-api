const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const seaDir = path.join(rootDir, ".sea");
const seaConfigPath = path.join(seaDir, "sea-config.json");
const mainScriptPath = path.join(rootDir, "local-host", "sea-main.cjs");
const blobOutputPath = path.join(seaDir, "sea-prep.blob");

function main() {
  if (!fs.existsSync(mainScriptPath)) {
    throw new Error(`SEA main script not found: ${mainScriptPath}`);
  }

  fs.mkdirSync(seaDir, { recursive: true });

  const config = {
    main: mainScriptPath,
    output: blobOutputPath,
    disableExperimentalSEAWarning: true,
  };

  fs.writeFileSync(seaConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote SEA config to ${seaConfigPath}\n`);
}

main();
