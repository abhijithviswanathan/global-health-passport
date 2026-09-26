# Connected GitHub Pages demo — change and verification report

Historical report: 19 September 2026. The subsequent cross-platform architecture refactor and current checks are documented in [REFACTOR_VERIFICATION.md](REFACTOR_VERIFICATION.md).

Date: 19 September 2026. Scope: the public fictional presentation under `docs/` and its documentation/tests. The full Java, web and Expo application source is unchanged.

## What changed

The former standalone demo has been separated into a small HTML shell, public fixtures, a pure workflow store, reusable view code and responsive styles. Five perspectives share one in-memory care story:

- Doctor requests scoped access, assigns nursing work, reviews a sample prescription, receives results and proposes follow-up.
- Patient approves or declines requests, chooses duration/scopes, revokes sharing, reads prescription directions, follows collection, sees reports, exchanges prepared messages and responds to appointments.
- Nurse receives an inbox notice and queue item containing requester, due time, priority, patient and instructions; acceptance, starting and final result review remain distinct.
- Pharmacy progresses the invented medicine through review, ready and collection with patient updates.
- Laboratory receives a collected specimen, processes and releases the fictional report; clinician review remains a separate action.

The nine-step guide derives progress from completed actions. Additional examples include three other patients, a visual daily agenda, historical case information, reported allergies, observation provenance, a shared timeline, role-specific inbox counts, printable fictional prescriptions, navigation history and reset. Follow-up slots reject double booking. Duplicate active requests and unreviewed result submissions are rejected without partially changing state.

The illustrated presenter guide is at [`demo-guide.html`](demo-guide.html), with maintained textual instructions in [`DEMO_WALKTHROUGH.md`](DEMO_WALKTHROUGH.md). The handover, source map, README and platform parity notes now point to the new modules. Hosted CI runs the pure demo regression tests as part of its web job.

## Executed verification

| Check | Result |
| --- | --- |
| Node workflow regression (`scripts/tests/demo.test.mjs`) | 11 tests passed: request/approval scopes and expiry; decline/ownership/duplicates; nursing transitions and provenance; prescription acknowledgment and pharmacy transitions; revoked access; lab handoff/review; appointment responses and replacement times; messages/inbox isolation; complete tour/reset isolation; slot conflicts; correct actor attribution when switching patients. |
| Chromium desktop, 1440 × 960 | Complete nine-step story, optional lab path, messages and notification navigation, decline, revoke, empty/limited scopes, back/home, Escape focus return, reset/reload all passed. |
| Chromium phone layouts, 390 × 960 and 360 × 960 | Same connected workflows passed; no horizontal page overflow at sampled screens. |
| Browser failures and storage | No page errors or failed HTTP responses during the scripted demo flows. Requests stayed under the served demo URL; localStorage and sessionStorage remained empty. |
| Automated accessibility | Sampled doctor home, patient access request, nurse queue, prescription review dialog and patient prescription screens passed axe WCAG 2 A/AA and 2.1 AA rules at all three sizes. This is automated sampling, not a complete accessibility certification. |
| Illustrated guide | Desktop and phone layouts checked; all three screenshots loaded, no page overflow and sampled axe rules passed. |
| Print style | Print media hides the application and leaves the marked fictional prescription visible; print controls are hidden. |
| Visual review | Doctor overview, nursing queue and patient prescription screenshots inspected. Presenter-guide screenshots contain only public fictional examples. |
| Diff hygiene | Whitespace checks passed; no credentials, private records, dependency folders or generated configuration included. |

Run commands and required browser setup are in the walkthrough. Browser verification can target the published site with `DEMO_BASE_URL=https://abhijithviswanathan.github.io/global-health-passport/`.

## Boundaries

This is a static demonstration, not a hosted version of the authenticated application. Role and scope controls simulate the workflow; all fixture data is public. State is confined to one tab's memory and resets on reload. There are no real messages, uploads, clinical recommendations or medication administration records. Demo medicines are invented and every printable sample is marked invalid for clinical use.

The full app's shared care/ecosystem models, paired web/native workspaces and server care/clinical-operation boundaries were inspected for conceptual continuity. They retain their existing API, authorization and persistence behavior. Responsive Chromium tests do not establish native-device behavior or cross-client persistence. Existing full-application limitations remain in [the portfolio review](PORTFOLIO_REVIEW.md).
