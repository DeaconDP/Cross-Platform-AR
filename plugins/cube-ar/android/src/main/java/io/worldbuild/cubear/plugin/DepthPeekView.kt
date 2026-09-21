package io.worldbuild.cubear.plugin

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.util.TypedValue
import android.view.MotionEvent
import android.view.View

/** Semi-transparent ARCore depth heatmap; sits under the Capacitor WebView. */
class DepthPeekView(context: Context) : View(context) {

    companion object {
        const val MIN_DEPTH_MM = 200
        const val MAX_DEPTH_MM = 4000
        const val FRAME_STRIDE = 3
        private const val HEATMAP_ALPHA = 110

        private val LUT = IntArray(256) { i -> lutColor(i / 255f) }

        fun colorForMm(mm: Int): Int {
            if (mm <= 0) return Color.TRANSPARENT
            val t = ((mm - MIN_DEPTH_MM).toFloat() /
                (MAX_DEPTH_MM - MIN_DEPTH_MM).toFloat()).coerceIn(0f, 1f)
            val near = 1f - t
            return LUT[(near * 255f).toInt().coerceIn(0, 255)]
        }

        private fun lutColor(near: Float): Int {
            val r: Float
            val g: Float
            val b: Float
            when {
                near < 0.34f -> {
                    val u = near / 0.34f
                    r = 0.05f + 0.05f * u
                    g = 0.12f + 0.68f * u
                    b = 0.42f + 0.53f * u
                }
                near < 0.67f -> {
                    val u = (near - 0.34f) / 0.33f
                    r = 0.10f + 0.89f * u
                    g = 0.80f + 0.20f * u
                    b = 0.95f - 0.88f * u
                }
                else -> {
                    val u = (near - 0.67f) / 0.33f
                    r = 0.99f
                    g = 1.00f - 0.55f * u
                    b = 0.07f * (1f - u)
                }
            }
            return Color.argb(
                HEATMAP_ALPHA,
                (r * 255f).toInt().coerceIn(0, 255),
                (g * 255f).toInt().coerceIn(0, 255),
                (b * 255f).toInt().coerceIn(0, 255),
            )
        }
    }

    private val lock = Any()
    private var heatmap: Bitmap? = null
    private var stretchToView = true
    private val bitmapMatrix = Matrix()
    private val destRect = RectF()
    private val polySrc = FloatArray(8)
    @Volatile
    var dimmed = false

    private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFF0F6FC.toInt()
        textSize = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_SP,
            12f,
            resources.displayMetrics,
        )
    }
    private val labelBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x990D1117.toInt()
    }
    private val pad = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        12f,
        resources.displayMetrics,
    )
    private val labelTop = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        36f,
        resources.displayMetrics,
    )
    private val labelBgRadius = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        6f,
        resources.displayMetrics,
    )

    init {
        setWillNotDraw(false)
        isClickable = false
        isFocusable = false
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        setBackgroundColor(Color.TRANSPARENT)
    }

    fun setHeatmap(pixels: IntArray, widthPx: Int, heightPx: Int, viewCorners: FloatArray?) {
        if (widthPx <= 0 || heightPx <= 0 || pixels.size < widthPx * heightPx) return
        synchronized(lock) {
            var bmp = heatmap
            if (bmp == null || bmp.width != widthPx || bmp.height != heightPx) {
                bmp?.recycle()
                bmp = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
                heatmap = bmp
            }
            bmp.setPixels(pixels, 0, widthPx, 0, 0, widthPx, heightPx)
            stretchToView = !applyViewCorners(widthPx, heightPx, viewCorners)
        }
        postInvalidateOnAnimation()
    }

    fun release() {
        synchronized(lock) {
            heatmap?.recycle()
            heatmap = null
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean = false

    override fun onDraw(canvas: Canvas) {
        val alphaMul = if (dimmed) 72 else 255
        synchronized(lock) {
            bitmapPaint.alpha = alphaMul
            val bmp = heatmap
            if (bmp != null) {
                if (stretchToView) {
                    destRect.set(0f, 0f, width.toFloat(), height.toFloat())
                    canvas.drawBitmap(bmp, null, destRect, bitmapPaint)
                } else {
                    canvas.drawBitmap(bmp, bitmapMatrix, bitmapPaint)
                }
            }
            if (bmp == null) return
            labelPaint.alpha = alphaMul
            labelBgPaint.alpha = if (dimmed) 40 else 153
            val text = "Depth peek"
            val fm = labelPaint.fontMetrics
            val textW = labelPaint.measureText(text)
            val x = width - pad - textW
            val y = pad + labelTop
            canvas.drawRoundRect(
                x - 6f,
                y + fm.ascent - 6f,
                x + textW + 6f,
                y + fm.descent + 6f,
                labelBgRadius,
                labelBgRadius,
                labelBgPaint,
            )
            canvas.drawText(text, x, y, labelPaint)
        }
    }

    private fun applyViewCorners(widthPx: Int, heightPx: Int, viewCorners: FloatArray?): Boolean {
        if (viewCorners == null || viewCorners.size < 8) return false
        for (i in 0 until 8) {
            if (!viewCorners[i].isFinite()) return false
        }
        val dx = viewCorners[2] - viewCorners[0]
        val dy = viewCorners[3] - viewCorners[1]
        if (dx * dx + dy * dy < 1f) return false
        polySrc[0] = 0f
        polySrc[1] = 0f
        polySrc[2] = widthPx.toFloat()
        polySrc[3] = 0f
        polySrc[4] = widthPx.toFloat()
        polySrc[5] = heightPx.toFloat()
        polySrc[6] = 0f
        polySrc[7] = heightPx.toFloat()
        return bitmapMatrix.setPolyToPoly(polySrc, 0, viewCorners, 0, 4)
    }
}
