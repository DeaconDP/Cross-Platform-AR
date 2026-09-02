package io.worldbuild.cubear.plugin

import com.google.ar.core.Camera
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Camera-ray ∩ tracked planes when [Frame.hitTest] returns nothing.
 * Uses every TRACKING plane on the session, not only this frame's updates.
 */
internal object ArRayPlane {
    const val RAY_MIN_M = 0.12f
    const val RAY_MAX_M = 8f
    const val LOOSE_MIN_M = 0.2f
    const val LOOSE_MAX_M = 6f
    const val LOOSE_CENTER_M = 2f

    fun pick(session: Session?, frame: Frame?, nx: Float, ny: Float): Pose? {
        if (session == null || frame == null) return null
        val camera = frame.camera
        if (camera.trackingState != TrackingState.TRACKING) return null
        val origin = FloatArray(3)
        val dir = FloatArray(3)
        if (!screenRay(camera, nx, ny, origin, dir)) return null

        var best: Pose? = null
        var bestRank = 99
        var bestT = Float.MAX_VALUE

        for (plane in session.getAllTrackables(Plane::class.java)) {
            if (plane.trackingState != TrackingState.TRACKING) continue
            if (plane.subsumedBy != null) continue
            if (plane.type != Plane.Type.HORIZONTAL_UPWARD_FACING) continue

            val center = plane.centerPose
            val p0 = FloatArray(3)
            val n = FloatArray(3)
            center.getTranslation(p0, 0)
            center.getYAxis(n, 0)

            val denom = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2]
            if (abs(denom) < 1e-5f) continue
            val t =
                ((p0[0] - origin[0]) * n[0] +
                    (p0[1] - origin[1]) * n[1] +
                    (p0[2] - origin[2]) * n[2]) / denom
            if (t < RAY_MIN_M || t > RAY_MAX_M) continue

            val hitT = floatArrayOf(
                origin[0] + t * dir[0],
                origin[1] + t * dir[1],
                origin[2] + t * dir[2],
            )
            val hitPose = Pose(hitT, center.rotationQuaternion)
            val inPoly = plane.isPoseInPolygon(hitPose)
            val inExt = plane.isPoseInExtents(hitPose)
            val rank = if (inPoly) 0 else if (inExt) 1 else 2
            if (rank == 2) {
                if (t < LOOSE_MIN_M || t > LOOSE_MAX_M) continue
                val dx = hitT[0] - p0[0]
                val dy = hitT[1] - p0[1]
                val dz = hitT[2] - p0[2]
                if (dx * dx + dy * dy + dz * dz > LOOSE_CENTER_M * LOOSE_CENTER_M) continue
            }
            if (rank < bestRank || (rank == bestRank && t < bestT)) {
                best = hitPose
                bestRank = rank
                bestT = t
            }
        }
        return best
    }

    fun syncDisplayGeometry(session: Session?, rotation: Int, width: Int, height: Int) {
        if (session == null || width <= 0 || height <= 0) return
        session.setDisplayGeometry(rotation, width, height)
    }

    private fun screenRay(
        camera: Camera,
        nx: Float,
        ny: Float,
        origin: FloatArray,
        dir: FloatArray,
    ): Boolean {
        val pose = camera.displayOrientedPose
        pose.getTranslation(origin, 0)
        val proj = FloatArray(16)
        camera.getProjectionMatrix(proj, 0, 0.1f, 100f)
        val ndcX = 2f * nx - 1f
        val ndcY = 1f - 2f * ny
        val vx = ndcX / proj[0]
        val vy = ndcY / proj[5]
        val world = FloatArray(3)
        pose.rotateVector(floatArrayOf(vx, vy, -1f), 0, world, 0)
        val len = sqrt(world[0] * world[0] + world[1] * world[1] + world[2] * world[2])
        if (len < 1e-6f) return false
        dir[0] = world[0] / len
        dir[1] = world[1] / len
        dir[2] = world[2] / len
        return true
    }
}
