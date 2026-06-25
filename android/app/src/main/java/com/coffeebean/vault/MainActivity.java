package com.coffeebean.vault;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(CoffeeLabelScannerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
