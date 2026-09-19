# Web and mobile parity

## Developer handover — 2026-09-19

This maintenance revision documents the Java backend, shared workflows and both clients without changing the API or intended product behavior. The independent GitHub Pages demonstration is now formatted and commented for editing; it remains a fictional static presentation, outside the API-backed parity matrix below. See [handover](HANDOVER.md), [source map](SOURCE_MAP.md) and [verification record](HANDOVER_VERIFICATION.md). No new native-device capability or device testing is claimed.

## Fictional presentation showcase — 2026-09-11

The same API-backed NorthStar fixture now supplies both clients with four patient stories, 33 clinical entries (26 authored, five orders, two completed reports), appointments, tasks, messages, handoffs and insurance examples. No client-only copy of clinical demo data was introduced.

Executed checks: web doctor directory/request queue and nurse work grid; native-code patient timeline/marketplace and nurse work grid. All four focused browser checks passed. Shared API verification also confirms matching record IDs in patient and staff views and denial for unrelated accounts. Physical iOS/Android devices were not tested for this revision. See [showcase report](../DEMO_SHOWCASE_REPORT.md), [API evidence](evidence/showcase-verification.json) and [browser evidence](evidence/showcase-ui.json).

## Existing capability matrix

User policy: future changes apply to both clients unless explicitly scoped otherwise. This matrix covers the short-ID, navigation, clinician-workspace and profile-photo revisions; it does not claim every older web capability exists on mobile.

| Workflow | Web | Mobile |
|---|---|---|
| Permanent short Health ID | 9-character canonical ID | Same server ID; displayed without a separate mobile identifier |
| Patient / doctor entry | Dedicated entry tabs and doctor link | Patient / Doctor entry tabs; trusted server role routing |
| Home / Back | Logo home, Back and browser history | Logo home, Back and Android BackHandler integration |
| Doctor home | Today dashboard and upcoming schedule | Today dashboard and upcoming schedule |
| Patient directory | Authorized patients, name/ID search and chart | Same authorized list, search and source-labelled chart |
| Appointments | Book, reschedule, check-in, no-show, cancel | Same shared endpoints and transitions |
| Visit context | Source records beside note on desktop | Source context followed by note in a scrollable mobile layout |
| Documentation | SOAP draft, explicit reuse of reason, writing guide | Same sections, explicit reason reuse and follow-up guide |
| Cross-device drafts | Server persisted; optimistic versions | Same server draft and versions; conflicts require reload/review |
| Completion | Reviewed, atomic single encounter | Same completion endpoint; repeat-safe filing |
| Permission revocation | Rechecked; redacted agenda | Rechecked; denied chart/draft removed and directory refreshed |
| Clinical data on device | No clinical browser-storage cache | No clinician offline storage; background unmount clears clinician state |

The September 11 care revision adds lab/pharmacy/admin and additional staff workspaces plus source-amendment editing to mobile. Remaining mobile gaps include passkey/second-factor enrollment, binary document upload/download, FHIR export and the fictional learning library. External calendar synchronization and built-in video remain unavailable. Care-task reminders are in-app; no external or OS notification delivery is configured.

## Verification boundaries

The browser test harness renders the actual mobile App and clinician component through React Native Web. It uses explicit test substitutes for native secure storage, biometrics, status bar and confirmation dialogs. It validates UI/API workflows and responsive web accessibility; it does not validate native cookie handling, hardware Back, VoiceOver/TalkBack, biometrics or OS background snapshots. The actual iOS and Android Hermes bundles are exported separately. No simulator runtime/device is installed on the inspected host.

## Doctor UI refinement

Both clients now show a visual day agenda with start/end timestamps, status-labelled visit cards, explicit unbooked intervals and direct visit opening. The shared agenda model handles ordering, cancelled/no-show exclusions and midnight clipping; both clients fetch the preceding three hours to include a visit crossing into the selected day. Unbooked intervals are not asserted to be clinician availability.

Patient directory cards group initials, the short Health ID, shared-chart context, the next visit within 31 days, visit reason, duration/mode/status when present, and paired chart/booking actions. No diagnoses or current-medication assertions are invented. Mobile secondary appointment actions are grouped under More options. Back remains compact with a 44-point minimum target; date selection is collapsible, and navigating to a new mobile section resets scroll position. Web uses a responsive two-column patient-card grid.

## Photo and account menu revision

| Workflow | Web | Mobile |
|---|---|---|
| Optional registration photo | File or camera; skip | OS library or camera; skip |
| Change later | Profile & photo; Settings shortcut | Same menu and Settings shortcut |
| Profile audience | Owner, authorized care team, selected usernames, authenticated public | Same persisted policies |
| Clinical identification image | Authorized doctor or organization holder; document grant required | Same holder-specific upload/view/removal |
| Patient transparency | Holder, purpose and date without private image | Same metadata-only view |
| Account navigation | Compact avatar/menu; guarded doctor navigation | Compact modal menu; guarded doctor navigation |
| Person check and storage | Shared local YuNet check and encrypted local blobs | Same API and stored data |

Public means signed-in users only. Anonymous image retrieval is denied. Role, practitioner verification, consent, holder and audience are checked server-side. The native browser harness substitutes camera/library launch; its uploads still reach the actual local model and API. Intentional native photo picking keeps its hidden task mounted; normal background handling continues afterward. Native hardware/privacy behavior remains unverified.

## September 11 care-team parity

| Workflow | Web | Mobile |
|---|---|---|
| Staff workspaces | Dedicated role entry and care sections | Native care component; same roles and API |
| Record provenance | Observation/entry/update times, source, author, age and historical labels | Same persisted fields and labels |
| Drafts and amendments | Versioned save/sign, explicit amendment reason | Same actions and version conflicts |
| Tasks | Individual/team assignment, acceptance, progress, block/completion, comments | Same workflow; cross-client completion tested |
| Conversations | Patient/encounter, direct/group/department, mentions, read state | Same supported forms and persisted membership |
| Clinical decisions from chat | Explicit reviewed action | Same action |
| Appointment and service queues | Booking/check-in/triage/consultation/follow-up/discharge; lab/imaging review | Same workflow controls |
| Organization access | Staff provisioning, assignments, suspension, clinic freshness overrides | Same care controls, including clinical staff verification |
| Notifications | Generic in-app notices and periodic count refresh | In-app notices on opening and workspace refresh |

See [care-team guide](CARE_TEAM_WORKFLOWS.md) for precise integration and native-device limitations.


## Organization ecosystem revision

| Flow | Web | React Native | Shared server boundary |
|---|---|---|---|
| Staff invitation acceptance, work role and employment review | Forms | Native forms | Pending/verified membership, role ceiling, credential dates |
| Organization nodes, staff, schedule, work grid and orders | Role tabs/cards | Role tabs/cards | Tenant/clinic/assignment/consent/version checks |
| Nursing and handoff acknowledgment | Structured forms | Structured forms | Linked provenance, prescription identity, incoming member acknowledgment |
| Insurance profile/share/eligibility and marketplace | Forms, protected file download, comparison table | Forms, image capture/library/view, comparison cards | Encryption, separate grants, independent plan review |
| Public appointment search and booking | Published slot selection | Published slot selection | Public intervals only, slot recheck, replay-safe booking |
| Realtime changes | SSE refresh hint | 60-second cursor fallback | Generic tenant-scoped signals and session revalidation |

Web insurance permits PDF/image uploads and downloads; native insurance currently supports images, with PDF file selection/rendering NOT TESTED/not implemented. Camera/biometric/device secure-store behavior remains NOT TESTED on physical devices. Current executed cross-client evidence is in ECOSYSTEM_VERIFICATION.md.


## September 19 connected public demonstration

The GitHub Pages presentation now shares in-tab state across doctor, nurse, patient, pharmacy and laboratory perspectives. The same responsive site presents the workflow on desktop and phone browsers; there is no separate mobile demo fork. It covers scoped approval/decline/revocation, nursing requests and observations, sample prescriptions through collection, laboratory reports through doctor review, messages, inbox updates and follow-up responses.

The full web, native and shared API workflow owners were inspected (`CareWorkspace`, `care-model`, `ecosystem-model`, `CareApi`, `ClinicalOperationsApi`). Their persisted behavior and authentication contracts are unchanged by this presentation-only revision. Public-demo consent and role controls are illustrative and do not replace server checks. GitHub Pages does not run the Java backend, the Expo application, native notifications or account storage. Phone-sized Chromium checks are responsive-browser evidence only, not physical-device or cross-client persistence evidence.

See [demo verification](DEMO_VERIFICATION.md) and the [presenter walkthrough](DEMO_WALKTHROUGH.md).
