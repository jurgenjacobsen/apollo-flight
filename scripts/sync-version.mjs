import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const pkgPath = path.join(rootDir, "package.json");
const cargoPath = path.join(rootDir, "src-tauri", "Cargo.toml");
const tauriConfPath = path.join(rootDir, "src-tauri", "tauri.conf.json");

const args = process.argv.slice(2);
const isCheck = args.includes("--check");
const explicitVersion = args.find((a) => !a.startsWith("-"));

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const cargoRaw = fs.readFileSync(cargoPath, "utf8");
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));

const cargoVersionMatch = cargoRaw.match(
    /^(\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m,
);
if (!cargoVersionMatch) {
    console.error("Could not find [package] version in src-tauri/Cargo.toml");
    process.exit(1);
}

const cargoVersion = cargoVersionMatch[2];
const tauriVersion = tauriConf.version;
const pkgVersion = pkg.version;

if (isCheck) {
    const mismatches = [];
    if (cargoVersion !== pkgVersion) {
        mismatches.push(`src-tauri/Cargo.toml (${cargoVersion})`);
    }
    if (tauriVersion !== pkgVersion) {
        mismatches.push(`src-tauri/tauri.conf.json (${tauriVersion})`);
    }
    if (mismatches.length > 0) {
        console.error(
            `Version mismatch! package.json is ${pkgVersion}, but differs from: ${mismatches.join(", ")}. Run "pnpm version:sync" to align.`,
        );
        process.exit(1);
    }
    console.log(`All package versions are synchronized at ${pkgVersion}`);
    process.exit(0);
}

const targetVersion = explicitVersion || pkgVersion;
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(targetVersion)) {
    console.error(`Invalid semver version: "${targetVersion}"`);
    process.exit(1);
}

if (pkg.version !== targetVersion) {
    pkg.version = targetVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
}

if (cargoVersion !== targetVersion) {
    const updatedCargo = cargoRaw.replace(
        /^(\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m,
        `$1${targetVersion}$3`,
    );
    fs.writeFileSync(cargoPath, updatedCargo, "utf8");
}

if (tauriVersion !== targetVersion) {
    tauriConf.version = targetVersion;
    fs.writeFileSync(
        tauriConfPath,
        JSON.stringify(tauriConf, null, 2) + "\n",
        "utf8",
    );
}

console.log(
    `Synchronized package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json to ${targetVersion}`,
);
