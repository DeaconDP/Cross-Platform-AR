package io.worldbuild.cubear.plugin

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.TypedValue
import android.view.MotionEvent
import android.view.View
import java.util.Locale

/** ARCore ambient light-estimate chip; sits under the Capacitor WebView. */
class LightEstimateHudView(context: Context) : View(context) {

    companion object {
        const val FRAME_STRIDE = 3
    }

    private val lock = Any()
    private var label = "Light · waiting"
    private val colorScratch = FloatArray(3)

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

    fun setReadout(valid: Boolean, pixel: Float, intensity: Float, rgb: FloatArray) {
        val text = if (!valid) {
            "Light · waiting"
        } else {
            val k = (intensity / 1000f).toInt().coerceAtLeast(0)
            "Light · pixel ${fmt(pixel)} · rgb ${fmt(rgb.getOrElse(0) { 1f })} " +
                "${fmt(rgb.getOrElse(1) { 1f })} ${fmt(rgb.getOrElse(2) { 1f })} · ~${k}k"
        }
        synchronized(lock) {
            label = text
            if (valid && rgb.size >= 3) {
                colorScratch[0] = rgb[0]
                colorScratch[1] = rgb[1]
                colorScratch[2] = rgb[2]
            } else {
                colorScratch[0] = 1f
                colorScratch[1] = 1f
                colorScratch[2] = 1f
            }
        }
        postInvalidateOnAnimation()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean = false

    override fun onDraw(canvas: Canvas) {
        synchronized(lock) {
            val r = colorScratch[0].coerceIn(0.2f, 2.2f)
            val g = colorScratch[1].coerceIn(0.2f, 2.2f)
            val b = colorScratch[2].coerceIn(0.2f, 2.2f)
            labelBgPaint.color = Color.argb(
                153,
                (13 + r * 28f).toInt().coerceIn(0, 80),
                (17 + g * 28f).toInt().coerceIn(0, 80),
                (23 + b * 28f).toInt().coerceIn(0, 90),
            )
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

    private fun fmt(v: Float): String =
        String.format(Locale.US, "%.2f", v)
}
