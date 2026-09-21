package io.worldbuild.cubear.plugin

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.TypedValue
import android.view.MotionEvent
import android.view.View

/** Transparent overlay of ARCore feature points; sits under the Capacitor WebView. */
class FeaturePointHudView(context: Context) : View(context) {

    companion object {
        const val MAX_POINTS = 200
        const val MIN_CONFIDENCE = 0.5f
    }

    private val lock = Any()
    private val screenPts = FloatArray(MAX_POINTS * 2)
    private var drawCount = 0
    private var label = "Feature points · 0"
    @Volatile
    var dimmed = false

    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF3DD6F5.toInt()
        style = Paint.Style.FILL
    }
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
    private val dotRadius = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        2.5f,
        resources.displayMetrics,
    )
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

    fun setScreenPoints(src: FloatArray, n: Int, cloudCount: Int) {
        val copyN = n.coerceIn(0, MAX_POINTS)
        synchronized(lock) {
            if (copyN > 0) {
                System.arraycopy(src, 0, screenPts, 0, copyN * 2)
            }
            drawCount = copyN
            label = "Feature points · $cloudCount"
        }
        postInvalidateOnAnimation()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean = false

    override fun onDraw(canvas: Canvas) {
        val alphaMul = if (dimmed) 72 else 255
        synchronized(lock) {
            dotPaint.alpha = alphaMul
            labelPaint.alpha = alphaMul
            labelBgPaint.alpha = if (dimmed) 40 else 153
            for (i in 0 until drawCount) {
                canvas.drawCircle(
                    screenPts[i * 2],
                    screenPts[i * 2 + 1],
                    dotRadius,
                    dotPaint,
                )
            }
            val text = label
            val fm = labelPaint.fontMetrics
            val textW = labelPaint.measureText(text)
            val x = pad
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
}
