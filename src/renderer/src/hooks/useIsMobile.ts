import { useEffect, useState } from "react";

// Phones in portrait, and phones in landscape (short, touch-driven screens).
const QUERY = "(max-width: 767px), (pointer: coarse) and (max-height: 500px)";

const matches = () =>
  // The mobile layout needs the host shim; a narrow desktop window keeps the
  // regular layout.
  window.terraForgeMobile !== undefined && window.matchMedia(QUERY).matches;

/** True on phone-sized screens in the mobile build; switches to the single-pane layout. */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(matches);
  useEffect(() => {
    if (window.terraForgeMobile === undefined) return;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setMobile(matches());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}
