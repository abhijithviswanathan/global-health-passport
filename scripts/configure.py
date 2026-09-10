#!/usr/bin/env python3
"""Create local synthetic configuration without overwriting existing secrets."""
from pathlib import Path
import argparse, base64, os, secrets
ROOT=Path(__file__).resolve().parents[1]
def configure():
    path=ROOT/'.env'
    if not path.exists():
        settings={'DEMO_MODE':'true','DEMO_PASSWORD':secrets.token_urlsafe(24),'DATABASE_PASSWORD':secrets.token_urlsafe(24),'IDENTITY_ENCRYPTION_KEY':base64.b64encode(secrets.token_bytes(32)).decode(),'DOCUMENT_ENCRYPTION_KEY':base64.b64encode(secrets.token_bytes(32)).decode(),'WEBAUTHN_RP_ID':'localhost','WEBAUTHN_ORIGINS':'http://localhost:5173','COOKIE_SECURE':'false'}
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:f.write(''.join(f'{k}={v}\n' for k,v in settings.items()))
    return path
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--show-accounts',action='store_true',help='Display the locally generated synthetic account password');args=parser.parse_args();path=configure();print(f'Local configuration: {path}')
    if args.show_accounts:
        settings=dict(line.split('=',1) for line in path.read_text().splitlines() if line and not line.startswith('#'))
        print('Synthetic usernames: patient, doctor, lab, pharmacy, admin, security')
        print('Initial seed password: '+settings.get('DEMO_PASSWORD','See backend data/demo-credentials.txt'))
        print('Changing this file does not reset existing accounts. These accounts are for local testing only.')
