package com.aivys.app

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer

/**
 * The app's one player, shared by the page's bridge (`NativePlayer`) and the
 * background service (`PlaybackService`). It plays one track at a time: the
 * queue stays in the page, which loads the next track when one ends. Only
 * touched on the main thread.
 */
object PlayerHub {
  private var exo: ExoPlayer? = null
  private var forwarding: Player? = null

  /** Told of "next" / "previous" from the notification, the lock screen or a headset. */
  var onSkip: ((next: Boolean) -> Unit)? = null

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
      .also { exo = it }

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

      override fun seekToNext() { onSkip?.invoke(true) }
      override fun seekToNextMediaItem() { onSkip?.invoke(true) }
      override fun seekToPrevious() { onSkip?.invoke(false) }
      override fun seekToPreviousMediaItem() { onSkip?.invoke(false) }
    }.also { forwarding = it }

  fun release() {
    exo?.release()
    exo = null
    forwarding = null
  }
}
