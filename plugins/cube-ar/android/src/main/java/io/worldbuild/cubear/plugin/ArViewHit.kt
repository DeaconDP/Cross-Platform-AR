package io.worldbuild.cubear.plugin

import android.opengl.Matrix
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import com.google.ar.core.HitResult
import com.google.ar.core.Plane
import com.google.ar.core.TrackingState
import kotlin.math.sqrt

/**
 * VIEW_NORMALIZED tap → ARCore VIEW pixels (letterbox-safe), then a camera-ray
 * hitTest fallback when the screen-space test is empty.
 */
internal class ArViewHit {
    var lastW: Int = 0
    var lastH: Int = 0
    var miss: String = "noSurface"

    fun hitHorizontal(
        frame: Frame?,
        nx: Float,
        ny: Float,
        viewW: Int,
        viewH: Int,
    ): HitResult? {
        if (frame == null) {
            miss = "notReady"
            return null
        }
        if (frame.camera.trackingState != TrackingState.TRACKING) {
            miss = "notTracking"
            return null
        }
        val px = toViewPx(frame, nx, ny, viewW, viewH)
        if (px == null) {
            miss = "notReady"
            return null
        }
        firstHorizontal(frame.hitTest(px[0], px[1]))?.let { return it }
        firstHorizontal(hitAlongRay(frame, nx, ny))?.let { return it }
        miss = "noSurface"
        return null
    }

    fun toViewPx(frame: Frame, nx: Float, ny: Float, viewW: Int, viewH: Int): FloatArray? {
        if (viewW > 0) lastW = viewW
        if (viewH > 0) lastH = viewH
        val w = if (viewW > 0) viewW else lastW
        val h = if (viewH > 0) viewH else lastH
        if (w <= 0 || h <= 0) return null
        val cx = clamp01(nx)
        val cy = clamp01(ny)
        val out = FloatArray(2)
        try {
            frame.transformCoordinates2d(
                Coordinates2d.VIEW_NORMALIZED,
                floatArrayOf(cx, cy),
                Coordinates2d.VIEW,
                out,
            )
            if (out[0].isFinite() && out[1].isFinite()) return out
        } catch (_: Exception) {
            // fall through to linear map
        }
        return floatArrayOf(cx * w, cy * h)
    }

    private fun hitAlongRay(frame: Frame, nx: Float, ny: Float): List<HitResult> {
        return try {
            val cam = frame.camera
            val view = FloatArray(16)
            val proj = FloatArray(16)
            val vp = FloatArray(16)
            val inv = FloatArray(16)
            cam.getViewMatrix(view, 0)
            cam.getProjectionMatrix(proj, 0, 0.1f, 100f)
            Matrix.multiplyMM(vp, 0, proj, 0, view, 0)
            if (!Matrix.invertM(inv, 0, vp, 0)) return emptyList()
            val ndcX = clamp01(nx) * 2f - 1f
            val ndcY = (1f - clamp01(ny)) * 2f - 1f
            val near = unproject(inv, ndcX, ndcY, -1f) ?: return emptyList()
            val far = unproject(inv, ndcX, ndcY, 1f) ?: return emptyList()
            val dir = floatArrayOf(far[0] - near[0], far[1] - near[1], far[2] - near[2])
            val len = sqrt((dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]).toDouble()).toFloat()
            if (len < 1e-6f) return emptyList()
            dir[0] /= len
            dir[1] /= len
            dir[2] /= len
            frame.hitTest(near, dir)
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun firstHorizontal(hits: List<HitResult>): HitResult? {
        for (hit in hits) {
            val plane = hit.trackable as? Plane ?: continue
            if (plane.trackingState != TrackingState.TRACKING) continue
            if (plane.type == Plane.Type.VERTICAL) continue
            if (plane.type == Plane.Type.HORIZONTAL_DOWNWARD_FACING) continue
            if (!plane.isPoseInPolygon(hit.hitPose)) continue
            return hit
        }
        return null
    }

    private fun unproject(invVp: FloatArray, x: Float, y: Float, z: Float): FloatArray? {
        val v = floatArrayOf(x, y, z, 1f)
        val o = FloatArray(4)
        Matrix.multiplyMV(o, 0, invVp, 0, v, 0)
        if (kotlin.math.abs(o[3]) < 1e-6f) return null
        return floatArrayOf(o[0] / o[3], o[1] / o[3], o[2] / o[3])
    }

    private fun clamp01(n: Float): Float = when {
        n <= 0f -> 0f
        n >= 1f -> 1f
        else -> n
    }
}
