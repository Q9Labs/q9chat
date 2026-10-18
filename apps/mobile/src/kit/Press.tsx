import { useState } from "react";
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { pressEasing, useReducedMotion } from "./motion";
import { motion } from "../theme/tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, "style" | "children"> & {
  /** Scale while pressed: 0.97 for buttons, 0.92 for icon buttons, like the mock's :active. */
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function Press({ scaleTo = 0.97, style, children, onPressIn, onPressOut, ...rest }: Props) {
  const [scale] = useState(() => new Animated.Value(1));
  const reduced = useReducedMotion();
  const to = (value: number) => {
    if (!reduced) Animated.timing(scale, { toValue: value, duration: motion.press, easing: pressEasing, useNativeDriver: true }).start();
  };
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        to(scaleTo);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        to(1);
        onPressOut?.(event);
      }}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
