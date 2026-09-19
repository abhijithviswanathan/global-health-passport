/**
 * Last-pass removal of a small set of internal database fields from JSON maps/lists.
 * This is defense in depth, not a complete response allowlist or an access-control
 * layer. Controllers must still authorize resources and choose safe output fields.
 */
package org.healthpassport;

import java.util.*;
import org.springframework.core.MethodParameter;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.*;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

@ControllerAdvice
public class PublicResponse implements ResponseBodyAdvice<Object> {
  public boolean supports(MethodParameter p, Class<? extends HttpMessageConverter<?>> c) {
    return true;
  }

  public Object beforeBodyWrite(
      Object body,
      MethodParameter p,
      MediaType m,
      Class<? extends HttpMessageConverter<?>> c,
      ServerHttpRequest req,
      ServerHttpResponse res) {
    return clean(body);
  }

  Object clean(Object o) {
    if (o instanceof Map<?, ?> map) {
      Map<String, Object> out = new LinkedHashMap<>();
      map.forEach(
          (k, v) -> {
            if (!Set.of("internal_pk", "password_hash", "seq").contains(k.toString()))
              out.put(k.toString(), clean(v));
          });
      return out;
    }
    if (o instanceof List<?> list) return list.stream().map(this::clean).toList();
    return o;
  }
}
