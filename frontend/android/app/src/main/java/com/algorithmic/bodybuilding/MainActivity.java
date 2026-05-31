package com.algorithmic.bodybuilding;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(FolderPickerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
