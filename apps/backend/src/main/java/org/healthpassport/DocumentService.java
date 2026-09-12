package org.healthpassport;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class DocumentService {
  static final long MAX_BYTES = 10L * 1024 * 1024;
  private final JdbcTemplate db;
  private final Scanner scanner;
  private final String encodedKey;
  private final Path storage;

  public DocumentService(
      JdbcTemplate db,
      Scanner scanner,
      @Value("${DOCUMENT_ENCRYPTION_KEY:}") String encodedKey,
      @Value("${DOCUMENT_STORAGE_PATH:./data/documents}") String storage) {
    this.db = db;
    this.scanner = scanner;
    this.encodedKey = encodedKey;
    this.storage = Path.of(storage).toAbsolutePath().normalize();
  }

  public enum Verdict {
    CLEAN,
    INFECTED,
    UNAVAILABLE
  }

  public interface Scanner {
    Verdict scan(Path file);
  }

  @Component
  public static class CommandScanner implements Scanner {
    private final String executable;

    public CommandScanner(@Value("${CLAMAV_EXECUTABLE:}") String executable) {
      this.executable = executable;
    }

    @Override
    public Verdict scan(Path file) {
      if (executable.isBlank()) return Verdict.UNAVAILABLE;
      Process process = null;
      try {
        Path scannerPath = Path.of(executable);
        if (!scannerPath.isAbsolute()
            || !Files.isRegularFile(scannerPath)
            || !Files.isExecutable(scannerPath)) return Verdict.UNAVAILABLE;
        process =
            new ProcessBuilder(
                    executable, "--no-summary", "--stdout", file.toAbsolutePath().toString())
                .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                .redirectError(ProcessBuilder.Redirect.DISCARD)
                .start();
        if (!process.waitFor(30, TimeUnit.SECONDS)) {
          process.destroyForcibly();
          return Verdict.UNAVAILABLE;
        }
        return switch (process.exitValue()) {
          case 0 -> Verdict.CLEAN;
          case 1 -> Verdict.INFECTED;
          default -> Verdict.UNAVAILABLE;
        };
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        return Verdict.UNAVAILABLE;
      } catch (Exception e) {
        return Verdict.UNAVAILABLE;
      } finally {
        if (process != null && process.isAlive()) process.destroyForcibly();
      }
    }
  }

  Map<String, Object> upload(
      String patient, String author, String source, MultipartFile upload, Runnable reauthorize) {
    if (upload.isEmpty() || upload.getSize() > MAX_BYTES)
      throw PassportApi.error(400, "Upload must contain 1 byte to 10 MiB");
    String name = upload.getOriginalFilename();
    if (name == null
        || name.isBlank()
        || name.length() > 160
        || name.contains("/")
        || name.contains("\\")
        || name.equals(".")
        || name.equals("..")
        || name.chars().anyMatch(c -> Character.isISOControl(c)))
      throw PassportApi.error(400, "Use a filename without paths or control characters");
    byte[] key = key();
    String id = UUID.randomUUID().toString();
    Path encrypted = blob(id), temporary = null;
    boolean rowSaved = false;
    try {
      byte[] bytes = upload.getBytes();
      if (bytes.length > MAX_BYTES) throw PassportApi.error(400, "Upload exceeds 10 MiB");
      String media = mediaType(bytes);
      if (!media.equals(upload.getContentType()))
        throw PassportApi.error(400, "File signature and declared type do not match");
      String extension = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
      if (!(media.equals("application/pdf") && extension.equals("pdf"))
          && !(media.equals("image/png") && extension.equals("png"))
          && !(media.equals("image/jpeg") && Set.of("jpg", "jpeg").contains(extension)))
        throw PassportApi.error(400, "File extension and content do not match");
      Files.createDirectories(storage);
      privatePermissions(storage, "rwx------");
      byte[] iv = new byte[12];
      new SecureRandom().nextBytes(iv);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
          Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
      cipher.updateAAD((id + ":" + patient).getBytes(java.nio.charset.StandardCharsets.UTF_8));
      byte[] ciphertext = cipher.doFinal(bytes);
      byte[] envelope = new byte[iv.length + ciphertext.length];
      System.arraycopy(iv, 0, envelope, 0, iv.length);
      System.arraycopy(ciphertext, 0, envelope, iv.length, ciphertext.length);
      Files.write(encrypted, envelope, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
      privatePermissions(encrypted, "rw-------");
      // Plaintext exists only in a private scan file and is removed on every exit.
      temporary = Files.createTempFile(storage, ".scan-", ".tmp");
      privatePermissions(temporary, "rw-------");
      Files.write(temporary, bytes, StandardOpenOption.TRUNCATE_EXISTING);
      Verdict verdict;
      try {
        verdict = scanner.scan(temporary);
      } catch (RuntimeException e) {
        verdict = Verdict.UNAVAILABLE;
      }
      String status =
          verdict == Verdict.CLEAN
              ? "clean"
              : verdict == Verdict.INFECTED ? "rejected" : "quarantined";
      reauthorize.run();
      db.update(
          "insert into"
              + " medical_document(id,patient_id,author_id,filename,media_type,size_bytes,status,source,sha256,created_at)"
              + " values(?,?,?,?,?,?,?,?,?,?)",
          id,
          patient,
          author,
          name,
          media,
          bytes.length,
          status,
          source,
          HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)),
          Instant.now().toString());
      rowSaved = true;
      return metadata(id);
    } catch (org.springframework.web.server.ResponseStatusException e) {
      throw e;
    } catch (Exception e) {
      throw PassportApi.error(503, "Document storage is unavailable");
    } finally {
      Arrays.fill(key, (byte) 0);
      if (temporary != null)
        try {
          Files.deleteIfExists(temporary);
        } catch (IOException e) {
          /* Directory is private; operational cleanup is required on filesystem failure. */
        }
      if (!rowSaved)
        try {
          Files.deleteIfExists(encrypted);
        } catch (IOException e) {
          /* Encrypted orphan can be removed during operational cleanup. */
        }
    }
  }

  static String mediaType(byte[] b) {
    if (b.length >= 12 && b[0] == '%' && b[1] == 'P' && b[2] == 'D' && b[3] == 'F' && b[4] == '-') {
      String tail =
          new String(
              b,
              Math.max(0, b.length - 1024),
              Math.min(1024, b.length),
              java.nio.charset.StandardCharsets.ISO_8859_1);
      if (tail.contains("%%EOF")) return "application/pdf";
    }
    if (b.length >= 24
        && Arrays.equals(Arrays.copyOf(b, 8), new byte[] {(byte) 137, 80, 78, 71, 13, 10, 26, 10})
        && b[12] == 'I'
        && b[13] == 'H'
        && b[14] == 'D'
        && b[15] == 'R') return "image/png";
    if (b.length >= 4
        && b[0] == (byte) 255
        && b[1] == (byte) 216
        && b[2] == (byte) 255
        && b[b.length - 2] == (byte) 255
        && b[b.length - 1] == (byte) 217) return "image/jpeg";
    throw PassportApi.error(400, "Only PDF, JPEG, and PNG file signatures are accepted");
  }

  private byte[] key() {
    try {
      byte[] key = Base64.getDecoder().decode(encodedKey);
      if (key.length == 32) return key;
    } catch (IllegalArgumentException ignored) {
    }
    throw PassportApi.error(503, "Document encryption is not configured");
  }

  private Path blob(String id) {
    return storage.resolve(UUID.fromString(id).toString() + ".enc");
  }

  private static void privatePermissions(Path path, String permissions) throws IOException {
    if (Files.getFileStore(path).supportsFileAttributeView("posix"))
      Files.setPosixFilePermissions(path, PosixFilePermissions.fromString(permissions));
  }

  Map<String, Object> metadata(String id) {
    var rows = db.queryForList("select * from medical_document where id=?", id);
    if (rows.isEmpty()) throw PassportApi.error(404, "Document not found");
    return rows.getFirst();
  }

  List<Map<String, Object>> list(String patient) {
    return db.queryForList(
        "select * from medical_document where patient_id=? order by created_at desc", patient);
  }

  byte[] download(Map<String, Object> row) {
    if (!"clean".equals(row.get("status")))
      throw PassportApi.error(423, "Document is quarantined or rejected and cannot be downloaded");
    byte[] key = key();
    try {
      Path file = blob(row.get("id").toString());
      if (Files.isSymbolicLink(file) || Files.size(file) > MAX_BYTES + 28)
        throw PassportApi.error(503, "Document storage integrity check failed");
      byte[] envelope = Files.readAllBytes(file);
      if (envelope.length < 29)
        throw PassportApi.error(503, "Document storage integrity check failed");
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
          Cipher.DECRYPT_MODE,
          new SecretKeySpec(key, "AES"),
          new GCMParameterSpec(128, Arrays.copyOf(envelope, 12)));
      cipher.updateAAD(
          (row.get("id") + ":" + row.get("patient_id"))
              .getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return cipher.doFinal(envelope, 12, envelope.length - 12);
    } catch (org.springframework.web.server.ResponseStatusException e) {
      throw e;
    } catch (Exception e) {
      throw PassportApi.error(503, "Document storage integrity check failed");
    } finally {
      Arrays.fill(key, (byte) 0);
    }
  }
}
