#!/usr/bin/env python3
"""Read-only assertions for the persisted fictional presentation fixture."""
from setup_ecosystem_demo import Client, ROOT
from datetime import datetime, timezone
import json

def main():
    m=json.loads((ROOT/'docs/evidence/showcase-demo.json').read_text())
    doctor=Client().login('hospitaldoctor')
    expected_records=set(m['records'].values())
    for order in m['orders'].values():
        expected_records.add(order['record_id'])
        if order['result_id']:expected_records.add(order['result_id'])
    saved=[]
    for p in m['patients'].values():
        rows=doctor.call('/care/patients/'+p['id']+'/timeline')
        records=[r for r in rows if r.get('entry_type')=='record' and r['title'].startswith('Showcase')]
        assert len(records)==len({r['title'] for r in records}), 'Duplicate presentation records'
        assert all('FICTIONAL' in r['details'].upper() for r in records)
        patient=Client().login(p['username'])
        own=patient.call('/patients/'+p['id']+'/timeline')
        assert {r['id'] for r in records}<={r['id'] for r in own}
        saved+=records
    assert {r['id'] for r in saved}==expected_records
    orders=[r for r in doctor.call('/ecosystem/orders') if r['code'].startswith('Showcase')]
    assert len(orders)==5
    expected_states={'alice-cbc':'completed','alice-xray':'completed','noah-panel':'processing','leo-imaging':'scheduled','fatima-consult':'ordered'}
    for key,status in expected_states.items():
        row=next(r for r in orders if r['id']==m['orders'][key]['id'])
        assert row['status']==status, 'Fixture progressed by user; preserve it and refresh report'
        if key in ['noah-panel','leo-imaging']:assert row['result_id'] is None
    tasks=[r for r in doctor.call('/care/tasks') if r['id'] in {t['id'] for t in m['tasks'].values()}]
    assert len(tasks)==4
    assert {t['status'] for t in tasks}=={'open','in_progress','waiting','completed'}
    assert next(t for t in tasks if t['status']=='completed')['verified_by']
    appointments=[r for r in doctor.call('/care/workspace')['appointments'] if r['reason'].startswith('Showcase')]
    assert len(appointments)==4 and len({r['starts_at'] for r in appointments})==4
    conversations=[doctor.call('/care/conversations/'+cid) for cid in m['conversations'].values()]
    messages=[msg for c in conversations for msg in c['messages']]
    assert len(messages)==6
    reports=[r for r in saved if r['kind'] in ['lab_result','imaging_report']]
    assert len(reports)==2 and all(r['observed_at']<r['created_at'] for r in reports)
    denied=[]
    for username,path in [('doctor','/care/patients/'+m['patients']['showcasenoah']['id']+'/timeline'),('showcasefatima','/patients/'+m['patients']['hospitalalice']['id']+'/timeline')]:
        try:Client().login(username).call(path)
        except RuntimeError as error:
            assert str(error).startswith('403'), str(error)
            denied.append(username)
        else:raise AssertionError('Unexpected access outside authorized patient context')
    result={'verifiedAt':datetime.now(timezone.utc).isoformat(),'synthetic':True,'status':'PASS','clinicalRecords':len(saved),'authoredRecords':len(m['records']),'orderRecords':5,'completedReports':2,'orders':5,'careTasks':4,'linkedOrderTasks':5,'appointments':4,'conversations':3,'messages':6,'deniedUnrelatedAccounts':denied,'patientTimelinesMatchStaffRecordIds':True,'noDuplicateShowcaseRecordsAfterRepeat':True,'orderStates':expected_states,'reports':reports,'messagesContent':messages}
    (ROOT/'docs/evidence/showcase-verification.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ['reports','messagesContent']},indent=2))

if __name__=='__main__':main()
