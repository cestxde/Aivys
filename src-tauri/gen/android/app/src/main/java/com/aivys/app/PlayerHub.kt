package com.aivys.app

import android.content.Context
import android.content.Intent
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
 * counting the plays and listening time for the page to record when it is
 * back (`takeMissed`). Only touched on the main thread.
 *
 * Its events go to the current page through `sink` (see `NativePlayer`), null
 * with the page gone. While `sink` is null, listening seconds are accumulated
 * here and queued with the missed plays.
 *
 * The system stops the service a while after the music is paused in the
 * background, and the player with it (`release`); the track stays loaded for
 * the page all the same: the next use of the player loads it again, where it
 * was paused.
 */
object PlayerHub {
  private val main = Handler(Looper.getMainLooper())
  private var exo: ExoPlayer? = null
  /** Preload / crossfade partner; swapped into `exo` after a transition. */
  private var exoNext: ExoPlayer? = null
  private var forwarding: Player? = null

  /** Gapless (optional delay) or crossfade between queue tracks. */
  @Volatile var transitionMode = "gapless"
  @Volatile var delayMs = 0L
  @Volatile var crossfadeSec = 3.0
  private var transitioning = false
  private var crossfadeStarted = false
  private var crossfadeUiFlipped = false
  private var crossfadeRamp: Runnable? = null
  private var preloadPath: String? = null

  /** Snapshot of the outgoing track while UI is handed to the next mid-crossfade. */
  private var presentedFromPath: String? = null
  private var presentedFromIndex = -1
  private var presentedFromMetadata = JSONObject()
  private var presentedFromPosition = 0.0
  private var presentedFromDuration: Double? = null

  /** Media session should rebuild its player after an A/B swap. */
  var onSessionPlayerChanged: (() -> Unit)? = null

  fun setTransition(mode: String, delay: Long, crossfade: Double) {
    transitionMode = if (mode == "crossfade") "crossfade" else "gapless"
    delayMs = delay.coerceIn(0L, 30_000L)
    crossfadeSec = crossfade.coerceIn(1.0, 12.0)
  }

  /**
   * Player the page should control (play / pause / seek): after the mid-crossfade
   * UI flip that is the incoming ExoPlayer, otherwise the current one.
   */
  fun transportPlayer(): ExoPlayer? =
    if (crossfadeUiFlipped) exoNext ?: exo else exo

  /** Pause both legs while a crossfade is running; otherwise pause the current player. */
  fun pauseTransport() {
    if (crossfadeStarted) {
      exo?.playWhenReady = false
      exoNext?.playWhenReady = false
    } else {
      (transportPlayer() ?: exo)?.playWhenReady = false
    }
  }

  /** Resume the audible leg(s); mid-crossfade both keep ramping. */
  fun playTransport() {
    if (crossfadeStarted) {
      exo?.playWhenReady = true
      exoNext?.playWhenReady = true
    } else {
      val target = transportPlayer() ?: exo ?: return
      if (target.playbackState == Player.STATE_ENDED) target.seekTo(0)
      target.playWhenReady = true
    }
  }

  fun seekTransport(seconds: Double) {
    val target = transportPlayer() ?: exo ?: return
    target.seekTo((seconds * 1000).toLong())
  }

  /** Page volume; during a crossfade ramp the next tick re-applies `volume`. */
  fun setOutputVolume(level: Float) {
    volume = level
    if (crossfadeStarted) return
    exo?.volume = level
  }

  /**
   * Where events go: the current page, if there is one. Clearing it (page gone)
   * starts native listen accounting if music is already playing; setting it
   * again flushes any pending listen chunk into the missed-events queue.
   */
  var sink: ((JSONObject) -> Unit)? = null
    set(value) {
      val was = field
      when {
        was == null && value != null -> {
          stopListen()
          field = value
        }
        was != null && value == null -> {
          field = value
          if (playing) startListen()
        }
        else -> field = value
      }
    }

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
    widgetChanged()
    saveState(true)
  }

  fun setShuffle(on: Boolean) {
    if (shuffle == on) return
    shuffle = on
    onModesChanged?.invoke()
    widgetChanged()
    saveState(true)
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

  // The home screen widget (PlayerWidget) is redrawn a moment after what it
  // shows changed, once for several changes (a new track and its metadata).
  private val widgetRefresh = Runnable { appContext?.let { PlayerWidget.refresh(it) } }

  /** What the widget shows changed: the track, playing, shuffle or repeat. */
  fun widgetChanged() {
    main.removeCallbacks(widgetRefresh)
    main.postDelayed(widgetRefresh, WIDGET_DELAY_MS)
  }

  /** What the widget shows; `label` is "title - artist", null with nothing loaded. */
  class WidgetState(
    val label: String?,
    val cover: String?,
    val playing: Boolean,
    val shuffle: Boolean,
    val repeat: String,
  )

  fun widgetState(context: Context): WidgetState {
    // With nothing loaded (the process is new) the session kept last time is what shows.
    val kept = path == null
    val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val data = if (kept) savedMetadata(preferences.getString(KEPT_METADATA, null)) else metadata
    val title = text(data, "title") ?: path?.let { File(it).nameWithoutExtension }
    val artist = text(data, "artist")
    val label = if (title == null) null else if (artist == null) title else "$title - $artist"
    val cover = text(data, "cover")?.takeIf { File(it).isFile }
    return WidgetState(
      label,
      cover,
      exo != null && playing,
      if (kept) preferences.getBoolean(KEPT_SHUFFLE, false) else shuffle,
      if (kept) preferences.getString(KEPT_REPEAT, "none") ?: "none" else repeat,
    )
  }

  // A text of the metadata; null if it is missing, null or empty.
  private fun text(data: JSONObject, key: String): String? = if (data.isNull(key)) null else data.optString(key).ifEmpty { null }

  private fun savedMetadata(json: String?): JSONObject = runCatching { JSONObject(json ?: "{}") }.getOrDefault(JSONObject())

  /**
   * Whether the widget's buttons have a session to drive: a track is loaded,
   * or the one kept last time is brought back (`restore`).
   */
  fun prepareSession(context: Context): Boolean = path != null || restore(context)

  /** The page's queue, parsed (`NativePlayer.setQueue`, and `restore` from what was kept). */
  fun parseQueue(json: String): List<QueueItem> {
    val array = JSONArray(json)
    return List(array.length()) { i ->
      val entry = array.getJSONObject(i)
      QueueItem(entry.getString("path"), entry)
    }
  }

  /** Kept as the page sent it, to bring the session back without the page (`restore`). */
  fun saveQueue(context: Context, json: String) {
    runCatching { File(context.applicationContext.filesDir, QUEUE_FILE).writeText(json) }
  }

  fun attachContext(context: Context) {
    appContext = context.applicationContext
  }

  private var stateSavedAt = 0L

  /**
   * Keep where the session is: the track, its place in the queue, the position
   * and the modes. Often while playing, but not every tick.
   */
  fun saveState(force: Boolean) {
    val context = appContext ?: return
    // Nothing loaded: what was kept stays.
    if (path == null) return
    val now = SystemClock.uptimeMillis()
    if (!force && now - stateSavedAt < STATE_SAVE_MS) return
    stateSavedAt = now
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit()
      .putString(KEPT_PATH, path)
      .putInt(KEPT_INDEX, queueIndex)
      .putFloat(KEPT_POSITION, position.toFloat())
      .putString(KEPT_REPEAT, repeat)
      .putBoolean(KEPT_SHUFFLE, shuffle)
      .putString(KEPT_METADATA, metadata.toString())
      .apply()
  }

  /**
   * Bring back the session kept last time, with the process new and the page
   * gone: the queue, the track and where it stopped, the modes; paused until
   * the caller plays it. False if nothing was kept, or the page is there to
   * ask (it has its own).
   */
  private fun restore(context: Context): Boolean {
    if (sink != null) return false
    val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val file = File(context.applicationContext.filesDir, QUEUE_FILE)
    val keptPath = preferences.getString(KEPT_PATH, null) ?: return false
    if (!file.isFile) return false
    val items = runCatching { parseQueue(file.readText()) }.getOrNull() ?: return false
    val keptIndex = preferences.getInt(KEPT_INDEX, -1)
    val index = if (items.getOrNull(keptIndex)?.path == keptPath) keptIndex else items.indexOfFirst { it.path == keptPath }
    if (index < 0 || !File(keptPath).isFile) return false

    appContext = context.applicationContext
    queue = items
    queueIndex = index
    repeat = preferences.getString(KEPT_REPEAT, "none") ?: "none"
    shuffle = preferences.getBoolean(KEPT_SHUFFLE, false)
    metadata = savedMetadata(preferences.getString(KEPT_METADATA, null))
    loaded(keptPath, preferences.getFloat(KEPT_POSITION, 0f).toDouble())
    return true
  }

  // The widget's buttons work with the app's page gone, and the player not made
  // (the service stopped after a long pause): they make it, as a page's load does.
  private fun startPlayback(context: Context) {
    runCatching { context.applicationContext.startService(Intent(context, PlaybackService::class.java)) }
  }

  /** The widget's play / pause. False with nothing loaded (the widget opens the app). */
  fun togglePlay(context: Context): Boolean {
    if (!prepareSession(context)) return false
    startPlayback(context)
    val player = player(context)
    if (player.playWhenReady) {
      player.playWhenReady = false
    } else {
      if (player.playbackState == Player.STATE_ENDED) player.seekTo(0)
      player.playWhenReady = true
    }
    return true
  }

  /** The widget's previous / next, as the system's controls do it. False with nothing loaded. */
  fun skipFromWidget(context: Context, next: Boolean): Boolean {
    if (!prepareSession(context)) return false
    startPlayback(context)
    player(context)
    skip(next)
    return true
  }

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
    // Credit listening on the previous track before the path changes.
    stopListen()
    listenPending = 0.0
    this.path = path
    position = startAt
    duration = null
    playCounted = false
    completeCounted = false
    widgetChanged()
    saveState(true)
  }

  private val ticker = object : Runnable {
    override fun run() {
      val player = if (crossfadeUiFlipped) exoNext ?: exo else exo
      if (player == null) return
      position = player.currentPosition / 1000.0
      if (crossfadeUiFlipped && player.duration != C.TIME_UNSET) {
        duration = player.duration / 1000.0
      }
      countCompletion()
      maybeStartCrossfade()
      maybePreloadNext()
      tickListen()
      if (listenSince != 0L && SystemClock.elapsedRealtime() - listenFlushedAt >= LISTEN_FLUSH_MS) {
        flushListen()
      }
      saveState(false)
      val now = SystemClock.uptimeMillis()
      if (pageVisible || now - timeSentAt >= HIDDEN_TICK_MS) {
        timeSentAt = now
        emit(JSONObject().put("type", "time").put("position", position))
      }
      if (player.isPlaying || (exoNext?.isPlaying == true) || (exo?.isPlaying == true)) {
        main.postDelayed(this, if (pageVisible) TICK_MS else HIDDEN_TICK_MS)
      }
    }
  }

  private val delayAdvance = Runnable { finishGaplessAdvance() }

  @OptIn(UnstableApi::class)
  private fun buildPlayer(context: Context, withFocus: Boolean): ExoPlayer =
    ExoPlayer.Builder(context.applicationContext.also { appContext = it })
      .setAudioAttributes(
        AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
        withFocus,
      )
      .setHandleAudioBecomingNoisy(withFocus)
      .setWakeMode(C.WAKE_MODE_LOCAL)
      .build()

  @OptIn(UnstableApi::class)
  fun player(context: Context): ExoPlayer =
    exo ?: buildPlayer(context, withFocus = true).also {
      exo = it
      it.addListener(events)
      it.volume = volume
      path?.let { current ->
        it.setMediaItem(item(current), (position * 1000).toLong())
        it.playWhenReady = false
        it.prepare()
      }
    }

  @OptIn(UnstableApi::class)
  private fun nextPlayer(context: Context): ExoPlayer =
    exoNext ?: buildPlayer(context, withFocus = false).also {
      exoNext = it
      it.volume = 0f
    }

  /** The file at `path` as the player plays it, with what the system's media controls show. */
  fun item(path: String, meta: JSONObject = metadata): MediaItem {
    val info = MediaMetadata.Builder()
      .setTitle(meta.optString("title").ifEmpty { File(path).nameWithoutExtension })
      .setArtist(meta.optString("artist").ifEmpty { null })
      .setAlbumTitle(meta.optString("album").ifEmpty { null })
    meta.optString("cover").ifEmpty { null }?.let { info.setArtworkUri(Uri.fromFile(File(it))) }
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
    abortTransition()
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
    abortTransition()
    main.removeCallbacks(ticker)
    main.removeCallbacks(sleeper)
    sleepAt = 0L
    exo?.let { position = it.currentPosition / 1000.0 }
    stopListen()
    saveState(true)
    exo?.release()
    exo = null
    exoNext?.release()
    exoNext = null
    forwarding = null
    preloadPath = null
    if (playing) {
      playing = false
      emit(JSONObject().put("type", "pause"))
    }
    widgetChanged()
  }

  /** Cancel an in-flight gapless/crossfade (user skip / new load). */
  fun abortTransitionForLoad() = abortTransition()

  private fun abortTransition() {
    main.removeCallbacks(delayAdvance)
    crossfadeRamp?.let { main.removeCallbacks(it) }
    crossfadeRamp = null
    val restoreUi = crossfadeUiFlipped && presentedFromPath != null
    if (restoreUi) {
      path = presentedFromPath
      queueIndex = presentedFromIndex
      metadata = presentedFromMetadata
      position = presentedFromPosition
      duration = presentedFromDuration
      widgetChanged()
      saveState(true)
      emit(
        JSONObject()
          .put("type", "advanced")
          .put("path", path)
          .put("queueIndex", queueIndex)
          .put("position", position)
          .put("playing", playing)
          .put("ui", "abort"),
      )
      if (duration != null) emit(JSONObject().put("type", "loaded").put("duration", duration))
    }
    clearPresentedSnapshot()
    transitioning = false
    crossfadeStarted = false
    crossfadeUiFlipped = false
    exo?.volume = volume
    exoNext?.playWhenReady = false
    exoNext?.volume = 0f
    clearNext()
  }

  private fun clearPresentedSnapshot() {
    presentedFromPath = null
    presentedFromIndex = -1
    presentedFromMetadata = JSONObject()
    presentedFromPosition = 0.0
    presentedFromDuration = null
  }

  // "Next" and "previous" of the system's controls: the page's to answer, or
  // with the page gone, the player's own, as the page does it.
  private fun skip(next: Boolean) {
    abortTransition()
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
    abortTransition()
    val context = appContext ?: return
    val player = player(context)
    val entry = queue.getOrNull(index) ?: return
    queueIndex = index
    loaded(entry.path, 0.0)
    metadata = entry.metadata
    player.volume = volume
    player.setMediaItem(item(entry.path), 0)
    player.playWhenReady = play
    player.prepare()
    clearNext()
  }

  private fun clearNext() {
    preloadPath = null
    exoNext?.playWhenReady = false
    exoNext?.stop()
    exoNext?.clearMediaItems()
  }

  private fun nextIndex(here: Int): Int? {
    if (queue.isEmpty() || here < 0) return null
    if (here == queue.size - 1 && repeat == "none") return null
    return (here + 1) % queue.size
  }

  private fun maybePreloadNext() {
    if (transitioning || stopAfterTrack || repeat == "one") return
    val here = here()
    val next = nextIndex(here) ?: run {
      clearNext()
      return
    }
    ensurePreloaded(next)
  }

  /** Load queue index `next` into `exoNext` if it is not already the preload. */
  private fun ensurePreloaded(next: Int) {
    val context = appContext ?: return
    val entry = queue.getOrNull(next) ?: return
    if (preloadPath == entry.path && exoNext?.mediaItemCount != 0) return
    val partner = nextPlayer(context)
    preloadPath = entry.path
    partner.volume = 0f
    partner.playWhenReady = false
    partner.setMediaItem(item(entry.path, entry.metadata), 0)
    partner.prepare()
  }

  private fun maybeStartCrossfade() {
    if (transitionMode != "crossfade" || transitioning || crossfadeStarted) return
    if (stopAfterTrack || repeat == "one") return
    val player = exo ?: return
    val length = duration ?: return
    if (length <= 0) return
    val fadeFor = minOf(crossfadeSec, length * 0.45).coerceAtLeast(0.05)
    if (position < length - fadeFor) return
    val here = here()
    val next = nextIndex(here) ?: return
    startCrossfade(next)
  }

  private fun startCrossfade(next: Int) {
    val entry = queue.getOrNull(next) ?: return
    ensurePreloaded(next)
    val partner = exoNext ?: return
    transitioning = true
    crossfadeStarted = true
    crossfadeUiFlipped = false
    clearPresentedSnapshot()
    partner.volume = 0f
    partner.playWhenReady = true
    val fadeMs = (minOf(crossfadeSec, (duration ?: crossfadeSec) - position).coerceAtLeast(0.05) * 1000).toLong()
    val started = SystemClock.elapsedRealtime()
    val outPlayer = exo
    val ramp = object : Runnable {
      override fun run() {
        if (!crossfadeStarted || crossfadeRamp !== this) return
        val t = ((SystemClock.elapsedRealtime() - started).toDouble() / fadeMs).coerceIn(0.0, 1.0)
        val angle = t * (Math.PI / 2)
        outPlayer?.volume = (volume * kotlin.math.cos(angle)).toFloat()
        partner.volume = (volume * kotlin.math.sin(angle)).toFloat()
        // Equal-power midpoint: hand the UI (queue / seek) to the next track.
        if (!crossfadeUiFlipped && t >= 0.5) {
          crossfadeUiFlipped = true
          presentIncoming(next)
        }
        if (t >= 1.0) {
          crossfadeRamp = null
          adoptNext(next, play = true, alreadyPresented = crossfadeUiFlipped)
          return
        }
        main.postDelayed(this, 16L)
      }
    }
    crossfadeRamp = ramp
    main.post(ramp)
  }

  /** Tell the page the next track is now the UI current, without swapping ExoPlayers yet. */
  private fun presentIncoming(next: Int) {
    val entry = queue.getOrNull(next) ?: return
    presentedFromPath = path
    presentedFromIndex = queueIndex
    presentedFromMetadata = metadata
    presentedFromPosition = position
    presentedFromDuration = duration
    queueIndex = next
    path = entry.path
    metadata = entry.metadata
    position = (exoNext?.currentPosition ?: 0L) / 1000.0
    duration = exoNext?.takeIf { it.duration != C.TIME_UNSET }?.let { it.duration / 1000.0 }
    widgetChanged()
    saveState(true)
    if (duration != null) emit(JSONObject().put("type", "loaded").put("duration", duration))
    emit(
      JSONObject()
        .put("type", "advanced")
        .put("path", entry.path)
        .put("queueIndex", next)
        .put("position", position)
        .put("playing", true)
        .put("ui", "crossfade"),
    )
  }

  private fun beginGaplessAdvance(next: Int, play: Boolean) {
    // Preload before flipping `transitioning` — maybePreloadNext refuses while transitioning.
    if (play) ensurePreloaded(next)
    transitioning = true
    if (!play) {
      adoptNext(next, play = false)
      return
    }
    if (delayMs <= 0L) {
      finishGaplessAdvance(next)
      return
    }
    pendingNextIndex = next
    main.removeCallbacks(delayAdvance)
    main.postDelayed(delayAdvance, delayMs)
  }

  private var pendingNextIndex = -1

  private fun finishGaplessAdvance(next: Int = pendingNextIndex) {
    if (next < 0) {
      transitioning = false
      return
    }
    adoptNext(next, play = true)
  }

  /** Promote the preloaded player to current and notify the page. */
  private fun adoptNext(next: Int, play: Boolean, alreadyPresented: Boolean = false) {
    main.removeCallbacks(delayAdvance)
    val context = appContext ?: return
    val entry = queue.getOrNull(next) ?: run {
      transitioning = false
      crossfadeStarted = false
      crossfadeUiFlipped = false
      return
    }
    val old = exo
    var incoming = exoNext
    if (incoming == null || (preloadPath != null && preloadPath != entry.path)) {
      incoming = nextPlayer(context)
      incoming.setMediaItem(item(entry.path, entry.metadata), 0)
      incoming.prepare()
    }
    incoming.volume = volume
    incoming.playWhenReady = play
    old?.playWhenReady = false
    old?.removeListener(events)
    old?.stop()
    old?.clearMediaItems()
    old?.release()
    exo = incoming
    exoNext = null
    preloadPath = null
    incoming.addListener(events)
    forwarding = null
    onSessionPlayerChanged?.invoke()
    queueIndex = next
    if (alreadyPresented) {
      // UI already shows this track; keep position / duration from presentIncoming.
      path = entry.path
      metadata = entry.metadata
      if (incoming.duration != C.TIME_UNSET) duration = incoming.duration / 1000.0
    } else {
      loaded(entry.path, 0.0)
      metadata = entry.metadata
      position = 0.0
      duration = if (incoming.duration != C.TIME_UNSET) incoming.duration / 1000.0 else null
    }
    playing = play
    clearPresentedSnapshot()
    transitioning = false
    crossfadeStarted = false
    crossfadeUiFlipped = false
    crossfadeRamp = null
    widgetChanged()
    saveState(true)
    if (!alreadyPresented) {
      if (duration != null) emit(JSONObject().put("type", "loaded").put("duration", duration))
      emit(
        JSONObject()
          .put("type", "advanced")
          .put("path", entry.path)
          .put("queueIndex", next)
          .put("position", position)
          .put("playing", play),
      )
    }
    if (play) {
      if (!alreadyPresented) emit(JSONObject().put("type", "play"))
      main.removeCallbacks(ticker)
      main.post(ticker)
    } else {
      emit(JSONObject().put("type", "pause"))
    }
  }

  /**
   * End of the current track: sleep stop, repeat one, or transition to next
   * (gapless / delay / crossfade). Used with the page present or gone.
   */
  private fun onTrackEnded() {
    val player = exo ?: return
    val here = here()
    if (here < 0) return
    if (crossfadeStarted) return
    if (stopAfterTrack) {
      stopAfterTrack = false
      val next = (here + 1) % queue.size
      if (sink == null) go(next, play = false) else emit(JSONObject().put("type", "ended"))
      return
    }
    if (repeat == "one") {
      position = 0.0
      player.seekTo(0)
      player.playWhenReady = true
      return
    }
    if (here == queue.size - 1 && repeat == "none") {
      go(0, play = false)
      emit(
        JSONObject()
          .put("type", "advanced")
          .put("path", queue[0].path)
          .put("queueIndex", 0)
          .put("position", 0.0)
          .put("playing", false),
      )
      return
    }
    val next = (here + 1) % queue.size
    if (transitionMode == "crossfade" && !crossfadeStarted) {
      // Crossfade should have started near the end; fall back to gapless.
      beginGaplessAdvance(next, play = true)
    } else {
      beginGaplessAdvance(next, play = true)
    }
  }

  /**
   * A track ended with the page gone: same rules as `onTrackEnded`.
   */
  private fun endedAlone() {
    onTrackEnded()
  }

  // Plays and listen chunks the page does not see (it is gone) are kept, with
  // when they were, in the preferences, as the process may be gone before the
  // page is back.
  private val missedLock = Any()

  // Wall-clock listening while sink is null (mirrors useListenTracking.ts).
  // listenSince != 0 means a segment is open; pending holds sub-second remainder.
  private var listenSince = 0L
  private var listenPending = 0.0
  private var listenFlushedAt = 0L

  private fun startListen() {
    if (sink != null || listenSince != 0L || path == null) return
    listenSince = SystemClock.elapsedRealtime()
    listenFlushedAt = listenSince
  }

  private fun tickListen() {
    if (listenSince == 0L) return
    val now = SystemClock.elapsedRealtime()
    listenPending += (now - listenSince) / 1000.0
    listenSince = now
  }

  private fun flushListen() {
    tickListen()
    val whole = listenPending.toInt()
    if (whole < 1) return
    listenPending -= whole
    listenFlushedAt = SystemClock.elapsedRealtime()
    missed("listen", whole)
  }

  private fun stopListen() {
    if (listenSince == 0L && listenPending < 1.0) {
      listenSince = 0L
      return
    }
    flushListen()
    listenSince = 0L
  }

  private fun missed(kind: String, seconds: Int? = null) {
    val file = path ?: return
    val context = appContext ?: return
    synchronized(missedLock) {
      val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      val list = JSONArray(preferences.getString(MISSED_KEY, "[]"))
      val entry = JSONObject()
        .put("kind", kind)
        .put("path", file)
        .put("at", System.currentTimeMillis() / 1000)
      if (seconds != null) entry.put("seconds", seconds)
      list.put(entry)
      preferences.edit().putString(MISSED_KEY, list.toString()).apply()
    }
  }

  /**
   * Events counted with the page gone, now handed over:
   * `[{kind: "play" | "complete", path, at}]` and
   * `[{kind: "listen", path, at, seconds}]` (`at` in Unix seconds).
   */
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
        if (sink == null) startListen()
      }
    }

    override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
      playing = playWhenReady
      widgetChanged()
      if (!playWhenReady) {
        position = (transportPlayer() ?: exo)?.currentPosition?.div(1000.0) ?: position
        stopListen()
        saveState(true)
      } else if (sink == null) {
        startListen()
      }
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
          if (transitioning && crossfadeStarted) return
          player.playWhenReady = false
          position = duration ?: position
          stopListen()
          countCompletion()
          // Whatever plays next, or this again, is a new play.
          playCounted = false
          completeCounted = false
          onTrackEnded()
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
  private const val QUEUE_FILE = "player-queue.json"
  private const val KEPT_PATH = "keptPath"
  private const val KEPT_INDEX = "keptIndex"
  private const val KEPT_POSITION = "keptPosition"
  private const val KEPT_REPEAT = "keptRepeat"
  private const val KEPT_SHUFFLE = "keptShuffle"
  private const val KEPT_METADATA = "keptMetadata"
  private const val STATE_SAVE_MS = 10_000L
  private const val WIDGET_DELAY_MS = 250L
  private const val TICK_MS = 250L
  private const val HIDDEN_TICK_MS = 5000L
  /** How often listen chunks are flushed while playing with the page gone. */
  private const val LISTEN_FLUSH_MS = 30_000L
  private const val SLEEP_FADE_MS = 15_000L
  private const val SLEEP_FADE_STEP_MS = 100L
}
