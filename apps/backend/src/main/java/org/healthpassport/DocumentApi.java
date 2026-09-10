package org.healthpassport;

import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
public class DocumentApi {
  private final PassportApi api;
  private final DocumentService documents;

  DocumentApi(PassportApi api, DocumentService documents) {
    this.api = api;
    this.documents = documents;
  }

  @GetMapping("/patients/{patient}/documents")
  List<Map<String, Object>> list(@PathVariable String patient, HttpServletRequest request) {
    var user = api.user(request);
    api.require(user, patient, "document");
    api.audit(api.uid(user), patient, "DOCUMENTS_READ", patient);
    return documents.list(patient).stream().map(this::publicMetadata).toList();
  }

  @PostMapping(
      value = "/patients/{patient}/documents",
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  Map<String, Object> upload(
      @PathVariable String patient,
      @RequestPart("file") MultipartFile file,
      HttpServletRequest request) {
    api.csrf(request);
    var user = api.user(request);
    api.require(user, patient, "document");
    if (!Set.of("patient", "doctor").contains(api.role(user)))
      throw PassportApi.error(403, "Document upload requires patient or doctor access");
    String source =
        api.role(user).equals("patient")
            ? "Patient entered — unverified"
            : "Provider upload — " + user.get("organization");
    var metadata =
        documents.upload(
            patient,
            api.uid(user),
            source,
            file,
            () -> api.require(api.user(request), patient, "document"));
    api.audit(
        api.uid(user),
        patient,
        "DOCUMENT_UPLOADED_" + metadata.get("status").toString().toUpperCase(Locale.ROOT),
        metadata.get("id").toString());
    return publicMetadata(metadata);
  }

  @GetMapping("/documents/{id}/download")
  ResponseEntity<byte[]> download(@PathVariable String id, HttpServletRequest request) {
    var user = api.user(request);
    var metadata = documents.metadata(id);
    String patient = metadata.get("patient_id").toString();
    api.require(user, patient, "document");
    byte[] contents = documents.download(metadata);
    // Recheck immediately before disclosure; a grant may have expired during decryption.
    api.require(user, patient, "document");
    api.audit(api.uid(user), patient, "DOCUMENT_DOWNLOADED", id);
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(metadata.get("media_type").toString()))
        .contentLength(contents.length)
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment()
                .filename(metadata.get("filename").toString(), StandardCharsets.UTF_8)
                .build()
                .toString())
        .header(HttpHeaders.CACHE_CONTROL, "no-store, private")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "sandbox; default-src 'none'")
        .body(contents);
  }

  private Map<String, Object> publicMetadata(Map<String, Object> row) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("id", row.get("id"));
    result.put("patientId", row.get("patient_id"));
    result.put("authorId", row.get("author_id"));
    result.put("filename", row.get("filename"));
    result.put("mediaType", row.get("media_type"));
    result.put("sizeBytes", row.get("size_bytes"));
    result.put("status", row.get("status"));
    result.put("source", row.get("source"));
    result.put("createdAt", row.get("created_at"));
    return result;
  }
}
