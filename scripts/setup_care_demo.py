#!/usr/bin/env python3
"""Create an explicitly synthetic, consented care-team walkthrough on the local demo."""
from pathlib import Path
import json, urllib.request, urllib.error, http.cookiejar, datetime, uuid, os
ROOT=Path(__file__).resolve().parents[1]
ENV=dict(line.split('=',1) for line in (ROOT/'.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
if ENV.get('DEMO_MODE','').lower()!='true':raise SystemExit('This setup is restricted to DEMO_MODE=true.')
PASSWORD=ENV['DEMO_PASSWORD']; BASE='http://localhost:8080/api'
class Client:
 def __init__(self):self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def call(self,path,body=None,method=None):
  method=method or ('GET' if body is None else 'POST');headers={'Content-Type':'application/json'}
  if method!='GET':
   csrf=self.call('/csrf');headers[csrf['headerName']]=csrf['token']
  req=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers=headers,method=method)
  try:
   with self.opener.open(req,timeout=20) as r:return json.load(r)
  except urllib.error.HTTPError as e:raise RuntimeError(f'{e.code}: {e.read().decode()}')
 def login(self,name):return self.call('/auth/login',{'username':name,'password':PASSWORD})
clients={};users={}
for role in ['doctor','nurse','reception','lab','diagnostic','coordinator','admin','pharmacy']:
 c=Client();users[role]=c.login(role);clients[role]=c
patient=Client()
try:p=patient.login('carepatient')
except RuntimeError as e:
 if not str(e).startswith('401'):raise
 patient.call('/auth/register',{'username':'carepatient','displayName':'Casey Rivera','password':PASSWORD});p=patient.login('carepatient')
if p.get('name') not in ['Casey Rivera (Synthetic)','Casey Rivera (Synthetic) (Synthetic)']:raise SystemExit('The carepatient username belongs to a different fixture; preserved without changes.')
clients['reception'].call('/care/registration',{'healthId':p['healthId']})
expiry=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=90)).isoformat()
scopes=['vital','history','nursing_observation','allergy','condition','medication','encounter','note','lab_order','lab_result','imaging_order','imaging_report','prescription','dispense','document','referral','follow_up','discharge']
for role,u in users.items():
 permission=['registration'] if role in ['reception','admin','coordinator'] else ['registration']+scopes
 existing=clients['admin'].call('/care/assignments');old=next((a for a in existing if a['patient_id']==p['id'] and a['staff_id']==u['id']),None)
 if not old:clients['admin'].call('/care/assignments',{'patientId':p['id'],'staffId':u['id'],'scopes':permission,'expiresAt':expiry})
 if role not in ['reception','admin','coordinator']:
  grants=patient.call('/consents')
  if not any(g['grantee_id']==u['id'] and g['status']=='active' for g in grants):patient.call('/consents',{'patientId':p['id'],'granteeId':u['id'],'purpose':'treatment','scopes':scopes,'expiresAt':expiry})
now=datetime.datetime.now(datetime.timezone.utc)
for key,delta,title,values in [('care-demo-vitals-old',12,'Previous intake vitals',{'pulse_bpm':76,'systolic_mmhg':124,'diastolic_mmhg':82}),('care-demo-vitals-today',0,'Today’s intake vitals',{'temperature_c':36.8,'spo2_percent':98,'pulse_bpm':72,'systolic_mmhg':120,'diastolic_mmhg':80})]:
 clients['nurse'].call('/care/records',{'patientId':p['id'],'kind':'vital','title':title,'details':'Synthetic training measurements only. Confirm with the patient and equipment.','sourceType':'nurse_observation','source':'Synthetic clinic intake','observedAt':(now-datetime.timedelta(days=delta)).isoformat(),'observedTimezone':'Etc/UTC','measurements':values,'idempotencyKey':key})
clients['doctor'].call('/care/tasks',{'patientId':p['id'],'scope':'nursing_observation','assigneeId':users['nurse']['id'],'title':'Complete intake review','details':'Synthetic walkthrough: confirm medication history and record your observation.','priority':'routine','dueAt':(now+datetime.timedelta(hours=2)).isoformat(),'acknowledgeBy':(now+datetime.timedelta(minutes=30)).isoformat(),'requestKey':'care-demo-intake-task'})
c=clients['doctor'].call('/care/conversations',{'patientId':p['id'],'scope':'note','kind':'patient','title':'Casey · care discussion','members':[users['nurse']['id']],'requestKey':'care-demo-discussion'})
clients['doctor'].call('/care/messages',{'conversationId':c['id'],'body':'Synthetic walkthrough: please review intake before the consultation. Accept the separate task to acknowledge ownership.','mentions':[users['nurse']['id']],'requestKey':'care-demo-discussion-message'})
order=clients['doctor'].call('/care/records',{'patientId':p['id'],'kind':'lab_order','title':'Synthetic laboratory request','details':'Synthetic workflow example; no actual investigation requested.','recipientId':users['lab']['id'],'observedAt':now.isoformat(),'sourceType':'clinician_observation','source':'Synthetic consultation','idempotencyKey':'care-demo-lab-order'})
path=ROOT/'docs/evidence/care-demo.json';path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps({'patient':p,'staff':users,'labOrder':order['id']},indent=2)+'\n')
print('Synthetic care walkthrough ready. Patient: Casey Rivera (Synthetic). Staff usernames: doctor, nurse, reception, lab, diagnostic, coordinator, admin, pharmacy. Password remains in LOCAL_ACCESS.txt.')
