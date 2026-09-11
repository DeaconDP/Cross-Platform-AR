package io.worldbuild.cubear.plugin

import android.Manifest
import android.content.Context
import android.graphics.Color
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
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
import com.google.ar.core.Config
import com.google.ar.core.HitResult
import com.google.ar.core.Plane
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.UnavailableDeviceNotCompatibleException
import com.google.ar.core.exceptions.UnavailableUserDeclinedInstallationException
import io.github.sceneview.SceneView
import io.github.sceneview.ar.ARSceneView
import io.github.sceneview.ar.node.AnchorNode
import io.github.sceneview.loaders.MaterialLoader
import io.github.sceneview.math.Color as SceneColor
import io.github.sceneview.math.Direction
import io.github.sceneview.math.Size
import io.github.sceneview.node.CubeNode
import kotlin.math.max
import kotlin.math.sqrt

@CapacitorPlugin(
    name = "CubeAR",
    permissions = [
        Permission(strings = [Manifest.permission.CAMERA], alias = "camera"),
    ],
)
class CubeArPlugin : Plugin() {

    private var arSceneView: ARSceneView? = null
    private var materialLoader: MaterialLoader? = null
    private var cubeSizeM = 0.12f
    private var cubeColorHex = "#30d158"
    private var placedCount = 0
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
    private val rangeTick = Runnable { onRangeTick() }
    private var rangeWatchOn = false
    private var rangeKind = "ok"
    private var rangeRaw = "ok"
    private var rangeSince = 0L
    private var hdrFlag = false
    private var peakFlag = false

    /** Owns a LifecycleRegistry we advance manually so attach-after-resume is safe. */
    private class PluginLifecycleOwner : LifecycleOwner {
        val registry = LifecycleRegistry(this)
        override val lifecycle: Lifecycle
            get() = registry
    }

    companion object {
        // Camera + surface layout often needs >3s on mid-range phones after cold start.
        private const val SESSION_START_TIMEOUT_MS = 10000L
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
        cubeSizeM = max(0.05f, size)
        cubeColorHex = color
        placedCount = 0
        surfaceFound = false

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
        bridge.executeOnMainThread {
            try {
                attachArView(
                    onReady = {
                        startRangeWatch()
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
    fun rangeState(call: PluginCall) {
        call.resolve(rangePayload())
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
            val view = arSceneView
            if (view == null) {
                val result = JSObject()
                result.put("placed", false)
                result.put("count", placedCount)
                call.resolve(result)
                return@executeOnMainThread
            }

            val placed = placeCubeAtScreen(x, y, view)
            val result = JSObject()
            result.put("placed", placed)
            result.put("count", placedCount)
            call.resolve(result)
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


        // Activity context is required for ARCore sensors. sharedActivity/Lifecycle stay
        // null so construction does not resume while the Activity is already RESUMED.
        val sceneView = ARSceneView(
            context = activity,
            sharedActivity = null,
            sharedLifecycle = null,
            onSessionFailed = { ex ->
                bridge.executeOnMainThread {
                    Logger.error("CubeAR session failed", ex)
                    notifyTracking("unavailable", formatError(ex))
                    detachArView()
                    notifySessionEnded()
                }
            },
        )

        try {
            sceneView.arCore.checkCameraPermission = false
            sceneView.arCore.checkAvailability = false
            sceneView.keepScreenOn = true

            sceneView.planeRenderer.isEnabled = true
            sceneView.planeRenderer.isVisible = true

            sceneView.configureSession { _, config ->
                config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL
                config.updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
                config.focusMode = Config.FocusMode.AUTO
                // Disable ARCore light estimates: AMBIENT_INTENSITY writes a ~0–1.8
                // factor into Filament lux each frame and compounds toward black cubes.
                config.lightEstimationMode = Config.LightEstimationMode.DISABLED
            }

            // Fixed sun-like light — do not let LightEstimator overwrite intensity.
            // DefaultLightNode uses direction (0,-1,0) (straight down); angle it like
            // the landing preview's directional light so cubes read with side shading.
            sceneView.lightEstimator?.isEnabled = false
            sceneView.lightEstimator = null
            if (sceneView.mainLightNode == null) {
                sceneView.mainLightNode = SceneView.DefaultLightNode(sceneView.engine)
            }
            val sunDir = run {
                // Match src/scene.ts createLights: light from (+0.5, +1, +0.8) toward origin.
                val x = -0.5f
                val y = -1.0f
                val z = -0.8f
                val len = sqrt(x * x + y * y + z * z)
                Direction(x / len, y / len, z / len)
            }
            sceneView.mainLightNode?.let { light ->
                light.intensity = 100_000f
                light.lightDirection = sunDir
            }
            sceneView.mainLightEstimatedNode?.let { light ->
                light.intensity = 100_000f
                light.lightDirection = sunDir
            }

            sceneView.onSessionUpdated = { _, frame ->
                if (!sessionFrameReceived) {
                    sessionFrameReceived = true
                    cancelSessionWatchdog()
                }
                val tracking = frame.camera.trackingState
                updateReticle(sceneView, frame)
                when (tracking) {
                    TrackingState.TRACKING -> {
                        if (surfaceFound) {
                            notifyTracking("ready", "Surface tracked")
                        } else {
                            notifyTracking("initializing", "Move phone to find a surface")
                        }
                    }
                    TrackingState.PAUSED -> notifyTracking("limited", "Tracking limited")
                    TrackingState.STOPPED -> notifyTracking("unavailable", "Tracking stopped")
                }
            }

            // Own the lifecycle so onAttachedToWindow does not bind the Activity's
            // already-RESUMED lifecycle (which previously double-fired create/resume).
            val owner = PluginLifecycleOwner()
            owner.registry.currentState = Lifecycle.State.INITIALIZED
            sceneView.lifecycle = owner.lifecycle
            arLifecycleOwner = owner

            // Insert behind the WebView so the transparent overlay stays on top.
            webParent.addView(sceneView, index, params)
            webView.bringToFront()


            materialLoader = MaterialLoader(sceneView.engine, activity)
            addReticle(sceneView)
            arSceneView = sceneView
            attachCompleted = false

            fun finishAttach() {
                if (attachCompleted || arSceneView !== sceneView) return
                attachCompleted = true
                // Samsung One UI 8 / ARCore 1.54+: hold uncalibrated IMU open so
                // Session.resume() does not hit "Failed to register sensor to queue 0".
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

    /**
     * Drive SceneView/ARCore through CREATE→RESUME on our registry after layout.
     * Avoids binding the Activity's already-RESUMED lifecycle (double-init / black screen).
     */
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

        // Fallback if lifecycle create skipped session (e.g. permission gate).
        if (sceneView.session == null) {
            try {
                sceneView.arCore.createSession(activity)
                sceneView.arCore.resume(activity, null)
            } catch (ex: Exception) {
                throw ex
            }
        }

    }

    /**
     * Keep uncalibrated accel/gyro streaming before ARCore EnableSensor.
     * Workaround for Samsung HAL + ARCore 1.54 "Failed to register sensor to queue 0".
     * See google-ar/arcore-android-sdk#1762.
     */
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
        // Pause/stop via our registry only. Do NOT call arCore.pause() afterward —
        // lifecycle already paused the session; a second native pause SIGSEGVs
        // (ArSession_pause on null) and is not catchable from Java.
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

    private fun pauseControlledLifecycle() {
        val registry = arLifecycleOwner?.registry ?: return
        try {
            if (registry.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
                registry.handleLifecycleEvent(Lifecycle.Event.ON_PAUSE)
            }
            if (registry.currentState.isAtLeast(Lifecycle.State.STARTED)) {
                registry.handleLifecycleEvent(Lifecycle.Event.ON_STOP)
            }
            if (registry.currentState.isAtLeast(Lifecycle.State.CREATED)) {
                registry.handleLifecycleEvent(Lifecycle.Event.ON_DESTROY)
            }
        } catch (_: Exception) {
            // lifecycle may already be torn down
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

    private fun updateReticle(sceneView: ARSceneView, frame: com.google.ar.core.Frame) {
        val reticle = reticleNode ?: return
        val hits = frame.hitTest(
            sceneView.width / 2f,
            sceneView.height / 2f,
        ).filter { hit ->
            val trackable = hit.trackable
            trackable is Plane && trackable.isPoseInPolygon(hit.hitPose)
        }

        if (hits.isNotEmpty()) {
            val pose = hits[0].hitPose
            reticle.isVisible = true
            reticle.position = io.github.sceneview.math.Position(
                pose.tx(),
                pose.ty(),
                pose.tz(),
            )
            if (!surfaceFound) {
                surfaceFound = true
                notifyTracking("ready", "Tap to place a cube")
            }
        } else {
            reticle.isVisible = false
        }
    }

    private fun placeCubeAtScreen(x: Float, y: Float, sceneView: ARSceneView): Boolean {
        val frame = sceneView.frame
        if (frame == null) {
            return false
        }
        val allHits = frame.hitTest(x, y)
        val hits = allHits.filter { hit ->
            val trackable = hit.trackable
            trackable is Plane && trackable.isPoseInPolygon(hit.hitPose)
        }
        if (hits.isEmpty()) return false

        val hit = hits[0]
        placeCube(sceneView, hit)
        return true
    }

    private fun placeCube(sceneView: ARSceneView, hit: HitResult) {
        val loader = materialLoader ?: return
        val (r, g, b) = parseHexColor(cubeColorHex)
        val anchor = hit.createAnchor()
        val anchorNode = AnchorNode(sceneView.engine, anchor)
        // Matte non-metal so diffuse color reads under the fixed directional light.
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
        cube.position = io.github.sceneview.math.Position(0f, cubeSizeM / 2f, 0f)
        anchorNode.addChildNode(cube)
        sceneView.addChildNode(anchorNode)
        placedCount++
    }

    private fun scheduleSessionWatchdog() {
        cancelSessionWatchdog()
        val watchdog = Runnable {
            sessionWatchdog = null
            if (!sessionFrameReceived && arSceneView != null) {
                val view = arSceneView
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

    private fun rangePayload(): JSObject {
        val o = JSObject()
        o.put("kind", rangeKind)
        o.put("hdrOn", hdrFlag)
        o.put("peakOn", peakFlag)
        o.put("valid", true)
        return o
    }

    private fun startRangeWatch() {
        stopRangeWatch()
        rangeKind = "ok"
        rangeRaw = "ok"
        rangeSince = 0L
        hdrFlag = false
        peakFlag = false
        rangeWatchOn = true
        readRangeFlags()
        tickRange(forceRaw = false)
        mainHandler.postDelayed(rangeTick, 800)
    }

    private fun stopRangeWatch() {
        rangeWatchOn = false
        mainHandler.removeCallbacks(rangeTick)
        rangeKind = "ok"
        hdrFlag = false
        peakFlag = false
    }

    private fun onRangeTick() {
        if (!rangeWatchOn) return
        readRangeFlags()
        tickRange(forceRaw = false)
        mainHandler.postDelayed(rangeTick, 800)
    }

    private fun readRangeFlags() {
        hdrFlag = false
        peakFlag = false
        try {
            val display = activity?.windowManager?.defaultDisplay ?: return
            if (Build.VERSION.SDK_INT >= 26) {
                hdrFlag = display.isHdr
            }
            if (Build.VERSION.SDK_INT >= 34) {
                val info = display.brightnessInfo
                if (info != null && info.currentBrightness >= 0.92f) {
                    peakFlag = true
                }
            }
            if (!peakFlag) {
                try {
                    val raw = Settings.System.getInt(
                        context.contentResolver,
                        Settings.System.SCREEN_BRIGHTNESS,
                    )
                    peakFlag = raw >= 235
                } catch (_: Exception) {
                    /* brightness optional */
                }
            }
            val win = activity?.window?.attributes?.screenBrightness ?: -1f
            if (win >= 0.92f) peakFlag = true
        } catch (_: Exception) {
            /* range optional */
        }
    }

    private fun tickRange(forceRaw: Boolean) {
        val raw = if (hdrFlag) "hdr" else if (peakFlag) "peak" else "ok"
        val now = System.currentTimeMillis()
        if (rangeSince == 0L) {
            rangeSince = now
            rangeRaw = raw
            rangeKind = "ok"
            return
        }
        if (forceRaw || raw != rangeRaw) {
            rangeRaw = raw
            rangeSince = now
            if (forceRaw) {
                rangeKind = raw
                notifyListeners("rangeChanged", rangePayload())
            }
            return
        }
        if (raw == rangeKind) return
        val need = if (raw == "ok") 800L else 400L
        if (now - rangeSince < need) return
        rangeKind = raw
        notifyListeners("rangeChanged", rangePayload())
    }

    private fun detachArView() {
        stopRangeWatch()
        cancelSessionWatchdog()
        sessionFrameReceived = false
        attachCompleted = false
        stopImuWarmup()
        arSceneView?.let { view ->
            safeDestroySceneView(view)
            arSceneView = null
            materialLoader = null
            reticleNode = null
            surfaceFound = false
        }
        arLifecycleOwner = null

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
        // Do not call arCore.pause() here — registry ON_PAUSE already did; a second
        // native pause can SIGSEGV (see exit-button crash).
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
