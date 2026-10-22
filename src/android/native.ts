import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
interface FlowNativePlugin {
  setActive(options: { active: boolean }): Promise<void>;
  addListener(
    event: "historyKey",
    fn: (event: { action: "undo" | "redo" }) => void,
  ): Promise<PluginListenerHandle>;
  print(options: { html: string; title: string }): Promise<void>;
}
export const FlowNative = registerPlugin<FlowNativePlugin>("MathFlowNative");
export const isAndroid = () => Capacitor.getPlatform() === "android";
export async function attachVolumeHistory(undo: () => void, redo: () => void) {
  if (!isAndroid()) return () => {};
  const listener = await FlowNative.addListener("historyKey", (e) =>
    e.action === "undo" ? undo() : redo(),
  );
  await FlowNative.setActive({ active: true });
  return () => {
    void listener.remove();
    void FlowNative.setActive({ active: false });
  };
}
