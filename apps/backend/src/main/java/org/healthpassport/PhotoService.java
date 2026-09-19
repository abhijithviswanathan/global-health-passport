/**
 * Sanitizes image bytes, checks face presence locally and encrypts stored photos.
 * Face presence is not identity verification or liveness detection. ProfileApi owns
 * visibility; a successful image check never grants anyone access to the photo.
 */
package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import java.awt.Color;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.TimeUnit;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.*;
import org.springframework.web.multipart.MultipartFile;

@Service
public class PhotoService {
  final Path storage;
  final byte[] key;
  final FaceCheck faceCheck;

  public interface FaceCheck {
    int check(Path file);
  }

  @Component
  public static class LocalFaceCheck implements FaceCheck {
    final Path python, script;

    public LocalFaceCheck(
        @Value("${PHOTO_CHECK_PYTHON:./photo-check/.venv/bin/python}") String python,
        @Value("${PHOTO_CHECK_SCRIPT:./photo-check/check.py}") String script) {
      this.python = Path.of(python).toAbsolutePath();
      this.script = Path.of(script).toAbsolutePath();
    }

    public int check(Path file) {
      Process p = null;
      try {
        p =
            new ProcessBuilder(python.toString(), script.toString(), file.toString())
                .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                .redirectError(ProcessBuilder.Redirect.DISCARD)
                .start();
        if (!p.waitFor(20, TimeUnit.SECONDS)) {
          p.destroyForcibly();
          return 25;
        }
        return p.exitValue();
      } catch (Exception e) {
        if (p != null) p.destroyForcibly();
        return 25;
      }
    }
  }

  public PhotoService(
      @Value("${PHOTO_STORAGE_PATH:./data/photos}") String directory,
      @Value("${DOCUMENT_ENCRYPTION_KEY:}") String encodedKey,
      FaceCheck faceCheck) {
    storage = Path.of(directory).toAbsolutePath().normalize();
    this.faceCheck = faceCheck;
    byte[] decoded;
    try {
      decoded = Base64.getDecoder().decode(encodedKey);
    } catch (Exception e) {
      decoded = new byte[0];
    }
    key = decoded;
  }

  static void privateMode(Path p, boolean directory) throws IOException {
    try {
      Files.setPosixFilePermissions(
          p, PosixFilePermissions.fromString(directory ? "rwx------" : "rw-------"));
    } catch (UnsupportedOperationException ignored) {
    }
  }

  byte[] prepare(MultipartFile file) {
    if (key.length != 32) throw error(503, "Local photo encryption is not configured");
    if (file.isEmpty() || file.getSize() > 5 * 1024 * 1024)
      throw error(400, "Choose a JPEG or PNG photo under 5 MB");
    Path temporary = null;
    try (var input = ImageIO.createImageInputStream(file.getInputStream())) {
      var readers = ImageIO.getImageReaders(input);
      if (!readers.hasNext()) throw error(400, "Choose a valid JPEG or PNG photo");
      var reader = readers.next();
      BufferedImage decoded;
      try {
        String format = reader.getFormatName();
        if (!Set.of("JPEG", "JPG", "PNG").contains(format.toUpperCase(Locale.ROOT)))
          throw error(400, "Only JPEG and PNG photos are supported");
        reader.setInput(input, true, true);
        int w = reader.getWidth(0), h = reader.getHeight(0);
        if (w < 64 || h < 64 || w > 8192 || h > 8192 || (long) w * h > 20_000_000)
          throw error(400, "Choose a photo from 64 pixels to 20 megapixels");
        decoded = reader.read(0);
      } finally {
        reader.dispose();
      }
      double scale = Math.min(1, 1024.0 / Math.max(decoded.getWidth(), decoded.getHeight()));
      var clean =
          new BufferedImage(
              Math.max(1, (int) (decoded.getWidth() * scale)),
              Math.max(1, (int) (decoded.getHeight() * scale)),
              BufferedImage.TYPE_INT_RGB);
      var graphics = clean.createGraphics();
      graphics.setColor(Color.WHITE);
      graphics.fillRect(0, 0, clean.getWidth(), clean.getHeight());
      graphics.setRenderingHint(
          RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
      graphics.drawImage(decoded, 0, 0, clean.getWidth(), clean.getHeight(), null);
      graphics.dispose();
      var out = new ByteArrayOutputStream();
      ImageIO.write(clean, "jpeg", out);
      byte[] bytes = out.toByteArray();
      Files.createDirectories(storage);
      privateMode(storage, true);
      temporary = Files.createTempFile(storage, "check-", ".jpg");
      privateMode(temporary, false);
      Files.write(temporary, bytes);
      int verdict = faceCheck.check(temporary);
      if (verdict == 23)
        throw error(
            422,
            "No clear face found. Choose a well-lit portrait facing the camera, or skip this"
                + " step.");
      if (verdict == 24)
        throw error(422, "More than one face found. Choose a photo showing only one person.");
      if (verdict != 0)
        throw error(
            503,
            "Local photo checking is unavailable. Try again later or continue without a photo.");
      return bytes;
    } catch (org.springframework.web.server.ResponseStatusException e) {
      throw e;
    } catch (Exception e) {
      throw error(400, "The photo could not be processed. Choose a different JPEG or PNG.");
    } finally {
      if (temporary != null)
        try {
          Files.deleteIfExists(temporary);
        } catch (IOException ignored) {
        }
    }
  }

  Path blob(String id) {
    if (!id.matches("[a-f0-9-]{36}")) throw error(404, "Photo not found");
    return storage.resolve(id + ".enc");
  }

  void save(String id, byte[] bytes) {
    try {
      Files.createDirectories(storage);
      privateMode(storage, true);
      byte[] iv = new byte[12];
      new SecureRandom().nextBytes(iv);
      var cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
          Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
      cipher.updateAAD(id.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      byte[] encrypted = cipher.doFinal(bytes);
      byte[] all = new byte[iv.length + encrypted.length];
      System.arraycopy(iv, 0, all, 0, iv.length);
      System.arraycopy(encrypted, 0, all, iv.length, encrypted.length);
      Files.write(blob(id), all, StandardOpenOption.CREATE_NEW);
      privateMode(blob(id), false);
    } catch (Exception e) {
      throw error(503, "Unable to store the photo locally");
    }
  }

  byte[] read(String id) {
    try {
      byte[] all = Files.readAllBytes(blob(id));
      var cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
          Cipher.DECRYPT_MODE,
          new SecretKeySpec(key, "AES"),
          new GCMParameterSpec(128, Arrays.copyOfRange(all, 0, 12)));
      cipher.updateAAD(id.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return cipher.doFinal(Arrays.copyOfRange(all, 12, all.length));
    } catch (Exception e) {
      throw error(404, "Photo unavailable");
    }
  }

  void remove(String id) {
    try {
      Files.deleteIfExists(blob(id));
    } catch (IOException e) {
      throw error(503, "Unable to remove the local photo file");
    }
  }
}
