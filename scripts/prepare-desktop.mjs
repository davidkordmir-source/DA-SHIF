import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("assets", { recursive: true });
copyFileSync(
  "node_modules/@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2",
  "assets/vazirmatn.woff2",
);
mkdirSync("assets/font-licenses", { recursive: true });
for (const name of [
  "vazirmatn",
  "estedad",
  "noto-sans-arabic",
  "readex-pro",
  "markazi-text",
  "baloo-bhaijaan-2",
  "noto-naskh-arabic",
])
  copyFileSync(
    `node_modules/@fontsource-variable/${name}/LICENSE`,
    `assets/font-licenses/${name}.txt`,
  );

for (const name of ["lalezar", "amiri", "ibm-plex-sans-arabic"])
  copyFileSync(
    `node_modules/@fontsource/${name}/LICENSE`,
    `assets/font-licenses/${name}.txt`,
  );
