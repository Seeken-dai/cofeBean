package com.coffeebean.vault;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
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
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(name = "CoffeeLabelScanner")
public class CoffeeLabelScannerPlugin extends Plugin {
    private static final int ARCHIVE_MAX_EDGE = 1600;
    private static final int ARCHIVE_WEBP_QUALITY = 80;

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
        String prefix = imagePrefix(role);

        File dir = new File(getContext().getFilesDir(), "bean-images");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("无法创建图片归档目录");
            return;
        }

        // 优先压缩为 WebP：解码 -> 长边缩放到 1600 -> WebP q80。
        // 解码失败（非位图、超大图 OOM 等）时回退为原样复制，保证不因压缩失败而丢图。
        File compressed = new File(dir, prefix + "-" + UUID.randomUUID().toString() + ".webp");
        if (writeCompressedWebp(source, compressed)) {
            JSObject payload = new JSObject();
            payload.put("path", Uri.fromFile(compressed).toString());
            payload.put("uri", Uri.fromFile(compressed).toString());
            call.resolve(payload);
            if (call.getBoolean("deleteSource", true)) deleteTemporaryFile(source);
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

    @SuppressWarnings("deprecation")
    private boolean writeCompressedWebp(Uri source, File target) {
        Bitmap bitmap = null;
        try {
            bitmap = decodeScaledBitmap(source, ARCHIVE_MAX_EDGE);
            if (bitmap == null) return false;
            try (OutputStream output = new FileOutputStream(target)) {
                Bitmap.CompressFormat format = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                    ? Bitmap.CompressFormat.WEBP_LOSSY
                    : Bitmap.CompressFormat.WEBP;
                if (!bitmap.compress(format, ARCHIVE_WEBP_QUALITY, output)) return false;
            }
            return true;
        } catch (IOException | SecurityException | OutOfMemoryError error) {
            if (target.exists()) target.delete();
            return false;
        } finally {
            if (bitmap != null) bitmap.recycle();
        }
    }

    private Bitmap decodeScaledBitmap(Uri source, int maxEdge) throws IOException {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream input = getContext().getContentResolver().openInputStream(source)) {
            if (input == null) return null;
            BitmapFactory.decodeStream(input, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
        int longEdge = Math.max(bounds.outWidth, bounds.outHeight);
        int sample = 1;
        while (longEdge / (sample * 2) >= maxEdge) sample *= 2;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        Bitmap decoded;
        try (InputStream input = getContext().getContentResolver().openInputStream(source)) {
            if (input == null) return null;
            decoded = BitmapFactory.decodeStream(input, null, options);
        }
        if (decoded == null) return null;
        int longNow = Math.max(decoded.getWidth(), decoded.getHeight());
        if (longNow <= maxEdge) return decoded;
        float scale = (float) maxEdge / (float) longNow;
        int width = Math.max(1, Math.round(decoded.getWidth() * scale));
        int height = Math.max(1, Math.round(decoded.getHeight() * scale));
        Bitmap scaled = Bitmap.createScaledBitmap(decoded, width, height, true);
        if (scaled != decoded) decoded.recycle();
        return scaled;
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

    @PluginMethod
    public void deleteArchivedImage(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.resolve();
            return;
        }
        Uri parsedUri = Uri.parse(path);
        Uri uri = parsedUri.getScheme() == null ? Uri.fromFile(new File(path)) : parsedUri;
        if (!"file".equalsIgnoreCase(uri.getScheme())) {
            call.resolve();
            return;
        }
        try {
            File file = new File(uri.getPath());
            File archiveDir = new File(getContext().getFilesDir(), "bean-images");
            String archivePath = archiveDir.getCanonicalPath();
            String filePath = file.getCanonicalPath();
            if (filePath.startsWith(archivePath + File.separator) && file.exists()) file.delete();
        } catch (IOException | SecurityException ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void readArchivedImage(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.reject("缺少图片路径");
            return;
        }
        Uri parsedUri = Uri.parse(path);
        Uri uri = parsedUri.getScheme() == null ? Uri.fromFile(new File(path)) : parsedUri;
        if (!"file".equalsIgnoreCase(uri.getScheme())) {
            call.reject("只支持读取本机归档图片");
            return;
        }
        File file = new File(uri.getPath());
        try {
            File archiveDir = new File(getContext().getFilesDir(), "bean-images");
            if (!file.getCanonicalPath().startsWith(archiveDir.getCanonicalPath())) {
                call.reject("只支持读取本机归档图片");
                return;
            }
            byte[] buffer = new byte[(int) file.length()];
            try (InputStream input = new FileInputStream(file)) {
                int offset = 0;
                int read;
                while (offset < buffer.length && (read = input.read(buffer, offset, buffer.length - offset)) != -1) offset += read;
            }
            JSObject payload = new JSObject();
            String extension = guessExtension(uri);
            payload.put("data", Base64.encodeToString(buffer, Base64.NO_WRAP));
            payload.put("extension", extension);
            payload.put("mimeType", ".png".equals(extension) ? "image/png" : ".webp".equals(extension) ? "image/webp" : "image/jpeg");
            call.resolve(payload);
        } catch (IOException | SecurityException error) {
            call.reject("图片读取失败", error);
        }
    }

    @PluginMethod
    public void restoreArchivedImage(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.trim().isEmpty()) {
            call.reject("缺少图片数据");
            return;
        }
        String role = call.getString("role", "bag");
        String prefix = imagePrefix(role);
        String extension = call.getString("extension", ".jpg");
        if (!".png".equals(extension) && !".webp".equals(extension)) extension = ".jpg";
        File dir = new File(getContext().getFilesDir(), "bean-images");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("无法创建图片归档目录");
            return;
        }
        File target = new File(dir, prefix + "-" + UUID.randomUUID().toString() + extension);
        try (OutputStream output = new FileOutputStream(target)) {
            output.write(Base64.decode(data, Base64.DEFAULT));
            JSObject payload = new JSObject();
            payload.put("path", Uri.fromFile(target).toString());
            payload.put("uri", Uri.fromFile(target).toString());
            call.resolve(payload);
        } catch (IOException | IllegalArgumentException error) {
            call.reject("图片恢复失败", error);
        }
    }

    @PluginMethod
    public void saveShareImage(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.trim().isEmpty()) {
            call.reject("缺少分享图片数据");
            return;
        }
        String filename = safePngFilename(call.getString("filename", "豆仓分享卡-" + UUID.randomUUID().toString() + ".png"));
        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("分享图片数据无效", error);
            return;
        }

        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + File.separator + "豆仓分享卡");
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
        }

        Uri uri = null;
        try {
            uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                call.reject("无法创建分享图片");
                return;
            }
            try (OutputStream output = resolver.openOutputStream(uri)) {
                if (output == null) {
                    call.reject("无法写入分享图片");
                    return;
                }
                output.write(bytes);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues done = new ContentValues();
                done.put(MediaStore.Images.Media.IS_PENDING, 0);
                resolver.update(uri, done, null, null);
            }
            JSObject payload = new JSObject();
            payload.put("uri", uri.toString());
            payload.put("folder", "Pictures/豆仓分享卡");
            call.resolve(payload);
        } catch (IOException | SecurityException error) {
            if (uri != null) resolver.delete(uri, null, null);
            call.reject("保存分享图片失败", error);
        }
    }

    @PluginMethod
    public void saveArchivedImage(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.reject("缺少图片路径");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("当前安卓版本无法在不申请存储权限的情况下保存到相册");
            return;
        }

        Uri parsedUri = Uri.parse(path);
        Uri source = parsedUri.getScheme() == null ? Uri.fromFile(new File(path)) : parsedUri;
        if (!"file".equalsIgnoreCase(source.getScheme())) {
            call.reject("只支持保存本机归档图片");
            return;
        }

        File file = new File(source.getPath());
        try {
            File archiveDir = new File(getContext().getFilesDir(), "bean-images");
            String archivePath = archiveDir.getCanonicalPath() + File.separator;
            if (!file.getCanonicalPath().startsWith(archivePath) || !file.isFile()) {
                call.reject("只支持保存本机归档图片");
                return;
            }
        } catch (IOException | SecurityException error) {
            call.reject("无法读取归档图片", error);
            return;
        }

        String extension = guessExtension(source);
        String filename = safeImageFilename(call.getString("filename", "豆仓图片-" + UUID.randomUUID().toString()), extension);
        String mimeType = ".png".equals(extension) ? "image/png" : ".webp".equals(extension) ? "image/webp" : "image/jpeg";
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
        values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + File.separator + "豆仓");
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        Uri target = null;
        try {
            target = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (target == null) {
                call.reject("无法在相册中创建图片");
                return;
            }
            try (InputStream input = new FileInputStream(file);
                 OutputStream output = resolver.openOutputStream(target)) {
                if (output == null) throw new IOException("无法打开相册输出流");
                byte[] buffer = new byte[8192];
                int length;
                while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(target, done, null, null);
            JSObject payload = new JSObject();
            payload.put("uri", target.toString());
            payload.put("folder", "Pictures/豆仓");
            call.resolve(payload);
        } catch (IOException | SecurityException error) {
            if (target != null) resolver.delete(target, null, null);
            call.reject("保存图片到相册失败", error);
        }
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

    private String imagePrefix(String role) {
        if ("label".equals(role) || "drink".equals(role)) return role;
        return "bag";
    }

    private String safePngFilename(String value) {
        String name = value == null ? "" : value.trim();
        if (name.isEmpty()) name = "豆仓分享卡-" + UUID.randomUUID().toString() + ".png";
        name = name.replaceAll("[\\\\/:*?\"<>|]", "");
        if (!name.toLowerCase(Locale.ROOT).endsWith(".png")) name = name + ".png";
        if (name.length() > 96) {
            String suffix = ".png";
            name = name.substring(0, 96 - suffix.length()) + suffix;
        }
        return name;
    }

    private String safeImageFilename(String value, String extension) {
        String name = value == null ? "" : value.trim();
        if (name.isEmpty()) name = "豆仓图片-" + UUID.randomUUID().toString();
        name = name.replaceAll("[\\\\/:*?\"<>|]", "");
        String lower = name.toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".jpg") && !lower.endsWith(".jpeg") && !lower.endsWith(".png") && !lower.endsWith(".webp")) {
            name = name + extension;
        }
        if (name.length() > 96) {
            name = name.substring(0, Math.max(1, 96 - extension.length())) + extension;
        }
        return name;
    }
}
