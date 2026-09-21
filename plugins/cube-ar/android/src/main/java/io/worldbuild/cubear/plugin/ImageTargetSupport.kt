package io.worldbuild.cubear.plugin

import android.content.res.AssetManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.google.ar.core.AugmentedImageDatabase
import com.google.ar.core.Config
import com.google.ar.core.Session

/**
 * Bundled teaching marker for ARCore Augmented Images.
 *
 * Print [ASSET_PATH] at about [PHYSICAL_WIDTH_M] metres wide (16 cm) on matte paper.
 */
internal object ImageTargetSupport {
    const val TARGET_NAME = "deez-marker"
    const val ASSET_PATH = "markers/deez_image_target.png"
    const val PHYSICAL_WIDTH_M = 0.16f

    fun applyToConfig(session: Session, config: Config, assets: AssetManager) {
        val bitmap = decodeUnscaled(assets)
            ?: throw IllegalStateException("Missing image target asset: $ASSET_PATH")
        try {
            val db = AugmentedImageDatabase(session)
            val index = db.addImage(TARGET_NAME, bitmap, PHYSICAL_WIDTH_M)
            if (index < 0) {
                throw IllegalStateException("ARCore rejected the image target")
            }
            config.augmentedImageDatabase = db
            config.focusMode = Config.FocusMode.AUTO
            config.planeFindingMode = Config.PlaneFindingMode.DISABLED
            config.instantPlacementMode = Config.InstantPlacementMode.DISABLED
        } finally {
            bitmap.recycle()
        }
    }

    private fun decodeUnscaled(assets: AssetManager): Bitmap? {
        return assets.open(ASSET_PATH).use { stream ->
            val opts = BitmapFactory.Options().apply {
                inPreferredConfig = Bitmap.Config.ARGB_8888
                inScaled = false
            }
            BitmapFactory.decodeStream(stream, null, opts)
        }
    }
}
