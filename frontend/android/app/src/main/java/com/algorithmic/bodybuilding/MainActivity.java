package com.algorithmic.bodybuilding;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(FolderPickerPlugin.class);
        registerPlugin(StopwatchPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
