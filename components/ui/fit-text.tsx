"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * One-line text that auto-shrinks until it fits its container (used for big
 * monetary figures like "$50,000,000.00" that would otherwise spill out of a
 * balance card). Inherits the font size from its classes, then scales the font
 * down in whole px steps until the line fits; hard-caps at `min` px and then
 * clips instead of overflowing the layout.
 */
export function FitText({
  children,
  className,
  min = 12,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  min?: number;
  title?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let lastPx = 0;
    const fit = () => {
      if (!ref.current) return;
      const styles = window.getComputedStyle(el);
      const base = lastPx || parseFloat(styles.fontSize) || 32;
      if (el.scrollWidth <= el.clientWidth + 1) {
        // Fits at the class size — keep the CSS value (no inline override).
        if (lastPx) {
          el.style.fontSize = "";
          lastPx = 0;
        }
        return;
      }
      let px = base;
      let guard = 0;
      while (el.scrollWidth > el.clientWidth + 1 && px > min && guard++ < 120) {
        px -= 1;
        el.style.fontSize = `${Math.max(min, px)}px`;
      }
      lastPx = px <= min ? min : px;
    };

    fit();
    // Re-measure on resize (and after webfont swap, a tick later).
    window.addEventListener("resize", fit);
    const id = window.setTimeout(fit, 60);
    return () => {
      window.removeEventListener("resize", fit);
      window.clearTimeout(id);
    };
  }, [children, min]);

  return (
    <span
      ref={ref}
      title={title}
      className={cn(
        "block max-w-full overflow-hidden whitespace-nowrap",
        className
      )}
    >
      {children}
    </span>
  );
}
