package org.healthpassport;

import static org.healthpassport.PassportApi.*;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
public class ProfileApi {
  final PassportApi api;
  final PhotoService photos;

  ProfileApi(PassportApi api, PhotoService photos) {
    this.api = api;
    this.photos = photos;
  }

  String visibility(String owner) {
    var rows = api.db.queryForList("select visibility from profile_policy where owner_id=?", owner);
    return rows.isEmpty() ? "none" : rows.getFirst().get("visibility").toString();
  }

  Map<String, Object> asset(String id) {
    var rows = api.db.queryForList("select * from photo_asset where id=?", id);
    if (rows.isEmpty()) throw error(404, "Photo not found");
    return rows.getFirst();
  }

  boolean visible(Map<String, Object> a, Map<String, Object> viewer) {
    String owner = a.get("owner_id").toString();
    if (a.get("kind").equals("clinical"))
      return api.role(viewer).equals("doctor")
          && api.allowed(viewer, owner, "document")
          && (a.get("holder_scope").equals("doctor")
              ? a.get("author_id").equals(api.uid(viewer))
              : a.get("organization").equals(viewer.get("organization")));
    if (owner.equals(api.uid(viewer))) return true;
    return switch (visibility(owner)) {
      case "signed_in" -> true;
      case "care_team" -> api.hasGrant(viewer, owner);
      case "selected" ->
          api.db.queryForObject(
                  "select count(*) from profile_viewer where owner_id=? and viewer_id=?",
                  Integer.class,
                  owner,
                  api.uid(viewer))
              > 0;
      default -> false;
    };
  }

  Map<String, Object> metadata(Map<String, Object> a, boolean view) {
    var result = new LinkedHashMap<String, Object>();
    result.put("id", a.get("id"));
    result.put("kind", a.get("kind"));
    result.put("createdAt", a.get("created_at"));
    result.put("canView", view);
    result.put("imageUrl", view ? "/api/photos/" + a.get("id") : null);
    result.put(
        "holder",
        a.get("holder_scope").equals("organization")
            ? a.get("organization")
            : api.db.queryForObject(
                "select display_name from app_user where id=?", String.class, a.get("author_id")));
    result.put("holderScope", a.get("holder_scope"));
    result.put("purpose", a.get("purpose"));
    return result;
  }

  @GetMapping("/profile")
  Map<String, Object> self(HttpServletRequest r) {
    synchronized (api) {
      var u = api.user(r);
      String owner = api.uid(u);
      var result = new LinkedHashMap<String, Object>();
      result.put("visibility", visibility(owner));
      result.put(
          "viewers",
          api.db.queryForList(
              "select u.username,u.display_name from profile_viewer v join app_user u on"
                  + " u.id=v.viewer_id where v.owner_id=? order by u.username",
              owner));
      result.put("photo", profile(owner, u).get("photo"));
      return result;
    }
  }

  Map<String, Object> profile(String owner, Map<String, Object> viewer) {
    var rows =
        api.db.queryForList("select * from photo_asset where owner_id=? and kind='profile'", owner);
    var out = new LinkedHashMap<String, Object>();
    out.put(
        "photo",
        !rows.isEmpty() && visible(rows.getFirst(), viewer)
            ? metadata(rows.getFirst(), true)
            : null);
    return out;
  }

  @GetMapping("/profiles/{owner}")
  Map<String, Object> profile(@PathVariable String owner, HttpServletRequest r) {
    synchronized (api) {
      return profile(owner, api.user(r));
    }
  }

  @PutMapping("/profile/visibility")
  Map<String, Object> privacy(@RequestBody Map<String, Object> b, HttpServletRequest r) {
    synchronized (api) {
      api.csrf(r);
      var u = api.user(r);
      String owner = api.uid(u), v = api.field(b, "visibility", 20);
      if (!Set.of("none", "care_team", "selected", "signed_in").contains(v))
        throw error(400, "Choose a profile visibility option");
      var recipients = new LinkedHashSet<String>();
      if (v.equals("selected") && b.get("usernames") instanceof List<?> names) {
        if (names.size() > 50) throw error(400, "Choose up to 50 accounts");
        for (Object n : names) {
          if (!(n instanceof String username) || username.length() > 80)
            throw error(400, "Enter valid account usernames");
          var found = api.byUsername(username.trim());
          if (found == null) throw error(400, "One or more selected accounts could not be found");
          recipients.add(api.uid(found));
        }
      }
      api.tx.executeWithoutResult(
          t -> {
            api.db.update("delete from profile_policy where owner_id=?", owner);
            api.db.update(
                "insert into profile_policy(owner_id,visibility,updated_at) values(?,?,?)",
                owner,
                v,
                now());
            api.db.update("delete from profile_viewer where owner_id=?", owner);
            for (String id : recipients)
              api.db.update(
                  "insert into profile_viewer(owner_id,viewer_id) values(?,?)", owner, id);
            api.audit(owner, owner, "PROFILE_VISIBILITY_CHANGED", owner);
          });
      return self(r);
    }
  }

  Map<String, Object> store(
      String owner,
      String author,
      String kind,
      String scope,
      String org,
      String purpose,
      byte[] bytes) {
    String holder =
        kind.equals("profile")
            ? "self"
            : scope.equals("doctor") ? "doctor:" + author : "organization:" + org;
    var old =
        api.db.queryForList(
            "select id from photo_asset where owner_id=? and kind=? and holder_key=?",
            owner,
            kind,
            holder);
    String id = id();
    photos.save(id, bytes);
    try {
      api.tx.executeWithoutResult(
          t -> {
            api.db.update(
                "delete from photo_asset where owner_id=? and kind=? and holder_key=?",
                owner,
                kind,
                holder);
            api.db.update(
                "insert into"
                    + " photo_asset(id,owner_id,author_id,kind,holder_key,holder_scope,organization,purpose,created_at)"
                    + " values(?,?,?,?,?,?,?,?,?)",
                id,
                owner,
                author,
                kind,
                holder,
                scope,
                org,
                purpose,
                now());
            api.audit(
                author,
                owner,
                kind.equals("profile") ? "PROFILE_PHOTO_UPLOADED" : "IDENTIFICATION_PHOTO_UPLOADED",
                id);
          });
    } catch (RuntimeException e) {
      photos.remove(id);
      throw e;
    }
    for (var row : old) photos.remove(row.get("id").toString());
    return metadata(asset(id), true);
  }

  @PostMapping(value = "/profile/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  Map<String, Object> upload(@RequestPart("file") MultipartFile file, HttpServletRequest r) {
    api.csrf(r);
    String owner = api.uid(api.user(r));
    api.identity.limit("photo:" + owner);
    byte[] bytes = photos.prepare(file);
    synchronized (api) {
      var u = api.user(r);
      if (!owner.equals(api.uid(u))) throw error(401, "Sign in again");
      return store(owner, owner, "profile", "self", "", "Patient-selected profile photo", bytes);
    }
  }

  String registration(HttpServletRequest r) {
    var s = r.getSession(false);
    if (s == null
        || !(s.getAttribute("photoRegistrationOwner") instanceof String owner)
        || !(s.getAttribute("photoRegistrationUntil") instanceof Instant expiry)
        || !expiry.isAfter(Instant.now()))
      throw error(401, "Sign in and add your photo from Profile");
    return owner;
  }

  @PostMapping(value = "/auth/registration-photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  Map<String, Object> registrationPhoto(
      @RequestPart("file") MultipartFile file, HttpServletRequest r) {
    api.csrf(r);
    String owner = registration(r);
    api.identity.limit("photo:" + owner);
    byte[] bytes = photos.prepare(file);
    synchronized (api) {
      if (!owner.equals(registration(r)))
        throw error(401, "Sign in and add your photo from Profile");
      var saved =
          store(owner, owner, "profile", "self", "", "Patient-selected profile photo", bytes);
      r.getSession().removeAttribute("photoRegistrationOwner");
      r.getSession().removeAttribute("photoRegistrationUntil");
      return saved;
    }
  }

  @DeleteMapping("/profile/photo")
  Map<String, Object> removeProfile(HttpServletRequest r) {
    synchronized (api) {
      api.csrf(r);
      var u = api.user(r);
      var rows =
          api.db.queryForList(
              "select id from photo_asset where owner_id=? and kind='profile'", api.uid(u));
      for (var a : rows) remove(a.get("id").toString(), u);
      return Map.of("ok", true);
    }
  }

  void remove(String id, Map<String, Object> u) {
    var a = asset(id);
    photos.remove(id);
    api.db.update("delete from photo_asset where id=?", id);
    api.audit(api.uid(u), a.get("owner_id").toString(), "PHOTO_REMOVED", id);
  }

  @GetMapping("/patients/{owner}/identification-photos")
  List<Map<String, Object>> clinicalList(@PathVariable String owner, HttpServletRequest r) {
    synchronized (api) {
      var u = api.user(r);
      boolean self = owner.equals(api.uid(u));
      if (!self) {
        if (!api.role(u).equals("doctor")) throw error(403, "Doctor access required");
        api.require(u, owner, "document");
      }
      return api
          .db
          .queryForList(
              "select * from photo_asset where owner_id=? and kind='clinical' order by created_at"
                  + " desc",
              owner)
          .stream()
          .filter(a -> self || visible(a, u))
          .map(a -> metadata(a, !self && visible(a, u)))
          .toList();
    }
  }

  @PostMapping(
      value = "/patients/{owner}/identification-photos",
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  Map<String, Object> clinicalUpload(
      @PathVariable String owner,
      @RequestPart("file") MultipartFile file,
      @RequestParam String purpose,
      @RequestParam String scope,
      @RequestParam boolean authorized,
      HttpServletRequest r) {
    api.csrf(r);
    var u = api.user(r);
    if (!api.role(u).equals("doctor")) throw error(403, "Doctor access required");
    api.require(u, owner, "document");
    if (!authorized
        || purpose.isBlank()
        || purpose.length() > 200
        || !Set.of("doctor", "organization").contains(scope))
      throw error(400, "Confirm authorization, purpose and photo holder");
    String uploader = api.uid(u);
    api.identity.limit("photo:" + uploader);
    byte[] bytes = photos.prepare(file);
    synchronized (api) {
      u = api.user(r);
      if (!uploader.equals(api.uid(u))) throw error(401, "Sign in again");
      if (!api.role(u).equals("doctor")) throw error(403, "Doctor access required");
      api.require(u, owner, "document");
      return store(
          owner, api.uid(u), "clinical", scope, u.get("organization").toString(), purpose, bytes);
    }
  }

  @DeleteMapping("/photos/{id}")
  Map<String, Object> removeClinical(@PathVariable String id, HttpServletRequest r) {
    synchronized (api) {
      api.csrf(r);
      var u = api.user(r);
      var a = asset(id);
      if (!a.get("kind").equals("clinical") || !visible(a, u)) throw error(404, "Photo not found");
      remove(id, u);
      return Map.of("ok", true);
    }
  }

  byte[] authorized(String id, HttpServletRequest r) {
    synchronized (api) {
      var u = api.user(r);
      var a = asset(id);
      if (!visible(a, u)) throw error(404, "Photo not found");
      byte[] bytes = photos.read(id);
      if (!visible(a, api.user(r))) throw error(404, "Photo not found");
      api.audit(api.uid(u), a.get("owner_id").toString(), "PHOTO_VIEWED", id);
      return bytes;
    }
  }

  @GetMapping("/photos/{id}")
  ResponseEntity<byte[]> content(@PathVariable String id, HttpServletRequest r) {
    return ResponseEntity.ok()
        .contentType(MediaType.IMAGE_JPEG)
        .header("Cache-Control", "no-store, private")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .body(authorized(id, r));
  }

  @GetMapping("/photos/{id}/data")
  ResponseEntity<Map<String, String>> data(@PathVariable String id, HttpServletRequest r) {
    return ResponseEntity.ok()
        .header("Cache-Control", "no-store, private")
        .body(
            Map.of(
                "dataUri",
                "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(authorized(id, r))));
  }
}
