package com.aivys.app

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // The page asks for, and checks, access to the music folders through it.
  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(StorageAccess(this), "AivysStorage")
  }
}
