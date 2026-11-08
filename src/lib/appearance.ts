export const themes = [
  {
    id: "emerald",
    name: "باغ زمرد",
    note: "آرام و الهام‌بخش",
    primary: "#147e68",
    surface: "#f3faf6",
    ink: "#244c40",
    dark: false,
  },
  {
    id: "violet",
    name: "یاس بنفش",
    note: "خلاق و متفاوت",
    primary: "#7c55c6",
    surface: "#f7f3ff",
    ink: "#493565",
    dark: false,
  },
  {
    id: "ocean",
    name: "آبی اقیانوس",
    note: "شفاف و متمرکز",
    primary: "#247bbc",
    surface: "#eff7ff",
    ink: "#234c6d",
    dark: false,
  },
  {
    id: "sunset",
    name: "غروب طلایی",
    note: "گرم و صمیمی",
    primary: "#b56835",
    surface: "#fff8ef",
    ink: "#78503b",
    dark: false,
  },
  {
    id: "rose",
    name: "شکوفهٔ رز",
    note: "لطیف و دلنشین",
    primary: "#bb567d",
    surface: "#fff4f8",
    ink: "#6d354b",
    dark: false,
  },
  {
    id: "midnight",
    name: "شب آرام",
    note: "تاریک و چشم‌نواز",
    primary: "#72d6b5",
    surface: "#121d29",
    ink: "#eef8f4",
    dark: true,
  },
] as const;
export const fonts = [
  {
    id: "vazirmatn",
    name: "وزیرمتن",
    note: "روان و آشنا",
    family: "Vazirmatn Variable",
  },
  {
    id: "estedad",
    name: "استعداد",
    note: "مدرن و هندسی",
    family: "Estedad Variable",
  },
  {
    id: "noto",
    name: "نوتو عربی",
    note: "نرم و خوانا",
    family: "Noto Sans Arabic Variable",
  },
] as const;
export type Appearance = {
  theme: (typeof themes)[number]["id"];
  font: (typeof fonts)[number]["id"];
};
export const defaultAppearance: Appearance = {
  theme: "emerald",
  font: "vazirmatn",
};
export function validAppearance(value: unknown): value is Appearance {
  if (!value || typeof value !== "object") return false;
  const a = value as Appearance;
  return (
    themes.some((t) => t.id === a.theme) && fonts.some((f) => f.id === a.font)
  );
}
