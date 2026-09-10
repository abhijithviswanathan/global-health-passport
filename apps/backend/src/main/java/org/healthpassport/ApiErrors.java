package org.healthpassport;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiErrors {
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
