package app.mathflow.mobile;

import android.os.Bundle;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(MathFlowNativePlugin.class);
        super.onCreate(state);
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        int key = event.getKeyCode();
        if (hasWindowFocus() && (key == KeyEvent.KEYCODE_VOLUME_DOWN || key == KeyEvent.KEYCODE_VOLUME_UP)
                && bridge != null && bridge.getPlugin("MathFlowNative") != null) {
            MathFlowNativePlugin plugin = (MathFlowNativePlugin) bridge.getPlugin("MathFlowNative").getInstance();
            if (plugin.isActive()) {
                if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                    plugin.historyKey(key == KeyEvent.KEYCODE_VOLUME_DOWN ? "undo" : "redo");
                }
                // Consume DOWN, repeat and UP. AudioManager must not change the volume.
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }
}
