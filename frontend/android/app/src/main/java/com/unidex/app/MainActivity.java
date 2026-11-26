package com.unidex.app;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int BRAND_NAV = Color.parseColor("#0F172A");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Draw behind the status and gesture bars. The web shell pads itself
        // with the safe-area values Capacitor injects.
        EdgeToEdge.enable(
            this,
            SystemBarStyle.dark(BRAND_NAV),
            SystemBarStyle.dark(BRAND_NAV)
        );
        super.onCreate(savedInstanceState);
        getWindow().setBackgroundDrawable(new ColorDrawable(BRAND_NAV));
    }
}
