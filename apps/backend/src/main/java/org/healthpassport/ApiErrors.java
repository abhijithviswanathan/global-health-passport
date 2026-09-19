/**
 * Maps expected request failures to the JSON error shape both clients consume.
 * Duplicate/stale writes surface as 409 so the caller can refresh and review.
 * Keep database details and secrets out of messages returned to the browser.
 */
package org.healthpassport;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiErrors {
  @ExceptionHandler(org.springframework.dao.DuplicateKeyException.class)
  ResponseEntity<Map<String,Object>> duplicate(){return ResponseEntity.status(409).body(Map.of("status",409,"message","This item already exists or changed. Refresh and review before retrying."));}

  @ExceptionHandler(ResponseStatusException.class)
  ResponseEntity<Map<String, Object>> expected(ResponseStatusException e) {
    return ResponseEntity.status(e.getStatusCode())
        .body(
            Map.of(
                "status",
                e.getStatusCode().value(),
                "message",
                e.getReason() == null ? "Request denied" : e.getReason()));
  }
}
