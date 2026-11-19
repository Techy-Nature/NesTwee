package com.techynature.nestwee;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // NesTwee's own plugin for opening whole story folders.
        registerPlugin(FolderAccessPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
