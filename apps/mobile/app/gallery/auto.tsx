import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { STATES } from "../../src/gallery/states";
import { ThemeProvider } from "../../src/theme";

const SETTLE_MS = 1800;
const SCHEMES = ["light", "dark"] as const;
const STEPS = SCHEMES.flatMap((scheme) => STATES.map((state) => ({ scheme, state })));

/** Dev-only screenshot harness: shows each state, then asks the host server on :9099 to capture it. */
export default function GalleryAuto() {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!step) return;
      fetch(`http://localhost:9099/shot?name=${step.state.id}-${step.scheme}`)
        .catch(() => null)
        .finally(() => setIndex((current) => current + 1));
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [step]);
  if (!__DEV__) return <Redirect href="/" />;
  if (!step) return null;
  return (
    <ThemeProvider key={`${step.state.id}-${step.scheme}`} scheme={step.scheme}>
      <StatusBar style={step.scheme === "dark" ? "light" : "dark"} />
      {step.state.render()}
    </ThemeProvider>
  );
}
