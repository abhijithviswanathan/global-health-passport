# MASTER PROJECT PROMPT

## Global Health Passport & Intelligent Medical Records Platform

You are responsible for helping me design and build a serious, production-oriented healthcare software platform from the ground up.

Do NOT treat this as a demo website, UI mockup, hackathon project, or one-response code-generation task.

Act as an autonomous multidisciplinary engineering organization consisting of:

* Principal Software Architect
* Product Manager
* Senior Backend Engineer
* Senior Frontend Engineer
* iOS/Android Engineer
* Database Architect
* Healthcare/FHIR Engineer
* Security Architect
* DevSecOps Engineer
* Cloud Architect
* AI/ML Engineer
* Clinical Informatics Specialist
* QA Automation Engineer
* Performance Engineer
* Privacy/Compliance Engineer
* UI/UX Designer
* Accessibility Specialist
* Technical Writer

Your responsibility is to PLAN → DESIGN → IMPLEMENT → RUN → TEST → INSPECT → FIX → RETEST → DOCUMENT the system.

Do not merely tell me what should be built. When we reach implementation phases, actually create the files, code, schemas, migrations, tests, configuration, documentation, and runnable applications using the tools available in your environment.

If you have terminal, filesystem, browser, IDE, sub-agent, testing, or computer-use capabilities, use them where appropriate.

Never claim that something works merely because the code looks correct.

When execution is possible, actually run it and verify it.

---

# 1. PRODUCT VISION

Build a secure global digital health platform where a person's medical history can follow them throughout their lifetime across participating doctors, hospitals, clinics, laboratories, imaging centers, pharmacies, and other authorized healthcare organizations.

Every patient receives a permanent globally unique Health ID.

The platform must create a longitudinal medical record containing information such as:

* Diagnoses
* Symptoms
* Past diseases
* Current diseases
* Allergies
* Medications
* Medication history
* Prescriptions
* Vaccinations
* Surgeries
* Procedures
* Hospitalizations
* Clinical notes
* Laboratory reports
* Imaging
* X-rays
* MRI
* CT
* Ultrasound
* DICOM studies
* Pathology
* Vital signs
* Treatment plans
* Treatment outcomes
* Follow-ups
* Recovery/progress
* Diet recommendations
* Patient-entered food/diet tracking
* Lifestyle recommendations
* Relevant costs
* Insurance information where applicable
* Referrals
* Discharge summaries
* Emergency information

The objective is to prevent medical information from becoming fragmented across different healthcare organizations.

---

# 2. GLOBAL HEALTH ID

Every patient must receive a cryptographically random, globally unique permanent identifier.

Example display format:

GHID-84A2-XK71-9PQ3-MD8L

The actual implementation may use UUIDv7, ULID, or another secure collision-resistant identifier internally.

Requirements:

* Never reuse an identifier.
* Never generate it sequentially.
* Never expose database primary keys.
* Never derive the Health ID from name, DOB, SSN, Aadhaar, phone number, email, or another personal identifier.
* Health ID remains unchanged if the patient's phone number/email changes.

The patient's verified phone number should be LINKED to their identity record to simplify registration, authentication, recovery, and account discovery.

The phone number must NOT mathematically generate or encode the Health ID.

Support multiple verified phone numbers/email addresses where appropriate.

Prevent duplicate patient profiles through a carefully designed identity-resolution process without unsafe automatic merging.

Potential duplicate records must enter a controlled reconciliation workflow.

---

# 3. PATIENT APPLICATION

Create a complete Patient Portal.

Dashboard should provide:

* Health summary
* Medical timeline
* Current diagnoses
* Current medications
* Allergies
* Recent tests
* Upcoming appointments
* Follow-ups
* Medication reminders
* Health notifications

Patient record sections should include:

* Personal profile
* Medical history
* Conditions
* Allergies
* Immunizations
* Medication history
* Active prescriptions
* Procedures
* Surgeries
* Encounters
* Hospitalizations
* Laboratory results
* Imaging
* Clinical documents
* Doctor notes where legally/shareably appropriate
* Referrals
* Diet/food tracking
* Recovery/progress tracking
* Insurance where supported
* Treatment costs where available

Allow patients to upload their own historical documents.

Patient-uploaded information must be visibly distinguished from provider-verified clinical information.

---

# 4. MEDICAL TIMELINE

Automatically construct a longitudinal timeline.

Example:

2016 — Asthma diagnosis
2018 — Appendectomy
2021 — COVID hospitalization
2023 — ACL reconstruction
2025 — New allergy recorded
2026 — Current treatment

Allow filtering by:

* Diagnosis
* Medication
* Procedure
* Hospital
* Doctor
* Laboratory
* Date
* Specialty

AI may summarize the timeline but must preserve links to the underlying source records.

Never allow AI-generated summaries to silently overwrite original clinical information.

---

# 5. DOCTOR PORTAL

Create a separate verified Healthcare Professional Portal.

Doctors should be able to:

* Authenticate securely.
* Maintain a verified professional profile.
* Search/request a patient using Health ID.
* Scan patient QR codes.
* Request access.
* See access status.
* View permitted history.
* Record encounters.
* Enter symptoms.
* Enter diagnoses.
* Record clinical findings.
* Enter treatment plans.
* Create prescriptions.
* Upload documents.
* Upload images.
* Add procedures.
* Record surgery.
* Record follow-up instructions.
* Track treatment progress.
* Refer patients.
* Review laboratory results.
* Review imaging.
* Sign clinical records digitally where supported.
* Correct/amend records through auditable workflows.

Do NOT make:

Health ID → unrestricted medical record.

Instead:

Health ID/QR → identify patient → request/verify authorization → policy engine evaluates access → permitted records become available.

---

# 6. OTHER PROVIDER PORTALS

Create role-specific portals for:

### Hospitals/Clinics

* Organization management
* Practitioner management
* Patient encounters
* Admission/discharge
* Treatment records
* Procedures
* Organization-level audit and access administration

### Laboratories

* Receive authorized test orders.
* Upload structured results.
* Upload reports.
* Sign results.
* Associate reports safely with the correct patient.
* Notify patient/provider.

### Radiology/Imaging

* Receive imaging orders.
* Upload reports.
* Support DICOM-compatible architecture.
* Associate studies with patient records.
* Provide secure viewing.

### Pharmacies

* Verify active electronic prescriptions.
* Verify prescriber.
* View only minimum information required.
* Record dispensing.
* Track refills.
* Display dosage, quantity and duration.
* Detect medication conflicts using appropriate drug knowledge sources.

### Administrators

Provide separate:

* Organization administration
* Security administration
* Compliance/audit administration

Administrative access must never automatically mean unrestricted access to medical records.

---

# 7. PATIENT-CONTROLLED ACCESS

Build a granular consent and authorization system.

Patients should be able to:

* Approve provider access.
* Deny access.
* Revoke access.
* Grant temporary access.
* Grant long-term access where legally appropriate.
* Restrict categories of records where legally/clinically appropriate.
* View organizations with access.
* View access history.

Implement:

* RBAC
* ABAC
* Consent policies
* Purpose-of-use
* Least privilege
* Need-to-know
* Time-limited grants

Do not rely exclusively on frontend authorization.

Every protected backend operation must enforce authorization.

---

# 8. EMERGENCY ACCESS / BREAK-GLASS

Design a carefully controlled emergency-access workflow.

Depending on applicable jurisdiction and organizational policy, authorized emergency personnel may obtain minimum necessary emergency information such as:

* Allergies
* Critical conditions
* Current medications
* Blood group if verified
* Implants
* Relevant recent critical results
* Emergency contacts

Require:

* Explicit emergency reason
* Strong authentication
* Minimum necessary disclosure
* Immutable logging
* Patient notification where appropriate
* Compliance review capability
* Automatic expiration

Emergency access must not become an authorization bypass.

---

# 9. PRIVACY / ANONYMOUS CASE SYSTEM

One major feature is the ability for clinicians to learn from similar historical cases.

However, DO NOT make identifiable patient records globally searchable.

Create a logically and operationally separated de-identified clinical-case environment.

Clinicians could search:

"Male, 40–50, persistent fever, elevated CRP, rash"

Results may show de-identified information such as:

* Demographic ranges
* Symptoms
* Relevant observations
* Diagnosis
* Treatment
* Medication
* Outcome
* Recovery trajectory
* Adverse effects

Exclude direct identifiers.

Evaluate and mitigate re-identification risk.

Rare conditions, exact ages, dates, geographic information, combinations of attributes, images and free text can potentially re-identify individuals.

Therefore implement proper de-identification/pseudonymization processes rather than simply removing names.

Never treat pseudonymized information as automatically anonymous.

Access to this environment must itself be governed and audited.

---

# 10. SIMILAR-CASE SEARCH

Build a clinical similarity engine capable of searching authorized/de-identified cases using combinations of:

* Symptoms
* Diagnoses
* Age range
* Sex where clinically relevant
* Laboratory patterns
* Medical history
* Medications
* Treatment
* Outcome
* Relevant clinical concepts

Consider hybrid retrieval:

* Structured medical terminology
* Keyword/full-text search
* Semantic/vector search
* Clinical ontology relationships

Results must clearly distinguish:

CORRELATION / SIMILARITY

from

CLINICAL RECOMMENDATION.

Never imply that because Treatment X worked for similar Patient Y, Treatment X is necessarily appropriate for the current patient.

---

# 11. MEDICAL KNOWLEDGE

Do NOT scrape, clone or copy proprietary Oracle Health, Epic, hospital, insurer or EHR patient databases.

Do NOT use protected patient information without authorization.

Build interoperability through authorized mechanisms.

Support where legally/licensing permitted:

* HL7 FHIR R4/R4B
* SMART on FHIR
* ICD-10
* ICD-11
* SNOMED CT where properly licensed
* LOINC
* RxNorm
* UCUM
* DICOM/DICOMweb
* Official/authorized EHR APIs

Design vendor adapters so systems such as Oracle Health, Epic and other EHRs could eventually integrate through authorized interfaces.

Preserve:

* Provenance
* Source organization
* Original record identifiers
* Version
* Timestamp
* Author
* Digital signature where appropriate

---

# 12. FHIR DATA MODEL

Map platform concepts to appropriate FHIR resources.

At minimum evaluate:

* Patient
* Practitioner
* PractitionerRole
* Organization
* Encounter
* Condition
* Observation
* DiagnosticReport
* Specimen
* ServiceRequest
* Medication
* MedicationRequest
* MedicationStatement
* MedicationDispense
* AllergyIntolerance
* Procedure
* Immunization
* CarePlan
* CareTeam
* ImagingStudy
* DocumentReference
* Consent
* Provenance
* AuditEvent
* Coverage
* Claim where appropriate

Do not force every internal implementation detail directly into FHIR.

Maintain a clean domain model while providing a standards-compliant interoperability layer.

---

# 13. MEDICATION PASSPORT

Create a secure Medication Passport.

Show:

* Active prescriptions
* Generic name
* Brand where relevant
* Dosage
* Route
* Frequency
* Duration
* Quantity
* Prescriber
* Prescription date
* Remaining refills
* Dispensing history
* Indication where appropriate

Allow generation of a clinician-verifiable medication summary/QR credential.

Do NOT claim this guarantees international customs or pharmacy acceptance.

Different countries have different controlled-drug, prescription and import requirements.

---

# 14. AI CLINICAL ASSISTANT

Build an AI layer that assists clinicians rather than replacing them.

Potential features:

* Medical history summarization
* Timeline generation
* Visit summarization
* Relevant-history extraction
* Similar-case retrieval
* Patient-friendly report explanations
* Medication schedule generation
* Clinical-document classification
* Follow-up extraction
* Guideline retrieval where properly sourced
* Potential interaction warnings using authoritative drug data

AI-generated clinical content must:

* Be clearly identified.
* Preserve source citations/provenance where possible.
* Be reviewable.
* Never silently modify source records.
* Require clinician review for clinical decisions.
* Support uncertainty.
* Avoid presenting probabilistic predictions as confirmed diagnoses.

High-risk AI features must be feature-flagged until clinically and legally validated.

Design for future medical-device/AI regulatory requirements where applicable.

---

# 15. SECURITY — EXTREMELY HIGH PRIORITY

This platform stores high-value sensitive health information.

Design authentication and account security comparable in usability to major consumer financial/social platforms, while meeting healthcare-grade security requirements.

Do NOT attempt to imitate undocumented internal security implementations of Instagram or another company.

Use established standards.

Support:

### Passkeys

Implement:

* FIDO2
* WebAuthn
* Platform authenticators
* Hardware security keys

Passkeys should be preferred for high-security accounts where supported.

### Multi-Factor Authentication

Support:

* Authenticator apps using TOTP
* Passkeys
* Hardware security keys
* Push approval where securely implemented
* Recovery codes

SMS OTP may be supported for verification/recovery where appropriate but must not be considered the strongest authentication factor.

Require stronger authentication for clinicians, administrators and sensitive actions.

### Biometrics

Mobile:

* Face ID
* Touch ID
* Android BiometricPrompt

Biometric templates must remain controlled by the operating system/secure hardware. Do not upload raw biometric templates to application servers.

### Adaptive/Risk-Based Authentication

Evaluate:

* New device
* Unusual location
* Impossible travel
* IP reputation
* Repeated failed attempts
* Unusual session behavior
* High-risk actions

Trigger step-up authentication when risk increases.

Do not make automatic account-locking decisions solely from unreliable geolocation.

### Account Security Center

Users should see:

* Logged-in devices
* Active sessions
* Recent login history
* Security events
* MFA methods
* Trusted devices

Allow remote session revocation.

Send notifications for important security events.

---

# 16. ACCOUNT RECOVERY

Account recovery is a critical attack surface.

Design secure recovery using combinations of:

* Recovery codes
* Verified devices
* Passkeys
* Secondary verified communication channels
* Strong identity verification where required

Never allow knowledge of:

* Health ID
* DOB
* Phone number

alone to recover a medical account.

Implement anti-SIM-swap considerations where practical.

Require additional verification after sensitive account changes.

---

# 17. SESSION/TOKEN SECURITY

Use modern standards such as:

* OAuth 2.1
* OpenID Connect
* PKCE
* Short-lived access tokens
* Refresh-token rotation
* Token revocation
* Secure HTTP-only cookies where appropriate
* SameSite policies
* CSRF protection
* Device/session binding where appropriate

Avoid storing sensitive authentication tokens in insecure browser storage.

---

# 18. DATA SECURITY

Implement defense in depth.

Evaluate/use:

* TLS 1.3
* Strong encryption at rest
* Envelope encryption
* KMS/HSM-backed key management
* Key rotation
* Secrets management
* Field-level encryption for particularly sensitive values
* Signed artifacts where appropriate
* Integrity validation
* Secure object storage
* Malware scanning
* File-type validation
* Upload size restrictions
* Network segmentation
* Private networking
* WAF
* API gateway
* Rate limiting
* DDoS protection
* Intrusion/anomaly detection
* SIEM integration
* Secure backups
* Disaster recovery

Do NOT hard-code credentials or encryption keys.

---

# 19. DATABASE SEPARATION

Design appropriate security boundaries between domains.

At minimum evaluate separate logical/physical stores or strict service boundaries for:

1. Identity/PII
2. Authentication/security
3. Clinical records
4. Consent/authorization
5. Laboratory
6. Imaging metadata
7. Imaging/object storage
8. Pharmacy
9. Audit/security events
10. De-identified clinical cases
11. Search indexes
12. AI retrieval indexes
13. Analytics
14. Notifications

Do not allow every service direct access to every database.

Use service identities and least privilege.

Do not unnecessarily duplicate PHI.

---

# 20. AUDITABILITY

Maintain tamper-evident/append-oriented audit trails for sensitive activity.

Capture as appropriate:

* Actor
* Organization
* Patient/resource
* Action
* Timestamp
* Purpose
* Authorization basis
* Device/session
* Relevant network metadata
* Success/failure
* Data exported/downloaded
* Permission changes
* Emergency access
* Administrative actions

Patients should have a readable access-history interface where appropriate.

Security/compliance teams require deeper audit capabilities.

Audit records must not themselves unnecessarily expose sensitive clinical content.

---

# 21. PRIVACY BY DESIGN

Implement:

* Data minimization
* Purpose limitation
* Consent management
* Retention policies
* Data lifecycle controls
* Export/portability
* Correction/amendment workflows
* Deletion/anonymization workflows where legally permitted
* Legal holds where applicable
* Regional storage policies
* Configurable consent
* Data-processing records
* Vendor/subprocessor management architecture

Do not assume "patient owns data" overrides legal record-retention obligations imposed on healthcare providers.

Model the difference between:

* Patient-controlled sharing
* Provider legal medical record
* Platform copy/cache
* De-identified research/learning data

---

# 22. REGULATORY DESIGN

Design the architecture so it CAN SUPPORT compliance with applicable requirements.

Do not falsely claim that software is automatically "globally compliant."

Create a jurisdictional compliance matrix.

At minimum evaluate:

### United States

* HIPAA
* HITECH
* HIPAA Privacy Rule
* HIPAA Security Rule
* HIPAA Breach Notification Rule
* 42 CFR Part 2 where applicable
* State privacy/health laws where applicable
* Information-blocking/interoperability requirements where applicable

### European Union / EEA

* GDPR
* Special-category health data requirements
* DPIA
* Data-subject rights
* International transfer requirements
* Data minimization
* Privacy by design/default
* Relevant EHDS requirements as applicable

### India

* Digital Personal Data Protection Act and applicable rules
* ABDM/ABHA interoperability where applicable
* Applicable health-data policies/standards
* Consent architecture
* Data localization/transfer requirements where applicable

Design regional policy modules rather than assuming one universal policy.

Before production deployment, require qualified legal/privacy/security review for each target jurisdiction.

---

# 23. MOBILE APPLICATION

Build a cross-platform mobile application for:

* iOS
* Android
* Tablets

Choose Flutter or React Native based on documented technical reasoning.

Required capabilities:

* Secure login
* Passkeys where supported
* Biometric unlock
* Patient dashboard
* Medical timeline
* Records
* Medication Passport
* QR codes
* QR scanning
* Notifications
* Medication reminders
* Appointments
* Permission management
* Emergency card
* Secure document viewing
* Dark/light themes

Provide carefully limited offline access to selected emergency information using OS-protected encrypted storage.

Never cache the entire medical record locally by default.

Support remote session revocation.

---

# 24. WEB APPLICATION

The web application must be completely responsive.

Support:

* Small phones
* Large phones
* Foldables
* Tablets
* Laptops
* Desktop displays
* Large/ultrawide displays

Do not simply shrink the desktop interface.

Reflow layouts intelligently.

Examples:

Desktop sidebar → mobile bottom navigation/drawer.

Wide clinical table → responsive cards or controlled horizontal viewing.

Multi-column forms → single-column mobile forms.

Charts → responsive charts.

Ensure no overlapping, clipping, unreadable text or unnecessarily dense interfaces.

---

# 25. DESIGN SYSTEM

Create a modern, minimalist, premium healthcare interface.

Avoid a generic bootstrap/admin-dashboard appearance.

Use:

* Strong visual hierarchy
* Generous whitespace
* Consistent spacing tokens
* Approximately 8px card/image radius
* Clean forms
* Restrained shadows
* Clear typography
* Professional medical iconography
* Subtle transitions
* Skeleton/loading states
* Excellent empty states
* Clear error states
* Consistent component library

Create reusable design tokens for:

* Colors
* Typography
* Spacing
* Radius
* Elevation
* Motion
* Breakpoints

---

# 26. DARK + LIGHT MODE

Implement both.

### Dark

Use deep charcoal—not pitch black—as the primary background.

Ensure:

* Comfortable contrast
* Readable medical information
* Clear cards
* Accessible forms
* Clear status colors

### Light

Use clean neutral backgrounds and professional healthcare styling.

Provide:

* System-theme detection
* Manual toggle
* Persistent preference

Every component must work correctly in both themes.

---

# 27. ACCESSIBILITY

Target WCAG 2.2 AA.

Support:

* Keyboard navigation
* Screen readers
* Semantic HTML
* Proper ARIA where required
* Focus indicators
* Accessible forms
* Dynamic font scaling
* Reduced-motion preferences
* Adequate touch targets
* Accessible contrast
* Color-independent status indicators

Accessibility tests must be automated where possible and manually reviewable.

---

# 28. BACKEND ARCHITECTURE

Choose the architecture based on requirements rather than blindly using microservices.

Evaluate:

* Modular monolith for initial MVP
* Clearly defined bounded contexts
* Event-driven architecture
* Future microservice extraction

Avoid unnecessary distributed-system complexity.

Potential backend stack:

* Java + Spring Boot
* Kotlin
* .NET
* TypeScript/NestJS

Choose one primary backend stack and explain why.

Python may be used for isolated AI/data services.

---

# 29. FRONTEND ARCHITECTURE

Evaluate:

* React
* Next.js
* TypeScript

Use:

* Strong typing
* Reusable component library
* Query/cache management
* Form validation
* Error boundaries
* Secure API layer
* Internationalization readiness
* Accessibility-first components

---

# 30. DATA TECHNOLOGY

Evaluate:

* PostgreSQL for transactional data
* Redis for appropriate caching/ephemeral workloads
* S3-compatible encrypted object storage
* OpenSearch/Elasticsearch for approved search workloads
* Vector database/pgvector where justified
* FHIR server architecture where appropriate

Do not add technology merely because it is fashionable.

Document every major technology decision using ADRs.

---

# 31. SCALABILITY

Design initially for realistic startup deployment while providing a path toward very large scale.

Consider:

* Horizontal scaling
* Stateless services
* Queue-based workloads
* Event-driven processing
* Caching
* Database partitioning
* Read replicas
* Object storage
* CDN
* Regional deployment
* Fault isolation
* Backpressure
* Idempotency

Do not prematurely create infrastructure for hundreds of millions of users if it makes the MVP impossible to operate.

---

# 32. AI/AGENTIC DEVELOPMENT WORKFLOW

This requirement governs HOW YOU BUILD THE PROJECT.

Do not generate everything in one response.

Maintain a persistent project source-of-truth document containing:

* Requirements
* Architecture decisions
* Technology decisions
* Security decisions
* Compliance assumptions
* API contracts
* Database conventions
* Design system
* Naming conventions
* Folder structure
* Coding standards
* Current implementation status
* Known limitations
* Future tasks

Before changing architecture, verify consistency with the source of truth.

If a new requirement conflicts with an existing decision, identify the conflict before silently changing the system.

---

# 33. SELF-CORRECTING ENGINEERING LOOP

For every implementation task:

PLAN
↓
IMPLEMENT
↓
BUILD
↓
RUN
↓
TEST
↓
INSPECT
↓
SECURITY CHECK
↓
ACCESSIBILITY CHECK where applicable
↓
REVIEW
↓
FIX
↓
REBUILD
↓
RETEST
↓
DOCUMENT

Repeat automatically when tools allow.

Do NOT repeatedly ask me to fix ordinary compilation/test errors that you can diagnose yourself.

Fix them.

Stop the loop when:

* Acceptance criteria pass, OR
* A genuine external dependency/credential/legal/product decision requires me.

Never hide failures.

If something cannot be verified, explicitly label it:

NOT VERIFIED.

---

# 34. AUTOMATED QUALITY GATES

Where tooling permits, automatically run:

* Compiler/type checker
* Linter
* Formatter checks
* Unit tests
* Integration tests
* API tests
* Database migration tests
* End-to-end tests
* Dependency vulnerability scanning
* Static security analysis
* Secret scanning
* Accessibility testing
* Container scanning
* Build validation

For security-critical code, perform additional review.

No phase should be marked complete while known Critical/High security defects remain unresolved unless the issue depends on an external decision; document the blocker.

Do not manipulate tests merely to make them pass.

Fix the implementation.

---

# 35. SECURITY TESTING

Test for relevant OWASP classes including:

* Broken access control
* Authentication failures
* Injection
* XSS
* CSRF
* SSRF
* IDOR/BOLA
* Mass assignment
* Unsafe file uploads
* Path traversal
* Secret leakage
* Token misuse
* Session fixation
* Privilege escalation
* Rate-limit bypass
* Insecure direct resource access

Explicitly test that:

Patient A cannot retrieve Patient B's information.

Doctor A cannot retrieve unauthorized patients.

Lab accounts cannot access unrelated records.

Pharmacy accounts cannot access unnecessary clinical information.

Administrators cannot bypass clinical authorization simply because they are administrators.

---

# 36. TEST DATA

Never require real patient information during development.

Generate synthetic patients.

Include:

* Synthetic medical histories
* Synthetic prescriptions
* Synthetic laboratory results
* Synthetic encounters
* Synthetic imaging metadata
* Synthetic organizations

Clearly label development data as synthetic.

Create realistic edge cases.

---

# 37. DOCUMENTATION REQUIREMENT

Do not leave me with only code.

Create and maintain:

README.md

ARCHITECTURE.md

PRD.md

SRS.md

SECURITY.md

COMPLIANCE.md

THREAT_MODEL.md

FHIR.md

API.md / OpenAPI

DATABASE.md

DEPLOYMENT.md

DEVELOPMENT.md

TESTING.md

MOBILE.md

AI_SAFETY.md

OPERATIONS.md

TROUBLESHOOTING.md

CHANGELOG.md

.env.example

ADRs/

README must contain exact instructions for:

* Prerequisites
* Installing dependencies
* Environment configuration
* Starting databases
* Running migrations
* Starting backend
* Starting web application
* Starting mobile application
* Running with Docker
* Running tests
* Creating synthetic development accounts
* Troubleshooting common problems

Commands must match the actual repository.

---

# 38. DEVELOPER EXPERIENCE

The repository should ultimately be runnable with as few steps as reasonably possible.

Aim for something similar to:

1. Clone repository.
2. Copy .env.example.
3. Start dependencies.
4. Run migrations/seed synthetic data.
5. Start application.

Where practical, provide development orchestration such as Docker Compose.

Do not sacrifice production security for development convenience.

---

# 39. DEMONSTRATION ENVIRONMENT

Create synthetic demo users such as:

* Patient
* Doctor
* Lab
* Pharmacy
* Hospital admin

Provide a safe documented way to create/access demo accounts locally.

Demonstrate an end-to-end workflow:

Patient registration
→ Health ID generated
→ Doctor requests access
→ Patient approves
→ Doctor records encounter
→ Doctor creates prescription
→ Lab uploads result
→ Patient sees result
→ Pharmacy verifies prescription
→ Audit log records actions
→ Patient reviews access history.

This workflow must become an automated E2E test.

---

# 40. PHASED EXECUTION

Do NOT attempt to implement the entire platform immediately.

Use these phases.

### PHASE 0 — Requirements Discovery

Review this prompt.

Identify:

* Ambiguities
* Contradictions
* Missing requirements
* Legal assumptions
* Security risks
* Technical risks

Ask only questions that materially affect architecture/product decisions.

Do not ask unnecessary questions.

### PHASE 1 — Product Definition

Produce:

* PRD
* User personas
* User journeys
* Functional requirements
* Non-functional requirements
* User stories
* Acceptance criteria
* MVP definition
* Future roadmap

### PHASE 2 — SRS

Create detailed Software Requirements Specification.

Maintain traceability between PRD → SRS → tests.

### PHASE 3 — Architecture

Produce:

* System architecture
* Trust boundaries
* Data-flow diagrams
* Database architecture
* FHIR architecture
* Identity architecture
* Consent architecture
* AI architecture
* Deployment architecture
* Threat model
* ADRs

### PHASE 4 — UX/UI

Design:

* Information architecture
* Patient UX
* Doctor UX
* Lab UX
* Pharmacy UX
* Admin UX
* Mobile UX
* Responsive behavior
* Design system
* Dark/light modes
* Accessibility strategy

### PHASE 5 — Repository Foundation

Create actual repository structure.

Configure:

* Backend
* Web
* Mobile
* Database
* Shared libraries
* Testing
* Docker
* CI
* Formatting
* Linting
* Environment management

Run the empty/minimal applications and verify builds.

### PHASE 6 — Authentication + Identity

Implement:

* Registration
* Health ID
* Login
* Passkeys
* MFA
* Account recovery
* Device/session management
* Practitioner verification foundation
* RBAC/ABAC foundations
* Audit foundation

Test thoroughly.

### PHASE 7 — Core Patient Record

Implement core longitudinal health record and FHIR mapping.

### PHASE 8 — Consent + Doctor Workflow

Implement patient authorization and clinician encounters.

### PHASE 9 — Labs + Imaging

Implement clinical orders/results and document/imaging infrastructure.

### PHASE 10 — Pharmacy + Medication Passport

Implement prescribing/dispensing workflow and medication history.

### PHASE 11 — Mobile

Implement iOS/Android application using approved APIs/design system.

### PHASE 12 — De-identified Cases + Search

Implement privacy-safe clinical case processing and similarity search.

### PHASE 13 — AI

Implement AI features behind safety controls and feature flags.

### PHASE 14 — Security Hardening

Perform comprehensive security testing and threat-model review.

### PHASE 15 — Compliance Readiness

Generate compliance-control mappings, evidence checklist, retention policies and jurisdiction configuration.

Do not claim legal certification.

### PHASE 16 — Production Infrastructure

Implement:

* CI/CD
* Infrastructure as Code
* Secrets
* Monitoring
* Logging
* Alerting
* Backup
* Restore tests
* Disaster recovery
* Deployment documentation

### PHASE 17 — Full System Validation

Run:

* Unit tests
* Integration tests
* E2E tests
* Security tests
* Accessibility tests
* Load/performance tests
* Failure/recovery tests

### PHASE 18 — Release Candidate

Generate a release candidate containing:

* Working applications
* Complete documentation
* Deployment instructions
* Test reports
* Security report
* Known limitations
* Remaining regulatory/clinical validation requirements

---

# 41. PHASE GATES

At the end of each major phase provide a concise:

PHASE COMPLETION REPORT

Include:

* What was created
* Files changed
* Decisions made
* Tests executed
* Test results
* Security findings
* Remaining risks
* Documentation updated
* How I can run/inspect what currently exists
* What the next phase will do

Then STOP and ask me:

"Approve Phase X and continue to Phase X+1?"

Do not continue to another major phase without approval.

However, within a phase, autonomously fix ordinary errors and rerun tests without asking me after every correction.

---

# 42. DO NOT FAKE COMPLETION

Never say:

"production ready"

"fully secure"

"HIPAA compliant"

"GDPR compliant"

"globally compliant"

unless sufficient external validation actually exists.

Instead use precise language such as:

"designed to support..."

"implemented control..."

"automated test passed..."

"requires legal validation..."

"requires penetration testing..."

"requires clinical validation..."

Security and compliance claims must be evidence-based.

---

# 43. SOURCE-OF-TRUTH FILE

Create:

PROJECT_SOURCE_OF_TRUTH.md

This document must track:

* Product vision
* Approved requirements
* Scope
* Current phase
* Architecture decisions
* Technology stack
* Data model decisions
* Security requirements
* FHIR decisions
* UI system
* API conventions
* Testing requirements
* Compliance assumptions
* Open questions
* Completed functionality
* Remaining functionality

Update it after every approved major phase.

---

# 44. VERSION CONTROL

Use Git from the beginning.

Create logical commits.

Do not combine the entire project into one giant commit.

Before risky architectural changes, preserve a recoverable state.

Never commit:

* Secrets
* Real credentials
* Real patient data
* Production certificates
* Private keys

Create an appropriate .gitignore.

---

# 45. FINAL PRODUCT STANDARD

The final system should eventually allow a competent engineering team to:

Clone the repository
→ Read README
→ Configure environment
→ Start dependencies
→ Run migrations
→ Start backend
→ Start web
→ Start mobile development build
→ Sign in using synthetic demo users
→ Execute the documented end-to-end healthcare workflow
→ Run automated tests
→ Review architecture/security/compliance documentation.

A diagram or report alone is NOT considered the final product.

The objective is a real, executable software project.

---

# 46. IMPORTANT EXECUTION RULE

Do not start coding immediately after receiving this prompt.

FIRST perform PHASE 0.

Read this specification carefully.

Find contradictions, security problems, missing decisions and architectural risks.

Then provide:

1. Your understanding of the product.
2. The proposed MVP boundary.
3. Major technical risks.
4. Major privacy/security risks.
5. Major regulatory assumptions.
6. Questions that genuinely require my decision.
7. Recommended initial technology stack.
8. Proposed repository structure.
9. Proposed phase plan.
10. Acceptance criteria for Phase 1.

Do NOT generate implementation code yet.

End by asking me to approve proceeding to Phase 1.

Once approved, maintain all subsequent decisions in PROJECT_SOURCE_OF_TRUTH.md and execute the project phase-by-phase according to this specification.
