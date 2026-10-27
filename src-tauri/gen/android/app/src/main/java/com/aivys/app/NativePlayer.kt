package com.aivys.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import org.json.JSONObject
import java.io.File

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
  private var serviceStarted = false
  // What the page last set: the metadata goes with the item.
  private var path: String? = null
  private var metadata = JSONObject()

  private val player get() = PlayerHub.player(activity)

  private val ticker = object : Runnable {
    override fun run() {
      emit(JSONObject().put("type", "time").put("position", player.currentPosition / 1000.0))
      if (player.isPlaying) main.postDelayed(this, TICK_MS)
    }
  }

  init {
    main.post {
      PlayerHub.onSkip = { next -> emit(JSONObject().put("type", if (next) "next" else "previous")) }
      player.addListener(object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
          if (isPlaying) {
            main.removeCallbacks(ticker)
            main.post(ticker)
          }
        }

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
          emit(JSONObject().put("type", if (playWhenReady) "play" else "pause"))
        }

        override fun onPlaybackStateChanged(state: Int) {
          when (state) {
            Player.STATE_READY -> if (player.duration != C.TIME_UNSET) {
              emit(JSONObject().put("type", "loaded").put("duration", player.duration / 1000.0))
            }
            Player.STATE_ENDED -> {
              player.playWhenReady = false
              emit(JSONObject().put("type", "ended"))
            }
          }
        }

        override fun onPositionDiscontinuity(old: Player.PositionInfo, new: Player.PositionInfo, reason: Int) {
          if (reason == Player.DISCONTINUITY_REASON_SEEK) {
            emit(JSONObject().put("type", "seeked").put("position", new.positionMs / 1000.0))
          }
        }

        override fun onPlayerError(error: PlaybackException) {
          emit(JSONObject().put("type", "error").put("message", error.message ?: error.errorCodeName))
        }
      })
    }
  }

  /** Load the file at `path` (paused), at `startAt` seconds. */
  @JavascriptInterface
  fun load(path: String, startAt: Double) = main.post {
    startService()
    this.path = path
    // The page sends the new track's metadata right after; until then, its file name.
    metadata = JSONObject()
    player.setMediaItem(item(path), (startAt * 1000).toLong())
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
  fun setVolume(volume: Double) = main.post { player.volume = volume.toFloat() }

  /** Let the file go: nothing loaded. */
  @JavascriptInterface
  fun unload() = main.post {
    path = null
    player.stop()
    player.clearMediaItems()
  }

  /**
   * What the system's media controls show: `{title, artist, album, cover}`
   * (`cover` a file path). Kept for the next load too.
   */
  @JavascriptInterface
  fun setMetadata(json: String) = main.post {
    metadata = JSONObject(json)
    val current = path ?: return@post
    if (player.mediaItemCount > 0) player.replaceMediaItem(0, item(current))
  }

  private fun item(path: String): MediaItem {
    val info = MediaMetadata.Builder()
      .setTitle(metadata.optString("title").ifEmpty { File(path).nameWithoutExtension })
      .setArtist(metadata.optString("artist").ifEmpty { null })
      .setAlbumTitle(metadata.optString("album").ifEmpty { null })
    metadata.optString("cover").ifEmpty { null }?.let { info.setArtworkUri(Uri.fromFile(File(it))) }
    return MediaItem.Builder()
      .setMediaId(path)
      .setUri(Uri.fromFile(File(path)))
      .setMediaMetadata(info.build())
      .build()
  }

  // The service keeps the process (and the music) going in the background.
  private fun startService() {
    if (serviceStarted) return
    serviceStarted = true
    activity.startService(Intent(activity, PlaybackService::class.java))
  }

  private fun emit(detail: JSONObject) {
    val script = "window.dispatchEvent(new CustomEvent('aivys-player', { detail: $detail }))"
    webView.post { webView.evaluateJavascript(script, null) }
  }

  private companion object {
    const val TICK_MS = 250L
  }
}
