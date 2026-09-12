#!/usr/bin/env python3
"""Build and run the synthetic local platform; never publish a service."""
from pathlib import Path
import argparse, os, shutil, signal, subprocess, sys, time, urllib.request
from configure import configure, ROOT
parser=argparse.ArgumentParser();parser.add_argument('--install',action='store_true');parser.add_argument('--no-build',action='store_true');args=parser.parse_args()
env=os.environ.copy()
for line in configure().read_text().splitlines():
    if line and not line.startswith('#'):
        key,value=line.split('=',1);env.setdefault(key,value)
for command in ('java','node','npm'):
    if not shutil.which(command):sys.exit(f'Missing {command}. Install Java 21 and Node.js 24 with npm, then retry.')
if args.install:
    from setup_photos import setup
    setup()
if args.install:subprocess.run(['npm','ci'],cwd=ROOT/'apps/web',env=env,check=True)
if not (ROOT/'apps/backend/photo-check/.venv').exists():sys.exit('Local photo checker missing. Run Python 3.12+ scripts/setup_photos.py before starting.')
if not (ROOT/'apps/web/node_modules').is_dir():sys.exit('Web dependencies missing. Run python3 scripts/dev.py --install.')
if not args.no_build:subprocess.run(['./mvnw','-B','verify'],cwd=ROOT/'apps/backend',env=env,check=True)
jar=ROOT/'apps/backend/target/health-passport-api-0.1.0.jar'
if not jar.exists():sys.exit('Backend package missing. Run without --no-build.')
runtime=ROOT/'.runtime';runtime.mkdir(exist_ok=True)
# Running a copied archive avoids class-loading errors when Maven rebuilds target/.
active=runtime/f'api-{int(time.time())}.jar';shutil.copy2(jar,active)
logs=[open(runtime/'backend.log','w'),open(runtime/'web.log','w')];processes=[]
def stop(*_):
    for p in processes:
        if p.poll() is None:p.terminate()
    for p in processes:
        try:p.wait(timeout=10)
        except subprocess.TimeoutExpired:p.kill()
    for log in logs:log.close()
    active.unlink(missing_ok=True)
signal.signal(signal.SIGTERM,lambda *_:(_ for _ in ()).throw(KeyboardInterrupt()))
def wait_url(url,seconds):
    until=time.time()+seconds
    while time.time()<until:
        if any(p.poll() is not None for p in processes):raise RuntimeError('A service stopped. See .runtime/backend.log and .runtime/web.log.')
        try:
            with urllib.request.urlopen(url,timeout=2) as r:
                if r.status==200:return
        except Exception:time.sleep(.5)
    raise RuntimeError(f'Service did not become ready: {url}. See .runtime logs.')
try:
    processes.append(subprocess.Popen(['java','-jar',str(active)],cwd=ROOT/'apps/backend',env=env,stdout=logs[0],stderr=subprocess.STDOUT))
    processes.append(subprocess.Popen(['npm','run','dev'],cwd=ROOT/'apps/web',env=env,stdout=logs[1],stderr=subprocess.STDOUT))
    wait_url('http://127.0.0.1:8080/api/health',60);wait_url('http://localhost:5173',60)
    print('Health Passport is running at http://localhost:5173',flush=True)
    print('Account access: python3 scripts/configure.py --show-accounts',flush=True)
    print('Synthetic data only. Ctrl+C stops both services.',flush=True)
    while all(p.poll() is None for p in processes):time.sleep(1)
except KeyboardInterrupt:pass
finally:stop()
