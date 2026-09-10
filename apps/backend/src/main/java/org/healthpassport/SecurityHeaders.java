package org.healthpassport;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class SecurityHeaders extends OncePerRequestFilter {
  protected void doFilterInternal(HttpServletRequest r, HttpServletResponse s, FilterChain chain)
      throws ServletException, IOException {
    s.setHeader("Cache-Control", "no-store");
    s.setHeader("Pragma", "no-cache");
    s.setHeader("X-Content-Type-Options", "nosniff");
    s.setHeader("X-Frame-Options", "DENY");
    s.setHeader("Referrer-Policy", "no-referrer");
    s.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    chain.doFilter(r, s);
  }
}
