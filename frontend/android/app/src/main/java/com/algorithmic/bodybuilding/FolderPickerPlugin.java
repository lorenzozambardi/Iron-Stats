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
            try {
                getContext().getContentResolver().takePersistableUriPermission(
                    treeUri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );
            } catch (SecurityException e) {
                call.reject("Could not persist folder permission: " + e.getMessage());
                return;
            }

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
        String subpath = call.getString("subpath");
        if (uriStr == null) { call.reject("No URI provided"); return; }

        try {
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(uriStr));
            if (root == null || !root.isDirectory()) { call.reject("Invalid directory"); return; }

            DocumentFile dir = resolveDirectory(root, subpath, false);
            JSArray files = new JSArray();
            JSArray directories = new JSArray();
            if (dir != null && dir.isDirectory()) {
                DocumentFile[] listing = dir.listFiles();
                if (listing != null) {
                    for (DocumentFile f : listing) {
                        String name = f.getName();
                        if (name == null || name.startsWith(".")) continue;
                        if (f.isDirectory()) {
                            directories.put(name);
                        } else if (f.isFile()) {
                            files.put(name);
                        }
                    }
                }
            }
            JSObject ret = new JSObject();
            ret.put("files", files);
            ret.put("directories", directories);
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
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(uriStr));
            if (root == null) { call.reject("Invalid directory"); return; }

            String[] parts = splitRelativePath(filename);
            if (parts == null) { call.reject("Invalid path: " + filename); return; }
            DocumentFile parentDir = resolveDirectorySegments(root, parts, parts.length - 1, false);
            if (parentDir == null) { call.reject("Directory not found for: " + filename); return; }

            DocumentFile file = parentDir.findFile(parts[parts.length - 1]);
            if (file == null || !file.exists()) { call.reject("File not found: " + filename); return; }

            byte[] bytes;
            try (InputStream is = getContext().getContentResolver().openInputStream(file.getUri())) {
                if (is == null) { call.reject("Could not open file"); return; }
                bytes = readStream(is);
            }

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
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(uriStr));
            if (root == null) { call.reject("Invalid directory"); return; }

            String[] parts = splitRelativePath(filename);
            if (parts == null) { call.reject("Invalid path: " + filename); return; }
            DocumentFile parentDir = resolveDirectorySegments(root, parts, parts.length - 1, true);
            if (parentDir == null) { call.reject("Failed to resolve directory for: " + filename); return; }

            String leafName = parts[parts.length - 1];
            DocumentFile file = parentDir.findFile(leafName);
            if (file == null) {
                String mimeType = "application/octet-stream";
                if (leafName.endsWith(".json")) {
                    mimeType = "application/json";
                } else if (leafName.endsWith(".md")) {
                    mimeType = "text/markdown";
                } else if (leafName.endsWith(".txt")) {
                    mimeType = "text/plain";
                }
                file = parentDir.createFile(mimeType, leafName);
                if (file != null && file.getName() != null && !leafName.equals(file.getName())) {
                    file.renameTo(leafName);
                }
            }
            if (file == null) { call.reject("Failed to create file: " + filename); return; }

            // "wt" = write + truncate, so we always overwrite cleanly
            try (OutputStream os = getContext().getContentResolver().openOutputStream(file.getUri(), "wt")) {
                if (os == null) { call.reject("Could not open output stream"); return; }
                os.write(data.getBytes(StandardCharsets.UTF_8));
                os.flush();
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("writeFile failed: " + e.getMessage());
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private String[] splitRelativePath(String path) {
        if (path == null) return null;
        String[] raw = path.replace('\\', '/').split("/");
        java.util.List<String> clean = new java.util.ArrayList<>();
        for (String seg : raw) {
            if (seg.isEmpty()) continue;
            if (".".equals(seg) || "..".equals(seg)) return null;
            clean.add(seg);
        }
        return clean.isEmpty() ? null : clean.toArray(new String[0]);
    }

    private DocumentFile resolveDirectory(DocumentFile root, String subpath, boolean createMissing) {
        if (subpath == null || subpath.trim().isEmpty()) return root;
        String[] parts = splitRelativePath(subpath);
        if (parts == null) return null;
        return resolveDirectorySegments(root, parts, parts.length, createMissing);
    }

    private DocumentFile resolveDirectorySegments(DocumentFile root, String[] parts, int count, boolean createMissing) {
        DocumentFile current = root;
        for (int i = 0; i < count; i++) {
            String seg = parts[i];
            DocumentFile next = current.findFile(seg);
            if (next == null) {
                if (!createMissing) return null;
                next = current.createDirectory(seg);
            }
            if (next == null || !next.isDirectory()) return null;
            current = next;
        }
        return current;
    }

    private byte[] readStream(InputStream is) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = is.read(buf)) != -1) baos.write(buf, 0, n);
        return baos.toByteArray();
    }
}
