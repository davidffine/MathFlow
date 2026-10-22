package app.mathflow.mobile;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MathFlowNative")
public class MathFlowNativePlugin extends Plugin {
    private volatile boolean active = false;
    private WebView printView;
    public boolean isActive() { return active; }
    @PluginMethod public void setActive(PluginCall call) {
        active = Boolean.TRUE.equals(call.getBoolean("active", false));
        call.resolve();
    }
    public void historyKey(String action) {
        JSObject result = new JSObject(); result.put("action", action);
        notifyListeners("historyKey", result);
    }
    @Override protected void handleOnDestroy() {
        active = false;
        if (printView != null) { printView.destroy(); printView = null; }
    }
    @PluginMethod public void print(PluginCall call) {
        String html = call.getString("html"), title = call.getString("title", "MathFlow");
        if (html == null || html.length() > 20000000) { call.reject("Invalid print document"); return; }
        getActivity().runOnUiThread(() -> {
            if (printView != null) { printView.destroy(); }
            printView = new WebView(getContext());
            WebView view = printView;
            view.getSettings().setJavaScriptEnabled(true);
            view.addJavascriptInterface(new Object() {
                private boolean done = false;
                @JavascriptInterface public void ready() {
                    if (done) return; done = true;
                    getActivity().runOnUiThread(() -> {
                        PrintManager manager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(title);
                        manager.print(title, adapter, new PrintAttributes.Builder()
                            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                            .setColorMode(PrintAttributes.COLOR_MODE_COLOR).build());
                        call.resolve();
                    });
                }
            }, "MathFlowPrint");
            view.setWebViewClient(new WebViewClient() {
                @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) { return getBridge().getLocalServer().shouldInterceptRequest(request); }
                @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) { return true; }
                @Override public void onPageFinished(WebView v, String url) {
                    v.evaluateJavascript("Promise.all([document.fonts.ready,...Array.from(document.images).map(i=>i.decode().catch(()=>{}))]).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>MathFlowPrint.ready())))", null);
                }
            });
            // Local fonts and CSS from the Capacitor asset server; no editor DOM is reused.
            view.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
        });
    }
}
