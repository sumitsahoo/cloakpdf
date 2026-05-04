// Shared config for the <Grainient /> backdrop. Anything that mounts
// the gradient (landing hero, layout shell) reads from here so the
// palette and motion stay coherent across surfaces — change once,
// applied everywhere.
//
// Palette is anchored to the brand mark in public/icons/logo.svg
// (Tailwind blue-500 → blue-700). Both modes use blue-500 as
// `color2` so the ribbon weaving through the field is the logo hue.
// Flanking stops are pushed to extreme luminance — pale-on-pale in
// light, deep-cool-on-near-black in dark — so `color2` stands alone
// as the only chromatic anchor.

export const GRAINIENT_LIGHT = {
  color1: "#DBEAFE",
  color2: "#97bcf7",
  color3: "#EFF4FF",
} as const;

export const GRAINIENT_DARK = {
  color1: "#162236",
  color2: "#3B82F6",
  color3: "#0A1020",
} as const;

// Mode-independent motion + saturation knockdown. `saturation: 0.3`
// pulls the chroma down 70% so the brand blue reads as a hint, not a
// wall, and translucent panels layered on top still pick up enough
// tint via backdrop-blur.
export const GRAINIENT_MOTION = {
  timeSpeed: 0.3,
  warpSpeed: 3,
  saturation: 0.3,
} as const;
