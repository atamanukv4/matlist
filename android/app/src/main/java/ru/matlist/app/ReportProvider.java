package ru.matlist.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;

/**
 * Отдаёт файл листа, приложенный к «Сообщить об ошибке», приложению-получателю (Telegram, почта…).
 * Файлы лежат в cache/reports, доступ только на чтение и только по выданному разрешению (grantUriPermissions).
 * Без androidx: FileProvider здесь не подключён, поэтому свой минимальный провайдер.
 */
public class ReportProvider extends ContentProvider {
    static final String AUTHORITY = "ru.matlist.app.reports";

    static Uri put(Context ctx, String name, byte[] bytes) throws Exception {
        File dir = new File(ctx.getCacheDir(), "reports");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("нет папки для отчёта");
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete(); // держим только последний отчёт
        String safe = name.replaceAll("[\\\\/:*?\"<>|]+", "_");
        File f = new File(dir, safe);
        try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
        return new Uri.Builder().scheme("content").authority(AUTHORITY).appendPath(safe).build();
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        String seg = uri.getLastPathSegment();
        if (seg == null || seg.contains("/") || seg.contains("..")) throw new FileNotFoundException("нет файла");
        File f = new File(new File(getContext().getCacheDir(), "reports"), seg);
        if (!f.isFile()) throw new FileNotFoundException("нет файла");
        return f;
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("только чтение");
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        try {
            File f = fileFor(uri);
            MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
            c.addRow(new Object[]{f.getName(), f.length()});
            return c;
        } catch (FileNotFoundException e) {
            return null;
        }
    }

    @Override public String getType(Uri uri) { return "application/octet-stream"; }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String selection, String[] args) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { return 0; }
}
