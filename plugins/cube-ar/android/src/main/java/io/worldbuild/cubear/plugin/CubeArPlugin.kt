package io.worldbuild.cubear.plugin

import android.Manifest
import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Color
import android.opengl.Matrix
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.getcapacitor.Logger
import com.google.ar.core.ArCoreApk
import com.google.ar.core.AugmentedFace
import com.google.ar.core.AugmentedImage
import com.google.ar.core.Config
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import com.google.ar.core.HitResult
import com.google.ar.core.InstantPlacementPoint
import com.google.ar.core.LightEstimate
import com.google.ar.core.Plane
import com.google.ar.core.PointCloud
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.UnavailableDeviceNotCompatibleException
import com.google.ar.core.exceptions.UnavailableUserDeclinedInstallationException
import io.github.sceneview.SceneView
import io.github.sceneview.ar.ARSceneView
import io.github.sceneview.ar.node.AnchorNode
import io.github.sceneview.ar.node.PoseNode
import io.github.sceneview.loaders.MaterialLoader
import java.nio.ByteOrder
import dev.romainguy.kotlin.math.Float3
import dev.romainguy.kotlin.math.Quaternion
import io.github.sceneview.math.Color as SceneColor
import io.github.sceneview.math.Direction
import io.github.sceneview.math.Position
import io.github.sceneview.math.Rotation
import io.github.sceneview.math.Scale
import io.github.sceneview.math.Size
import io.github.sceneview.node.CubeNode
import kotlin.math.atan2
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

private enum class CubeARTechnique {
    PLACE, POINTS, DEPTH, LIGHT, IMAGE, FACE;

    companion object {
        fun parse(raw: String?): CubeARTechnique = when (raw?.lowercase()) {
            null, "", "place" -> PLACE
            "points" -> POINTS
            "depth" -> DEPTH
            "light" -> LIGHT
            "image" -> IMAGE
            "face" -> FACE
            else -> throw IllegalArgumentException("Unknown AR technique: $raw")
        }
    }
}

@CapacitorPlugin(
    name = "CubeAR",
    permissions = [
        Permission(strings = [Manifest.permission.CAMERA], alias = "camera"),
    ],
)
class CubeArPlugin : Plugin() {

    private var arSceneView: ARSceneView? = null
    private var technique = CubeARTechnique.PLACE
    private var featurePointHudView: FeaturePointHudView? = null
    private var depthPeekView: DepthPeekView? = null
    private var lightEstimateHudView: LightEstimateHudView? = null
    private var lightEstimateTick = 0
    private val lightColorScratch = FloatArray(4)
    private var depthModeActive = false
    private var depthModeResolved = false
    private var depthPeekTick = 0
    private var depthPeekHidden = false
    private var depthPeekPixels: IntArray? = null
    private val depthImageCorners = FloatArray(8)
    private val depthViewCorners = FloatArray(8)
    private val hudViewMtx = FloatArray(16)
    private val hudProjMtx = FloatArray(16)
    private val hudVpMtx = FloatArray(16)
    private val hudWorld = FloatArray(4)
    private val hudClip = FloatArray(4)
    private val hudScratch = FloatArray(FeaturePointHudView.MAX_POINTS * 2)
    private var faceMeshPeekView: FaceMeshPeekView? = null
    private var faceNoseNode: PoseNode? = null
    private var faceMeshTick = 0
    private val faceVertScratch = FloatArray(FaceMeshPeekView.MAX_VERTS * 2)
    private val faceLineScratch = FloatArray(FaceMeshPeekView.MAX_LINES * 4)
    private val faceLandmarkScratch = FloatArray(FaceMeshPeekView.MAX_LANDMARKS * 2)
    private val faceProjected = IntArray(FaceMeshPeekView.MAX_VERTS)
    private val faceLocal = FloatArray(3)
    private val faceWorld = FloatArray(3)
    private val faceRegions = arrayOf(
        AugmentedFace.RegionType.NOSE_TIP,
        AugmentedFace.RegionType.FOREHEAD_LEFT,
        AugmentedFace.RegionType.FOREHEAD_RIGHT,
    )
    private var materialLoader: MaterialLoader? = null
    private var cubeSizeM = 0.12f
    private var cubeColorHex = "#30d158"
    private var reticleNode: CubeNode? = null
    private var surfaceFound = false
    private var pendingStartCall: PluginCall? = null
    private var sessionFrameReceived = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private var sessionWatchdog: Runnable? = null
    private var attachCompleted = false
    private var arLifecycleOwner: PluginLifecycleOwner? = null
    private var sensorManager: SensorManager? = null
    private var imuWarmupListener: SensorEventListener? = null

    private var placed = false
    private var anchorNode: AnchorNode? = null
    private var cubeNode: CubeNode? = null
    private var cubeBaseScale: Scale? = null
    private var cubeRestY = 0f
    private var scaleFactor = 1f
    private var introMultiplier = 1f
    private var emergeAnimator: ValueAnimator? = null

    /** Owns a LifecycleRegistry we advance manually so attach-after-resume is safe. */
    private class PluginLifecycleOwner : LifecycleOwner {
        val registry = LifecycleRegistry(this)
        override val lifecycle: Lifecycle
            get() = registry
    }

    companion object {
        private const val SESSION_START_TIMEOUT_MS = 10000L
        private const val INSTANT_PLACEMENT_DISTANCE_M = 1.0f
        private const val EMERGE_RISE_MS = 520f
        private const val EMERGE_JIGGLE_MS = 380f
        private const val EMERGE_DURATION_MS = (EMERGE_RISE_MS + EMERGE_JIGGLE_MS).toLong()
        private const val EMERGE_FLOOR = 0.08f
        private const val EMERGE_OVERSHOOT = 1.18f
        private const val EMERGE_START_Y = 0.08f
        private const val SCALE_MIN = 0.35f
        private const val SCALE_MAX = 2.4f
        private const val MAIN_LIGHT_INTENSITY = 100_000f
        private const val LIGHT_REF_PIXEL = 0.4f
        private const val LIGHT_INTENSITY_MIN = 12_000f
        private const val LIGHT_INTENSITY_MAX = 180_000f
        private const val FACE_NOSE_CUBE_M = 0.014f
    }

    @PluginMethod
    fun isSupported(call: PluginCall) {
        val availability = ArCoreApk.getInstance().checkAvailability(context)
        val supported = availability.isSupported
        val result = JSObject()
        result.put("supported", supported)
        result.put("backend", if (supported) "arcore" else "none")
        call.resolve(result)
    }

    @PluginMethod
    fun startSession(call: PluginCall) {
        val size = call.getDouble("cubeSizeM")?.toFloat() ?: 0.12f
        val color = call.getString("colorHex") ?: "#30d158"
        technique = try {
            CubeARTechnique.parse(call.getString("technique"))
        } catch (ex: IllegalArgumentException) {
            call.reject(ex.message ?: "Unknown AR technique")
            return
        }
        cubeSizeM = max(0.05f, size)
        cubeColorHex = color
        placed = false
        scaleFactor = 1f
        introMultiplier = 1f
        surfaceFound = false
        depthModeActive = false
        depthModeResolved = false
        depthPeekTick = 0
        depthPeekHidden = false
        lightEstimateTick = 0
        faceMeshTick = 0

        if (getPermissionState("camera") == PermissionState.GRANTED) {
            ensureArCoreAndBeginSession(call)
        } else {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback")
        }
    }

    @PermissionCallback
    private fun cameraPermissionCallback(call: PluginCall) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            ensureArCoreAndBeginSession(call)
        } else {
            call.reject("Camera permission denied")
        }
    }

    private fun ensureArCoreAndBeginSession(call: PluginCall) {
        val activity = activity ?: run {
            call.reject("No activity available")
            return
        }

        try {
            when (ArCoreApk.getInstance().requestInstall(activity, true)) {
                ArCoreApk.InstallStatus.INSTALL_REQUESTED -> {
                    pendingStartCall = call
                }
                ArCoreApk.InstallStatus.INSTALLED -> {
                    pendingStartCall = null
                    beginSession(call)
                }
            }
        } catch (ex: UnavailableUserDeclinedInstallationException) {
            pendingStartCall = null
            call.reject("ARCore install declined")
        } catch (ex: UnavailableDeviceNotCompatibleException) {
            pendingStartCall = null
            call.reject("ARCore is not supported on this device")
        } catch (ex: Exception) {
            pendingStartCall = null
            call.reject("Failed to prepare ARCore: ${formatError(ex)}")
        }
    }

    private fun beginSession(call: PluginCall) {
        if (technique == CubeARTechnique.DEPTH) {
            val probe = Session(context)
            try {
                if (!probe.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                    call.reject("Depth is not supported on this device")
                    return
                }
            } catch (ex: Exception) {
                Logger.error("CubeAR depth probe failed", ex)
            } finally {
                probe.close()
            }
        }
        bridge.executeOnMainThread {
            try {
                attachArView(
                    onReady = {
                        notifyTracking("initializing", "Starting ARCore session")
                        call.resolve()
                    },
                    onFailed = { ex ->
                        Logger.error("CubeAR attach failed", ex)
                        detachArView()
                        call.reject("Failed to start native AR: ${formatError(ex)}")
                    },
                )
            } catch (ex: Exception) {
                Logger.error("CubeAR attach failed", ex)
                detachArView()
                call.reject("Failed to start native AR: ${formatError(ex)}")
            }
        }
    }

    private fun formatError(ex: Throwable): String {
        val parts = mutableListOf<String>()
        var current: Throwable? = ex
        var depth = 0
        while (current != null && depth < 4) {
            val detail = current.localizedMessage?.takeIf { it.isNotBlank() && !it.equals("null", ignoreCase = true) }
                ?: current.message?.takeIf { it.isNotBlank() && !it.equals("null", ignoreCase = true) }
            parts.add(
                if (detail != null) "${current.javaClass.simpleName}: $detail"
                else current.javaClass.simpleName,
            )
            current = current.cause
            depth++
        }
        return parts.joinToString(" ← ")
    }

    @PluginMethod
    fun stopSession(call: PluginCall) {
        pendingStartCall = null
        bridge.executeOnMainThread {
            detachArView()
            notifySessionEnded()
            call.resolve()
        }
    }

    @PluginMethod
    fun onScreenTap(call: PluginCall) {
        val x = call.getFloat("x") ?: run {
            call.reject("Missing tap x")
            return
        }
        val y = call.getFloat("y") ?: run {
            call.reject("Missing tap y")
            return
        }

        bridge.executeOnMainThread {
            val result = JSObject()
            result.put(
                "placed",
                if (technique == CubeARTechnique.IMAGE || technique == CubeARTechnique.FACE) {
                    false
                } else {
                    placeCubeAtScreen(x, y, arSceneView)
                },
            )
            call.resolve(result)
        }
    }

    @PluginMethod
    fun moveScreen(call: PluginCall) {
        val x = call.getFloat("x") ?: run {
            call.reject("Missing move x")
            return
        }
        val y = call.getFloat("y") ?: run {
            call.reject("Missing move y")
            return
        }
        bridge.executeOnMainThread {
            val didMove = arSceneView?.let { moveCubeAtScreen(x, y, it) } ?: false
            call.resolve(JSObject().apply { put("moved", didMove) })
        }
    }

    @PluginMethod
    fun reposition(call: PluginCall) {
        bridge.executeOnMainThread {
            if (technique == CubeARTechnique.FACE) {
                destroyFaceContent()
                surfaceFound = false
                notifyTracking("initializing", "Face the front camera")
            } else if (technique == CubeARTechnique.IMAGE) {
                clearPlacement()
                surfaceFound = false
                notifyTracking("initializing", "Point at the printed marker")
            } else {
                clearPlacement()
                arSceneView?.let { view ->
                    view.planeRenderer.isEnabled = true
                    view.planeRenderer.isVisible = true
                }
            }
            call.resolve()
        }
    }

    @PluginMethod
    fun recenter(call: PluginCall) {
        bridge.executeOnMainThread {
            faceCamera(alignViewpoint = true)
            call.resolve()
        }
    }

    @PluginMethod
    fun rotate(call: PluginCall) {
        val dx = call.getFloat("dx") ?: 0f
        val dy = call.getFloat("dy") ?: 0f
        bridge.executeOnMainThread {
            cubeNode?.takeIf { placed && emergeAnimator == null }?.let { node ->
                val yawDeg = dx * 0.45f
                val pitchDeg = dy * 0.30f
                if (yawDeg != 0f) {
                    node.quaternion *= Quaternion.fromAxisAngle(Float3(y = 1.0f), yawDeg)
                }
                if (pitchDeg != 0f) {
                    node.quaternion *= Quaternion.fromAxisAngle(Float3(x = 1.0f), pitchDeg)
                }
            }
            call.resolve()
        }
    }

    @PluginMethod
    fun setScale(call: PluginCall) {
        scaleFactor = (call.getFloat("factor") ?: 1f).coerceIn(SCALE_MIN, SCALE_MAX)
        bridge.executeOnMainThread {
            if (emergeAnimator == null) applyCubeScale()
            call.resolve()
        }
    }

    @PluginMethod
    fun debugPlaceFront(call: PluginCall) {
        bridge.executeOnMainThread {
            if (technique == CubeARTechnique.FACE || technique == CubeARTechnique.IMAGE) {
                call.resolve(
                    JSObject().apply {
                        put("placed", false)
                        put("error", "${technique.name.lowercase()}-mode")
                    },
                )
            } else {
                call.resolve(placeCubeInFrontOfCamera())
            }
        }
    }

    private fun attachArView(onReady: () -> Unit, onFailed: (Exception) -> Unit = {}) {
        detachArView()

        val activity = activity as? ComponentActivity
            ?: throw IllegalStateException("No activity")
        val webView = bridge.webView

        webView.setBackgroundColor(Color.TRANSPARENT)
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        var parent: android.view.ViewParent? = webView.parent
        while (parent is View) {
            parent.setBackgroundColor(Color.TRANSPARENT)
            parent = parent.parent
        }

        val webParent = webView.parent as? ViewGroup
            ?: throw IllegalStateException("WebView has no parent")
        val index = webParent.indexOfChild(webView)
        val params = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
        )

        val sceneView = ARSceneView(
            context = activity,
            sharedActivity = null,
            sharedLifecycle = null,
            sessionFeatures = if (technique == CubeARTechnique.FACE) {
                setOf(Session.Feature.FRONT_CAMERA)
            } else {
                emptySet()
            },
            sessionCameraConfig = if (technique == CubeARTechnique.FACE) {
                { session -> FaceMeshSupport.pickFrontCamera(session) }
            } else {
                null
            },
            onSessionFailed = { ex ->
                bridge.executeOnMainThread {
                    Logger.error("CubeAR session failed", ex)
                    notifyTracking("unavailable", formatError(ex))
                    detachArView()
                    notifySessionEnded()
                }
            },
            onSessionResumed = { session ->
                if (technique == CubeARTechnique.FACE) {
                    try {
                        val config = session.config
                        FaceMeshSupport.applyToConfig(config)
                        session.configure(config)
                    } catch (ex: Exception) {
                        Logger.error("CubeAR face session resume config failed", ex)
                    }
                }
            },
        )

        try {
            sceneView.arCore.checkCameraPermission = false
            sceneView.arCore.checkAvailability = false
            sceneView.keepScreenOn = true

            if (technique == CubeARTechnique.IMAGE || technique == CubeARTechnique.FACE) {
                sceneView.planeRenderer.isEnabled = false
                sceneView.planeRenderer.isVisible = false
            } else {
                sceneView.planeRenderer.isEnabled = true
                sceneView.planeRenderer.isVisible = true
            }

            sceneView.configureSession { session, config ->
                config.updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
                when (technique) {
                    CubeARTechnique.FACE -> {
                        FaceMeshSupport.applyToConfig(config)
                        depthModeActive = false
                        depthModeResolved = true
                    }
                    CubeARTechnique.IMAGE -> {
                        ImageTargetSupport.applyToConfig(session, config, activity.assets)
                        depthModeActive = false
                        depthModeResolved = true
                        config.depthMode = Config.DepthMode.DISABLED
                        config.lightEstimationMode = Config.LightEstimationMode.DISABLED
                    }
                    CubeARTechnique.LIGHT -> {
                        config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL
                        config.instantPlacementMode = Config.InstantPlacementMode.LOCAL_Y_UP
                        config.focusMode = Config.FocusMode.AUTO
                        config.lightEstimationMode = Config.LightEstimationMode.AMBIENT_INTENSITY
                        val depthOk = session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)
                        depthModeActive = depthOk
                        depthModeResolved = true
                        config.depthMode = if (depthOk) {
                            Config.DepthMode.AUTOMATIC
                        } else {
                            Config.DepthMode.DISABLED
                        }
                    }
                    CubeARTechnique.DEPTH -> {
                        config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL
                        config.instantPlacementMode = Config.InstantPlacementMode.LOCAL_Y_UP
                        config.focusMode = Config.FocusMode.AUTO
                        config.lightEstimationMode = Config.LightEstimationMode.DISABLED
                        if (!session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                            throw IllegalStateException("Depth is not supported on this device")
                        }
                        depthModeActive = true
                        depthModeResolved = true
                        config.depthMode = Config.DepthMode.AUTOMATIC
                    }
                    CubeARTechnique.PLACE, CubeARTechnique.POINTS -> {
                        config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL
                        config.instantPlacementMode = Config.InstantPlacementMode.LOCAL_Y_UP
                        config.focusMode = Config.FocusMode.AUTO
                        config.lightEstimationMode = Config.LightEstimationMode.DISABLED
                        val depthOk = session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)
                        depthModeActive = depthOk
                        depthModeResolved = true
                        config.depthMode = if (depthOk) {
                            Config.DepthMode.AUTOMATIC
                        } else {
                            Config.DepthMode.DISABLED
                        }
                    }
                }
            }

            sceneView.lightEstimator?.isEnabled = false
            sceneView.lightEstimator = null
            if (sceneView.mainLightNode == null) {
                sceneView.mainLightNode = SceneView.DefaultLightNode(sceneView.engine)
            }
            applyFixedMainLight(sceneView)

            sceneView.onSessionUpdated = { _, frame ->
                if (!sessionFrameReceived) {
                    sessionFrameReceived = true
                    cancelSessionWatchdog()
                }
                when (technique) {
                    CubeARTechnique.FACE -> updateFaceMesh(sceneView, frame)
                    CubeARTechnique.IMAGE -> updateImageTarget(sceneView, frame)
                    else -> {
                        updateSurfaceProbe(frame)
                        updateReticle(sceneView, frame)
                    }
                }
                featurePointHudView?.let { updateFeaturePointHud(frame, it) }
                depthPeekView?.let { updateDepthPeek(frame, it) }
                if (technique == CubeARTechnique.LIGHT) {
                    updateLightEstimate(sceneView, frame)
                }
                when (frame.camera.trackingState) {
                    TrackingState.TRACKING -> {
                        when (technique) {
                            CubeARTechnique.FACE -> when {
                                placed -> notifyTracking("ready", "Face locked")
                                surfaceFound -> notifyTracking("ready", "Face locked")
                                else -> notifyTracking("initializing", "Face the front camera")
                            }
                            CubeARTechnique.IMAGE -> when {
                                placed -> notifyTracking("ready", "Cube on marker")
                                surfaceFound -> notifyTracking("ready", "Marker locked")
                                else -> notifyTracking("initializing", "Point at the printed marker")
                            }
                            else -> if (surfaceFound) {
                                notifyTracking(
                                    "ready",
                                    if (placed) "Cube placed" else "Tap to place a cube",
                                )
                            } else {
                                notifyTracking("initializing", "Move phone to find a surface")
                            }
                        }
                    }
                    TrackingState.PAUSED -> notifyTracking("limited", "Tracking limited")
                    TrackingState.STOPPED -> notifyTracking("unavailable", "Tracking stopped")
                }
            }

            val owner = PluginLifecycleOwner()
            owner.registry.currentState = Lifecycle.State.INITIALIZED
            sceneView.lifecycle = owner.lifecycle
            arLifecycleOwner = owner

            webParent.addView(sceneView, index, params)
            var overlayAt = index + 1
            if (technique == CubeARTechnique.POINTS) {
                val hud = FeaturePointHudView(activity)
                webParent.addView(hud, overlayAt, params)
                featurePointHudView = hud
                overlayAt++
            }
            if (technique == CubeARTechnique.DEPTH) {
                val peek = DepthPeekView(activity)
                webParent.addView(peek, overlayAt, params)
                depthPeekView = peek
                overlayAt++
            }
            if (technique == CubeARTechnique.LIGHT) {
                val chip = LightEstimateHudView(activity)
                webParent.addView(chip, overlayAt, params)
                lightEstimateHudView = chip
                overlayAt++
            }
            if (technique == CubeARTechnique.FACE) {
                val peek = FaceMeshPeekView(activity)
                webParent.addView(peek, overlayAt, params)
                faceMeshPeekView = peek
            }
            webView.bringToFront()

            materialLoader = MaterialLoader(sceneView.engine, activity)
            if (technique != CubeARTechnique.IMAGE && technique != CubeARTechnique.FACE) {
                addReticle(sceneView)
            }
            arSceneView = sceneView
            attachCompleted = false

            fun finishAttach() {
                if (attachCompleted || arSceneView !== sceneView) return
                attachCompleted = true
                startImuWarmup(activity)
                sceneView.postDelayed({
                    if (arSceneView !== sceneView) return@postDelayed
                    try {
                        startControlledLifecycle(sceneView)
                        sessionFrameReceived = false
                        scheduleSessionWatchdog()
                        onReady()
                    } catch (ex: Exception) {
                        attachCompleted = false
                        stopImuWarmup()
                        arLifecycleOwner = null
                        safeDestroySceneView(sceneView)
                        arSceneView = null
                        materialLoader = null
                        reticleNode = null
                        onFailed(ex)
                    }
                }, 200L)
            }

            if (sceneView.width > 0 && sceneView.height > 0) {
                finishAttach()
            } else {
                val layoutListener = object : ViewTreeObserver.OnGlobalLayoutListener {
                    override fun onGlobalLayout() {
                        if (sceneView.width <= 0 || sceneView.height <= 0) return
                        if (sceneView.viewTreeObserver.isAlive) {
                            sceneView.viewTreeObserver.removeOnGlobalLayoutListener(this)
                        }
                        finishAttach()
                    }
                }
                sceneView.viewTreeObserver.addOnGlobalLayoutListener(layoutListener)
                sceneView.post {
                    if (sceneView.width > 0 && sceneView.height > 0) {
                        if (sceneView.viewTreeObserver.isAlive) {
                            sceneView.viewTreeObserver.removeOnGlobalLayoutListener(layoutListener)
                        }
                        finishAttach()
                    }
                }
            }
        } catch (ex: Exception) {
            arLifecycleOwner = null
            safeDestroySceneView(sceneView)
            onFailed(ex)
        }
    }

    private fun startControlledLifecycle(sceneView: ARSceneView) {
        val owner = arLifecycleOwner
            ?: throw IllegalStateException("Missing AR lifecycle owner")
        val registry = owner.registry

        if (registry.currentState == Lifecycle.State.INITIALIZED) {
            registry.handleLifecycleEvent(Lifecycle.Event.ON_CREATE)
        }
        if (registry.currentState.isAtLeast(Lifecycle.State.CREATED) &&
            !registry.currentState.isAtLeast(Lifecycle.State.STARTED)
        ) {
            registry.handleLifecycleEvent(Lifecycle.Event.ON_START)
        }
        if (registry.currentState.isAtLeast(Lifecycle.State.STARTED) &&
            !registry.currentState.isAtLeast(Lifecycle.State.RESUMED)
        ) {
            registry.handleLifecycleEvent(Lifecycle.Event.ON_RESUME)
        }

        if (sceneView.session == null) {
            sceneView.arCore.createSession(activity)
            sceneView.arCore.resume(activity, null)
        }
    }

    private fun startImuWarmup(context: Context) {
        stopImuWarmup()
        val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent?) {}
            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        val types = intArrayOf(
            Sensor.TYPE_GYROSCOPE_UNCALIBRATED,
            Sensor.TYPE_ACCELEROMETER_UNCALIBRATED,
            Sensor.TYPE_GYROSCOPE,
            Sensor.TYPE_ACCELEROMETER,
        )
        var registered = 0
        for (type in types) {
            val sensor = sm.getDefaultSensor(type) ?: continue
            val ok = sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_FASTEST)
            if (ok) registered++
        }
        if (registered == 0) return
        sensorManager = sm
        imuWarmupListener = listener
    }

    private fun stopImuWarmup() {
        val listener = imuWarmupListener ?: return
        try {
            sensorManager?.unregisterListener(listener)
        } catch (_: Exception) {
            // already unregistered
        }
        imuWarmupListener = null
        sensorManager = null
    }

    private fun safeDestroySceneView(view: ARSceneView) {
        val registry = arLifecycleOwner?.registry
        if (registry != null) {
            try {
                if (registry.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
                    registry.handleLifecycleEvent(Lifecycle.Event.ON_PAUSE)
                }
                if (registry.currentState.isAtLeast(Lifecycle.State.STARTED)) {
                    registry.handleLifecycleEvent(Lifecycle.Event.ON_STOP)
                }
            } catch (_: Exception) {
                // lifecycle may already be torn down
            }
        }
        (view.parent as? ViewGroup)?.removeView(view)
        try {
            view.lifecycle = null
        } catch (_: Exception) {
            // lifecycle may already be cleared
        }
        arLifecycleOwner = null
        try {
            view.destroy()
        } catch (_: Exception) {
            // view may be partially constructed
        }
    }

    private fun addReticle(sceneView: ARSceneView) {
        val loader = materialLoader ?: return
        val ring = CubeNode(
            engine = sceneView.engine,
            size = Size(0.14f, 0.004f, 0.14f),
            materialInstance = loader.createColorInstance(
                SceneColor(0.19f, 0.82f, 0.35f, 0.85f),
                metallic = 0f,
                roughness = 0.8f,
                reflectance = 0.5f,
            ),
        )
        ring.isVisible = false
        sceneView.addChildNode(ring)
        reticleNode = ring
    }

    private fun updateSurfaceProbe(frame: com.google.ar.core.Frame) {
        if (placed) return
        // Instant Placement: unlock tap as soon as the camera tracks.
        if (!surfaceFound && frame.camera.trackingState == TrackingState.TRACKING) {
            surfaceFound = true
            notifyTracking("ready", "Tap to place a cube")
        }
    }

    private fun defaultLightDirection(): Direction {
        val x = -0.5f
        val y = -1.0f
        val z = -0.8f
        val len = sqrt(x * x + y * y + z * z)
        return Direction(x / len, y / len, z / len)
    }

    private fun applyFixedMainLight(sceneView: ARSceneView) {
        val dir = defaultLightDirection()
        sceneView.mainLightNode?.let { light ->
            light.intensity = MAIN_LIGHT_INTENSITY
            light.lightDirection = dir
        }
        sceneView.mainLightEstimatedNode?.let { light ->
            light.intensity = MAIN_LIGHT_INTENSITY
            light.lightDirection = dir
        }
    }

    private fun mapPixelToIntensity(pixel: Float): Float {
        val safe = if (pixel.isFinite()) pixel.coerceAtLeast(0f) else LIGHT_REF_PIXEL
        return (MAIN_LIGHT_INTENSITY * (safe / LIGHT_REF_PIXEL))
            .coerceIn(LIGHT_INTENSITY_MIN, LIGHT_INTENSITY_MAX)
    }

    private fun updateLightEstimate(sceneView: ARSceneView, frame: Frame) {
        val estimate = frame.lightEstimate
        val valid = estimate.state == LightEstimate.State.VALID
        var pixel = 0f
        lightColorScratch[0] = 1f
        lightColorScratch[1] = 1f
        lightColorScratch[2] = 1f
        lightColorScratch[3] = 1f
        if (valid) {
            pixel = estimate.pixelIntensity
            try {
                estimate.getColorCorrection(lightColorScratch, 0)
            } catch (_: Exception) {
                // optional on this API level
            }
        }
        val intensity = if (valid) mapPixelToIntensity(pixel) else MAIN_LIGHT_INTENSITY
        val r = lightColorScratch[0].coerceIn(0.15f, 3f)
        val g = lightColorScratch[1].coerceIn(0.15f, 3f)
        val b = lightColorScratch[2].coerceIn(0.15f, 3f)
        val direction = defaultLightDirection()
        sceneView.mainLightNode?.let { light ->
            light.intensity = intensity
            light.lightDirection = direction
            light.color = SceneColor(r, g, b, 1f)
        }
        sceneView.mainLightEstimatedNode?.let { light ->
            light.intensity = intensity
            light.lightDirection = direction
            light.color = SceneColor(r, g, b, 1f)
        }
        lightEstimateTick += 1
        if (lightEstimateTick % LightEstimateHudView.FRAME_STRIDE != 0) return
        lightEstimateHudView?.setReadout(valid, pixel, intensity, lightColorScratch)
    }

    private fun updateFeaturePointHud(frame: Frame, hud: FeaturePointHudView) {
        val w = hud.width.toFloat()
        val h = hud.height.toFloat()
        if (w <= 0f || h <= 0f) return
        hud.dimmed = placed

        val camera = frame.camera
        if (camera.trackingState != TrackingState.TRACKING) {
            hud.setScreenPoints(hudScratch, 0, 0)
            return
        }

        camera.getViewMatrix(hudViewMtx, 0)
        camera.getProjectionMatrix(hudProjMtx, 0, 0.1f, 100f)
        Matrix.multiplyMM(hudVpMtx, 0, hudProjMtx, 0, hudViewMtx, 0)

        var cloud: PointCloud? = null
        try {
            cloud = frame.acquirePointCloud()
            val buf = cloud.points
            val pos = buf.position()
            val total = buf.remaining() / 4
            if (total <= 0) {
                hud.setScreenPoints(hudScratch, 0, 0)
                return
            }
            val max = FeaturePointHudView.MAX_POINTS
            val stride = if (total <= max) 1 else total / max
            var i = 0
            var drawn = 0
            while (i < total && drawn < max) {
                val base = pos + i * 4
                if (buf.get(base + 3) >= FeaturePointHudView.MIN_CONFIDENCE) {
                    hudWorld[0] = buf.get(base)
                    hudWorld[1] = buf.get(base + 1)
                    hudWorld[2] = buf.get(base + 2)
                    hudWorld[3] = 1f
                    Matrix.multiplyMV(hudClip, 0, hudVpMtx, 0, hudWorld, 0)
                    val cw = hudClip[3]
                    if (cw > 0.0001f) {
                        val ndcX = hudClip[0] / cw
                        val ndcY = hudClip[1] / cw
                        if (ndcX >= -1f && ndcX <= 1f && ndcY >= -1f && ndcY <= 1f) {
                            hudScratch[drawn * 2] = (ndcX + 1f) * 0.5f * w
                            hudScratch[drawn * 2 + 1] = (1f - ndcY) * 0.5f * h
                            drawn++
                        }
                    }
                }
                i += stride
            }
            hud.setScreenPoints(hudScratch, drawn, drawn)
        } catch (_: Exception) {
            // point cloud not always available
        } finally {
            try {
                cloud?.release()
            } catch (_: Exception) {
                // already released
            }
        }
    }

    private fun updateDepthPeek(frame: Frame, peek: DepthPeekView) {
        if (depthModeResolved && !depthModeActive) {
            if (!depthPeekHidden) {
                depthPeekHidden = true
                peek.post { peek.visibility = View.GONE }
            }
            return
        }
        if (!depthModeActive) return
        peek.dimmed = placed
        if (placed) {
            peek.postInvalidateOnAnimation()
            return
        }
        depthPeekTick += 1
        if (depthPeekTick % DepthPeekView.FRAME_STRIDE != 0) return

        try {
            frame.acquireDepthImage16Bits().use { image ->
                val w = image.width
                val h = image.height
                if (w <= 0 || h <= 0) return
                val plane = image.planes[0]
                val buf = plane.buffer.duplicate().order(ByteOrder.LITTLE_ENDIAN)
                val rowStride = plane.rowStride
                val pixelStride = plane.pixelStride
                if (pixelStride <= 0 || rowStride <= 0) return
                val step = if (max(w, h) > 160) 2 else 1
                val outW = w / step
                val outH = h / step
                if (outW <= 0 || outH <= 0) return
                val needed = outW * outH
                val pixels = depthPeekPixels?.takeIf { it.size == needed }
                    ?: IntArray(needed).also { depthPeekPixels = it }
                var i = 0
                for (y in 0 until outH) {
                    val row = y * step * rowStride
                    for (x in 0 until outW) {
                        val idx = row + x * step * pixelStride
                        val mm = if (idx + 1 < buf.limit()) {
                            buf.getShort(idx).toInt() and 0xFFFF
                        } else {
                            0
                        }
                        pixels[i++] = DepthPeekView.colorForMm(mm)
                    }
                }
                depthImageCorners[0] = 0f
                depthImageCorners[1] = 0f
                depthImageCorners[2] = 1f
                depthImageCorners[3] = 0f
                depthImageCorners[4] = 1f
                depthImageCorners[5] = 1f
                depthImageCorners[6] = 0f
                depthImageCorners[7] = 1f
                var corners: FloatArray? = depthViewCorners
                try {
                    frame.transformCoordinates2d(
                        Coordinates2d.IMAGE_NORMALIZED,
                        depthImageCorners,
                        Coordinates2d.VIEW,
                        depthViewCorners,
                    )
                } catch (_: Exception) {
                    corners = null
                }
                peek.setHeatmap(pixels, outW, outH, corners)
            }
        } catch (_: Exception) {
            // NotYetAvailable — keep last heatmap
        }
    }

    private fun findTrackedImage(sceneView: ARSceneView, frame: Frame): AugmentedImage? {
        val candidates = sceneView.session?.getAllTrackables(AugmentedImage::class.java)
            ?: frame.getUpdatedTrackables(AugmentedImage::class.java)
        return candidates.firstOrNull { image ->
            image.name == ImageTargetSupport.TARGET_NAME &&
                image.trackingState == TrackingState.TRACKING &&
                image.trackingMethod == AugmentedImage.TrackingMethod.FULL_TRACKING
        }
    }

    private fun findTrackedFace(sceneView: ARSceneView, frame: Frame): AugmentedFace? {
        val candidates = sceneView.session?.getAllTrackables(AugmentedFace::class.java)
            ?: frame.getUpdatedTrackables(AugmentedFace::class.java)
        return candidates.firstOrNull { face ->
            face.trackingState == TrackingState.TRACKING
        }
    }

    private fun updateFaceMesh(sceneView: ARSceneView, frame: Frame) {
        val peek = faceMeshPeekView
        val face = findTrackedFace(sceneView, frame)
        if (face == null) {
            if (surfaceFound) surfaceFound = false
            faceNoseNode?.isVisible = false
            peek?.clear()
            return
        }
        if (!surfaceFound) {
            surfaceFound = true
            notifyTracking("ready", "Face locked")
        }
        attachFaceNoseMarker(sceneView, face)
        faceMeshTick += 1
        if (peek == null) return
        if (faceMeshTick % FaceMeshPeekView.FRAME_STRIDE != 0) return
        projectFaceMesh(frame, face, peek)
    }

    private fun attachFaceNoseMarker(sceneView: ARSceneView, face: AugmentedFace) {
        val nosePose = face.getRegionPose(AugmentedFace.RegionType.NOSE_TIP)
        var node = faceNoseNode
        if (node == null) {
            node = PoseNode(sceneView.engine, nosePose)
            val marker = obtainFaceNoseCube(sceneView)
            node.addChildNode(marker)
            sceneView.addChildNode(node)
            faceNoseNode = node
        } else {
            node.pose = nosePose
            node.isVisible = true
        }
        if (!placed) {
            placed = true
            notifyListeners("placed", JSObject())
        }
    }

    private fun obtainFaceNoseCube(sceneView: ARSceneView): CubeNode {
        cubeNode?.let { return it }
        val loader = materialLoader ?: throw IllegalStateException("No material loader")
        val (r, g, b) = parseHexColor(cubeColorHex)
        val cube = CubeNode(
            engine = sceneView.engine,
            size = Size(FACE_NOSE_CUBE_M, FACE_NOSE_CUBE_M, FACE_NOSE_CUBE_M),
            materialInstance = loader.createColorInstance(
                SceneColor(r, g, b, 1f),
                metallic = 0f,
                roughness = 0.8f,
                reflectance = 0.5f,
            ),
        )
        cubeBaseScale = cube.scale
        cubeRestY = 0f
        cubeNode = cube
        return cube
    }

    private fun projectPointToView(
        x: Float,
        y: Float,
        z: Float,
        viewW: Float,
        viewH: Float,
        out: FloatArray,
        outOffset: Int,
    ): Boolean {
        hudWorld[0] = x
        hudWorld[1] = y
        hudWorld[2] = z
        hudWorld[3] = 1f
        Matrix.multiplyMV(hudClip, 0, hudVpMtx, 0, hudWorld, 0)
        val cw = hudClip[3]
        if (cw <= 0.0001f) return false
        val ndcX = hudClip[0] / cw
        val ndcY = hudClip[1] / cw
        if (ndcX < -1.2f || ndcX > 1.2f || ndcY < -1.2f || ndcY > 1.2f) return false
        out[outOffset] = (ndcX + 1f) * 0.5f * viewW
        out[outOffset + 1] = (1f - ndcY) * 0.5f * viewH
        return out[outOffset].isFinite() && out[outOffset + 1].isFinite()
    }

    private fun projectFaceMesh(frame: Frame, face: AugmentedFace, peek: FaceMeshPeekView) {
        val w = peek.width.toFloat()
        val h = peek.height.toFloat()
        if (w <= 0f || h <= 0f) return
        val camera = frame.camera
        if (camera.trackingState != TrackingState.TRACKING) {
            peek.clear()
            return
        }
        camera.getViewMatrix(hudViewMtx, 0)
        camera.getProjectionMatrix(hudProjMtx, 0, 0.05f, 4f)
        Matrix.multiplyMM(hudVpMtx, 0, hudProjMtx, 0, hudViewMtx, 0)

        val verts = face.meshVertices
        val indices = face.meshTriangleIndices
        val pose = face.centerPose
        val savedV = verts.position()
        val savedI = indices.position()
        try {
            verts.position(0)
            indices.position(0)
            val vertTotal = verts.remaining() / 3
            val maxV = FaceMeshPeekView.MAX_VERTS
            java.util.Arrays.fill(faceProjected, -1)
            var drawnV = 0
            var vi = 0
            while (vi < vertTotal && vi < faceProjected.size && drawnV < maxV) {
                faceLocal[0] = verts.get()
                faceLocal[1] = verts.get()
                faceLocal[2] = verts.get()
                pose.transformPoint(faceLocal, 0, faceWorld, 0)
                if (projectPointToView(
                        faceWorld[0],
                        faceWorld[1],
                        faceWorld[2],
                        w,
                        h,
                        faceVertScratch,
                        drawnV * 2,
                    )
                ) {
                    faceProjected[vi] = drawnV
                    drawnV++
                }
                vi++
            }
            val triCount = indices.remaining() / 3
            val triStride = if (triCount <= FaceMeshPeekView.MAX_LINES / 3) {
                1
            } else {
                (triCount * 3 / FaceMeshPeekView.MAX_LINES).coerceAtLeast(1)
            }
            var drawnL = 0
            var ti = 0
            while (ti < triCount && drawnL < FaceMeshPeekView.MAX_LINES) {
                val a = indices.get().toInt() and 0xFFFF
                val b = indices.get().toInt() and 0xFFFF
                val c = indices.get().toInt() and 0xFFFF
                if (ti % triStride == 0) {
                    val pa = if (a < faceProjected.size) faceProjected[a] else -1
                    val pb = if (b < faceProjected.size) faceProjected[b] else -1
                    val pc = if (c < faceProjected.size) faceProjected[c] else -1
                    if (pa >= 0 && pb >= 0) {
                        packLine(pa, pb, drawnL)
                        drawnL++
                    }
                    if (drawnL < FaceMeshPeekView.MAX_LINES && pb >= 0 && pc >= 0) {
                        packLine(pb, pc, drawnL)
                        drawnL++
                    }
                    if (drawnL < FaceMeshPeekView.MAX_LINES && pc >= 0 && pa >= 0) {
                        packLine(pc, pa, drawnL)
                        drawnL++
                    }
                }
                ti++
            }
            var drawnM = 0
            for (region in faceRegions) {
                if (drawnM >= FaceMeshPeekView.MAX_LANDMARKS) break
                val regionPose = face.getRegionPose(region)
                if (projectPointToView(
                        regionPose.tx(),
                        regionPose.ty(),
                        regionPose.tz(),
                        w,
                        h,
                        faceLandmarkScratch,
                        drawnM * 2,
                    )
                ) {
                    drawnM++
                }
            }
            peek.setMesh(
                faceVertScratch,
                drawnV,
                faceLineScratch,
                drawnL,
                faceLandmarkScratch,
                drawnM,
                locked = true,
                vertTotal = vertTotal,
            )
        } catch (_: Exception) {
            // mesh buffers can be unavailable for a frame
        } finally {
            try {
                verts.position(savedV)
                indices.position(savedI)
            } catch (_: Exception) {
                // buffer already released
            }
        }
    }

    private fun packLine(from: Int, to: Int, lineIndex: Int) {
        val dst = lineIndex * 4
        faceLineScratch[dst] = faceVertScratch[from * 2]
        faceLineScratch[dst + 1] = faceVertScratch[from * 2 + 1]
        faceLineScratch[dst + 2] = faceVertScratch[to * 2]
        faceLineScratch[dst + 3] = faceVertScratch[to * 2 + 1]
    }

    private fun destroyFaceContent() {
        cubeNode?.let { node ->
            try {
                node.parent?.removeChildNode(node)
            } catch (_: Exception) {
                // already detached
            }
        }
        cubeNode = null
        cubeBaseScale = null
        cubeRestY = 0f
        faceNoseNode?.let { node ->
            try {
                arSceneView?.removeChildNode(node)
            } catch (_: Exception) {
                try {
                    node.parent?.removeChildNode(node)
                } catch (_: Exception) {
                    // already detached
                }
            }
            try {
                node.destroy()
            } catch (_: Exception) {
                // engine may be tearing down
            }
        }
        faceNoseNode = null
        faceMeshTick = 0
        placed = false
    }

    private fun updateImageTarget(sceneView: ARSceneView, frame: Frame) {
        if (placed) return
        if (frame.camera.trackingState != TrackingState.TRACKING) return
        val image = findTrackedImage(sceneView, frame)
        if (image == null) {
            if (surfaceFound) surfaceFound = false
            return
        }
        if (!surfaceFound) {
            surfaceFound = true
            notifyTracking("ready", "Marker locked")
        }
        placeCubeOnImage(sceneView, image)
    }

    private fun placeCubeOnImage(sceneView: ARSceneView, image: AugmentedImage): Boolean {
        if (placed) return true
        val cube = obtainCubeNode(sceneView)
        val newAnchor = AnchorNode(sceneView.engine, image.createAnchor(image.centerPose))
        newAnchor.addChildNode(cube)
        sceneView.addChildNode(newAnchor)
        anchorNode = newAnchor
        placed = true
        sceneView.planeRenderer.isVisible = false
        sceneView.planeRenderer.isEnabled = false
        reticleNode?.isVisible = false
        startEmergence()
        faceCamera(alignViewpoint = false)
        notifyListeners("placed", JSObject())
        notifyTracking("ready", "Cube on marker")
        return true
    }

    private fun updateReticle(sceneView: ARSceneView, frame: com.google.ar.core.Frame) {
        val reticle = reticleNode ?: return
        if (placed) {
            reticle.isVisible = false
            return
        }
        val hit = hitAt(sceneView, sceneView.width / 2f, sceneView.height / 2f)
        if (hit != null) {
            val pose = hit.hitPose
            reticle.isVisible = true
            reticle.position = Position(pose.tx(), pose.ty(), pose.tz())
        } else {
            reticle.isVisible = false
        }
    }

    private fun isHorizontalPlaneHit(hit: HitResult): Boolean {
        val trackable = hit.trackable
        return trackable is Plane &&
            trackable.trackingState == TrackingState.TRACKING &&
            (trackable.type == Plane.Type.HORIZONTAL_UPWARD_FACING ||
                trackable.type == Plane.Type.HORIZONTAL_DOWNWARD_FACING)
    }

    private fun hitAt(sceneView: ARSceneView, x: Float, y: Float): HitResult? {
        val frame = sceneView.frame ?: return null
        val hits = frame.hitTest(x, y)
        hits.firstOrNull(::isHorizontalPlaneHit)?.let { return it }
        hits.firstOrNull { hit ->
            val trackable = hit.trackable
            trackable is Plane && trackable.trackingState == TrackingState.TRACKING
        }?.let { return it }
        return try {
            frame.hitTestInstantPlacement(x, y, INSTANT_PLACEMENT_DISTANCE_M)
                .firstOrNull { hit ->
                    val trackable = hit.trackable
                    trackable is InstantPlacementPoint &&
                        trackable.trackingState == TrackingState.TRACKING
                }
        } catch (_: Exception) {
            null
        }
    }

    private fun placeCubeAtScreen(x: Float, y: Float, sceneView: ARSceneView?): Boolean {
        if (sceneView == null || placed) return false
        val hit = hitAt(sceneView, x, y) ?: return false
        attachCubeToHit(sceneView, hit)
        return true
    }

    private fun obtainCubeNode(sceneView: ARSceneView): CubeNode {
        cubeNode?.let { return it }
        val loader = materialLoader ?: throw IllegalStateException("No material loader")
        val (r, g, b) = parseHexColor(cubeColorHex)
        val material = loader.createColorInstance(
            SceneColor(r, g, b, 1f),
            metallic = 0f,
            roughness = 0.8f,
            reflectance = 0.5f,
        )
        val cube = CubeNode(
            engine = sceneView.engine,
            size = Size(cubeSizeM),
            materialInstance = material,
        )
        cube.position = Position(0f, cubeSizeM / 2f, 0f)
        cubeRestY = cube.position.y
        cubeBaseScale = cube.scale
        cubeNode = cube
        return cube
    }

    private fun attachCubeToHit(sceneView: ARSceneView, hit: HitResult) {
        val cube = obtainCubeNode(sceneView)
        val newAnchor = AnchorNode(sceneView.engine, hit.createAnchor())
        newAnchor.addChildNode(cube)
        sceneView.addChildNode(newAnchor)
        anchorNode = newAnchor
        placed = true
        sceneView.planeRenderer.isVisible = false
        sceneView.planeRenderer.isEnabled = false
        reticleNode?.isVisible = false
        startEmergence()
        faceCamera(alignViewpoint = false)
        notifyListeners("placed", JSObject())
        notifyTracking("ready", "Cube placed")
    }

    private fun placeCubeInFrontOfCamera(): JSObject {
        val out = JSObject()
        val sceneView = arSceneView
        val frame = sceneView?.frame
        val camera = frame?.camera
        if (sceneView == null || frame == null || camera == null) {
            out.put("placed", false)
            out.put("error", "no-session")
            return out
        }
        if (camera.trackingState != TrackingState.TRACKING) {
            out.put("placed", false)
            out.put("error", "not-tracking")
            out.put("tracking", camera.trackingState.name)
            return out
        }
        clearPlacement()
        val camPose = camera.pose
        val localForward = floatArrayOf(0f, 0f, -0.55f)
        val world = FloatArray(3)
        camPose.transformPoint(localForward, 0, world, 0)
        val anchorPose = Pose(world, floatArrayOf(0f, 0f, 0f, 1f))
        val session = sceneView.session
        if (session == null) {
            out.put("placed", false)
            out.put("error", "no-session-obj")
            return out
        }
        val cube = obtainCubeNode(sceneView)
        val newAnchor = AnchorNode(sceneView.engine, session.createAnchor(anchorPose))
        newAnchor.addChildNode(cube)
        sceneView.addChildNode(newAnchor)
        anchorNode = newAnchor
        placed = true
        sceneView.planeRenderer.isVisible = false
        sceneView.planeRenderer.isEnabled = false
        reticleNode?.isVisible = false
        startEmergence()
        faceCamera(alignViewpoint = false)
        notifyListeners("placed", JSObject())
        out.put("placed", true)
        out.put("tracking", camera.trackingState.name)
        return out
    }

    private fun moveCubeAtScreen(x: Float, y: Float, sceneView: ARSceneView): Boolean {
        if (!placed || emergeAnimator != null) return false
        val node = cubeNode ?: return false
        val hit = hitAt(sceneView, x, y) ?: return false
        anchorNode?.let { oldAnchor ->
            oldAnchor.removeChildNode(node)
            oldAnchor.destroy()
        }
        val newAnchor = AnchorNode(sceneView.engine, hit.createAnchor())
        newAnchor.addChildNode(node)
        sceneView.addChildNode(newAnchor)
        anchorNode = newAnchor
        return true
    }

    private fun startEmergence() {
        cancelEmergence()
        val node = cubeNode
        if (node != null && cubeRestY == 0f) {
            cubeRestY = node.position.y
        }
        introMultiplier = EMERGE_FLOOR
        applyCubePose(elapsedMs = 0f)
        val animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = EMERGE_DURATION_MS
            interpolator = android.view.animation.LinearInterpolator()
            addUpdateListener {
                val elapsed = currentPlayTime.toFloat().coerceAtMost(EMERGE_DURATION_MS.toFloat())
                introMultiplier = emergeIntroAt(elapsed)
                applyCubePose(elapsed)
            }
        }
        animator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (emergeAnimator !== animator) return
                emergeAnimator = null
                introMultiplier = 1f
                applyCubePose(elapsedMs = EMERGE_DURATION_MS.toFloat())
            }
        })
        emergeAnimator = animator
        animator.start()
    }

    private fun cancelEmergence() {
        val animator = emergeAnimator
        emergeAnimator = null
        animator?.cancel()
        introMultiplier = 1f
    }

    private fun easeOutBack(t: Float): Float {
        val c1 = 2.2f
        val c3 = c1 + 1f
        val u = t - 1f
        return 1f + c3 * u * u * u + c1 * u * u
    }

    private fun easeOutCubic(t: Float): Float {
        val u = 1f - t
        return 1f - u * u * u
    }

    private fun lerp(a: Float, b: Float, t: Float): Float = a + (b - a) * t

    private fun jiggleIntro(t: Float): Float {
        val u = min(1f, max(0f, t))
        val ts = floatArrayOf(0f, 0.35f, 0.7f, 1f)
        val vs = floatArrayOf(EMERGE_OVERSHOOT, 0.94f, 1.06f, 1f)
        for (i in 0 until ts.lastIndex) {
            if (u <= ts[i + 1]) {
                val local = (u - ts[i]) / (ts[i + 1] - ts[i]).coerceAtLeast(0.0001f)
                return lerp(vs[i], vs[i + 1], easeOutCubic(local))
            }
        }
        return 1f
    }

    private fun emergeIntroAt(elapsedMs: Float): Float {
        if (elapsedMs <= 0f) return EMERGE_FLOOR
        if (elapsedMs < EMERGE_RISE_MS) {
            val t = elapsedMs / EMERGE_RISE_MS
            return max(EMERGE_FLOOR, EMERGE_OVERSHOOT * easeOutBack(t))
        }
        val jiggleT = min(1f, (elapsedMs - EMERGE_RISE_MS) / EMERGE_JIGGLE_MS)
        return jiggleIntro(jiggleT)
    }

    private fun emergeRiseOffset(elapsedMs: Float): Float {
        if (elapsedMs >= EMERGE_RISE_MS) return 0f
        val t = min(1f, max(0f, elapsedMs / EMERGE_RISE_MS))
        return EMERGE_START_Y * (1f - easeOutBack(t))
    }

    private fun applyCubePose(elapsedMs: Float = EMERGE_DURATION_MS.toFloat()) {
        applyCubeScale()
        val node = cubeNode ?: return
        val pos = node.position
        node.position = Position(
            x = pos.x,
            y = cubeRestY + emergeRiseOffset(elapsedMs),
            z = pos.z,
        )
    }

    private fun applyCubeScale() {
        val node = cubeNode ?: return
        val base = cubeBaseScale ?: return
        val multiplier = scaleFactor * introMultiplier
        node.scale = Scale(
            base.x * multiplier,
            base.y * multiplier,
            base.z * multiplier,
        )
    }

    private fun faceCamera(alignViewpoint: Boolean = false) {
        val view = arSceneView ?: return
        val node = cubeNode?.takeIf { placed } ?: return
        val camera = view.cameraNode.worldPosition
        val model = node.worldPosition
        if (!camera.x.isFinite() || !camera.y.isFinite() || !camera.z.isFinite() ||
            !model.x.isFinite() || !model.y.isFinite() || !model.z.isFinite()
        ) {
            return
        }

        val parent = node.parent
        val localCam = parent?.getLocalPosition(camera) ?: camera
        val pos = node.position
        val localDx = localCam.x - pos.x
        val localDy = localCam.y - pos.y
        val localDz = localCam.z - pos.z
        if (!localDx.isFinite() || !localDy.isFinite() || !localDz.isFinite()) return

        val horiz = sqrt(localDx * localDx + localDz * localDz)
        if (horiz < 1e-5f) return

        val yawDeg = Math.toDegrees(atan2(localDx.toDouble(), localDz.toDouble())).toFloat()
        if (!yawDeg.isFinite()) return

        if (!alignViewpoint) {
            node.rotation = Rotation(0f, yawDeg, 0f)
            return
        }

        val pitchDeg = (-Math.toDegrees(atan2(localDy.toDouble(), horiz.toDouble()))).toFloat()
            .coerceIn(-40f, 40f)
        if (!pitchDeg.isFinite()) {
            node.rotation = Rotation(0f, yawDeg, 0f)
            return
        }
        node.rotation = Rotation(pitchDeg, yawDeg, 0f)
    }

    private fun clearPlacement() {
        cancelEmergence()
        val node = cubeNode
        anchorNode?.let { anchor ->
            if (node != null) {
                try {
                    anchor.removeChildNode(node)
                } catch (_: Exception) {
                    // already detached
                }
            }
            try {
                anchor.destroy()
            } catch (_: Exception) {
                // already destroyed
            }
        }
        anchorNode = null
        placed = false
        scaleFactor = 1f
        introMultiplier = 1f
        if (node != null) {
            applyCubePose()
        }
        notifyTracking("ready", "Tap to place a cube")
    }

    private fun scheduleSessionWatchdog() {
        cancelSessionWatchdog()
        val watchdog = Runnable {
            sessionWatchdog = null
            if (!sessionFrameReceived && arSceneView != null) {
                Logger.error("CubeAR session timed out — no frames received")
                notifyTracking("unavailable", "Camera session timed out")
                detachArView()
                notifySessionEnded()
            }
        }
        sessionWatchdog = watchdog
        mainHandler.postDelayed(watchdog, SESSION_START_TIMEOUT_MS)
    }

    private fun cancelSessionWatchdog() {
        sessionWatchdog?.let { mainHandler.removeCallbacks(it) }
        sessionWatchdog = null
    }

    private fun detachArView() {
        cancelSessionWatchdog()
        cancelEmergence()
        sessionFrameReceived = false
        attachCompleted = false
        stopImuWarmup()
        if (technique == CubeARTechnique.FACE) {
            destroyFaceContent()
        } else {
            clearPlacement()
        }
        cubeNode = null
        cubeBaseScale = null
        cubeRestY = 0f
        featurePointHudView?.let { hud ->
            (hud.parent as? ViewGroup)?.removeView(hud)
        }
        featurePointHudView = null
        depthPeekView?.let { peek ->
            (peek.parent as? ViewGroup)?.removeView(peek)
            peek.release()
        }
        depthPeekView = null
        lightEstimateHudView?.let { chip ->
            (chip.parent as? ViewGroup)?.removeView(chip)
        }
        lightEstimateHudView = null
        lightEstimateTick = 0
        faceMeshPeekView?.let { peek ->
            (peek.parent as? ViewGroup)?.removeView(peek)
        }
        faceMeshPeekView = null
        depthPeekPixels = null
        depthModeActive = false
        depthModeResolved = false
        depthPeekTick = 0
        depthPeekHidden = false
        arSceneView?.let { view ->
            safeDestroySceneView(view)
            arSceneView = null
            materialLoader = null
            reticleNode = null
            surfaceFound = false
        }
        arLifecycleOwner = null
        technique = CubeARTechnique.PLACE

        val webView = bridge.webView
        webView.setBackgroundColor(Color.WHITE)
        webView.setLayerType(View.LAYER_TYPE_NONE, null)
    }

    private fun parseHexColor(hex: String): Triple<Float, Float, Float> {
        val clean = hex.removePrefix("#")
        val value = clean.toLong(16)
        val r = ((value shr 16) and 0xFF) / 255f
        val g = ((value shr 8) and 0xFF) / 255f
        val b = (value and 0xFF) / 255f
        return Triple(r, g, b)
    }

    private fun notifyTracking(state: String, message: String? = null) {
        val payload = JSObject()
        payload.put("state", state)
        if (message != null) payload.put("message", message)
        notifyListeners("trackingChanged", payload)
    }

    private fun notifySessionEnded() {
        notifyListeners("sessionEnded", JSObject())
    }

    override fun handleOnPause() {
        super.handleOnPause()
        val registry = arLifecycleOwner?.registry
        if (registry != null && registry.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
            try {
                registry.handleLifecycleEvent(Lifecycle.Event.ON_PAUSE)
            } catch (_: Exception) {
                // ignore
            }
        }
    }

    override fun handleOnResume() {
        super.handleOnResume()
        pendingStartCall?.let { ensureArCoreAndBeginSession(it) }
        val view = arSceneView ?: return
        val registry = arLifecycleOwner?.registry
        if (registry != null && registry.currentState.isAtLeast(Lifecycle.State.STARTED) &&
            !registry.currentState.isAtLeast(Lifecycle.State.RESUMED)
        ) {
            try {
                registry.handleLifecycleEvent(Lifecycle.Event.ON_RESUME)
            } catch (ex: Exception) {
                Logger.error("CubeAR lifecycle resume failed", ex)
            }
        } else {
            try {
                view.arCore.resume(activity, null)
            } catch (ex: Exception) {
                Logger.error("CubeAR resume failed", ex)
            }
        }
    }

    override fun handleOnDestroy() {
        pendingStartCall = null
        detachArView()
        super.handleOnDestroy()
    }
}
