import { useEffect, useRef } from "react";

// Moves focus to the screen heading when the screen appears, so keyboard and screen-reader
// users are not left on <body> after a transition. `enabled: false` skips it (fast cold start).
export function useScreenFocus(enabled = true) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (enabled) ref.current?.focus();
  }, [enabled]);
  return ref;
}
