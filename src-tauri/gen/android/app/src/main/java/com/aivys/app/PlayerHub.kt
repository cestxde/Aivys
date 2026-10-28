package com.aivys.app

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import org.json.JSONObject
import java.io.File

/**
 * The app's one player, shared by the page's bridge (`NativePlayer`) and the
 * background service (`PlaybackService`). It outlives the page: swiped away
 * from the recent apps, the app keeps playing here, and a new page finds what
 * plays (`state`). It plays one track at a time: the queue stays in the page,
 * which loads the next track when one ends. Only touched on the main thread.
 *
 * Its events go to the current page through `sink` (see `NativePlayer`).
 *
 * The system stops the service a while after the music is paused in the
 * background, and the player with it (`release`); the track stays loaded for
 * the page all the same: the next use of the player loads it again, where it
 * was paused.
 */
object PlayerHub {
  private val main = Handler(Looper.getMainLooper())
  private var exo: ExoPlayer? = null
  private var forwarding: Player? = null

  /** Where events go: the current page, if there is one. */
  var sink: ((JSONObject) -> Unit)? = null

  /** The loaded file, for a new page to find. */
  @Volatile var path: String? = null

  /** What the system's media controls show for it (`NativePlayer.setMetadata`). */
  var metadata = JSONObject()

  /** The page's volume, 0 to 1, kept for a player made anew. */
  var volume = 1f

  // A copy of the player's state for `state`, read off the main thread
  // (the player itself is only touched on it).
  @Volatile private var position = 0.0
  @Volatile private var duration: Double? = null
  @Volatile private var playing = false

  // Whether the page is on screen: hidden, it hears where the track is
  // rarely (enough to save it), not several times a second.
  private var pageVisible = true
  private var timeSentAt = 0L

  /** The app's screen shown or hidden (`MainActivity`). */
  fun setPageVisible(visible: Boolean) {
    pageVisible = visible
    // Shown again: where the track is now, at once.
    if (visible && exo?.isPlaying == true) {
      main.removeCallbacks(ticker)
      main.post(ticker)
    }
  }

  /** A new file loaded at `startAt` seconds. */
  fun loaded(path: String, startAt: Double) {
    this.path = path
    position = startAt
    duration = null
  }

  private val ticker = object : Runnable {
    override fun run() {
      val player = exo ?: return
      position = player.currentPosition / 1000.0
      val now = SystemClock.uptimeMillis()
      if (pageVisible || now - timeSentAt >= HIDDEN_TICK_MS) {
        timeSentAt = now
        emit(JSONObject().put("type", "time").put("position", position))
      }
      if (player.isPlaying) main.postDelayed(this, if (pageVisible) TICK_MS else HIDDEN_TICK_MS)
    }
  }

  @OptIn(UnstableApi::class)
  fun player(context: Context): ExoPlayer =
    exo ?: ExoPlayer.Builder(context.applicationContext)
      .setAudioAttributes(
        AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
        /* handleAudioFocus = */ true,
      )
      // Unplugged headphones pause, as everywhere.
      .setHandleAudioBecomingNoisy(true)
      .setWakeMode(C.WAKE_MODE_LOCAL)
      .build()
      .also {
        exo = it
        it.addListener(events)
        it.volume = volume
        // Released while the page kept its track (paused): loaded again, paused where it was.
        path?.let { current ->
          it.setMediaItem(item(current), (position * 1000).toLong())
          it.playWhenReady = false
          it.prepare()
        }
      }

  /** The file at `path` as the player plays it, with what the system's media controls show. */
  fun item(path: String): MediaItem {
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

  /**
   * The player as the media session shows it: with "previous" and "next",
   * which the page answers from its queue.
   */
  fun sessionPlayer(context: Context): Player =
    forwarding ?: object : ForwardingPlayer(player(context)) {
      override fun getAvailableCommands(): Player.Commands =
        super.getAvailableCommands().buildUpon()
          .add(Player.COMMAND_SEEK_TO_NEXT)
          .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
          .add(Player.COMMAND_SEEK_TO_PREVIOUS)
          .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
          .build()

      override fun isCommandAvailable(command: Int): Boolean =
        availableCommands.contains(command)

      override fun seekToNext() = skip(true)
      override fun seekToNextMediaItem() = skip(true)
      override fun seekToPrevious() = skip(false)
      override fun seekToPreviousMediaItem() = skip(false)
    }.also { forwarding = it }

  /**
   * What plays, for a new page: `{path, position, duration, playing}`
   * (seconds; `path` null with nothing loaded).
   */
  fun state(): JSONObject = JSONObject()
    .put("path", path ?: JSONObject.NULL)
    .put("position", position)
    .put("duration", duration ?: JSONObject.NULL)
    .put("playing", playing)

  /** The player gone with the service; what it had loaded (`path`, `position`) is kept. */
  fun release() {
    main.removeCallbacks(ticker)
    exo?.let { position = it.currentPosition / 1000.0 }
    exo?.release()
    exo = null
    forwarding = null
    if (playing) {
      playing = false
      emit(JSONObject().put("type", "pause"))
    }
  }

  private fun skip(next: Boolean) = emit(JSONObject().put("type", if (next) "next" else "previous"))

  private fun emit(detail: JSONObject) {
    sink?.invoke(detail)
  }

  private val events = object : Player.Listener {
    override fun onIsPlayingChanged(isPlaying: Boolean) {
      if (isPlaying) {
        main.removeCallbacks(ticker)
        main.post(ticker)
      }
    }

    override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
      playing = playWhenReady
      emit(JSONObject().put("type", if (playWhenReady) "play" else "pause"))
    }

    override fun onPlaybackStateChanged(state: Int) {
      val player = exo ?: return
      when (state) {
        Player.STATE_READY -> if (player.duration != C.TIME_UNSET) {
          duration = player.duration / 1000.0
          emit(JSONObject().put("type", "loaded").put("duration", duration))
        }
        Player.STATE_ENDED -> {
          player.playWhenReady = false
          emit(JSONObject().put("type", "ended"))
        }
      }
    }

    override fun onPositionDiscontinuity(old: Player.PositionInfo, new: Player.PositionInfo, reason: Int) {
      if (reason == Player.DISCONTINUITY_REASON_SEEK) {
        position = new.positionMs / 1000.0
        emit(JSONObject().put("type", "seeked").put("position", position))
      }
    }

    override fun onPlayerError(error: PlaybackException) {
      emit(JSONObject().put("type", "error").put("message", error.message ?: error.errorCodeName))
    }
  }

  private const val TICK_MS = 250L
  private const val HIDDEN_TICK_MS = 5000L
}
