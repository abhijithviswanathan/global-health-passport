package org.healthpassport;

import static org.junit.jupiter.api.Assertions.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class EligibilityProviderTest {
  // UTC is September 12 while New York is still September 11.
  final Clock clock =
      Clock.fixed(Instant.parse("2026-09-12T01:30:00Z"), ZoneId.of("America/New_York"));

  EligibilityProvider.Request policy(String company, String effective, String expiration) {
    return new EligibilityProvider.Request(company, "Plan", Map.of(), effective, expiration);
  }

  @Test
  void syntheticNeverVerifiesARealCompanyOrFuturePolicy() {
    var provider = new EligibilityProvider.Synthetic(clock);
    assertEquals("UNKNOWN", provider.verify(policy("Real company", null, null)).status());
    assertEquals("UNVERIFIED", provider.verify(policy("Synthetic Example", "2026-09-13", null)).status());
    assertEquals("UNKNOWN", new EligibilityProvider.Unconfigured().verify(policy("Company", null, null)).status());
  }

  @Test
  void policyBoundariesUseUtcEvenWhenHostDateDiffers() {
    var provider = new EligibilityProvider.Synthetic(clock);
    assertEquals("VERIFIED", provider.verify(policy("Synthetic Example", "2026-09-12", "2026-09-12")).status());
    assertEquals("UNVERIFIED", provider.verify(policy("Synthetic Example", null, "2026-09-11")).status());
    assertTrue(provider.verify(policy("Synthetic Example", null, null)).synthetic());
  }

  @Test
  void externalAdapterRequiresPrivateHttpsConfiguration() {
    var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
    assertThrows(IllegalArgumentException.class,
        () -> new HttpEligibilityProvider("http://example.org/eligibility", "test-only", mapper));
    assertThrows(IllegalArgumentException.class,
        () -> new HttpEligibilityProvider("https://example.org/eligibility", "", mapper));
    assertThrows(IllegalArgumentException.class,
        () -> new HttpEligibilityProvider("https://user@example.org/eligibility", "test-only", mapper));
  }
}
