package com.aivys.app

import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var player: NativePlayer? = null

  // The app's window, made by the Rust side: for the activities after the
  // process's first (see `openWindow` in lib.rs).
  private external fun openWindow()

  private companion object {
    // Whether an activity was made in this process before.
    var made = false
  }

  // Back is handled below: to the app in the background rather than closed.
  override val handleBackNavigation: Boolean = false

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    // The navigation buttons over the page as they are, without a dimmed strip under them.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) window.isNavigationBarContrastEnforced = false
    super.onCreate(savedInstanceState)
    // The process outlived the last activity (the app swiped away, its music
    // going on) and took its window along: the new activity needs a new one.
    if (made) openWindow()
    made = true
  }

  override fun onResume() {
    super.onResume()
    PlayerHub.setPageVisible(true)
  }

  override fun onPause() {
    PlayerHub.setPageVisible(false)
    super.onPause()
  }

  // The page is gone with the activity (the app swiped away); the music may go
  // on, and the player takes over the queue.
  override fun onDestroy() {
    player?.detach()
    player = null
    super.onDestroy()
  }

  // The page asks for, and checks, access to the music folders, keeps its
  // content out of the system bars and plays through the app's player,
  // through these.
  override fun onWebViewCreate(webView: WebView) {
    // An app, not a page: no pinch zoom.
    webView.settings.setSupportZoom(false)
    webView.settings.builtInZoomControls = false
    webView.settings.displayZoomControls = false
    webView.addJavascriptInterface(StorageAccess(this), "AivysStorage")
    webView.addJavascriptInterface(SafeInsets(webView), "AivysInsets")
    player = NativePlayer(this, webView).also { webView.addJavascriptInterface(it, "AivysPlayer") }

    // Back closes what the page has open (a dialog, the player, a view other
    // than the library: useBackLayer.ts); with nothing left, the app goes to
    // the background, like a player, its music going on.
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        webView.evaluateJavascript("window.aivysBack ? window.aivysBack() : false") { closed ->
          if (closed != "true") moveTaskToBack(true)
        }
      }
    })
  }
}
