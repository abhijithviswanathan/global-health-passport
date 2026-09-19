/**
 * Organization update notifications over SSE and a cursor-based polling fallback.
 * Subscribers are tied to sessions; polling rechecks access. Events tell the UI to
 * refresh authorized data instead of embedding a patient chart in a notification.
 * The emitter registry is local to this Java process.
 */
package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Configuration
@EnableScheduling
class OrganizationScheduling {}

@RestController
@RequestMapping("/api/ecosystem")
class OrganizationEventsApi {
  final EcosystemApi eco;
  final ConcurrentHashMap<SseEmitter, Subscription> clients = new ConcurrentHashMap<>();

  record Subscription(Map<String, Object> user, String sessionHash, long cursor) {}

  OrganizationEventsApi(EcosystemApi eco) {
    this.eco = eco;
  }

  @GetMapping(value = "/events", produces = "text/event-stream")
  SseEmitter events(HttpServletRequest r) {
    var u = eco.staff(r);
    if (clients.size() >= 500
        || clients.values().stream().filter(s -> s.user.get("id").equals(u.get("id"))).count() >= 3)
      throw error(429, "Too many live workspace connections");
    var emitter = new SseEmitter(120000L);
    long cursor = latest(eco.tenants.org(u));
    clients.put(emitter, new Subscription(u, IdentityService.hash(r.getSession().getId()), cursor));
    emitter.onCompletion(() -> clients.remove(emitter));
    emitter.onTimeout(() -> clients.remove(emitter));
    emitter.onError(e -> clients.remove(emitter));
    try {
      emitter.send(SseEmitter.event().name("ready").data(Map.of("cursor", cursor)));
    } catch (Exception e) {
      clients.remove(emitter);
      emitter.complete();
    }
    return emitter;
  }

  long latest(String oid) {
    Long n =
        eco.api.db.queryForObject(
            "select coalesce(max(seq),0) from organization_event where organization_id=?",
            Long.class,
            oid);
    return n == null ? 0 : n;
  }

  @GetMapping("/changes")
  Map<String, Object> changes(@RequestParam(defaultValue = "0") long after, HttpServletRequest r) {
    var u = eco.staff(r);
    long cursor = latest(eco.tenants.org(u));
    return Map.of("cursor", cursor, "changed", cursor > after);
  }

  @Scheduled(fixedDelay = 1500)
  void deliver() {
    for (var entry : clients.entrySet()) {
      var emitter = entry.getKey();
      var sub = entry.getValue();
      try {
        var user = eco.api.db.queryForMap("select * from app_user where id=?", sub.user.get("id"));
        eco.tenants.validate(user);
        var session =
            eco.api.db.queryForMap(
                "select * from identity_session where session_hash=?", sub.sessionHash);
        if (Boolean.TRUE.equals(session.get("revoked"))
            || TenantService.expired(session.get("expires_at"))) throw error(401, "Session ended");
        long cursor = latest(eco.tenants.org(user));
        if (cursor > sub.cursor) {
          emitter.send(
              SseEmitter.event()
                  .name("change")
                  .data(Map.of("cursor", cursor, "message", "Workspace updated")));
          clients.put(emitter, new Subscription(user, sub.sessionHash, cursor));
        }
      } catch (Exception ex) {
        clients.remove(emitter);
        emitter.complete();
      }
    }
  }

  @Scheduled(fixedDelay = 30000)
  void expireEmployment() {
    for (var e : eco.api.db.queryForList("select * from employment where status='active'")) {
      if (!TenantService.expired(e.get("end_at"))
          && !TenantService.expired(e.get("credential_until"))) continue;
      eco.atomic(
          () -> {
            eco.tenants.expire(e);
            return null;
          });
    }
  }
}
