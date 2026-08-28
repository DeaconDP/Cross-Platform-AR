package io.worldbuild.cubear;

import android.os.Bundle;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // SceneView ARSceneView registers these keys on attach. Pre-register before
        // super.onCreate so late attach-after-resume paths do not throw.
        getActivityResultRegistry().register(
            "sceneview_camera_permission",
            new ActivityResultContracts.RequestPermission(),
            granted -> { /* Capacitor CubeAR plugin handles runtime camera */ }
        );
        getActivityResultRegistry().register(
            "sceneview_app_settings",
            new ActivityResultContracts.StartActivityForResult(),
            result -> { }
        );
        super.onCreate(savedInstanceState);
    }
}
