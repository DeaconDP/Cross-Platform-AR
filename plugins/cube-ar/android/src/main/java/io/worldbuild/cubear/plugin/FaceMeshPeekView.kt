package io.worldbuild.cubear.plugin

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.TypedValue
import android.view.MotionEvent
import android.view.View

/** ARCore face-mesh wireframe + landmark dots; sits under the Capacitor WebView. */
class FaceMeshPeekView(context: Context) : View(context) {

    companion object {
        const val MAX_VERTS = 468
        const val MAX_LINES = 900
        const val MAX_LANDMARKS = 3
        const val FRAME_STRIDE = 2
    }

    private val lock = Any()
    private val verts = FloatArray(MAX_VERTS * 2)
    private val lines = FloatArray(MAX_LINES * 4)
    private val landmarks = FloatArray(MAX_LANDMARKS * 2)
    private var vertCount = 0
    private var lineCount = 0
    private var landmarkCount = 0
    private var label = "Face mesh · looking"
    @Volatile
    var dimmed = false

    private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xCC3DD6F5.toInt()
        style = Paint.Style.STROKE
        strokeWidth = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            1.1f,
            resources.displayMetrics,
        )
        strokeJoin = Paint.Join.ROUND
        strokeCap = Paint.Cap.ROUND
    }
    private val vertPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF3DD6F5.toInt()
        style = Paint.Style.FILL
    }
    private val landmarkPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFE27221.toInt()
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
    private val vertRadius = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        1.6f,
        resources.displayMetrics,
    )
    private val landmarkRadius = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        5f,
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

    fun clear() {
        setMesh(null, 0, null, 0, null, 0, locked = false)
    }

    fun setMesh(
        vertSrc: FloatArray?,
        nVerts: Int,
        lineSrc: FloatArray?,
        nLines: Int,
        landmarkSrc: FloatArray?,
        nLandmarks: Int,
        locked: Boolean,
        vertTotal: Int = nVerts,
    ) {
        val copyV = nVerts.coerceIn(0, MAX_VERTS)
        val copyL = nLines.coerceIn(0, MAX_LINES)
        val copyM = nLandmarks.coerceIn(0, MAX_LANDMARKS)
        synchronized(lock) {
            if (copyV > 0 && vertSrc != null) {
                System.arraycopy(vertSrc, 0, verts, 0, copyV * 2)
            }
            if (copyL > 0 && lineSrc != null) {
                System.arraycopy(lineSrc, 0, lines, 0, copyL * 4)
            }
            if (copyM > 0 && landmarkSrc != null) {
                System.arraycopy(landmarkSrc, 0, landmarks, 0, copyM * 2)
            }
            vertCount = copyV
            lineCount = copyL
            landmarkCount = copyM
            label = if (locked) {
                "Face mesh · locked · $vertTotal verts"
            } else {
                "Face mesh · looking"
            }
        }
        postInvalidateOnAnimation()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean = false

    override fun onDraw(canvas: Canvas) {
        val alphaMul = if (dimmed) 72 else 255
        synchronized(lock) {
            linePaint.alpha = (0xCC * alphaMul) / 255
            vertPaint.alpha = alphaMul
            landmarkPaint.alpha = alphaMul
            labelPaint.alpha = alphaMul
            labelBgPaint.alpha = if (dimmed) 40 else 153
            if (lineCount > 0) {
                canvas.drawLines(lines, 0, lineCount * 4, linePaint)
            }
            val vStep = if (vertCount > 80) 3 else 1
            var i = 0
            while (i < vertCount) {
                canvas.drawCircle(
                    verts[i * 2],
                    verts[i * 2 + 1],
                    vertRadius,
                    vertPaint,
                )
                i += vStep
            }
            for (m in 0 until landmarkCount) {
                canvas.drawCircle(
                    landmarks[m * 2],
                    landmarks[m * 2 + 1],
                    landmarkRadius,
                    landmarkPaint,
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
