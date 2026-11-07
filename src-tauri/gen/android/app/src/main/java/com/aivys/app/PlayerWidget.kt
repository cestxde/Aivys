package com.aivys.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Shader
import android.widget.RemoteViews

/**
 * The home screen widget: the cover, "title - artist" and the buttons of the
 * system's media controls (shuffle, previous, play / pause, next, repeat).
 * It shows what `PlayerHub` plays (`PlayerHub.widgetChanged` redraws it) and
 * its buttons drive the same player, with the app open or not. With nothing
 * loaded (the process is new) the session kept last time is brought back
 * (`PlayerHub.restore`), and what the widget shows is what was kept.
 */
class PlayerWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    refresh(context)
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    val handled = when (intent.action) {
      ACTION_PLAY_PAUSE -> PlayerHub.togglePlay(context)
      ACTION_PREVIOUS -> PlayerHub.skipFromWidget(context, false)
      ACTION_NEXT -> PlayerHub.skipFromWidget(context, true)
      ACTION_SHUFFLE -> PlayerHub.prepareSession(context).also { if (it) PlayerHub.pressShuffle() }
      ACTION_REPEAT -> PlayerHub.prepareSession(context).also { if (it) PlayerHub.pressRepeat() }
      else -> return
    }
    if (!handled) {
      // Nothing was kept to play (the app was never used here): the app opens.
      val open = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      runCatching { context.startActivity(open) }
    }
  }

  companion object {
    private const val ACTION_PLAY_PAUSE = "com.aivys.app.widget.PLAY_PAUSE"
    private const val ACTION_PREVIOUS = "com.aivys.app.widget.PREVIOUS"
    private const val ACTION_NEXT = "com.aivys.app.widget.NEXT"
    private const val ACTION_SHUFFLE = "com.aivys.app.widget.SHUFFLE"
    private const val ACTION_REPEAT = "com.aivys.app.widget.REPEAT"

    // The buttons of an unset mode are dimmer.
    private const val DIM = 110
    private const val COVER_PX = 160

    // The last cover drawn, so that a play / pause does not read the file again.
    private var coverPath: String? = null
    private var coverBitmap: Bitmap? = null

    /** Draw every widget of this app. */
    fun refresh(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, PlayerWidget::class.java))
      if (ids.isEmpty()) return
      manager.updateAppWidget(ids, views(context))
    }

    private fun views(context: Context): RemoteViews {
      val state = PlayerHub.widgetState(context)
      val views = RemoteViews(context.packageName, R.layout.widget_player)

      views.setTextViewText(R.id.widget_title, state.label ?: context.getString(R.string.app_name))
      val cover = cover(state.cover)
      if (cover != null) views.setImageViewBitmap(R.id.widget_cover, cover)
      else views.setImageViewResource(R.id.widget_cover, R.drawable.widget_cover_placeholder)

      views.setImageViewResource(R.id.widget_play, if (state.playing) R.drawable.ic_widget_pause else R.drawable.ic_widget_play)
      views.setImageViewResource(
        R.id.widget_repeat,
        if (state.repeat == "one") R.drawable.ic_widget_repeat_one else R.drawable.ic_widget_repeat,
      )
      views.setInt(R.id.widget_shuffle, "setImageAlpha", if (state.shuffle) 255 else DIM)
      views.setInt(R.id.widget_repeat, "setImageAlpha", if (state.repeat == "none") DIM else 255)

      views.setOnClickPendingIntent(R.id.widget_shuffle, action(context, ACTION_SHUFFLE))
      views.setOnClickPendingIntent(R.id.widget_previous, action(context, ACTION_PREVIOUS))
      views.setOnClickPendingIntent(R.id.widget_play, action(context, ACTION_PLAY_PAUSE))
      views.setOnClickPendingIntent(R.id.widget_next, action(context, ACTION_NEXT))
      views.setOnClickPendingIntent(R.id.widget_repeat, action(context, ACTION_REPEAT))

      // Only the cover opens the app: a miss of a button does nothing.
      val open = PendingIntent.getActivity(
        context,
        0,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
      views.setOnClickPendingIntent(R.id.widget_cover, open)
      return views
    }

    private fun action(context: Context, action: String): PendingIntent = PendingIntent.getBroadcast(
      context,
      action.hashCode(),
      Intent(context, PlayerWidget::class.java).setAction(action),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    /** The cover file as a round picture (null if there is none to read). */
    private fun cover(path: String?): Bitmap? {
      if (path == null) return null
      if (path == coverPath) return coverBitmap
      val bitmap = decode(path)
      coverPath = path
      coverBitmap = bitmap
      return bitmap
    }

    private fun decode(path: String): Bitmap? {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(path, bounds)
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
      var sample = 1
      while (bounds.outWidth / (sample * 2) >= COVER_PX && bounds.outHeight / (sample * 2) >= COVER_PX) sample *= 2
      val source = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null

      // The middle square of the picture, as a circle.
      val side = minOf(source.width, source.height)
      val scale = COVER_PX.toFloat() / side
      val shader = BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
      shader.setLocalMatrix(
        Matrix().apply {
          setScale(scale, scale)
          postTranslate(-(source.width - side) / 2f * scale, -(source.height - side) / 2f * scale)
        },
      )
      val round = Bitmap.createBitmap(COVER_PX, COVER_PX, Bitmap.Config.ARGB_8888)
      Canvas(round).drawCircle(COVER_PX / 2f, COVER_PX / 2f, COVER_PX / 2f, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.shader = shader })
      source.recycle()
      return round
    }
  }
}
