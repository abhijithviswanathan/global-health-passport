package org.healthpassport;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.net.ssl.HttpsURLConnection;

/**
 * Private server-configured eligibility gateway. No public marketplace or clinical chart fields.
 */
final class HttpEligibilityProvider implements EligibilityProvider {
  final URI endpoint;
  final String token;
  final ObjectMapper json;

  HttpEligibilityProvider(String url, String token, ObjectMapper json) {
    this.endpoint = URI.create(url);
    this.token = token;
    this.json = json;
    if (!"https".equals(endpoint.getScheme())
        || endpoint.getHost() == null
        || endpoint.getUserInfo() != null
        || endpoint.getFragment() != null
        || endpoint.getQuery() != null
        || token == null
        || token.isBlank()
        || token.contains("\n")
        || token.contains("\r"))
      throw new IllegalArgumentException(
          "Eligibility requires a private HTTPS gateway and server-held token");
  }

  public String name() {
    return "configured-https-gateway";
  }

  public Result verify(Request r) {
    HttpsURLConnection connection = null;
    try {
      var payload = new LinkedHashMap<String, Object>();
      payload.put("company", r.company());
      payload.put("plan", r.plan());
      payload.put("identifiers", r.identifiers());
      payload.put("effectiveDate", r.effectiveDate());
      payload.put("expirationDate", r.expirationDate());
      byte[] body = json.writeValueAsBytes(payload);
      connection = (HttpsURLConnection) endpoint.toURL().openConnection();
      connection.setInstanceFollowRedirects(false);
      connection.setConnectTimeout(3000);
      connection.setReadTimeout(5000);
      connection.setRequestMethod("POST");
      connection.setRequestProperty("Authorization", "Bearer " + token);
      connection.setRequestProperty("Content-Type", "application/json");
      connection.setRequestProperty("Accept", "application/json");
      connection.setDoOutput(true);
      connection.setFixedLengthStreamingMode(body.length);
      try (var out = connection.getOutputStream()) {
        out.write(body);
      }
      int code = connection.getResponseCode();
      if (code != 200)
        return new Result(
            code == 202 ? "PENDING" : "FAILED",
            false,
            "Eligibility gateway did not return a final coverage response. No coverage assumed.");
      byte[] response;
      try (var in = connection.getInputStream()) {
        response = in.readNBytes(32769);
      }
      if (response.length > 32768)
        return new Result(
            "FAILED", false, "Eligibility gateway response exceeded the accepted size.");
      String status =
          json.readTree(new String(response, StandardCharsets.UTF_8)).path("status").asText();
      if (!Set.of("VERIFIED", "UNVERIFIED", "PENDING", "FAILED", "UNKNOWN").contains(status))
        return new Result(
            "UNKNOWN",
            false,
            "Eligibility gateway returned an unrecognized status. Coverage is unknown.");
      return new Result(
          status,
          false,
          "Configured eligibility gateway reported "
              + status
              + ". Eligibility is not a guarantee of claim payment.");
    } catch (Exception ex) {
      return new Result(
          "FAILED",
          false,
          "Eligibility gateway unavailable or response invalid. No coverage assumed; request a new"
              + " check when ready.");
    } finally {
      if (connection != null) connection.disconnect();
    }
  }
}
