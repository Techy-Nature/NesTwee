package com.techynature.nestwee;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import org.json.JSONArray;

/**
 * Lets NesTwee open whole folders on Android.
 *
 * Android's storage rules don't let an app read any folder it likes. Instead the
 * person picks a folder in Android's own folder picker, which grants NesTwee
 * permission to read (and write) that folder and everything inside it. The
 * permission is kept until the person removes it, so the folder can be read
 * again on every build and picks up any changes.
 */
@CapacitorPlugin(name = "FolderAccess")
public class FolderAccessPlugin extends Plugin {

    private static final int MAX_FILES = 20000;
    private static final java.util.Set<String> SKIP_DIRS = new java.util.HashSet<>(java.util.Arrays.asList(".git", "node_modules"));
    /** Files bigger than this are skipped rather than read (they'd make a story too big to open). */
    private static final long MAX_FILE_BYTES = 64L * 1024 * 1024;
    private static final String TOO_BIG = "This story is too big for this device's memory. Large music, video or image files in the folder are the usual cause: move them out of the story folder, or build on a computer.";
    private static final int FLAGS = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    /** Opens Android's folder picker and keeps permission for the folder chosen. */
    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(FLAGS | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject r = new JSObject();
            r.put("cancelled", true);
            call.resolve(r);
            return;
        }
        Uri tree = data.getData();
        ContentResolver cr = getContext().getContentResolver();
        try {
            cr.takePersistableUriPermission(tree, FLAGS);
        } catch (SecurityException e) {
            try {
                cr.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (SecurityException ignored) {
                // Still readable for now, just not remembered.
            }
        }
        call.resolve(describe(tree));
    }

    /** Whether the page had to restart last time (out of memory), and clears it: { note }. */
    @PluginMethod
    public void takeCrashNote(PluginCall call) {
        android.content.SharedPreferences p = getContext().getSharedPreferences(MainActivity.PREFS, android.content.Context.MODE_PRIVATE);
        String note = p.getString(MainActivity.CRASH_NOTE, "");
        p.edit().remove(MainActivity.CRASH_NOTE).apply();
        JSObject r = new JSObject();
        r.put("note", note);
        call.resolve(r);
    }

    /** Folders NesTwee currently has permission for. */
    @PluginMethod
    public void list(PluginCall call) {
        JSArray folders = new JSArray();
        List<UriPermission> perms = getContext().getContentResolver().getPersistedUriPermissions();
        for (UriPermission p : perms) {
            Uri uri = p.getUri();
            if (!p.isReadPermission() || !DocumentsContract.isTreeUri(uri)) continue;
            JSObject f = describe(uri);
            f.put("write", p.isWritePermission());
            folders.put(f);
        }
        JSObject r = new JSObject();
        r.put("folders", folders);
        call.resolve(r);
    }

    /** Gives back the permission for one folder. */
    @PluginMethod
    public void release(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("No folder was given.");
            return;
        }
        ContentResolver cr = getContext().getContentResolver();
        Uri u = Uri.parse(uri);
        try {
            cr.releasePersistableUriPermission(u, FLAGS);
        } catch (SecurityException e) {
            try {
                cr.releasePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (SecurityException ignored) {
                // Already gone.
            }
        }
        call.resolve();
    }

    /** Every file in the folder and its subfolders: { files: [{ path, id, size }] }. */
    @PluginMethod
    public void listTree(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("No folder was given.");
            return;
        }
        Uri tree = Uri.parse(uri);
        ContentResolver cr = getContext().getContentResolver();
        String[] cols = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED
        };
        JSArray files = new JSArray();
        int count = 0;
        try {
            Deque<String[]> stack = new ArrayDeque<>();
            stack.push(new String[] { DocumentsContract.getTreeDocumentId(tree), "" });
            while (!stack.isEmpty() && count < MAX_FILES) {
                String[] dir = stack.pop();
                Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, dir[0]);
                try (Cursor c = cr.query(children, cols, null, null, null)) {
                    if (c == null) continue;
                    while (c.moveToNext() && count < MAX_FILES) {
                        String id = c.getString(0);
                        String name = c.getString(1);
                        String mime = c.getString(2);
                        long size = c.isNull(3) ? 0 : c.getLong(3);
                        long modified = c.isNull(4) ? 0 : c.getLong(4);
                        String path = dir[1] + name;
                        if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                            // Git's own data and installed packages never hold story files,
                            // and can be huge, so don't walk them.
                            if (SKIP_DIRS.contains(name)) continue;
                            stack.push(new String[] { id, path + "/" });
                        } else {
                            JSObject f = new JSObject();
                            f.put("path", path);
                            f.put("id", id);
                            f.put("size", size);
                            f.put("modified", modified);
                            files.put(f);
                            count++;
                        }
                    }
                }
            }
        } catch (SecurityException e) {
            call.reject("NesTwee no longer has permission for this folder. Give permission again in the Accessibility settings, or add the folder again.", "NO_PERMISSION");
            return;
        } catch (OutOfMemoryError e) {
            call.reject(TOO_BIG, "TOO_BIG");
            return;
        } catch (Exception e) {
            call.reject("Couldn't read this folder: " + e.getMessage());
            return;
        }
        JSObject r = new JSObject();
        r.put("files", files);
        r.put("truncated", count >= MAX_FILES);
        call.resolve(r);
    }

    /** Reads files by id (from listTree): { files: [{ id, data (base64) }] }. */
    @PluginMethod
    public void readFiles(PluginCall call) {
        String uri = call.getString("uri");
        JSArray ids = call.getArray("ids");
        if (uri == null || ids == null) {
            call.reject("No folder or files were given.");
            return;
        }
        Uri tree = Uri.parse(uri);
        ContentResolver cr = getContext().getContentResolver();
        JSArray out = new JSArray();
        try {
            JSONArray list = ids;
            byte[] buf = new byte[65536];
            for (int i = 0; i < list.length(); i++) {
                String id = list.getString(i);
                Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, id);
                long size = sizeOf(cr, doc);
                if (size > MAX_FILE_BYTES) {
                    JSObject skipped = new JSObject();
                    skipped.put("id", id);
                    skipped.put("skipped", "too big (" + (size / (1024 * 1024)) + " MB)");
                    out.put(skipped);
                    continue;
                }
                ByteArrayOutputStream bytes = new ByteArrayOutputStream(size > 0 ? (int) size : 8192);
                try (InputStream in = cr.openInputStream(doc)) {
                    if (in == null) continue;
                    int n;
                    while ((n = in.read(buf)) > 0) bytes.write(buf, 0, n);
                }
                JSObject f = new JSObject();
                f.put("id", id);
                f.put("data", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
                out.put(f);
            }
        } catch (SecurityException e) {
            call.reject("NesTwee no longer has permission for this folder. Give permission again in the Accessibility settings, or add the folder again.", "NO_PERMISSION");
            return;
        } catch (OutOfMemoryError e) {
            out = null;
            call.reject(TOO_BIG, "TOO_BIG");
            return;
        } catch (Exception e) {
            call.reject("Couldn't read a file in this folder: " + e.getMessage());
            return;
        }
        JSObject r = new JSObject();
        r.put("files", out);
        call.resolve(r);
    }

    /**
     * Saves text as a file directly inside a folder NesTwee has permission for,
     * replacing a file with the same name: { uri, name, data, mime }.
     */
    @PluginMethod
    public void writeFile(PluginCall call) {
        String uri = call.getString("uri");
        String name = call.getString("name");
        String data = call.getString("data", "");
        String mime = call.getString("mime", "application/octet-stream");
        if (uri == null || name == null || name.isEmpty()) {
            call.reject("No folder or file name was given.");
            return;
        }
        Uri tree = Uri.parse(uri);
        ContentResolver cr = getContext().getContentResolver();
        try {
            String rootId = DocumentsContract.getTreeDocumentId(tree);
            Uri target = null;
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, rootId);
            String[] cols = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME };
            try (Cursor c = cr.query(children, cols, null, null, null)) {
                while (c != null && c.moveToNext()) {
                    if (name.equals(c.getString(1))) {
                        target = DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0));
                        break;
                    }
                }
            }
            if (target == null) {
                Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, rootId);
                target = DocumentsContract.createDocument(cr, parent, mime, name);
            }
            if (target == null) {
                call.reject("Couldn't create " + name + " in this folder.");
                return;
            }
            OutputStream out;
            try {
                out = cr.openOutputStream(target, "wt");
            } catch (Exception notSupported) {
                out = cr.openOutputStream(target, "w");
            }
            if (out == null) {
                call.reject("Couldn't write " + name + ".");
                return;
            }
            try (Writer w = new OutputStreamWriter(out, StandardCharsets.UTF_8)) {
                for (int i = 0; i < data.length(); i += 65536) {
                    w.write(data, i, Math.min(65536, data.length() - i));
                }
            }
            JSObject r = new JSObject();
            r.put("uri", target.toString());
            call.resolve(r);
        } catch (SecurityException e) {
            call.reject("NesTwee no longer has permission to save in this folder. Give permission again in the Accessibility settings.", "NO_PERMISSION");
        } catch (OutOfMemoryError e) {
            call.reject(TOO_BIG, "TOO_BIG");
        } catch (Exception e) {
            call.reject("Couldn't save " + name + ": " + e.getMessage());
        }
    }

    private static long sizeOf(ContentResolver cr, Uri doc) {
        try (Cursor c = cr.query(doc, new String[] { DocumentsContract.Document.COLUMN_SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0);
        } catch (Exception ignored) {
            // Unknown size; read it anyway.
        }
        return -1;
    }

    /** { uri, name, place } where place is a readable location like "Documents/Stories". */
    private JSObject describe(Uri tree) {
        JSObject f = new JSObject();
        f.put("uri", tree.toString());
        String docId = "";
        try {
            docId = DocumentsContract.getTreeDocumentId(tree);
        } catch (Exception ignored) {
            // Not a tree uri.
        }
        String place = docId.contains(":") ? docId.substring(docId.indexOf(':') + 1) : docId;
        String name = place.contains("/") ? place.substring(place.lastIndexOf('/') + 1) : place;
        try {
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, docId);
            try (Cursor c = getContext().getContentResolver().query(doc, new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst() && !c.isNull(0)) name = c.getString(0);
            }
            f.put("available", true);
        } catch (Exception e) {
            f.put("available", false);
        }
        if (name == null || name.isEmpty()) name = "Folder";
        f.put("name", name);
        f.put("place", place.isEmpty() ? name : place);
        return f;
    }
}
