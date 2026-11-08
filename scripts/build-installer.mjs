import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { getMakeNsisPath } = require("app-builder-lib/out/toolsets/windows.js");
const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
// Remove only files shipped by us on uninstall. Never recursively remove a
// user-selected install directory, custom logos, or staff data.
const files = [],
  directories = [];
function scan(folder, relative = "") {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const rel = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      directories.push(rel);
      scan(path.join(folder, entry.name), rel);
    } else files.push(rel);
  }
}
scan("out/win-unpacked");
const nsisPath = (name) =>
  name.replaceAll("\\", "/").replaceAll("$", "$$").replaceAll("/", "\\");
fs.writeFileSync(
  "out/uninstall-files.nsh",
  [
    ...files.map((name) => `Delete "$INSTDIR\\${nsisPath(name)}"`),
    ...directories
      .sort((a, b) => b.length - a.length)
      .map((name) => `RMDir "$INSTDIR\\${nsisPath(name)}"`),
  ].join("\n"),
);
const compiler = await getMakeNsisPath("1.2.1");
const args = [
  `-DPROJECT_ROOT=${process.cwd()}`,
  `-DAPP_VERSION=${version}`,
  path.resolve("installer/hamshift.nsi"),
];
const child = spawn(compiler.path, args, {
  stdio: "inherit",
  env: { ...process.env, ...compiler.env },
});
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
