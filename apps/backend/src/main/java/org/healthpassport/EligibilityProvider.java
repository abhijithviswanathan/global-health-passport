package org.healthpassport;

import java.time.*;
import java.util.*;

/** Adapter boundary: credentials and insurer identifiers never enter marketplace systems. */
interface EligibilityProvider {
  record Request(
      String company,
      String plan,
      Map<String, Object> identifiers,
      String effectiveDate,
      String expirationDate) {}

  record Result(String status, boolean synthetic, String summary) {}

  String name();

  Result verify(Request request);

  class Unconfigured implements EligibilityProvider {
    public String name() {
      return "unconfigured";
    }

    public Result verify(Request r) {
      return new Result(
          "UNKNOWN",
          false,
          "No insurer eligibility adapter is configured. Coverage has not been verified.");
    }
  }

  class Synthetic implements EligibilityProvider {
    public String name() {
      return "synthetic-development";
    }

    public Result verify(Request r) {
      if (!r.company().startsWith("Synthetic "))
        return new Result(
            "UNKNOWN",
            true,
            "Synthetic adapter accepts fictional companies only; no real coverage decision.");
      if (r.effectiveDate() != null
          && LocalDate.parse(r.effectiveDate()).isAfter(LocalDate.now(ZoneOffset.UTC)))
        return new Result(
            "UNVERIFIED",
            true,
            "Synthetic test policy has not reached its supplied effective date. Not an insurer"
                + " response.");
      if (r.expirationDate() != null
          && LocalDate.parse(r.expirationDate()).isBefore(LocalDate.now(ZoneOffset.UTC)))
        return new Result(
            "UNVERIFIED",
            true,
            "Synthetic test policy is past its supplied expiration. Not an insurer response.");
      return new Result(
          "VERIFIED",
          true,
          "SYNTHETIC TEST RESPONSE — no insurer was contacted. This is not evidence of actual"
              + " coverage or payment.");
    }
  }
}
