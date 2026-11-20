package com.techynature.nestwee;

import android.content.Context;
import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    static final String PREFS = "nestwee";
    static final String CRASH_NOTE = "lastCrash";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // NesTwee's own plugin for opening whole story folders.
        registerPlugin(FolderAccessPlugin.class);
        super.onCreate(savedInstanceState);

        // If the page runs out of memory (a very large story), Android would close
        // the whole app. Instead, note it and reopen NesTwee so it can explain.
        bridge.addWebViewListener(
            new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .edit()
                        .putString(CRASH_NOTE, detail != null && detail.didCrash() ? "crash" : "memory")
                        .commit();
                    runOnUiThread(MainActivity.this::recreate);
                    return true;
                }
            }
        );
    }
}
