import type { CSSProperties, ReactNode } from "react";

/**
 * The single owner of scroll in this app.
 *
 * body{overflow:hidden} stops the window scrolling like a web page,
 * which means any screen rendered at the top level has to provide its
 * own scroll region. Setup shipped without one and its lower half was
 * unreachable. Every top-level screen goes through this component so
 * that cannot happen again (see tests/ui/scroll.test.tsx).
 */
export const Page = ({
  children,
  maxWidth,
  padding = "var(--space-7) var(--space-6)",
  style,
}: {
  children: ReactNode;
  /** Centres the content column when set. */
  maxWidth?: number;
  padding?: string;
  style?: CSSProperties;
}) => (
  <div
    style={{
      height: "100%",
      overflowY: "auto",
      overflowX: "hidden",
      position: "relative",
      ...style,
    }}
  >
    <div style={{ maxWidth, margin: maxWidth ? "0 auto" : undefined, padding }}>{children}</div>
  </div>
);
