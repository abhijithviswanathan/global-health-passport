package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import com.fasterxml.jackson.core.type.TypeReference;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.core.io.ClassPathResource;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class LearningApi {
  final PassportApi api;
  final List<Map<String, Object>> cases;
  static final Map<String, String> SYNONYMS =
      Map.of(
          "pyrexia",
          "fever",
          "anaemia",
          "anemia",
          "tiredness",
          "fatigue",
          "crp",
          "inflammation",
          "wheezing",
          "wheeze");

  LearningApi(PassportApi api) throws IOException {
    this.api = api;
    try (var stream = new ClassPathResource("learning/synthetic-cases.json").getInputStream()) {
      List<Map<String, Object>> source = api.json.readValue(stream, new TypeReference<>() {});
      if (source.isEmpty()
          || source.stream()
              .anyMatch(
                  c ->
                      !Boolean.TRUE.equals(c.get("synthetic"))
                          || !c.get("id").toString().startsWith("SYN-CASE-")))
        throw new IllegalStateException(
            "Learning corpus must contain curated synthetic cases only");
      cases = source.stream().map(Map::copyOf).toList();
    }
  }

  static Set<String> tokens(String value) {
    Set<String> result = new LinkedHashSet<>();
    for (String word : Pattern.compile("[^a-z0-9-]+").split(value.toLowerCase(Locale.ROOT))) {
      if (word.length() > 1) result.add(SYNONYMS.getOrDefault(word, word));
    }
    return result;
  }

  int age(Map<String, Object> b, String key, int fallback) {
    if (!b.containsKey(key)) return fallback;
    Object value = b.get(key);
    if (!(value instanceof Number n)
        || n.doubleValue() != n.intValue()
        || n.intValue() < 0
        || n.intValue() > 120) throw error(400, "Invalid age range");
    return n.intValue();
  }

  @PostMapping("/learning/cases/search")
  Map<String, Object> search(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    api.csrf(r);
    var user = api.user(r);
    if (!api.role(user).equals("doctor")) {
      api.audit(api.uid(user), null, "LEARNING_ACCESS_DENIED", "synthetic-corpus");
      throw error(403, "Clinician learning access required");
    }
    if (!"clinical-learning".equals(b.get("purpose"))
        || !Boolean.TRUE.equals(b.get("acknowledgeLimitations")))
      throw error(400, "Acknowledge learning purpose and limitations");
    String query = b.get("query") instanceof String s ? s : "";
    if (query.length() > 500) throw error(400, "Query is too long");
    int minimum = age(b, "ageMin", 0), maximum = age(b, "ageMax", 120);
    if (minimum > maximum) throw error(400, "Invalid age range");
    String sex = b.get("sex") instanceof String s ? s.toLowerCase(Locale.ROOT) : "";
    if (!Set.of("", "male", "female", "unknown").contains(sex))
      throw error(400, "Invalid sex filter");
    String lab = b.get("labPattern") instanceof String s ? s.toLowerCase(Locale.ROOT) : "";
    if (lab.length() > 80) throw error(400, "Invalid laboratory pattern");
    Set<String> requested = tokens(query);
    List<Map<String, Object>> results = new ArrayList<>();
    for (var c : cases) {
      if (((Number) c.get("ageMax")).intValue() < minimum
          || ((Number) c.get("ageMin")).intValue() > maximum) continue;
      if (!sex.isEmpty() && !sex.equals(c.get("sex"))) continue;
      List<?> labs = (List<?>) c.get("labPatterns");
      if (!lab.isEmpty() && !labs.contains(lab)) continue;
      Set<String> conceptTerms =
          tokens(
              String.join(
                  " ", ((List<?>) c.get("concepts")).stream().map(Object::toString).toList()));
      Set<String> text =
          tokens(
              c.get("title")
                  + " "
                  + c.get("narrative")
                  + " "
                  + String.join(" ", labs.stream().map(Object::toString).toList()));
      List<String> matched =
          requested.stream().filter(t -> conceptTerms.contains(t) || text.contains(t)).toList();
      if (!requested.isEmpty() && matched.isEmpty()) continue;
      int score = matched.stream().mapToInt(t -> conceptTerms.contains(t) ? 3 : 1).sum();
      Map<String, Object> result = new LinkedHashMap<>(c);
      result.put("matchedTerms", matched);
      result.put("score", score);
      result.put(
          "matchExplanation",
          "Age range overlaps the selected range; optional sex/laboratory filters match. Concept"
              + " matches weigh 3 and lexical matches weigh 1. Score is a retrieval ranking, not"
              + " clinical probability.");
      results.add(result);
    }
    results.sort(
        Comparator.<Map<String, Object>>comparingInt(x -> ((Number) x.get("score")).intValue())
            .reversed()
            .thenComparing(x -> x.get("id").toString()));
    api.audit(api.uid(user), null, "SYNTHETIC_CASE_SEARCH", "synthetic-corpus-v1");
    return Map.of(
        "results",
        results,
        "corpusVersion",
        "synthetic-corpus-v1",
        "synthetic",
        true,
        "method",
        "structured-filters-and-lexical-concepts",
        "notice",
        "Fictional learning cases only. Similarity is not a diagnosis or treatment recommendation."
            + " Do not enter patient identifiers.");
  }

  @GetMapping("/patients/{patient}/summary")
  Map<String, Object> summary(@PathVariable String patient, HttpServletRequest r) {
    var user = api.user(r);
    if (!Set.of("patient", "doctor").contains(api.role(user)))
      throw error(403, "Patient or clinician access required");
    var records = api.timeline(patient, r);
    List<Map<String, Object>> statements =
        records.stream()
            .filter(row -> "active".equals(row.get("status")))
            .limit(25)
            .map(
                row -> {
                  Map<String, Object> s = new LinkedHashMap<>();
                  String detail = String.valueOf(row.get("details"));
                  s.put(
                      "text",
                      row.get("title")
                          + " — "
                          + detail.substring(0, Math.min(detail.length(), 240)));
                  s.put("sourceRecordId", row.get("id"));
                  s.put("source", row.get("source"));
                  s.put("recordedAt", row.get("created_at"));
                  s.put("kind", row.get("kind"));
                  return s;
                })
            .toList();
    api.audit(api.uid(user), patient, "SOURCE_SUMMARY_READ", patient);
    return Map.of(
        "statements",
        statements,
        "method",
        "deterministic-source-extraction",
        "aiGenerated",
        false,
        "remoteModelEnabled",
        false,
        "notice",
        "Source-linked excerpts from up to 25 active records you may access. History may be"
            + " incomplete. No clinical inference or source-record modification.");
  }
}
