# Present the connected care story

[Open the live demonstration](https://abhijithviswanathan.github.io/global-health-passport/) · [Illustrated presenter guide](https://abhijithviswanathan.github.io/global-health-passport/demo-guide.html)

This GitHub Pages demonstration uses four fictional patients and five connected perspectives. No account or installation is needed. Choose **Start guided story** to follow Alice Morgan. **Continue story** moves to the next role and screen; it does not perform the action for you. The nine progress markers reflect completed work.

## A five-minute presentation

| Step | Perspective | What to click | What the audience sees |
| --- | --- | --- | --- |
| 1 | Doctor | Request patient access | A request arrives in Alice's inbox and Requests & sharing. |
| 2 | Patient | Review the three scopes and duration → Approve selected sharing | The doctor receives the response. Keep all three scopes for the complete tour; limited sharing and decline also work. |
| 3 | Doctor | Create vitals request → Send request to nurse | Nurse Williams receives a task with the patient, requester, due time and priority. Alice receives a care update. |
| 4 | Nurse | Accept request → Start task → Review & file result → Confirm & file sample result | Nursing observations are filed with separate observation and entry times. Doctor and patient receive completion updates. |
| 5 | Doctor | Review new prescription → review the sample → check the review box → Send sample prescription | The invented DemoCare A prescription appears for Alice and Harbor Pharmacy. |
| 6 | Patient | Read dose, route, frequency, duration, quantity and notes → I have read the directions | Reading is acknowledged separately from collection or taking a dose. |
| 7 | Pharmacy | Review prescription → confirm; Mark ready for collection → confirm; Record collection → confirm | Alice sees the prescription progress through review, ready and collection. The doctor receives the final update. |
| 8 | Doctor | Select a proposed follow-up time → Invite patient to follow-up | Alice receives a pending appointment invitation. |
| 9 | Patient | Confirm appointment | The doctor's schedule reflects confirmation. Open Alice's timeline to review the entire story. |

Use **Continue story** between steps. The role selector in the top bar also allows free exploration. The patient selector changes the focus patient; nursing and pharmacy queues still show all assigned examples, with the focus patient's items first.

## Show the nurse receiving work

After step 3, choose **Nurse → Inbox** and open the new request from Dr Smith. It takes you to the work queue. The queue distinguishes new, accepted, in-progress and completed tasks. Accepting a task does not file a result. Final confirmation is a separate review step. Repeated requests of the same active type are rejected.

## Show the patient receiving work

Use **Patient → Inbox** to show the access request, nursing update, new prescription, pharmacy readiness, report availability, doctor review and follow-up invitation. Clicking an update opens its related screen. Unread counts are separate for each fictional patient. Open **My health** for the patient's ID, history, reported allergy, historical or newly filed observations, care team and next steps.

## Optional demonstrations

- **Laboratory:** Doctor → Care requests → create a specimen request. Nurse accepts, starts and files collection. Laboratory starts processing, reviews and releases the sample CBC. Doctor → Reports → Record my review. Patient → My reports shows the values, specimen date, entry date and review state. No automatic interpretation is supplied.
- **Questions and replies:** Patient → Messages → Send example question. Doctor → Messages → Send example reply. Return to the patient inbox. The text is prepared and sends no real message.
- **Another appointment time:** Patient chooses Ask for another time. Doctor chooses the other proposed time and sends a replacement invitation. Pending or confirmed example slots cannot be booked twice.
- **Patient choice:** Decline a request, approve only one scope, or revoke active sharing. Future simulated staff actions require the relevant scope. Existing patient history remains. To resume the full Alice tour after a decline or limited grant, revoke if needed, send a new request as the doctor, and approve all three scopes as Alice.
- **Other stories:** Noah has an outstanding access request; Fatima has an accepted nursing task and a sample prescription ready to collect; Leo has a specimen-collection task.
- **Print:** Open a prescription and choose Print sample. The print sheet is prominently marked as fictional and not a valid prescription.

## Present again

Open the top-right menu → **Restart with fresh examples → Reset demo**, or reload the page. A new browser tab also starts fresh. Keep the same tab open to demonstrate the connected workflow. Different tabs or devices do not share session state.

The small Back button returns to the previous demo screen. The top-left Health Passport logo returns to the current perspective's home. On phones, swipe the navigation strip horizontally to see additional sections.

## What this link does and does not run

The site serves static HTML, CSS, JavaScript and images from `main` → `/docs`. Its action state exists only in browser memory; it uses no backend, browser storage, real login, upload or external messaging. All names, identifiers, histories, laboratory values and medicines are public invented fixtures. Simulated consent demonstrates behavior; it is not a privacy boundary. Dates use a fictional September 2026 clock in Eastern time.

The full local web and Expo applications use a separate Java API and database. They are not hosted by this GitHub Pages site. See [developer handover](HANDOVER.md) to run them. The responsive phone demonstration is not evidence of native iOS/Android device testing.

## For the next developer

- `docs/index.html`: accessible shell and relative asset links.
- `docs/demo/data.mjs`: public fictional patients, roles, medicines and report fixtures.
- `docs/demo/store.mjs`: stable pure dispatch facade for tests and callers. `model.mjs` owns each tab’s state; `workflow/commands/` contains transitions, `transaction.mjs` keeps writes atomic, and `journey.mjs` derives tour progress.
- `docs/demo/app.mjs`: composition root. `ui/application.mjs` controls events and dialogs; `ui/navigation.mjs` owns history; `ui/views/` and `ui/components.mjs` render detached snapshots.
- `docs/demo/styles.css`: responsive styling and sample print rules.
- `docs/demo-guide.html`: illustrated guide; keep its steps aligned with this document.
- `scripts/tests/demo.test.mjs`: Node workflow regression tests.
- `scripts/tests/demo-ui.mjs`: desktop and phone browser checks, screenshots and sampled accessibility scans.

Run the pure checks with `node --test scripts/tests/demo*.test.mjs`. For browser checks, install the existing web dependencies (`npm ci` in `apps/web`) and Playwright Chromium (`npx playwright install chromium` there). Serve `docs` locally using `python3 -m http.server 5181 --bind 127.0.0.1 --directory docs`, then run `node scripts/tests/demo-ui.mjs` from the repository root. `DEMO_BASE_URL` selects another served URL; optional `DEMO_SCREENSHOTS` selects a screenshot output directory. Browser checks use only fictional demo actions.
