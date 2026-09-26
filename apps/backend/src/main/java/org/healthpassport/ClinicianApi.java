package org.healthpassport;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.springframework.web.bind.annotation.*;

/** HTTP adapter: resolves a server session, checks CSRF for writes and delegates use cases. */
@RestController
@RequestMapping("/api/clinician")
public class ClinicianApi {
  private final PassportApi sessions;
  private final ClinicianService clinician;

  ClinicianApi(PassportApi sessions, ClinicianService clinician) {
    this.sessions = sessions;
    this.clinician = clinician;
  }

  private <T> T withActor(
      HttpServletRequest request, boolean mutation, Function<Map<String, Object>, T> useCase) {
    // Keep session validation and the use case under the original shared monitor.
    synchronized (sessions) {
      if (mutation) sessions.csrf(request);
      return useCase.apply(sessions.user(request));
    }
  }

  @GetMapping("/appointments")
  List<Map<String, Object>> list(
      @RequestParam String from, @RequestParam String to, HttpServletRequest request) {
    return withActor(request, false, actor -> clinician.list(from, to, actor));
  }

  @GetMapping("/appointments/{aid}")
  Map<String, Object> one(@PathVariable String aid, HttpServletRequest request) {
    return withActor(request, false, actor -> clinician.one(aid, actor));
  }

  @PostMapping("/appointments")
  Map<String, Object> book(@RequestBody Map<String, Object> body, HttpServletRequest request) {
    return withActor(request, true, actor -> clinician.book(body, actor));
  }

  @PatchMapping("/appointments/{aid}")
  Map<String, Object> update(
      @PathVariable String aid, @RequestBody Map<String, Object> body, HttpServletRequest request) {
    return withActor(request, true, actor -> clinician.update(aid, body, actor));
  }

  @GetMapping("/appointments/{aid}/draft")
  Map<String, Object> readDraft(@PathVariable String aid, HttpServletRequest request) {
    return withActor(request, false, actor -> clinician.readDraft(aid, actor));
  }

  @PutMapping("/appointments/{aid}/draft")
  Map<String, Object> saveDraft(
      @PathVariable String aid, @RequestBody Map<String, Object> body, HttpServletRequest request) {
    return withActor(request, true, actor -> clinician.saveDraft(aid, body, actor));
  }

  @PostMapping("/appointments/{aid}/complete")
  Map<String, Object> complete(
      @PathVariable String aid, @RequestBody Map<String, Object> body, HttpServletRequest request) {
    return withActor(request, true, actor -> clinician.complete(aid, body, actor));
  }
}
