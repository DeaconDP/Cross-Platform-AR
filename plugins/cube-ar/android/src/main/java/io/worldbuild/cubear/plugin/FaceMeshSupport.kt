package io.worldbuild.cubear.plugin

import com.google.ar.core.CameraConfig
import com.google.ar.core.CameraConfigFilter
import com.google.ar.core.Config
import com.google.ar.core.Session

/**
 * ARCore Augmented Faces teaching session.
 *
 * Front camera + [Config.AugmentedFaceMode.MESH3D]. Plane finding, Instant
 * Placement, depth, and light estimate stay off — they conflict with faces.
 */
internal object FaceMeshSupport {
    fun pickFrontCamera(session: Session): CameraConfig {
        val filter = CameraConfigFilter(session)
            .setFacingDirection(CameraConfig.FacingDirection.FRONT)
        val configs = session.getSupportedCameraConfigs(filter)
        if (configs.isEmpty()) {
            throw IllegalStateException("No front-facing camera config for Augmented Faces")
        }
        return configs[0]
    }

    fun applyToConfig(config: Config) {
        config.augmentedFaceMode = Config.AugmentedFaceMode.MESH3D
        config.planeFindingMode = Config.PlaneFindingMode.DISABLED
        config.instantPlacementMode = Config.InstantPlacementMode.DISABLED
        config.depthMode = Config.DepthMode.DISABLED
        config.lightEstimationMode = Config.LightEstimationMode.DISABLED
        config.cloudAnchorMode = Config.CloudAnchorMode.DISABLED
        config.geospatialMode = Config.GeospatialMode.DISABLED
        config.focusMode = Config.FocusMode.FIXED
        config.updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
    }
}
