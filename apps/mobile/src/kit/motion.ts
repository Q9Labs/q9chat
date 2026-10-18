import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

import { motion } from "../theme/tokens";

export const moveEasing = Easing.bezier(...motion.ease);
/** CSS ease-out, for press feedback. */
export const pressEasing = Easing.bezier(0, 0, 0.58, 1);

/** True while the system asks for reduced motion; animations then jump to their end state. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setReduced(on);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** One animated 0..1 value that eases toward `to` on `moveEasing`; transform and opacity only. */
export function useEased(to: number, duration: number, from?: number): Animated.Value {
  const reduced = useReducedMotion();
  const [value] = useState(() => new Animated.Value(from ?? to));
  useEffect(() => {
    if (reduced) value.setValue(to);
    else
      Animated.timing(value, {
        toValue: to,
        duration,
        easing: moveEasing,
        useNativeDriver: true,
      }).start();
  }, [reduced, to, duration, value]);
  return value;
}
