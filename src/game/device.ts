/** True on a phone or tablet: the primary pointer is coarse (a finger), or it has touch and a small screen. */
export function isPhone(): boolean {
  if (window.matchMedia?.("(pointer: coarse)").matches) return true;
  return (
    navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 820
  );
}
