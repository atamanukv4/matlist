package ru.matlist.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Матлист для Android: веб-ядро из assets в WebView.
 * Страница отдаётся с адреса https://appassets.androidplatform.net/assets/…, чтобы у неё был
 * постоянный origin (localStorage сохраняется между запусками).
 * Мост MatlistAndroid: saveFile(имя, текст) и saveBase64(имя, тип, base64) — сохранить файл через системный диалог;
 * printHtml(html, имя) — печать/PDF; ready() — страница загрузилась.
 * «Открыть с помощью → Матлист» для .xmcd передаёт содержимое в window.MATLIST_OPEN_TEXT(имя, текст).
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/index.html";
    private static final int REQ_PICK = 1, REQ_SAVE = 2;

    private WebView web;
    private ValueCallback<Uri[]> pickCallback;
    private byte[] pendingSaveBytes;
    private WebView printView; // страница для печати в PDF (держим ссылку до конца печати)
    private String pendingOpenName, pendingOpenText;
    private boolean pageReady;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Build.VERSION.SDK_INT >= 23) {
            getWindow().setStatusBarColor(Color.WHITE);
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        web.addJavascriptInterface(new Bridge(), "MatlistAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return serveAsset(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { /* нет браузера */ }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pickCallback != null) pickCallback.onReceiveValue(null);
                pickCallback = callback;
                String type = "*/*";
                String[] acc = params.getAcceptTypes();
                if (acc != null) for (String a : acc) if (a != null && a.startsWith("image/")) { type = "image/*"; break; }
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(type);
                try {
                    startActivityForResult(Intent.createChooser(i, type.startsWith("image") ? "Выберите картинку" : "Выберите файл .xmcd или .md"), REQ_PICK);
                } catch (ActivityNotFoundException e) {
                    pickCallback = null;
                    return false;
                }
                return true;
            }
        });
        if (state != null) web.restoreState(state); else web.loadUrl(START);
        handleIntent(getIntent());
    }

    /** Файлы страницы из assets/: https://appassets.androidplatform.net/assets/<путь>. */
    private WebResourceResponse serveAsset(Uri u) {
        if (!HOST.equals(u.getHost())) return null;
        String path = u.getPath();
        if (path == null || !path.startsWith("/assets/")) return null;
        String name = path.substring("/assets/".length());
        try {
            InputStream in = getAssets().open(name);
            return new WebResourceResponse(mime(name), mime(name).startsWith("text") || mime(name).equals("application/javascript") ? "utf-8" : null, in);
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
        }
    }

    private static String mime(String n) {
        if (n.endsWith(".html")) return "text/html";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "application/javascript";
        if (n.endsWith(".wasm")) return "application/wasm";
        if (n.endsWith(".txt")) return "text/plain";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".woff2")) return "font/woff2";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    /** «Открыть с помощью» / «Поделиться» — прочитать файл и передать странице. */
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(intent.getAction())) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null && Intent.ACTION_SEND.equals(intent.getAction())) { // «Поделиться» текстом (решение в Markdown)
            String t = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (t != null && !t.trim().isEmpty()) { pendingOpenText = t; pendingOpenName = "Заметка.md"; deliverOpen(); }
            return;
        }
        if (uri == null) return;
        try {
            pendingOpenText = readText(uri);
            pendingOpenName = displayName(uri);
            deliverOpen();
        } catch (Exception e) {
            Toast.makeText(this, "Не удалось открыть файл: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void deliverOpen() {
        if (!pageReady || pendingOpenText == null) return;
        String js = "window.MATLIST_OPEN_TEXT && window.MATLIST_OPEN_TEXT(" + JSONObject.quote(pendingOpenName) + "," + JSONObject.quote(pendingOpenText) + ")";
        pendingOpenText = null;
        web.evaluateJavascript(js, null);
    }

    private String readText(Uri uri) throws Exception {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) throw new Exception("пустой поток");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private String displayName(Uri uri) {
        String name = "Лист.xmcd";
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) name = c.getString(0);
        } catch (Exception e) { /* имя по умолчанию */ }
        return name;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_PICK) {
            if (pickCallback != null) {
                Uri u = (res == RESULT_OK && data != null) ? data.getData() : null;
                pickCallback.onReceiveValue(u != null ? new Uri[]{u} : null);
                pickCallback = null;
            }
        } else if (req == REQ_SAVE) {
            byte[] bytes = pendingSaveBytes;
            pendingSaveBytes = null;
            if (res != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt")) {
                if (out == null) throw new Exception("нет доступа к файлу");
                out.write(bytes);
                Toast.makeText(this, "Файл сохранён", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "Не удалось сохранить: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    public void onBackPressed() {
        // сначала закрыть панели и редакторы на странице; если нечего закрывать — выйти
        web.evaluateJavascript("(window.MATLIST_BACK && window.MATLIST_BACK()) ? 1 : 0", value -> {
            if (!"1".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    private void askSave(String name, String mime, byte[] bytes) {
        runOnUiThread(() -> {
            pendingSaveBytes = bytes;
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
            i.putExtra(Intent.EXTRA_TITLE, name);
            try {
                startActivityForResult(i, REQ_SAVE);
            } catch (ActivityNotFoundException e) {
                pendingSaveBytes = null;
                Toast.makeText(MainActivity.this, "Нет приложения для сохранения файлов", Toast.LENGTH_LONG).show();
            }
        });
    }

    private void printPage(String html, String title) {
        final WebView pv = new WebView(this);
        pv.getSettings().setJavaScriptEnabled(false);
        pv.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return serveAsset(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                if (pm == null) { Toast.makeText(MainActivity.this, "Печать недоступна", Toast.LENGTH_LONG).show(); return; }
                String job = (title == null || title.isEmpty()) ? "Матлист" : title;
                PrintDocumentAdapter ad = view.createPrintDocumentAdapter(job);
                pm.print(job, ad, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            }
        });
        printView = pv;
        pv.loadDataWithBaseURL("https://" + HOST + "/assets/", html, "text/html", "utf-8", null);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    /** Мост для страницы: window.MatlistAndroid. */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(String name, String text) {
            askSave(name, "application/octet-stream", text.getBytes(StandardCharsets.UTF_8));
        }

        /** Двоичный файл (docx и т. п.) в base64. */
        @JavascriptInterface
        public void saveBase64(String name, String mime, String b64) {
            askSave(name, mime, Base64.decode(b64, Base64.DEFAULT));
        }

        /** Печать HTML-страницы листа: в системном окне печати можно выбрать «Сохранить как PDF». */
        @JavascriptInterface
        public void printHtml(String html, String title) {
            runOnUiThread(() -> printPage(html, title));
        }

        @JavascriptInterface
        public void ready() {
            runOnUiThread(() -> {
                pageReady = true;
                deliverOpen();
            });
        }

        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }
    }
}
