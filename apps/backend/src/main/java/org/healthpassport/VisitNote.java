package org.healthpassport;

import java.time.Instant;
import java.util.Map;

/** Immutable SOAP note value object; a draft may contain empty sections. */
record VisitNote(String subjective, String objective, String assessment, String plan) {
  VisitNote {
    validate(subjective);
    validate(objective);
    validate(assessment);
    validate(plan);
  }

  static VisitNote from(Map<String, Object> values) {
    return new VisitNote(
        section(values, "subjective"),
        section(values, "objective"),
        section(values, "assessment"),
        section(values, "plan"));
  }

  private static String section(Map<String, Object> values, String key) {
    if (!(values.get(key) instanceof String value))
      throw new IllegalArgumentException("Each note section must be at most 2000 characters");
    return value;
  }

  private static void validate(String value) {
    if (value == null || value.length() > 2000)
      throw new IllegalArgumentException("Each note section must be at most 2000 characters");
  }

  String formatEncounter(Instant scheduledAt) {
    return "Scheduled visit date: "
        + scheduledAt
        + "\n\nSubjective\n"
        + subjective
        + "\n\nObjective\n"
        + objective
        + "\n\nAssessment\n"
        + assessment
        + "\n\nPlan\n"
        + plan;
  }
}
