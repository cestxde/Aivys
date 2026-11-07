package com.aivys.app

import android.app.PendingIntent
import android.content.Intent
import android.os.Bundle
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Keeps the music playing with the app in the background, and shows it in
 * the system's media controls (notification shade, lock screen, headset
 * buttons) through a media session around the app's player, with buttons of
 * its own for shuffle and repeat: the system's controls show them around
 * "previous" and "next" (shuffle, previous, play, next, repeat).
 */
class PlaybackService : MediaSessionService() {
  private var session: MediaSession? = null

  private companion object {
    val SHUFFLE = SessionCommand("aivys.shuffle", Bundle.EMPTY)
    val REPEAT = SessionCommand("aivys.repeat", Bundle.EMPTY)
  }

  private val callback = object : MediaSession.Callback {
    // The two buttons' commands are for any controller (the system's included).
    override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult =
      MediaSession.ConnectionResult.AcceptedResultBuilder(session)
        .setAvailableSessionCommands(
          MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon().add(SHUFFLE).add(REPEAT).build(),
        )
        .build()

    override fun onCustomCommand(
      session: MediaSession,
      controller: MediaSession.ControllerInfo,
      customCommand: SessionCommand,
      args: Bundle,
    ): ListenableFuture<SessionResult> {
      when (customCommand.customAction) {
        SHUFFLE.customAction -> PlayerHub.pressShuffle()
        REPEAT.customAction -> PlayerHub.pressRepeat()
      }
      return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
    }
  }

  // Shuffle left of "previous" and repeat right of "next", showing the mode they are in.
  // The platform session (the system's controls) only gets the buttons that can go
  // to the overflow too, as custom actions, in this order.
  private fun modeButtons(): List<CommandButton> = listOf(
    CommandButton.Builder(if (PlayerHub.shuffle) CommandButton.ICON_SHUFFLE_ON else CommandButton.ICON_SHUFFLE_OFF)
      .setSessionCommand(SHUFFLE)
      .setDisplayName("Shuffle")
      .setSlots(CommandButton.SLOT_BACK_SECONDARY, CommandButton.SLOT_OVERFLOW)
      .build(),
    CommandButton.Builder(
      when (PlayerHub.repeat) {
        "all" -> CommandButton.ICON_REPEAT_ALL
        "one" -> CommandButton.ICON_REPEAT_ONE
        else -> CommandButton.ICON_REPEAT_OFF
      },
    )
      .setSessionCommand(REPEAT)
      .setDisplayName("Repeat")
      .setSlots(CommandButton.SLOT_FORWARD_SECONDARY, CommandButton.SLOT_OVERFLOW)
      .build(),
  )

  override fun onCreate() {
    super.onCreate()
    val open = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val created = MediaSession.Builder(this, PlayerHub.sessionPlayer(this))
      .setSessionActivity(open)
      .setCallback(callback)
      .build()
    session = created
    created.setMediaButtonPreferences(modeButtons())
    PlayerHub.onModesChanged = { session?.setMediaButtonPreferences(modeButtons()) }
    // Shown without a controller connecting first: the page drives the player directly.
    addSession(created)
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

  // Swiping the app away stops the music when it is paused; playing, it goes on.
  override fun onTaskRemoved(rootIntent: Intent?) {
    val player = session?.player
    if (player == null || !player.playWhenReady || player.mediaItemCount == 0) {
      stopSelf()
    }
  }

  override fun onDestroy() {
    PlayerHub.onModesChanged = null
    session?.release()
    session = null
    PlayerHub.release()
    super.onDestroy()
  }
}
