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
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * The app's one player, shared by the page's bridge (`NativePlayer`) and the
 * background service (`PlaybackService`). It outlives the page: swiped away
 * from the recent apps, the app keeps playing here, and a new page finds what
 * plays (`state`). It plays one track at a time: the queue is the page's,
 * which loads the next track when one ends. The page also tells the player
 * the queue (`queue`, `queueIndex`, `repeat`, `stopAfterTrack`), and with the
 * page gone (the app swiped away) the player goes through it by itself,
 * counting the plays for the page to record when it is back (`takeMissed`).
 * Only touched on the main thread.
 *
 * Its events go to the current page through `sink` (see `NativePlayer`), null
 * with the page gone.
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

  /** A track of the queue: its file and what the system's media controls show for it (`NativePlayer.setQueue`). */
  class QueueItem(val path: String, val metadata: JSONObject)

  /** What plays after the loaded track, in the order it plays, as the page last told. */
  var queue: List<QueueItem> = emptyList()

  /** Where the loaded track is in `queue`. */
  @Volatile var queueIndex = -1

  /** The page's repeat mode: "none", "all" or "one". */
  var repeat = "none"
    private set

  /** Whether the page shuffles its queue. */
  var shuffle = false
    private set

  /** The shuffle or repeat mode changed (for the buttons of the system's controls): set by `PlaybackService`. */
  var onModesChanged: (() -> Unit)? = null

  fun setRepeatMode(mode: String) {
    if (repeat == mode) return
    repeat = mode
    onModesChanged?.invoke()
  }

  fun setShuffle(on: Boolean) {
    if (shuffle == on) return
    shuffle = on
    onModesChanged?.invoke()
  }

  /**
   * The shuffle button of the system's controls was pressed: the page's to
   * answer, which tells the new mode back. With the page gone the mode is
   * flipped here, and the page takes it when it is back (`state`).
   */
  fun pressShuffle() {
    if (sink != null) emit(JSONObject().put("type", "shuffle")) else setShuffle(!shuffle)
  }

  /** The repeat button of the system's controls was pressed (as `pressShuffle`). */
  fun pressRepeat() {
    if (sink != null) {
      emit(JSONObject().put("type", "repeat"))
    } else {
      setRepeatMode(when (repeat) {
        "none" -> "all"
        "all" -> "one"
        else -> "none"
      })
    }
  }

  /** The sleep timer's "end of the track": at the end of this one the next is loaded, paused. */
  var stopAfterTrack = false

  // Whether the loaded track's play and completion are counted (by the page,
  // or here with the page gone), so each is once per play of the track.
  private var playCounted = false
  private var completeCounted = false

  private var appContext: Context? = null

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
    playCounted = false
    completeCounted = false
  }

  private val ticker = object : Runnable {
    override fun run() {
      val player = exo ?: return
      position = player.currentPosition / 1000.0
      countCompletion()
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
    exo ?: ExoPlayer.Builder(context.applicationContext.also { appContext = it })
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
   * What plays, for a new page: `{path, position, duration, playing,
   * queueIndex, shuffle, repeat}` (seconds; `path` null with nothing loaded).
   */
  fun state(): JSONObject = JSONObject()
    .put("path", path ?: JSONObject.NULL)
    .put("position", position)
    .put("duration", duration ?: JSONObject.NULL)
    .put("playing", playing)
    .put("queueIndex", queueIndex)
    .put("shuffle", shuffle)
    .put("repeat", repeat)

  // The sleep timer: at `sleepAt` (elapsed real time, ms) the music has faded
  // out over SLEEP_FADE_MS and pauses. Here rather than in the page, which
  // may sleep itself (the screen off) or be gone (the app swiped away).
  private var sleepAt = 0L
  private val sleeper = object : Runnable {
    override fun run() {
      val player = exo ?: return
      val left = sleepAt - SystemClock.elapsedRealtime()
      if (left <= 0) {
        sleepAt = 0L
        player.playWhenReady = false
        player.volume = volume
        emit(JSONObject().put("type", "slept"))
        return
      }
      val fading = left < SLEEP_FADE_MS
      player.volume = if (fading) volume * left / SLEEP_FADE_MS else volume
      main.postDelayed(this, if (fading) SLEEP_FADE_STEP_MS else minOf(left - SLEEP_FADE_MS, 60_000L).coerceAtLeast(SLEEP_FADE_STEP_MS))
    }
  }

  /** Fade out and pause in `ms`, instead of any timer set before. */
  fun sleepAfter(ms: Long) {
    main.removeCallbacks(sleeper)
    sleepAt = SystemClock.elapsedRealtime() + ms
    main.post(sleeper)
  }

  /** No sleep timer (the volume back, if it was fading). */
  fun cancelSleep() {
    main.removeCallbacks(sleeper)
    if (sleepAt != 0L) {
      sleepAt = 0L
      exo?.volume = volume
    }
  }

  /** The player gone with the service; what it had loaded (`path`, `position`) is kept. */
  fun release() {
    main.removeCallbacks(ticker)
    main.removeCallbacks(sleeper)
    sleepAt = 0L
    exo?.let { position = it.currentPosition / 1000.0 }
    exo?.release()
    exo = null
    forwarding = null
    if (playing) {
      playing = false
      emit(JSONObject().put("type", "pause"))
    }
  }

  // "Next" and "previous" of the system's controls: the page's to answer, or
  // with the page gone, the player's own, as the page does it.
  private fun skip(next: Boolean) {
    if (sink != null) {
      emit(JSONObject().put("type", if (next) "next" else "previous"))
      return
    }
    val player = exo ?: return
    val here = here()
    if (here < 0) return
    if (!next && player.currentPosition > RESTART_MS) {
      player.seekTo(0)
      return
    }
    val size = queue.size
    go(if (next) (here + 1) % size else (here - 1 + size) % size, play = true)
  }

  /** Where the loaded track is in `queue`: -1 if it is not there. */
  private fun here(): Int {
    val current = path ?: return -1
    if (queue.getOrNull(queueIndex)?.path == current) return queueIndex
    return queue.indexOfFirst { it.path == current }
  }

  /** Load the queue's track `index`, and play it or leave it paused. */
  private fun go(index: Int, play: Boolean) {
    val player = exo ?: return
    val entry = queue.getOrNull(index) ?: return
    queueIndex = index
    loaded(entry.path, 0.0)
    metadata = entry.metadata
    player.setMediaItem(item(entry.path), 0)
    player.playWhenReady = play
    player.prepare()
  }

  /**
   * A track ended with the page gone: as the page does it, the sleep timer's
   * stop, repeating the track, stopping on the first track at the end of the
   * queue without repeat, or going on.
   */
  private fun endedAlone() {
    val player = exo ?: return
    val here = here()
    if (here < 0) return
    val next = (here + 1) % queue.size
    if (stopAfterTrack) {
      stopAfterTrack = false
      go(next, play = false)
    } else if (repeat == "one") {
      position = 0.0
      player.seekTo(0)
      player.playWhenReady = true
    } else if (here == queue.size - 1 && repeat == "none") {
      go(0, play = false)
    } else {
      go(next, play = true)
    }
  }

  // Plays the page does not see (it is gone) are kept, with when they were, in
  // the preferences, as the process may be gone before the page is back.
  private val missedLock = Any()

  private fun missed(kind: String) {
    val file = path ?: return
    val context = appContext ?: return
    synchronized(missedLock) {
      val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      val list = JSONArray(preferences.getString(MISSED_KEY, "[]"))
      list.put(JSONObject().put("kind", kind).put("path", file).put("at", System.currentTimeMillis() / 1000))
      preferences.edit().putString(MISSED_KEY, list.toString()).apply()
    }
  }

  /** The plays counted with the page gone, `[{kind: "play" | "complete", path, at}]` (`at` in Unix seconds), now handed over. */
  fun takeMissed(context: Context): String = synchronized(missedLock) {
    val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val list = preferences.getString(MISSED_KEY, null) ?: "[]"
    preferences.edit().remove(MISSED_KEY).apply()
    list
  }

  // A track counts as completed when it has played this far, as in the page (usePlayTracking.ts).
  private fun countCompletion() {
    val length = duration ?: return
    if (completeCounted || length <= 0 || position < length * COMPLETE_RATIO) return
    completeCounted = true
    if (sink == null) missed("complete")
  }

  private fun emit(detail: JSONObject) {
    sink?.invoke(detail)
  }

  private val events = object : Player.Listener {
    override fun onIsPlayingChanged(isPlaying: Boolean) {
      if (isPlaying) {
        main.removeCallbacks(ticker)
        main.post(ticker)
        if (!playCounted) {
          playCounted = true
          if (sink == null) missed("play")
        }
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
          position = duration ?: position
          countCompletion()
          // Whatever plays next, or this again, is a new play.
          playCounted = false
          completeCounted = false
          if (sink == null) endedAlone() else emit(JSONObject().put("type", "ended"))
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

  private const val PREFERENCES = "player"
  private const val MISSED_KEY = "missed"
  private const val COMPLETE_RATIO = 0.9
  private const val RESTART_MS = 3000L
  private const val TICK_MS = 250L
  private const val HIDDEN_TICK_MS = 5000L
  private const val SLEEP_FADE_MS = 15_000L
  private const val SLEEP_FADE_STEP_MS = 100L
}
