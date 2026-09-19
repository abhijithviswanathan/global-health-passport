/**
 * Generates the nine-character patient lookup label shown by both clients.
 * Internal row IDs remain separate UUIDs. The database enforces uniqueness; callers
 * handle collisions. Normalization helps lookup and does not prove identity.
 */
package org.healthpassport;

import java.security.SecureRandom;
import java.util.Locale;

/** A public lookup label, never an authentication or authorization secret. */
public final class HealthIds {
  private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  private static final SecureRandom RANDOM = new SecureRandom();

  private HealthIds() {}

  public static String generate() {
    StringBuilder id = new StringBuilder(9);
    for (int i = 0; i < 9; i++) id.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
    return id.toString();
  }

  public static String normalize(String value) {
    return value.toUpperCase(Locale.ROOT).replaceAll("[\\s-]", "");
  }

  public static boolean isCompact(String value) {
    return value.matches("[A-HJ-NP-Z2-9]{9}");
  }
}
