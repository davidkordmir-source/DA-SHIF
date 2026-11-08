const fs = require("node:fs");
const path = require("node:path");
module.exports = async (context) => {
  if (context.electronPlatformName !== "win32") return;
  const RE = await import("resedit");
  const file = path.join(context.appOutDir, "Hamshift.exe");
  const executable = RE.NtExecutable.from(fs.readFileSync(file), {
    ignoreCert: true,
  });
  const resources = RE.NtExecutableResource.from(executable);
  const icon = RE.Data.IconFile.from(
    fs.readFileSync(
      path.join(context.packager.projectDir, "assets/hamshift.ico"),
    ),
  );
  const groups = RE.Resource.IconGroupEntry.fromEntries(resources.entries);
  for (const group of groups)
    RE.Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries,
      group.id,
      group.lang,
      icon.icons.map((i) => i.data),
    );
  if (!groups.length)
    RE.Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries,
      1,
      1033,
      icon.icons.map((i) => i.data),
    );
  const versions = RE.Resource.VersionInfo.fromEntries(resources.entries);
  const version = context.packager.appInfo.version;
  for (const info of versions) {
    const [a, b, c] = version.split(".").map(Number);
    info.setFileVersion(a, b, c, 0, 1033);
    info.setProductVersion(a, b, c, 0, 1033);
    info.setStringValues(
      { lang: 1033, codepage: 1200 },
      {
        FileDescription: "Hamshift — Offline Staff Scheduler",
        ProductName: "Hamshift",
        CompanyName: "Hamshift",
        OriginalFilename: "Hamshift.exe",
        InternalName: "Hamshift",
        LegalCopyright: "Hamshift",
      },
    );
    info.outputToResourceEntries(resources.entries);
  }
  resources.outputResource(executable);
  fs.writeFileSync(file, Buffer.from(executable.generate()));
};
