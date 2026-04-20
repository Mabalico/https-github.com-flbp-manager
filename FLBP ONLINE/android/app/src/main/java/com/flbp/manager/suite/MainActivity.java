package com.flbp.manager.suite;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FLBPAppSettingsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
