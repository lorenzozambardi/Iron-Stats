package com.algorithmic.bodybuilding;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "FolderPicker")
public class FolderPickerPlugin extends Plugin {

    // ── Folder Picker ──────────────────────────────────────────────────────────

    @PluginMethod
    public void pickDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "handlePickResult");
    }

    @ActivityCallback
    private void handlePickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            Uri treeUri = result.getData().getData();
            if (treeUri == null) { call.reject("No URI returned"); return; }

            // Take persistent permissions so access survives app restarts
            getContext().getContentResolver().takePersistableUriPermission(
                treeUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            );

            // Build a human-readable display name from the URI path segment
            // SAF tree URIs look like: content://…/tree/primary%3AMyFolder
            String displayName = treeUri.getLastPathSegment();
            if (displayName != null && displayName.contains(":")) {
                displayName = displayName.substring(displayName.lastIndexOf(":") + 1);
            }

            JSObject ret = new JSObject();
            ret.put("uri", treeUri.toString());
            ret.put("displayName", displayName != null ? displayName : treeUri.toString());
            call.resolve(ret);
        } else {
            call.reject("Folder selection cancelled");
        }
    }

    // ── Directory Listing ──────────────────────────────────────────────────────

    @PluginMethod
    public void listDirectory(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("No URI provided"); return; }

        try {
            DocumentFile dir = DocumentFile.fromTreeUri(getContext(), Uri.parse(uriStr));
            if (dir == null || !dir.isDirectory()) { call.reject("Invalid directory"); return; }

            JSArray files = new JSArray();
            DocumentFile[] listing = dir.listFiles();
            if (listing != null) {
                for (DocumentFile f : listing) {
                    if (f.isFile() && f.getName() != null) {
                        files.put(f.getName());
                    }
                }
            }
            JSObject ret = new JSObject();
            ret.put("files", files);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("listDirectory failed: " + e.getMessage());
        }
    }

    // ── Read File ──────────────────────────────────────────────────────────────

    @PluginMethod
    public void readFile(PluginCall call) {
        String uriStr   = call.getString("uri");
        String filename = call.getString("filename");
        if (uriStr == null || filename == null) { call.reject("Missing parameters"); return; }

        try {
            DocumentFile dir  = DocumentFile.fromTreeUri(getContext(), Uri.parse(uriStr));
            if (dir == null) { call.reject("Invalid directory"); return; }

            DocumentFile file = dir.findFile(filename);
            if (file == null || !file.exists()) { call.reject("File not found: " + filename); return; }

            InputStream is = getContext().getContentResolver().openInputStream(file.getUri());
            if (is == null) { call.reject("Could not open file"); return; }
            byte[] bytes = readStream(is);
            is.close();

            JSObject ret = new JSObject();
            ret.put("data", new String(bytes, StandardCharsets.UTF_8));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("readFile failed: " + e.getMessage());
        }
    }

    // ── Write File ─────────────────────────────────────────────────────────────

    @PluginMethod
    public void writeFile(PluginCall call) {
        String uriStr   = call.getString("uri");
        String filename = call.getString("filename");
        String data     = call.getString("data");
        if (uriStr == null || filename == null || data == null) { call.reject("Missing parameters"); return; }

        try {
            DocumentFile dir = DocumentFile.fromTreeUri(getContext(), Uri.parse(uriStr));
            if (dir == null) { call.reject("Invalid directory"); return; }

            DocumentFile file = dir.findFile(filename);
            if (file == null) {
                String mimeType = filename.endsWith(".json") ? "application/json" : "text/plain";
                file = dir.createFile(mimeType, filename);
            }
            if (file == null) { call.reject("Failed to create file: " + filename); return; }

            // "wt" = write + truncate, so we always overwrite cleanly
            OutputStream os = getContext().getContentResolver().openOutputStream(file.getUri(), "wt");
            if (os == null) { call.reject("Could not open output stream"); return; }
            os.write(data.getBytes(StandardCharsets.UTF_8));
            os.flush();
            os.close();

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("writeFile failed: " + e.getMessage());
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private byte[] readStream(InputStream is) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = is.read(buf)) != -1) baos.write(buf, 0, n);
        return baos.toByteArray();
    }
}
