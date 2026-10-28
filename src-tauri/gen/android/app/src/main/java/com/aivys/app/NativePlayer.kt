package com.aivys.app

import android.app.Activity
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.media3.common.Player
import org.json.JSONObject

/**
 * The page's player on Android (`window.AivysPlayer`): the WebView cannot
 * stream local files there (its requests for a part of a file past the start
 * fail) and stops when the app is in the background, so the page drives the
 * app's ExoPlayer instead (`PlayerHub`, kept playing by `PlaybackService`).
 *
 * Commands come from the WebView's own thread and are run on the main one.
 * Events go back as `aivys-player` events with a JSON `detail`:
 * `{type: "loaded", duration}`, `play`, `pause`, `{type: "time", position}`,
 * `{type: "seeked", position}`, `ended`, `{type: "error", message}`, `next`,
 * `previous` (seconds throughout).
 */
class NativePlayer(private val activity: Activity, private val webView: WebView) {
  private val main = Handler(Looper.getMainLooper())

  private val player get() = PlayerHub.player(activity)

  init {
    // This page gets the events from now on (a page before it is gone).
    PlayerHub.sink = { detail -> emit(detail) }
  }

  /**
   * What already plays, for the page to take over rather than load anew (the
   * app reopened while its music went on): `{path, position, duration,
   * playing}`, `path` null with nothing loaded.
   */
  @JavascriptInterface
  fun state(): String = PlayerHub.state().toString()

  /** Load the file at `path` (paused), at `startAt` seconds. */
  @JavascriptInterface
  fun load(path: String, startAt: Double) = main.post {
    startService()
    PlayerHub.loaded(path, startAt)
    // The page sends the new track's metadata right after; until then, its file name.
    PlayerHub.metadata = JSONObject()
    player.setMediaItem(PlayerHub.item(path), (startAt * 1000).toLong())
    player.playWhenReady = false
    player.prepare()
  }

  @JavascriptInterface
  fun play() = main.post {
    startService()
    if (player.playbackState == Player.STATE_ENDED) player.seekTo(0)
    player.playWhenReady = true
  }

  @JavascriptInterface
  fun pause() = main.post { player.playWhenReady = false }

  @JavascriptInterface
  fun seek(seconds: Double) = main.post { player.seekTo((seconds * 1000).toLong()) }

  @JavascriptInterface
  fun setVolume(volume: Double) = main.post {
    PlayerHub.volume = volume.toFloat()
    player.volume = PlayerHub.volume
  }

  /** Let the file go: nothing loaded. */
  @JavascriptInterface
  fun unload() = main.post {
    PlayerHub.path = null
    player.stop()
    player.clearMediaItems()
  }

  /**
   * What the system's media controls show: `{title, artist, album, cover}`
   * (`cover` a file path). Kept for the next load too.
   */
  @JavascriptInterface
  fun setMetadata(json: String) = main.post {
    PlayerHub.metadata = JSONObject(json)
    val current = PlayerHub.path ?: return@post
    if (player.mediaItemCount > 0) player.replaceMediaItem(0, PlayerHub.item(current))
  }

  // The service keeps the process (and the music) going in the background;
  // starting it again while it runs changes nothing.
  private fun startService() {
    activity.startService(Intent(activity, PlaybackService::class.java))
  }

  private fun emit(detail: JSONObject) {
    val script = "window.dispatchEvent(new CustomEvent('aivys-player', { detail: $detail }))"
    webView.post { webView.evaluateJavascript(script, null) }
  }
}
