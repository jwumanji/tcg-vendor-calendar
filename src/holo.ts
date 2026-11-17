import type { PointerEvent } from "react";

/**
 * Pointer-driven holo tilt + shine for card-like tiles.
 * Writes CSS custom properties straight onto the element (no React re-render).
 * Only active for a real mouse and when the user has not asked for reduced motion.
 */
const motionOk = () =>
  typeof matchMedia === "function" &&
  matchMedia("(hover: hover) and (pointer: fine)").matches &&
  !matchMedia("(prefers-reduced-motion: reduce)").matches;

export const holo = {
  onPointerMove(ev: PointerEvent<HTMLElement>) {
    if (ev.pointerType !== "mouse" || !motionOk()) return;
    const el = ev.currentTarget;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = (ev.clientX - r.left) / r.width;
    const y = (ev.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    el.style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((x - 0.5) * 9).toFixed(2)}deg`);
  },
  onPointerLeave(ev: PointerEvent<HTMLElement>) {
    const el = ev.currentTarget;
    for (const p of ["--mx", "--my", "--rx", "--ry"]) el.style.removeProperty(p);
  },
};
