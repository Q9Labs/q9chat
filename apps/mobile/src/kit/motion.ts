import { useEffect, useState, useSyncExternalStore } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

import { motion } from "../theme/tokens";

export const moveEasing = Easing.bezier(...motion.ease);
/** CSS ease-out, for press feedback. */
export const pressEasing = Easing.bezier(0, 0, 0.58, 1);

let reduced = false;
const listeners = new Set<() => void>();
const setReduced = (on: boolean) => {
  reduced = on;
  for (const listener of listeners) listener();
};

/**
 * The Reduce Motion setting is read once when the app starts and kept here, so the first sheet or
 * toast already knows it. The root holds the splash screen until this settles.
 */
export const reducedMotionLoaded = AccessibilityInfo.isReduceMotionEnabled().then(setReduced, () =>
  setReduced(false),
);
AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const read = () => reduced;

/** True while the system asks for reduced motion; animations then jump to their end state. */
export const useReducedMotion = () => useSyncExternalStore(subscribe, read);

/** One animated 0..1 value that eases toward `to` on `moveEasing`; transform and opacity only. */
export function useEased(to: number, duration: number, from?: number): Animated.Value {
  const off = useReducedMotion();
  const [value] = useState(() => new Animated.Value(from ?? to));
  useEffect(() => {
    if (off) value.setValue(to);
    else
      Animated.timing(value, {
        toValue: to,
        duration,
        easing: moveEasing,
        useNativeDriver: true,
      }).start();
  }, [off, to, duration, value]);
  return value;
}
