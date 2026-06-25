package com.coffeebean.vault;

import android.graphics.Rect;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(name = "CoffeeLabelScanner")
public class CoffeeLabelScannerPlugin extends Plugin {
    @PluginMethod
    public void recognize(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.reject("缺少待识别图片路径");
            return;
        }

        Uri parsedUri = Uri.parse(path);
        final Uri uri = parsedUri.getScheme() == null ? Uri.fromFile(new File(path)) : parsedUri;
        final InputImage image;
        try {
            image = InputImage.fromFilePath(getContext(), uri);
        } catch (IOException | IllegalArgumentException error) {
            call.reject("无法读取拍摄的图片", error);
            return;
        }

        TextRecognizer recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
        recognizer
            .process(image)
            .addOnSuccessListener(result -> {
                JSArray lines = new JSArray();
                for (Text.TextBlock block : result.getTextBlocks()) {
                    for (Text.Line line : block.getLines()) {
                        JSObject item = new JSObject();
                        item.put("text", line.getText());
                        Rect box = line.getBoundingBox();
                        if (box != null) {
                            item.put("left", box.left);
                            item.put("top", box.top);
                            item.put("right", box.right);
                            item.put("bottom", box.bottom);
                        }
                        lines.put(item);
                    }
                }
                JSObject payload = new JSObject();
                payload.put("text", result.getText());
                payload.put("lines", lines);
                payload.put("width", image.getWidth());
                payload.put("height", image.getHeight());
                call.resolve(payload);
            })
            .addOnFailureListener(error -> call.reject("未能识别包装文字", error))
            .addOnCompleteListener(task -> {
                recognizer.close();
                if (call.getBoolean("deleteSource", true)) deleteTemporaryFile(uri);
            });
    }

    @PluginMethod
    public void archiveImage(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.reject("缺少待归档图片路径");
            return;
        }
        Uri parsedUri = Uri.parse(path);
        Uri source = parsedUri.getScheme() == null ? Uri.fromFile(new File(path)) : parsedUri;
        String role = call.getString("role", "bag");
        String prefix = "label".equals(role) ? "label" : "bag";

        File dir = new File(getContext().getFilesDir(), "bean-images");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("无法创建图片归档目录");
            return;
        }
        String extension = guessExtension(source);
        File target = new File(dir, prefix + "-" + UUID.randomUUID().toString() + extension);
        try (InputStream input = getContext().getContentResolver().openInputStream(source);
             OutputStream output = new FileOutputStream(target)) {
            if (input == null) {
                call.reject("无法读取待归档图片");
                return;
            }
            byte[] buffer = new byte[8192];
            int length;
            while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
            JSObject payload = new JSObject();
            payload.put("path", Uri.fromFile(target).toString());
            payload.put("uri", Uri.fromFile(target).toString());
            call.resolve(payload);
            if (call.getBoolean("deleteSource", true)) deleteTemporaryFile(source);
        } catch (IOException | SecurityException error) {
            call.reject("图片归档失败", error);
        }
    }

    @PluginMethod
    public void discardImage(PluginCall call) {
        String path = call.getString("path");
        if (path != null && !path.trim().isEmpty()) {
            Uri parsedUri = Uri.parse(path);
            Uri uri = parsedUri.getScheme() == null ? Uri.fromFile(new File(path)) : parsedUri;
            deleteTemporaryFile(uri);
        }
        call.resolve();
    }

    private void deleteTemporaryFile(Uri uri) {
        if (!"file".equalsIgnoreCase(uri.getScheme())) return;
        try {
            File file = new File(uri.getPath());
            File cache = getContext().getCacheDir();
            if (file.getCanonicalPath().startsWith(cache.getCanonicalPath())) file.delete();
        } catch (IOException ignored) {}
    }

    private String guessExtension(Uri uri) {
        String path = uri.getPath();
        if (path != null) {
            String lower = path.toLowerCase(Locale.ROOT);
            if (lower.endsWith(".png")) return ".png";
            if (lower.endsWith(".webp")) return ".webp";
        }
        return ".jpg";
    }
}
