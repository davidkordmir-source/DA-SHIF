const fs = require("node:fs");
const path = require("node:path");
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
function imageMime(buffer) {
  if (buffer.length < 12) return null;
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return "image/jpeg";
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}
function loadBranding(directory, defaultLogo) {
  for (const name of [
    "splash-logo.png",
    "splash-logo.jpg",
    "splash-logo.jpeg",
    "splash-logo.webp",
  ]) {
    try {
      const file = path.join(directory, name),
        info = fs.statSync(file);
      if (!info.isFile() || info.size > MAX_LOGO_BYTES) continue;
      const image = fs.readFileSync(file),
        mime = imageMime(image);
      if (mime)
        return {
          custom: true,
          fileName: name,
          logo: `data:${mime};base64,${image.toString("base64")}`,
        };
    } catch {
      /* A missing or invalid custom logo falls back to the app logo. */
    }
  }
  return {
    custom: false,
    fileName: "لوگوی پیش‌فرض هم‌شیفت",
    logo: `data:image/png;base64,${fs.readFileSync(defaultLogo).toString("base64")}`,
  };
}
module.exports = { loadBranding, imageMime, MAX_LOGO_BYTES };
