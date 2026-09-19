/**
 * HTTP boundary for clinical document metadata, upload and authorized download.
 * Calls DocumentService for file processing and storage, and links uploads to record
 * provenance. Insurance cards have a separate access path in InsuranceApi.
 */
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
    return documents.list(patient).stream().filter(row->!"insurance".equals(row.get("document_purpose"))).filter(row->api.tenants.recordVisible(user,row)).map(this::publicMetadata).toList();
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
    String rid = metadata.get("id").toString();
    api.tx.executeWithoutResult(
        tx -> {
          api.db.update(
              "insert into"
                  + " clinical_record(id,patient_id,kind,title,details,author_id,source,status,created_at)"
                  + " values(?,?,'document',?,?,?,?,?,?)",
              rid,
              patient,
              metadata.get("filename"),
              "Uploaded document. Open Clinical documents to view scan status and download.",
              api.uid(user),
              source,
              "active",
              metadata.get("created_at"));
          api.provenance.stamp(
              rid,
              Map.of(
                  "sourceType",
                  "uploaded_document",
                  "source",
                  api.role(user).equals("patient")
                      ? "Patient entered — unverified"
                      : "Provider upload"),
              user);
          api.db.update("update medical_document set provenance_record_id=?,tenant_id=? where id=?", rid, user.get("organization_id"),rid);
        });
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
    if("insurance".equals(metadata.get("document_purpose")))throw PassportApi.error(403,"Use the separately authorized insurance card workflow");
    String patient = metadata.get("patient_id").toString();
    api.require(user, patient, "document");
    if(!api.tenants.recordVisible(user,metadata))throw PassportApi.error(403,"Document belongs to another organization");
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
    var records =
        api.db.queryForList(
            "select * from clinical_record where id=?", row.get("provenance_record_id"));
    result.put(
        "provenance",
        records.isEmpty()
            ? Map.of(
                "observed_at",
                "Unknown",
                "author_role",
                "Unknown",
                "updated_at",
                "Unknown",
                "source_type",
                "uploaded_document")
            : api.provenance.view(records.getFirst()));
    return result;
  }
}
