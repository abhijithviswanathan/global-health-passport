#!/usr/bin/env python3
"""Build the local presentation report from saved, verified synthetic fixtures."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from xml.sax.saxutils import escape
import json
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from PIL import Image as PILImage

ROOT=Path(__file__).resolve().parents[1]
m=json.loads((ROOT/'docs/evidence/showcase-demo.json').read_text())
v=json.loads((ROOT/'docs/evidence/showcase-verification.json').read_text())
ui=json.loads((ROOT/'docs/evidence/showcase-ui.json').read_text())
assert ui['stats']['unexpected']==0 and ui['stats']['expected']==4
OUT=ROOT/'output/pdf/Health_Passport_Demo_Report.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
teal=colors.HexColor('#146B5D');ink=colors.HexColor('#20373A');muted=colors.HexColor('#587074');pale=colors.HexColor('#EEF5F2');gold=colors.HexColor('#E7A24E')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleCustom',fontName='Helvetica-Bold',fontSize=29,leading=32,textColor=ink,spaceAfter=14))
styles.add(ParagraphStyle(name='Sub',fontName='Helvetica',fontSize=12,leading=17,textColor=muted,spaceAfter=12))
styles.add(ParagraphStyle(name='BodyCustom',fontName='Helvetica',fontSize=9.5,leading=14,textColor=ink,spaceAfter=8))
styles.add(ParagraphStyle(name='SmallCustom',fontName='Helvetica',fontSize=8,leading=11,textColor=muted,spaceAfter=6))
styles.add(ParagraphStyle(name='SectionCustom',fontName='Helvetica-Bold',fontSize=14,leading=18,textColor=teal,spaceBefore=11,spaceAfter=8))
styles.add(ParagraphStyle(name='CellCustom',fontName='Helvetica',fontSize=8.5,leading=12,textColor=ink))
story=[]
def clean(x):return str(x).replace('—','-').replace('–','-').replace('·',' / ').replace('→',' > ').replace('’',"'")
def p(x,style='BodyCustom'):return Paragraph(escape(clean(x)).replace('\n','<br/>'),styles[style])
def add(x,style='BodyCustom'):story.append(p(x,style))
def section(title):add(title,'SectionCustom')
def page(title,subtitle):
    if story:story.append(PageBreak())
    add(title,'TitleCustom');add(subtitle,'Sub')
def table(headers,rows,widths):
    data=[[p(x,'CellCustom') for x in headers]]+[[p(x,'CellCustom') for x in row] for row in rows]
    t=Table(data,colWidths=widths,hAlign='LEFT',repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),pale),('VALIGN',(0,0),(-1,-1),'TOP'),('BOTTOMPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),9),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('LINEBELOW',(0,0),(-1,0),1,teal),('LINEBELOW',(0,1),(-1,-1),.3,colors.HexColor('#D9E5E2'))]))
    story.append(t);story.append(Spacer(1,10))
def photo(name,width,maxheight):
    path=ROOT/'docs/images'/name
    with PILImage.open(path) as im:w,h=im.size
    scale=min(width/w,maxheight/h)
    return Image(str(path),width=w*scale,height=h*scale,hAlign='LEFT')
def time(a):return datetime.fromtimestamp(a['starts_at']/1000,ZoneInfo('America/New_York')).strftime('%I:%M %p').lstrip('0')
def case(c):
    section(c['name'].replace(' (Synthetic)','')+' | '+str(c['age'])+' | '+c['occupation'])
    add(c['story'],'Sub')
    add('Health ID '+c['healthId']+' | Login '+c['username']+' | '+c['room'],'SmallCustom')
    add(c['history']);add('Allergy / intolerance context: '+c['allergy'])
    z=c['vitals'];add(f"Invented intake: {z['temperature_c']} C; SpO2 {z['spo2_percent']}%; pulse {z['pulse_bpm']}/min; BP {z['systolic_mmhg']}/{z['diastolic_mmhg']} mmHg.")
    add('Assessment context: '+c['condition']);add('Next step: '+c['plan'])

page('Health Passport\nA hospital day, explained','Fictional demonstration pack | NorthStar Hospital | 11 September 2026')
add('Use four connected patient stories to show how a doctor, nurse, laboratory, imaging team and patient work from the same saved information. Names, histories, results, addresses and insurance examples are invented.')
table(['4 patients','33 clinical entries','5 requests','4 visits'],[['Alice, Noah, Fatima, Leo','26 authored + 5 orders + 2 reports','Completed and pending stages','30-minute appointments']],[126,126,126,126])
story.append(photo('showcase-patients-web.png',504,375))
add('Actual local web application: the doctor sees four authorized patients, short Health IDs and the next appointment. Screenshots reflect the saved demo on 11 September.','SmallCustom')
section('Start here')
add('Open http://localhost:5173/?portal=doctor and sign in as hospitaldoctor. Use the existing local demo password in LOCAL_ACCESS.txt. The generic doctor account belongs to a different organization. For the mobile browser preview, open http://localhost:5174/.')

page('Meet Alice and Noah','One case has completed reports; the other makes pending work visible.')
case(m['patients']['hospitalalice']);case(m['patients']['showcasenoah'])
add('Noah also has a server-saved SOAP draft attached to his appointment. It is unfinished documentation, not a signed consultation.','SmallCustom')

page('Meet Fatima and Leo','Two more stories demonstrate follow-up, medication reconciliation and imaging coordination.')
case(m['patients']['showcasefatima']);case(m['patients']['showcaseleo'])
add('Fatima has a prescription for the nonexistent DEMO TRAINING TABLET: 10 fictional units, with one demonstration dispensing unit recorded. No real medicine was supplied or recommended.','SmallCustom')

page('From request to report','Alice demonstrates the completed laboratory and imaging journeys.')
table(['Laboratory step','Fictional evidence'],[['Order and identity','Alice CBC report, assigned to Technician Lee; patient and specimen identifiers recorded.'],['Result','WBC 6.8 x10^9/L; haemoglobin 13.2 g/dL; platelets 254 x10^9/L.'],['Review and completion','Result stored, Dr Smith review recorded, workflow completed.']],[137,367])
section('Complete sample narratives')
for r in sorted(v['reports'],key=lambda x:x['kind']):
    add(r['title'],'SectionCustom');add(r['details'])
section('The date care happened is preserved')
add('The sample observations are dated 10 September 2026, while their upload is dated 11 September 2026. The chart preserves the author, role, source, original observation timestamp and entry timestamp. It does not present the older measurement as a new reading.')
add('The chest study reference is metadata only. No actual X-ray or DICOM image pixels were created. Report language and laboratory values are invented demonstration content, without diagnostic guidance.','SmallCustom')
section('What this demonstrates')
add('An authorized patient can read the same result in the mobile timeline. Team members can inspect the request state, and the doctor can review the report without uploading it again. Nurse task completion has a separate doctor verification.')

page('Work that still needs attention','Pending requests, named owners and explicit handoff states make the demonstration useful.')
table(['Patient / request','Saved state','Owner'],[['Alice / CBC and chest reports','Both completed','Technician Lee / Technician Patel; Dr Ahmed attestation; Dr Smith review'],['Noah / wellness panel','Processing; no result','Technician Lee'],['Fatima / follow-up review','Ordered','Dr Smith'],['Leo / left ankle imaging','Scheduled; no result','Technician Patel']],[162,132,210])
table(['Nurse Williams task','Saved state','Location'],[[t['title'].replace('Showcase · ',''),t['status'].replace('_',' ')+(' + doctor verified' if t.get('verified_by') else ''),t['location_label']] for t in m['tasks'].values()],[250,134,120])
section('Communication and handoffs')
add('Three care-context conversations contain six messages. Alice: confirm access to reviewed reports. Noah: leave the result-review task open during processing. Leo: confirm room and time for imaging. Nurse Williams replies with an acknowledgment in each thread; the task must still be updated separately.')
add('Two structured nurse-to-doctor handoffs carry patient status, pending tasks, medication attention, tests, observations and concerns. Alice\'s handoff is acknowledged. Leo\'s handoff is sent and awaits acknowledgment.')
add('The five structured orders also create five linked tasks. Together with the four curated nurse tasks, this addition supplies nine tasks. Existing earlier demo records remain available.','SmallCustom')

page('Coverage and the demo cast','Insurance comparisons and role-specific accounts complete the story.')
table(['Invented plan','Monthly premium','Deductible','Out-of-pocket','Network'],[['Harbor Starter','$220','$1,800','$6,500','HMO'],['Harbor Flexible','$365','$900','$4,500','PPO'],['Harbor Family','$480','$1,500','$7,000','EPO']],[144,95,85,100,80])
add('All three Showcase plans are fictional approved listings in USD, with an illustrative $25 office copay and 20% coinsurance description. They are not offers, recommendations or enrollment options.')
add('Noah: Example Unconnected Provider - Fictional returns UNKNOWN. Fatima: Synthetic Harbor Health returns a synthetic VERIFIED response. Neither involved contacting a real insurer. Two patient-owned profiles have purpose-specific billing access.')
section('Sign in to show each perspective')
table(['Username','Demo role / what to show'],[['hospitaldoctor','Dr Smith: patients, schedule, request review, Noah draft'],['hospitalnurse','Nurse Williams: work grid, observations and handoffs'],['hospitallab','Technician Lee: specimen and pending laboratory work'],['hospitalimaging / hospitalradiologist','Technician Patel / Dr Ahmed: imaging and report attestation'],['hospitalpharmacy','Pharmacist Davis: fictional prescription and dispensing'],['hospitalbilling / hospitalreception','Billing Taylor / Reception Jordan: insurance or registration'],['hospitaladmin / hospitalinsurer','Hospital organization / fictional plan management'],['hospitalalice / showcasenoah / showcasefatima / showcaseleo','Each patient sees their own authorized records']],[230,274])
add('Credentials stay in the local LOCAL_ACCESS.txt file and .env; this shareable report deliberately contains no passwords. Sign out before changing roles, or use separate browser profiles.','SmallCustom')

page('Your eight-minute presentation','Follow this route to explain the value through a complete patient story.')
steps=[('0:00 - 1:00 | The doctor\'s day','Use hospitaldoctor. Open Patients and show four cards with short IDs, reasons for visiting and appointment times.'),('1:00 - 2:30 | Alice\'s history','Open Alice\'s chart. Show history, reported allergy, nurse vitals, then the completed CBC and chest reports. Point to observation versus upload date.'),('2:30 - 3:30 | Pending work','Hospital workspace > Orders. Search Showcase. Contrast Noah in processing, Leo scheduled and Fatima ordered.'),('3:30 - 4:30 | The nurse\'s workload','Use hospitalnurse. Hospital workspace > Work grid. Show waiting, open, in progress and completed/verified work; then the handoffs.'),('4:30 - 5:30 | The patient\'s phone','Use hospitalalice at localhost:5174. Timeline shows the same reports. The picture below is the real mobile-code browser preview.'),('5:30 - 6:30 | Coverage','Patient Connections > Marketplace on mobile. Compare the three invented Harbor plans; explain that sample eligibility is synthetic.'),('6:30 - 8:00 | Less repeated work','Return to Noah\'s appointment draft and the care conversations. Explain that context, result tracking and task ownership persist across users.')]
left=[]
for title,body in steps:left.extend([p(title,'SectionCustom'),p(body)])
right=[photo('showcase-native-timeline.png',167,398),p('Mobile timeline / actual React Native browser harness. Physical iOS and Android devices were not tested in this revision.','SmallCustom')]
t=Table([[left,right]],colWidths=[323,181]);t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),14)]));story.append(t)

page('What changed and what was checked','A local, repeatable demonstration layer on the existing platform.')
section('This revision added')
add('Three new patient accounts and richer content for the existing Alice account; four detailed histories and reconciliation examples; dated structured vitals; follow-up plans; consultation overview notes; two completed reports; five requests; a training prescription and dispensing event; four appointments; one saved SOAP draft; four curated nurse tasks plus five order-linked tasks; three conversations with six messages; two handoffs; two insurance profiles/shares and three fictional plan listings.')
section('Existing platform capabilities this builds on')
add('The existing delivery includes separate patient and staff entry, compact navigation and a home logo, doctor schedules and patient cards, short Health IDs, consent-scoped records, profile-photo controls, hospital roles and workspaces, organization/employment management, nursing workflows, orders and insurance. The detailed prior implementation and its test boundaries are in HOSPITAL_EXPANSION_REPORT.md. This revision adds demonstrable examples rather than a new clinical system.')
section('Executed for this revision')
add('PASS: read-only API verification of 33 unique clinical entries, correct saved order/task states, four distinct appointments, six messages, dated report provenance and matching patient/staff record IDs. Repeated setup left one copy of each Showcase clinical record. Unrelated staff and cross-patient access attempts returned 403.')
add('PASS: four focused browser checks - web doctor directory/orders; web nurse work grid; native-code patient reports/marketplace; native-code nurse work grid. Screenshots and machine-readable results are saved with the project. These are browser checks, not physical-device tests.')
section('Where everything is saved')
add('Desktop > Health Passport opens the local project. This report is in output/pdf. DEMO_SHOWCASE_REPORT.md contains the full inventory, exact examples, messages and run instructions. docs/evidence/showcase-demo.json records IDs and states; showcase-verification.json and showcase-ui.json record the checks. The scripts are in scripts/. No public deployment was made.')
section('Run and maintain the demonstration')
add('Use Start Health Passport.command in the project to start the local app. Keep the local database, .env and encryption/signing material together according to the existing backup guide. With the server running in DEMO_MODE, the Showcase setup script reuses stable request keys and preserves staged progress. This is a fixed 11 September snapshot: select that date in the agenda later. Existing README files were preserved in this revision.')
add('Not established by this demo: real insurer/EHR/PACS integration, actual image acquisition, external message delivery, physical-device camera/push behavior or readiness for real patient care. The exact remaining release work is retained in the earlier expansion report.','SmallCustom')

def furniture(c,doc):
    c.saveState();w,h=doc.pagesize
    c.setFillColor(teal);c.rect(44,h-28,28,4,fill=1,stroke=0)
    c.setFont('Helvetica-Bold',8);c.drawString(80,h-27,'HEALTH PASSPORT / DEMONSTRATION REPORT')
    c.setStrokeColor(colors.HexColor('#D9E5E2'));c.line(44,42,w-44,42)
    c.setFont('Helvetica',7.5);c.setFillColor(muted);c.drawString(44,28,'Fictional data only  |  Local project  |  11 September 2026');c.drawRightString(w-44,28,str(doc.page));c.restoreState()
SimpleDocTemplate(str(OUT),pagesize=(595,842),leftMargin=45,rightMargin=46,topMargin=55,bottomMargin=57,title='Health Passport - Fictional Demonstration Report',author='Health Passport project').build(story,onFirstPage=furniture,onLaterPages=furniture)

# The companion report keeps full source text and a searchable inventory.
md=['# Health Passport - Fictional demonstration report','', 'Prepared 11 September 2026. All people, stories, values, addresses, insurance plans and messages below are invented. This is a local demonstration, not clinical advice or real coverage.','', '## Open the demonstration','', '- Web: http://localhost:5173/?portal=doctor', '- Mobile-code browser preview: http://localhost:5174/', '- Doctor username: `hospitaldoctor`. Use the existing demo password in `LOCAL_ACCESS.txt`. Other accounts are listed below; do not distribute the password in a public presentation.', '- Desktop > Health Passport links to this complete local project.', '- Schedule snapshot: '+m['scheduleDate']+' (America/New_York). Later, select this date in the agenda.','', '## Everything added','', '| Item | Count |','|---|---:|','| Fictional patient stories | 4 (3 new accounts + existing Alice) |','| Authored clinical entries | 26 |','| Structured order records | 5 |','| Completed result reports | 2 |','| Total new clinical entries | 33 |','| Requests / orders | 5 |','| Curated nurse tasks | 4 |','| Additional order-linked tasks | 5 |','| Appointments | 4 |','| Saved unfinished SOAP draft | 1 |','| Care conversations / messages | 3 / 6 |','| Structured handoffs | 2 |','| Insurance profiles with billing shares | 2 |','| Approved fictional comparison plans | 3 |','', 'Each patient has history, allergy reconciliation, assessment context, nurse vitals, a follow-up plan and consultation overview. Fatima has the additional fictional prescription and dispensing record. Existing earlier demonstration data remains unchanged.','', '![Doctor directory](docs/images/showcase-patients-web.png)','', '## Patient stories','']
for c in m['patients'].values():
    md+=['### '+c['name'],'',f"- Login: `{c['username']}`; Health ID: `{c['healthId']}`; age: {c['age']}; occupation: {c['occupation']}.",f"- Appointment: {m['scheduleDate']} at {time(m['appointments'][c['username']])} Eastern, 30 minutes, in person.",'- Location: '+c['room']+'.','- Presenting concern: '+c['story']+'.','',c['history'],'','Allergy / intolerance: '+c['allergy'],'','Assessment context: '+c['condition'],'','Invented vitals: '+json.dumps(c['vitals'])+'.','','Follow-up: '+c['plan'],'']
md+=['## Exact completed report text','']
for r in sorted(v['reports'],key=lambda x:x['kind']):md+=['### '+r['title'],'',r['details'],'',f"Author: {r['author_name']} ({r['author_role']}). Observed: {r['observed_at']}. Entered: {r['created_at']}. Related order record: `{r['related_id']}`.",'']
md+=['## Requests and tasks','', '| Request | State | Result |','|---|---|---|']
for o in m['orders'].values():md+=[f"| {o['code']} | {o['status']} | {'Saved report' if o['result_id'] else 'None - pending'} |"]
md+=['','![Order queue](docs/images/showcase-orders-web.png)','', '| Nurse Williams task | State | Location |','|---|---|---|']
for t in m['tasks'].values():md+=[f"| {t['title']} | {t['status']}"+(' / independently verified' if t.get('verified_by') else '')+f" | {t['location_label']} |"]
md+=['','![Nurse work grid](docs/images/showcase-nurse-web.png)','', '## Exact example messages','', 'These operational messages remain separate from clinical record entries. An acknowledgment reply does not complete a task.','']
for msg in v['messagesContent']:md+=['- **'+msg['author_name']+'**: '+msg['body']]
md+=['','## Structured handoffs','']
for key,h in m['handoffs'].items():md+=['### '+key+' - '+h['status'],'',h['details'],'']
md+=['## Training prescription','', 'Fatima: DEMO TRAINING TABLET is a nonexistent medicine. Quantity 10 fictional units, no refills; a linked pharmacy event records one demonstration unit. No real medicine is prescribed, dispensed or administered. This shows recipient assignment and quantity tracking.','', '## Insurance examples','', '| Plan | Monthly premium USD | Deductible USD | Out-of-pocket USD | Network |','|---|---:|---:|---:|---|','| Showcase / Harbor Starter | 220 | 1800 | 6500 | HMO |','| Showcase / Harbor Flexible | 365 | 900 | 4500 | PPO |','| Showcase / Harbor Family | 480 | 1500 | 7000 | EPO |','', 'All three include invented comparison text, an illustrative $25 office copay and 20% coinsurance description. No actual benefits, provider network or enrollment exist. No sponsorship was activated.','', '- Noah: Example Unconnected Provider - Fictional -> UNKNOWN, synthetic=true.','- Fatima: Synthetic Harbor Health -> VERIFIED, synthetic=true.','- Neither contacted a real insurer. Profiles are patient-owned and specifically shared with the fictional hospital billing account. Identifiers remain protected by the existing access controls.','', '## Accounts','', '| Username | Perspective |','|---|---|','| hospitaldoctor | Dr Smith |','| hospitalnurse | Nurse Williams |','| hospitallab | Technician Lee |','| hospitalimaging | Technician Patel |','| hospitalradiologist | Dr Ahmed |','| hospitalpharmacy | Pharmacist Davis |','| hospitalbilling | Billing Taylor |','| hospitalreception | Reception Jordan |','| hospitaladmin | Hospital administration |','| hospitalinsurer | Fictional plan management |','| hospitalalice / showcasenoah / showcasefatima / showcaseleo | Individual patient |','', 'Use the protected local password from LOCAL_ACCESS.txt. The generic doctor account has a different tenant and is intentionally unable to access these patients. Sign out or use separate browser profiles when switching roles.','', '## Eight-minute presentation script','']
for title,body in steps:md+=['### '+title,'',body,'']
md+=['## Prior platform work and remaining scope','', 'This builds on the existing patient/staff portals, short Health IDs, compact Back/home navigation, doctor agenda and patient cards, photo controls, scoped clinical records, organization hierarchy/employment, invitations, workforce availability, nursing, orders, handoffs and insurance. [HOSPITAL_EXPANSION_REPORT.md](HOSPITAL_EXPANSION_REPORT.md) records the prior delivered changes and exact earlier test scope. [PROJECT_SOURCE_OF_TRUTH.md](PROJECT_SOURCE_OF_TRUTH.md) remains the project baseline.','', 'This revision changes data, reproducible setup/verification scripts, focused browser checks, screenshots and this report. It does not add a new external integration or claim production readiness. Physical native devices, live EHR/PACS/insurance integration, real image acquisition and real notification delivery are not demonstrated here. The mobile screenshots are from the actual React Native components running in a browser harness.','', '## Verification executed in this revision','', '- Shared API verification PASS: 33 unique records; staged request states; no result invented for pending requests; four appointments with distinct start times; four curated task states; independent completion verification; three conversations with six messages; preserved source dates.', '- Patient record IDs match the corresponding authorized staff records.', '- Two unrelated account access checks returned 403.', '- Setup executed twice; no duplicated Showcase clinical entries were found.', '- Four focused browser tests PASS: web doctor directory/orders; web nurse work grid; native patient reports/marketplace; native nurse work grid.', '- Evidence: [API verification](docs/evidence/showcase-verification.json), [browser results](docs/evidence/showcase-ui.json), [full fixture manifest](docs/evidence/showcase-demo.json).', '- Prior backend, PostgreSQL and full application regression results remain in the earlier expansion report; those complete suites were not rerun for this data/report-only revision.','', '## Run, preserve and reproduce','', '1. Open Desktop > Health Passport > Start Health Passport.command. The normal launcher starts the web app and backend.', '2. Use the existing mobile development/harness instructions in README_USER_GUIDE.md or apps/mobile/tests/browser/README.md when the native preview is not already running.', '3. The examples are already saved in the local database. Do not delete the database or .env; use the existing backup guidance for database and encryption/signing material.', '4. With the backend running and DEMO_MODE=true, run `python3 scripts/setup_showcase_demo.py` from the project root to reapply the fixture. It requires the existing NorthStar accounts from `scripts/setup_ecosystem_demo.py`, uses stable request keys and preserves staged progress. Keep the fixture manifest with its matching database.', '5. Run `python3 scripts/verify_showcase_demo.py` for the read-only snapshot assertions. If you intentionally progress tasks or requests, a snapshot assertion can fail; preserve the new progress and revise the demonstration report.', '6. Browser verification: from apps/web run `npx playwright test --config=playwright.showcase.config.ts` with the web, backend and native browser harness running and Playwright Chromium installed. Existing local toolchain/browser configuration is described in the project guides.', '7. The report PDF is output/pdf/Health_Passport_Demo_Report.pdf. Its companion is this file. The report builder uses ReportLab and the saved evidence; it is not required to run the app.', '', 'The fixed appointment date is preserved on subsequent setup runs. Future rescheduling should use the app; rerunning the fixture does not silently move appointments or reset user progress. No public deployment or cloud-only storage was introduced. Existing README files were not changed by this revision.','', '## Complete authored record inventory','', '| Fixture key | Record ID |','|---|---|']
for key,rid in m['records'].items():md+=[f'| {key} | `{rid}` |']
(ROOT/'DEMO_SHOWCASE_REPORT.md').write_text('\n'.join(md)+'\n')
print(str(OUT))
