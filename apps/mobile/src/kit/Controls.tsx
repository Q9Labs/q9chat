import { useEffect, useState, type ReactNode } from "react";
import { Animated, I18nManager, View } from "react-native";

import { useTheme } from "../theme";
import { T } from "../theme/Text";
import { motion } from "../theme/tokens";
import { moveEasing, useReducedMotion } from "./motion";
import { Press } from "./Press";

/** The knob slides toward the end edge, which is the left one in a right-to-left layout. */
const KNOB_TRAVEL = I18nManager.isRTL ? -14 : 14;

/** 36 by 22 switch; the thumb moves 14px on transform only. */
export function Switch({
  on,
  onChange,
  label,
  children,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const [x] = useState(() => new Animated.Value(on ? KNOB_TRAVEL : 0));
  useEffect(() => {
    if (reduced) x.setValue(on ? KNOB_TRAVEL : 0);
    else
      Animated.timing(x, {
        toValue: on ? KNOB_TRAVEL : 0,
        duration: 150,
        easing: moveEasing,
        useNativeDriver: true,
      }).start();
  }, [on, reduced, x]);
  return (
    <Press
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={() => onChange(!on)}
      scaleTo={1}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 48,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 12,
      }}
    >
      {children}
      <View style={{ width: 36, height: 22, borderRadius: 999, backgroundColor: on ? c.tx : c.s3 }}>
        <Animated.View
          style={{
            position: "absolute",
            top: 3,
            start: 3,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: on ? c.s0 : "#ffffff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
            transform: [{ translateX: x }],
          }}
        />
      </View>
    </Press>
  );
}

export type RadioOption<V extends string> = {
  value: V;
  label: string;
  suffix?: string;
  hint?: string;
};

/** The mock's ring is 1.5px, but Chromium floors a border to whole CSS pixels, so it paints 1px (3 device pixels at 3x). 1.5 here would paint 5. */
const RING = 1;

/** One radio row: 18px ring with a 9px dot, bold label, muted hint. */
export function RadioList<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly RadioOption<V>[];
  value: V | null;
  onChange: (next: V) => void;
  label: string;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <Press
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked }}
            onPress={() => onChange(option.value)}
            scaleTo={1}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 9,
            }}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                borderWidth: RING,
                borderColor: checked ? c.tx : c.mu,
                marginTop: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {checked ? (
                <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: c.tx }} />
              ) : null}
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <T weight={600}>
                {option.label}
                {option.suffix ? (
                  <T weight={400} color="mu">
                    {` · ${option.suffix}`}
                  </T>
                ) : null}
              </T>
              {option.hint ? (
                <T size={12.5} color="mu" lineHeight={17.5}>
                  {option.hint}
                </T>
              ) : null}
            </View>
          </Press>
        );
      })}
    </View>
  );
}

export function PopIn({ children, active }: { children: ReactNode; active: boolean }) {
  const [scale] = useState(() => new Animated.Value(active ? 0.5 : 1));
  const reduced = useReducedMotion();
  useEffect(() => {
    if (active && !reduced) {
      scale.setValue(0.5);
      Animated.timing(scale, {
        toValue: 1,
        duration: motion.pop,
        easing: moveEasing,
        useNativeDriver: true,
      }).start();
    }
  }, [active, reduced, scale]);
  return (
    <Animated.View
      style={{
        transform: [{ scale }],
        opacity: scale.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1] }),
      }}
    >
      {children}
    </Animated.View>
  );
}
