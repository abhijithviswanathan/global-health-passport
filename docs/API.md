# API contract: current synthetic backend

Base path `/api`. This document describes the current `PassportApi.java` implementation, not the full future API. Sessions use a server cookie. First GET `/csrf` with a cookie jar; retain the returned token and session cookie. All POST requests require header `X-CSRF-TOKEN`. Login rotates the session ID. Use JSON request bodies. Browser clients must send credentials; same-origin proxying avoids unsafe credentialed wildcard CORS.

| Method/path | Access | Request/result |
|---|---|---|
| GET `/health` | Public | Status, configured mode and `clinicalUse:false` |
| GET `/csrf` | Public | Establish session and return `token`, `headerName` |
| POST `/auth/login` | CSRF required | `{username,password,otp?}` → public synthetic user; enrolled TOTP required |
| POST `/auth/logout` | Authenticated + CSRF | Invalidate current session |
| GET `/me` | Authenticated | Current actor |
| GET `/users` | Authenticated | Synthetic doctor/lab/pharmacy directory |
| GET `/patients` | Authenticated | Patient self or provider's active-consent patient list; administrative roles empty |
| GET `/patients/{patient}/timeline` | Ownership/scoped consent | Filtered clinical rows; role restricts permissible kinds |
| GET `/consents` | Authenticated | Grants where actor is patient or grantee |
| POST `/consents` | Patient self + CSRF | `{patientId,granteeId,purpose:"treatment",scopes:[...],expiresAt:ISO}`; expiry within one year |
| POST `/consents/{id}/revoke` | Patient owner + CSRF | Revoke active grant |
| GET `/access-requests` | Authenticated | Actor's sent or received requests |
| POST `/access-requests/{id}/deny` | Patient owner + CSRF | Deny a pending request |
| POST `/access-requests` | Doctor/lab/pharmacy + CSRF | `{healthId,purpose:"treatment"}`; generic result whether identifier matches |
| POST `/records` | Role/consent + CSRF | `{patientId,kind,title,details,relatedId?,replacesId?}` |
| GET `/audit` | Authenticated | Actor/subject events; security role sees latest 500 events |
| GET `/patients/{patient}/export` | Patient self | Portable synthetic JSON |
| GET `/patients/{patient}/fhir` | Patient self | R4 resource-specific collection projection |
| GET `/fhir/metadata` | Public | Draft limited CapabilityStatement |
| POST `/break-glass` | Authenticated + CSRF | Always denied and logged; emergency access disabled |

Record kinds: `allergy`, `condition`, `medication`, `encounter`, `lab_order`, `lab_result`, `prescription`, `dispense`, `note`, `imaging_report`. Patients can create notes/allergies/conditions/medications marked unverified. Doctors can create those and encounters/orders/prescriptions. Labs can create lab results/imaging reports. Pharmacies can create dispense entries. Lab-result and dispense writes require an active related order/prescription for the same patient. Amendments require an active same-kind record by the same author; original remains with amended status.

## Limits
This is a compact narrative-record API. It now supports assigned laboratory/pharmacy orders and structured quantity/supply validation with dispensing idempotency, synthetic registration, TOTP and recovery codes. External practitioner-credential validation, OIDC, DICOM, emergency policy, notification delivery and external e-prescribing remain absent; an organization-controlled verification/suspension foundation exists; passkeys and bounded encrypted document uploads are implemented. Public resource UUIDs are distinct from hidden numerical database primary keys. Detailed purpose/version provenance remains incomplete. Audit representation is narrower than the target SRS. The tested FHIR subset passed local official-R4 validation; no OpenAPI-generated, external partner or universal conformance is claimed.

Error outcomes include 400 invalid fields/relationships, 401 missing or incorrect authentication, 403 authorization/CSRF failures, 404 unmatched revoke and 429 repeated failed login. Production error standardization, pagination beyond fixed audit limit, rate-limit sharing and idempotency require further work.

## Identity/security endpoints

All POST requests require the established CSRF session/header.

| Method/path | Contract |
|---|---|
| POST `/auth/register` | Synthetic mode only; `{username,displayName,password}` creates a patient with a random permanent Health ID. Password ≥12 characters and ≤72 UTF-8 bytes. Does not automatically log in. |
| GET `/security/status` | Authenticated; TOTP enrollment and recovery-code count, passkeys availability status |
| POST `/security/totp/setup` | Authenticated; `{password}` reauthenticates, returns `secret`, `otpauthUri`, 600-second enrollment lifetime |
| POST `/security/totp/confirm` | Authenticated; `{otp}` verifies six digits, enables TOTP and returns eight recovery codes once; revokes other sessions |
| GET `/security/sessions` | Authenticated; actor's session metadata and revocation state; no session bearer secret |
| POST `/security/sessions/{sessionId}/revoke` | Owner-only; revocation enforced on next protected request |
| POST `/auth/recover` | `{username,recoveryCode,newPassword}` consumes one random code, resets password/MFA, invalidates all codes and sessions |

TOTP setup requires `IDENTITY_ENCRYPTION_KEY`, a base64-encoded 32-byte random key provided externally. There is no default; missing/invalid configuration fails enrollment closed. The key protects TOTP secrets with AES-GCM. TOTP replay is rejected by a transactionally consumed timestep. Recovery codes are hashed and one-time; Health ID, DOB and phone are not recovery proofs. Session metadata persists but servlet sessions are process-local, so restart requires login. Sessions expire after 15 minutes absolute. Attempt limits are process-local; production distributed throttling, notification, risk assessment and identity-provider integration remain required.

## Synthetic learning and source extraction
POST `/learning/cases/search` requires an authenticated doctor, CSRF and `{query,ageMin?,ageMax?,sex?,labPattern?,purpose:"clinical-learning",acknowledgeLimitations:true}`. Ages are inclusive overlap filters between 0 and 120; sex is male/female/unknown or omitted. Lab filters use corpus tags such as `elevated-crp` and `low-hemoglobin`. Results contain synthetic case IDs, fictional treatment/outcome text, matched terms, retrieval score and explanation. Weighted concept/lexical matches are deterministic and are not probabilities or treatment recommendations. No clinical-table data enters this corpus, and query text is not stored in audit events.

GET `/patients/{id}/summary` permits patient-self or a doctor with current category access. It returns up to 25 active record excerpts with `sourceRecordId`, source, timestamp and kind. Response declares `aiGenerated:false`, `remoteModelEnabled:false`, `method:"deterministic-source-extraction"`. It reuses timeline authorization, does not infer diagnoses and never writes source records. Revoked consent denies the next summary request.

## Bounded document storage
GET/POST `/patients/{id}/documents` lists/uploads multipart `file` content under patient/consent policy. GET `/documents/{id}/download` rechecks the current grant and releases only clean content as an attachment. Allowed signatures/extensions/MIME types are PDF, JPEG and PNG, at most 10 MiB. `DOCUMENT_ENCRYPTION_KEY` is a mandatory base64 32-byte key; absent configuration returns 503 on upload. Local encrypted AES-GCM blobs bind document/patient IDs as associated data. `CLAMAV_EXECUTABLE` must point to the approved scanner; unavailable scanning keeps content quarantined. There is no claimed real scanner verification, DICOM viewer or rescan queue. Two bounded DocumentTest cases passed using a controlled fake scanner; actual malware detection remains NOT VERIFIED.

## WebAuthn passkeys
GET `/passkeys` lists the current user's credential metadata. POST `/passkeys/register/options` requires `{password,otp?}` reauthentication and returns browser creation options plus `requestId`. POST `/passkeys/register/finish` accepts `{requestId,credential}`. Login uses POST `/auth/passkey/options` with `{username}`, followed by `/auth/passkey/finish` with `{requestId,credential}`. POST `/passkeys/{id}/revoke` requires owner password and enrolled TOTP proof. All POST requests retain CSRF protection.

Yubico's maintained WebAuthn library validates assertions, RP/origin, challenge and required user verification; persisted challenges are session-bound, expire after three minutes and are consumed once. Counter updates check concurrent use. Recovery removes passkeys/challenges as well as TOTP and sessions. Configure exact `WEBAUTHN_RP_ID` and allowed `WEBAUTHN_ORIGINS`; localhost defaults are development only. Two protocol tests passed using generated test authenticator material; physical authenticator/browser UX remains a separate check.

## Signed medication credential
POST `/medication-passports` with `{patientId}` is patient-self only and returns a five-minute Ed25519-signed credential, scoped reference and QR payload. GET `/medication-passports/public-key` publishes the local verification key. GET `/medication-passports/ref/{reference}` requires authentication plus current consent for every included category; the reference alone is not authorization. POST `/medication-passports/verify` with `{credential}` checks local signature and expiry, returning no underlying record content.

`PASSPORT_SIGNING_PRIVATE_KEY`/`PASSPORT_SIGNING_PUBLIC_KEY` configure signing. Synthetic mode can generate a local protected development key file (`PASSPORT_KEY_FILE`); no production signing authority or customs/pharmacy acceptance is implied. Credential integrity is not clinical accuracy.

## Organization verification foundation
GET `/organization/members` is organization-admin only and lists the admin's doctor/lab/pharmacy members. POST `/organization/members/{memberId}/verification` with `{status:"verified"|"suspended",evidenceReference}` requires same-organization administration and CSRF. Suspension revokes sessions and active grants and clears pending passkey challenges. Re-verification does not restore revoked grants. Non-demo protected clinical access requires verified status; synthetic fixtures use explicit synthetic_verified state. This is evidence tracking and enforcement, not an external professional-license verification service. Admin role does not confer clinical access.

## Clinician schedule and visit drafts

All `/clinician` routes require the authenticated, verified doctor role. Ownership and live patient grants are enforced on the server. POST/PATCH/PUT require CSRF.

| Method | Route | Purpose |
|---|---|---|
| GET | `/clinician/appointments?from=…&to=…` | Own schedule, explicit ISO-instant range up to 93 days; revoked patients are redacted |
| POST | `/clinician/appointments` | Book with patientId, startsAt, duration, reason, mode and requestKey; conflicts return 409 |
| GET/PATCH | `/clinician/appointments/{id}` | Read, reschedule or change status; updates require current version |
| GET/PUT | `/clinician/appointments/{id}/draft` | Read/save subjective, objective, assessment and plan with current draft version; encounter permission required |
| POST | `/clinician/appointments/{id}/complete` | Reviewed completion with version, draftVersion and reviewed; atomically file a single encounter |

Closed appointments cannot be changed through the draft workflow. Repeat completion returns the existing encounter reference. See [Clinician workspace](CLINICIAN_WORKSPACE.md) for the workflow, access behavior and integration boundaries.

## Profile and clinical photos

- `GET /api/profile`: own audience, selected account names and own photo.
- `GET /api/profiles/{owner}`: permitted profile image metadata or null, without medical records.
- `PUT /api/profile/visibility`: `visibility` (`none`, `care_team`, `selected`, `signed_in`) and selected `usernames`. CSRF required.
- `POST /api/profile/photo`: multipart `file`; `DELETE /api/profile/photo`: remove own current image.
- `POST /api/auth/registration-photo`: one-use, 10-minute, registration-session-scoped multipart upload; CSRF required; does not sign in.
- `GET /api/patients/{owner}/identification-photos`: authorized holder images, or patient-self holder/purpose/date metadata with `canView=false` and `imageUrl=null`.
- `POST` same clinical path: multipart `file`, `purpose`, `scope` (`doctor`/`organization`), `authorized=true`. Verified doctor and current document grant required.
- `GET /api/photos/{id}`: JPEG with authenticated per-photo access and no-store; `/data` returns the same authorized image as an in-memory mobile data URI.
- `DELETE /api/photos/{id}`: authorized clinical holder only; CSRF required.

Photo uploads require a configured 32-byte document encryption key and local checker. Size/type/dimension failures are rejected; no/small/multiple face returns 422, checker unavailable returns 503. Upload attempts are limited to five per uploader in 15 minutes. No person identity or liveness inference is performed.


## Organization ecosystem API (V15–V18)

All paths below are relative to `/api`. Authentication cookies and CSRF remain mandatory; mutations require CSRF including invitation acceptance. Staff identity/tenant is derived on the server. A `version` is required for versioned updates. Unknown or out-of-scope objects do not grant access through IDs.

| Method/path | Purpose and authorization |
|---|---|
| GET `/ecosystem/workspace` | Own organization, minimized directory, nodes, employment, shifts, permission catalog, generic notices |
| GET `/ecosystem/organizations` | Verified public organization metadata; platform reviewer may inspect pending requests |
| POST `/ecosystem/onboard` | Personal account/reviewer creates pending organization and separate work administrator |
| POST `/ecosystem/organizations/{id}/verify` | Independent platform review, evidence, optional verified parent group, version |
| POST `/ecosystem/nodes`; PATCH `/ecosystem/nodes/{id}` | Tenant administrator creates/edits/deactivates hierarchy/configuration |
| POST `/ecosystem/invitations` | Administrator issues hashed, expiring single-use invitation |
| POST `/ecosystem/invitations/accept` | Token + name + password creates unverified work membership |
| PATCH `/ecosystem/employment/{id}` | Own-tenant admin: role, node, dates, encrypted license, credential status, privileges, offboarding |
| GET/POST `/ecosystem/shifts`; POST `/ecosystem/shifts/{id}/cancel` | Scoped workforce intervals, overlap/version protection |
| PUT `/ecosystem/availability-policy` | Tenant admin toggles shift enforcement with version |
| GET `/ecosystem/public-slots?organizationId=...&date=YYYY-MM-DD` | Authenticated public 30-minute appointment slots only |
| POST `/ecosystem/public-booking` | Patient books self using organizationId/doctorId/startsAt/requestKey |
| GET `/ecosystem/patient-organizations` | Patient's own care team, appointments and insurance sharing |
| GET `/ecosystem/operations` | Authorized manager aggregate staffing/task/order/appointment counts, no chart content |
| GET/POST `/ecosystem/orders`; PATCH `/ecosystem/orders/{id}` | Scoped clinical orders, specimen identity checks, results and review |
| POST `/ecosystem/nursing` | Authorized structured nursing entry linked to record/patient/encounter |
| GET/POST `/ecosystem/handoffs`; POST `/ecosystem/handoffs/{id}/acknowledge` | Authorized outgoing/incoming shift handoff and versioned acknowledgment |
| PATCH `/care/tasks/{id}`; POST `/care/tasks/{id}/verify` | Assignee progress; assigning colleague's independent completed-task verification |
| GET `/ecosystem/events`; GET `/ecosystem/changes?after=...` | Generic tenant SSE changes / native cursor fallback; revoked sessions close |
| GET `/ecosystem/notices`; POST `/ecosystem/notices/{id}/read` | Limited generic notices and read state |
| GET `/ecosystem/audit` | Tenant-scoped administration/security audit metadata |
| GET/POST `/insurance/profiles` | Patient edits with id/version; staff list requires explicit insurance share |
| GET `/insurance/profiles/{id}/identifiers` | Audited, separately authorized identifier reveal |
| GET/POST `/insurance/cards` | Patient lists/uploads separate encrypted quarantined card files |
| GET `/insurance/profiles/{id}/card` or `/card-image` | Insurance-grant-controlled clean file / image data URI; no-store |
| GET/POST `/insurance/shares`; POST `/insurance/shares/{id}/revoke` | Patient-granted organization/employee/department purpose and expiry |
| POST `/insurance/profiles/{id}/eligibility`; GET `/insurance/eligibility` | Billing/admin/reception with eligibility-purpose grant; idempotent check/result |
| GET `/insurance/marketplace` | Approved public plan metadata; transparent sort/filter; separate organic/sponsored arrays |
| GET/POST `/insurance/plans`; POST `/insurance/plans/{id}/review` | Verified insurer plan submission; platform reviewer approval/rejection |
| GET `/ecosystem/fhir`; GET `/insurance/fhir` | Authorized R4 collection projections |

Eligibility gateway: in non-demo mode, set server-only `ELIGIBILITY_GATEWAY_URL` and `ELIGIBILITY_GATEWAY_TOKEN`. HTTPS, no redirects/userinfo/query/fragment, 3-second connection timeout, 5-second read timeout and 32 KiB response limit are enforced. The gateway receives only company, plan, member/group/policyholder identifiers and coverage dates, never clinical chart fields. Its JSON response must contain status VERIFIED, UNVERIFIED, PENDING, FAILED or UNKNOWN. Invalid responses become UNKNOWN/FAILED; no raw external body or token is logged or shown. No automatic retries imply fresh payment/coverage decisions. A new explicit check can retry; a repeated requestKey returns the stored result. The interface is a private gateway contract, not a claim of compatibility with a particular insurer. Live provider credentials/contract and integration validation are still required. Synthetic mode rejects external gateway configuration.
