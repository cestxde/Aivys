package com.aivys.app

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import android.provider.Settings
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Access to the music folders, for the page (`window.AivysStorage`). The
 * library is read and written by its real paths (scanning, `.aivys/`, tag
 * edits), so the app needs access to all files: "All files access" since
 * Android 11, the storage permission before.
 */
class StorageAccess(private val activity: Activity) {
  /** Whether the app can read and write the shared storage. */
  @JavascriptInterface
  fun granted(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      Environment.isExternalStorageManager()
    } else {
      activity.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }

  /**
   * Asks for access: opens the system's "All files access" page for the app
   * (the page checks `granted()` again when the app comes back), or the
   * permission dialog before Android 11.
   */
  @JavascriptInterface
  fun request() {
    activity.runOnUiThread {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val forApp = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${activity.packageName}"))
        try {
          activity.startActivity(forApp)
        } catch (_: Exception) {
          // Some devices only have the list of all apps.
          activity.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
        }
      } else {
        activity.requestPermissions(
          arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE),
          0,
        )
      }
    }
  }

  /** The shared storage's root (e.g. /storage/emulated/0), where the folder browser starts. */
  @JavascriptInterface
  fun root(): String = Environment.getExternalStorageDirectory().absolutePath

  /**
   * The mounted storage volumes, the phone's own first, as JSON:
   * `[{"path": "/storage/emulated/0", "name": "...", "removable": false}, ...]`.
   * A memory card is one of them, e.g. /storage/1234-ABCD.
   */
  @JavascriptInterface
  fun volumes(): String {
    val manager = activity.getSystemService(Context.STORAGE_SERVICE) as StorageManager
    val list = JSONArray()
    for (volume in manager.storageVolumes) {
      if (volume.state != Environment.MEDIA_MOUNTED) continue
      val dir: File? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        volume.directory
      } else {
        // Before Android 11 the path is only known by the volume's id.
        volume.uuid?.let { File("/storage/$it") } ?: if (volume.isPrimary) Environment.getExternalStorageDirectory() else null
      }
      if (dir == null) continue
      list.put(
        JSONObject()
          .put("path", dir.absolutePath)
          .put("name", volume.getDescription(activity))
          .put("removable", volume.isRemovable),
      )
    }
    return list.toString()
  }
}
