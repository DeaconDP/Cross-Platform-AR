package io.worldbuild.cubear.plugin

import com.google.ar.core.HitResult
import com.google.ar.core.Plane
import com.google.ar.core.Pose
import com.google.ar.core.TrackingState
import kotlin.math.hypot
import kotlin.math.min

/**
 * Prefer a live table (then seat/floor) and keep cubes inside the surface,
 * not on a shrinking lip.
 */
internal object PlaneHitPick {
    const val EDGE_MARGIN_M = 0.04f
    const val TINY_HALF_M = 0.08f

    fun bestHorizontal(hits: List<HitResult>): HitResult? {
        var best: HitResult? = null
        var bestScore = Int.MAX_VALUE
        for (hit in hits) {
            val plane = hit.trackable as? Plane ?: continue
            if (plane.trackingState != TrackingState.TRACKING) continue
            if (plane.type != Plane.Type.HORIZONTAL_UPWARD_FACING) continue
            if (!plane.isPoseInPolygon(hit.hitPose)) continue
            val score = score(plane, hit.hitPose)
            if (score < bestScore) {
                bestScore = score
                best = hit
            }
        }
        return best
    }

    fun classRank(plane: Plane): Int {
        return try {
            when (plane.classification) {
                Plane.Classification.TABLE -> 0
                Plane.Classification.SEAT -> 1
                Plane.Classification.FLOOR -> 2
                Plane.Classification.UNKNOWN -> 3
                else -> 8
            }
        } catch (_: Throwable) {
            3
        }
    }

    fun isInsetLocal(lx: Float, lz: Float, halfX: Float, halfZ: Float): Boolean {
        if (halfX < TINY_HALF_M || halfZ < TINY_HALF_M) return true
        val mx = min(EDGE_MARGIN_M, halfX * 0.25f)
        val mz = min(EDGE_MARGIN_M, halfZ * 0.25f)
        return kotlin.math.abs(lx) <= halfX - mx && kotlin.math.abs(lz) <= halfZ - mz
    }

    fun score(plane: Plane, hitPose: Pose): Int {
        val local = plane.centerPose.inverse().compose(hitPose)
        val halfX = maxOf(plane.extentX / 2f, 0.001f)
        val halfZ = maxOf(plane.extentZ / 2f, 0.001f)
        val centerNorm = min(1f, hypot(local.tx() / halfX, local.tz() / halfZ))
        val area = plane.extentX * plane.extentZ
        return scoreParts(classRank(plane), isInsetLocal(local.tx(), local.tz(), halfX, halfZ), area, centerNorm)
    }

    fun scoreParts(classRank: Int, inset: Boolean, areaM2: Float, centerNorm: Float): Int {
        var score = classRank * 100
        if (!inset) score += 40
        score -= (min(areaM2, 2f) * 10).toInt()
        score += (min(1f, maxOf(0f, centerNorm)) * 20).toInt()
        return score
    }
}
