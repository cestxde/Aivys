package com.aivys.app

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * Keeps the music playing with the app in the background, and shows it in
 * the system's media controls (notification shade, lock screen, headset
 * buttons) through a media session around the app's player.
 */
class PlaybackService : MediaSessionService() {
  private var session: MediaSession? = null

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
      .build()
    session = created
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
    session?.release()
    session = null
    PlayerHub.release()
    super.onDestroy()
  }
}
