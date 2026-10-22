import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "app.mathflow.mobile",
  appName: "MathFlow",
  webDir: "dist",
  android: { backgroundColor: "#f1f3f2" },
  plugins: { Keyboard: { resize: "native" } },
};
export default config;
