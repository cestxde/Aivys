package com.aivys.app

import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject

/**
 * The parts of the screen the system draws over: the status bar and camera
 * cutout, the navigation bar, the keyboard. The app is drawn edge to edge
 * (always, since Android 15), so the page reads these (`window.AivysInsets`)
 * in CSS pixels and keeps its content out of them; it hears of a change by
 * the `aivys-insets` event.
 */
class SafeInsets(private val webView: WebView) {
  @Volatile private var current = JSONObject().put("top", 0).put("right", 0).put("bottom", 0).put("left", 0).toString()

  init {
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      update(insets)
      insets
    }
    ViewCompat.requestApplyInsets(webView)
  }

  /** `{"top": .., "right": .., "bottom": .., "left": ..}` in CSS pixels. */
  @JavascriptInterface
  fun get(): String = current

  private fun update(insets: WindowInsetsCompat) {
    val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
    val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
    val density = webView.resources.displayMetrics.density
    val css = { px: Int -> (px / density).toDouble() }
    val next = JSONObject()
      .put("top", css(bars.top))
      .put("right", css(bars.right))
      .put("bottom", css(maxOf(bars.bottom, keyboard.bottom)))
      .put("left", css(bars.left))
      .toString()
    if (next == current) return
    current = next
    webView.post { webView.evaluateJavascript("window.dispatchEvent(new Event('aivys-insets'))", null) }
  }
}
