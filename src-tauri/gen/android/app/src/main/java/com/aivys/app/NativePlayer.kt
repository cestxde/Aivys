package com.aivys.app

import android.app.Activity
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.media3.common.Player
import org.json.JSONArray
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
 * `previous`, `shuffle` and `repeat` (their buttons of the system's controls
 * were pressed), `slept` (the sleep timer paused it) (seconds throughout).
 *
 * The page also tells the player its queue, for it to go on through it with
 * the page gone (the app swiped away), and takes the plays and listening
 * chunks it counted then.
 */
class NativePlayer(private val activity: Activity, private val webView: WebView) {
  private val main = Handler(Looper.getMainLooper())

  private val player get() = PlayerHub.player(activity)

  private val sink: (JSONObject) -> Unit = { detail -> emit(detail) }

  init {
    // This page gets the events from now on (a page before it is gone).
    PlayerHub.sink = sink
    PlayerHub.attachContext(activity)
  }

  /** The page is gone (the activity destroyed): the player goes through the queue by itself now. */
  fun detach() {
    if (PlayerHub.sink === sink) PlayerHub.sink = null
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

  /**
   * The queue, in the order it plays: JSON `[{path, title, artist, album,
   * cover}]` (what the system's media controls show for each; absent when
   * the track has none). Where the loaded track is in it: `setQueueIndex`.
   */
  @JavascriptInterface
  fun setQueue(json: String) {
    // Parsed (and kept for the widget) here, on the WebView's thread: it can be a long list.
    val items = PlayerHub.parseQueue(json)
    PlayerHub.saveQueue(activity, json)
    main.post { PlayerHub.queue = items }
  }

  @JavascriptInterface
  fun setQueueIndex(index: Int) = main.post {
    PlayerHub.queueIndex = index
    PlayerHub.saveState(true)
  }

  /** The repeat mode: "none", "all" or "one". */
  @JavascriptInterface
  fun setRepeat(mode: String) = main.post { PlayerHub.setRepeatMode(mode) }

  /** Whether the page shuffles its queue. */
  @JavascriptInterface
  fun setShuffle(on: Boolean) = main.post { PlayerHub.setShuffle(on) }

  /** The sleep timer's "end of the track" is on or off. */
  @JavascriptInterface
  fun setStopAfterTrack(on: Boolean) = main.post { PlayerHub.stopAfterTrack = on }

  /**
   * The plays and listening chunks counted while the page was gone, for it to
   * record: `[{kind: "play" | "complete", path, at}]` and
   * `[{kind: "listen", path, at, seconds}]` (`at` in Unix seconds). Taken once;
   * they are not given again.
   */
  @JavascriptInterface
  fun takeMissedEvents(): String = PlayerHub.takeMissed(activity)

  /** The sleep timer: fade out and pause in `seconds`. */
  @JavascriptInterface
  fun sleepAfter(seconds: Double) = main.post { PlayerHub.sleepAfter((seconds * 1000).toLong()) }

  @JavascriptInterface
  fun cancelSleep() = main.post { PlayerHub.cancelSleep() }

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
    PlayerHub.widgetChanged()
  }

  /**
   * What the system's media controls show: `{title, artist, album, cover}`
   * (`cover` a file path). Kept for the next load too.
   */
  @JavascriptInterface
  fun setMetadata(json: String) = main.post {
    PlayerHub.metadata = JSONObject(json)
    PlayerHub.widgetChanged()
    PlayerHub.saveState(true)
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
