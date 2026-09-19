/**
 * Shared identity mechanics: MFA encryption, OTP checks, recovery and session registry.
 * Encryption keys come from server configuration and must survive restarts.
 * Attempt counters are process-local; they are not a distributed rate limiter.
 */
package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import com.eatthepath.otp.TimeBasedOneTimePasswordGenerator;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class IdentityService {
  final JdbcTemplate db;
  final TransactionTemplate tx;
  final TimeBasedOneTimePasswordGenerator otp = new TimeBasedOneTimePasswordGenerator();
  final Map<String, List<Instant>> attempts = new ConcurrentHashMap<>();

  @Value("${IDENTITY_ENCRYPTION_KEY:}")
  String encryptionKey;

  IdentityService(JdbcTemplate db, PlatformTransactionManager manager) {
    this.db = db;
    tx = new TransactionTemplate(manager);
  }

  static String hash(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  // Bound attempts in a rolling local window. Multiple server processes would need shared counters.
  void limit(String key) {
    var list = attempts.computeIfAbsent(key, k -> new ArrayList<>());
    synchronized (list) {
      list.removeIf(i -> i.isBefore(Instant.now().minusSeconds(900)));
      if (list.size() >= 5) throw error(429, "Too many attempts");
      list.add(Instant.now());
    }
  }

  byte[] key() {
    try {
      byte[] k = Base64.getDecoder().decode(encryptionKey);
      if (k.length != 32) throw new IllegalArgumentException();
      return k;
    } catch (Exception e) {
      throw error(503, "Identity encryption is not configured");
    }
  }

  // Store IV + authenticated ciphertext, encoded as Base64. Each encryption uses a fresh random IV.
  String encrypt(byte[] secret) {
    try {
      byte[] iv = new byte[12];
      new SecureRandom().nextBytes(iv);
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key(), "AES"), new GCMParameterSpec(128, iv));
      byte[] encrypted = c.doFinal(secret), out = new byte[iv.length + encrypted.length];
      System.arraycopy(iv, 0, out, 0, iv.length);
      System.arraycopy(encrypted, 0, out, iv.length, encrypted.length);
      return Base64.getEncoder().encodeToString(out);
    } catch (org.springframework.web.server.ResponseStatusException e) {
      throw e;
    } catch (Exception e) {
      throw new IllegalStateException("Cannot protect MFA secret", e);
    }
  }

  byte[] decrypt(String value) {
    try {
      byte[] raw = Base64.getDecoder().decode(value);
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(
          Cipher.DECRYPT_MODE,
          new SecretKeySpec(key(), "AES"),
          new GCMParameterSpec(128, Arrays.copyOf(raw, 12)));
      return c.doFinal(Arrays.copyOfRange(raw, 12, raw.length));
    } catch (org.springframework.web.server.ResponseStatusException e) {
      throw e;
    } catch (Exception e) {
      throw error(503, "MFA key is unavailable");
    }
  }

  static String base32(byte[] bytes) {
    String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    StringBuilder out = new StringBuilder();
    int buffer = 0, bits = 0;
    for (byte value : bytes) {
      buffer = (buffer << 8) | (value & 255);
      bits += 8;
      while (bits >= 5) {
        out.append(alphabet.charAt((buffer >> (bits - 5)) & 31));
        bits -= 5;
      }
    }
    if (bits > 0) out.append(alphabet.charAt((buffer << (5 - bits)) & 31));
    return out.toString();
  }

  boolean enabled(String uid) {
    return db.queryForObject(
            "select count(*) from identity_mfa where user_id=? and enabled=true",
            Integer.class,
            uid)
        > 0;
  }

  void verifySecondFactor(String uid, Map<String, Object> body) {
    if (enabled(uid)) {
      limit("mfa:" + uid);
      verify(uid, body.get("otp") instanceof String s ? s : "");
    }
  }

  void verify(String uid, String code) {
    if (!code.matches("[0-9]{6}")) throw error(401, "Second factor required");
    Boolean accepted =
        tx.execute(
            status -> {
              var rows =
                  db.queryForList("select * from identity_mfa where user_id=? for update", uid);
              if (rows.isEmpty()) return false;
              var row = rows.getFirst();
              long last = ((Number) row.get("last_step")).longValue(),
                  step = Instant.now().getEpochSecond() / 30;
              byte[] secret = decrypt(row.get("encrypted_secret").toString());
              for (long s = step - 1; s <= step + 1; s++) {
                if (s <= last) continue;
                String expected = generate(secret, s);
                if (MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.US_ASCII),
                    code.getBytes(StandardCharsets.US_ASCII))) {
                  db.update("update identity_mfa set last_step=? where user_id=?", s, uid);
                  return true;
                }
              }
              return false;
            });
    if (!Boolean.TRUE.equals(accepted))
      throw error(401, "Invalid or previously used second factor");
  }

  String generate(byte[] secret, long step) {
    try {
      return otp.generateOneTimePasswordString(
          new SecretKeySpec(secret, "HmacSHA1"), Instant.ofEpochSecond(step * 30), Locale.ROOT);
    } catch (InvalidKeyException e) {
      throw new IllegalStateException("Invalid MFA key", e);
    }
  }

  // The registry stores a hash of the session identifier so revocation can be checked on later requests.
  void registerSession(String uid, HttpServletRequest r) {
    db.update(
        "insert into"
            + " identity_session(id,session_hash,user_id,created_at,expires_at,revoked,device_label)"
            + " values(?,?,?,?,?,false,?)",
        id(),
        hash(r.getSession().getId()),
        uid,
        now(),
        Instant.now().plusSeconds(900).toString(),
        Optional.ofNullable(r.getHeader("User-Agent"))
            .orElse("Unknown device")
            .substring(
                0,
                Math.min(
                    200,
                    Optional.ofNullable(r.getHeader("User-Agent"))
                        .orElse("Unknown device")
                        .length())));
  }

  // A cookie alone is insufficient: revoked/expired registry entries must stop access immediately.
  void validateSession(HttpServletRequest r) {
    var session = r.getSession(false);
    if (session == null) throw error(401, "Authentication required");
    String key = hash(session.getId());
    var rows = db.queryForList("select * from identity_session where session_hash=?", key);
    if (rows.isEmpty()
        || Boolean.TRUE.equals(rows.getFirst().get("revoked"))
        || !Instant.parse(rows.getFirst().get("expires_at").toString()).isAfter(Instant.now())) {
      session.invalidate();
      throw error(401, "Session revoked or expired");
    }
  }

  void revokeCurrent(HttpServletRequest r) {
    if (r.getSession(false) != null)
      db.update(
          "update identity_session set revoked=true where session_hash=?",
          hash(r.getSession(false).getId()));
  }
}
