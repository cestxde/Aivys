package com.aivys.app

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  // Back is handled below: to the app in the background rather than closed.
  override val handleBackNavigation: Boolean = false

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
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
    webView.addJavascriptInterface(NativePlayer(this, webView), "AivysPlayer")

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
