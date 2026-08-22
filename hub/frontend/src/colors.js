// Shared "what color should this on/off indicator be" rule for lights,
// room-summary dots, and the room-level toggle circle. Hue smart plugs and
// other colorless devices have no color_hex at all (see Light.dimmable in
// the proto) -- without a fallback, an "on" plug's dot renders identical to
// an "off" one but for a subtle opacity change, easy to miss at a glance.
export function swatchColor(on, colorHex) {
  if (!on) return undefined; // CSS's .off class already dims/grays this.
  return colorHex || "var(--on-neutral)";
}
