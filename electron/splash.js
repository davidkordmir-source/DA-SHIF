const theme = new URLSearchParams(location.search).get("theme");
document.getElementById("splash-logo").addEventListener(
  "error",
  (event) => {
    event.target.src = "../assets/hamshift.png";
  },
  { once: true },
);
if (
  ["emerald", "violet", "ocean", "sunset", "rose", "midnight"].includes(theme)
)
  document.getElementById("splash").dataset.theme = theme;
window.desktop
  .branding()
  .then((result) => {
    if (result.logo) document.getElementById("splash-logo").src = result.logo;
  })
  .catch(() => {});
