#!/usr/bin/env python3
"""Run the locally saved builds; never deploy or publish a service."""
from pathlib import Path
import argparse, os, shutil, signal, subprocess, sys, time, urllib.request, webbrowser
from configure import configure, ROOT
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');parser.add_argument('--no-open',action='store_true',help='Start without opening a browser');args=parser.parse_args()
def ready(url):
    try:
        with urllib.request.urlopen(url,timeout=2) as response:return response.status==200
    except Exception:return False
api_ready=ready('http://127.0.0.1:8080/api/health');web_ready=ready('http://localhost:5173/')
if api_ready and web_ready:
    print('Health Passport is already running: http://localhost:5173/')
    if not args.check and not args.no_open:webbrowser.open('http://localhost:5173/')
    sys.exit(0)
if args.check:
    print('API ready:',api_ready,'Web ready:',web_ready);sys.exit(1)
if api_ready or web_ready:sys.exit('One service is already running. Stop the existing launcher before starting both services here.')
node=shutil.which('node')
if not node:
    bundled=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
    if bundled.is_file():node=str(bundled)
java=shutil.which('java')
if sys.platform=='darwin':
    result=subprocess.run(['/usr/libexec/java_home','-v','21'],capture_output=True,text=True)
    if result.returncode==0:java=str(Path(result.stdout.strip())/'bin/java')
jar=ROOT/'apps/backend/target/health-passport-api-0.1.0.jar'
if not node or not java:sys.exit('Install Node.js 24 and Java 21. See README_USER_GUIDE.md.')
if not jar.exists() or not (ROOT/'apps/web/dist/client/index.html').exists():sys.exit('Saved build missing. Follow Build after changing code in README_USER_GUIDE.md.')
if not (ROOT/'apps/backend/photo-check/.venv').exists():sys.exit('Run Python 3.12+ scripts/setup_photos.py first. See README_USER_GUIDE.md.')
env=os.environ.copy()
for line in configure().read_text().splitlines():
    if line and not line.startswith('#'):
        key,value=line.split('=',1);env.setdefault(key,value)
runtime=ROOT/'.runtime';runtime.mkdir(exist_ok=True)
active=runtime/f'api-saved-{int(time.time())}.jar';shutil.copy2(jar,active)
processes=[];logs=[]
signal.signal(signal.SIGTERM,lambda *_:(_ for _ in ()).throw(KeyboardInterrupt()))
try:
    for name,command,directory in [('backend',[java,'-jar',str(active)],ROOT/'apps/backend'),('web',[node,'scripts/serve-local.mjs'],ROOT/'apps/web')]:
        log=open(runtime/(name+'.log'),'w');logs.append(log)
        processes.append(subprocess.Popen(command,cwd=directory,env=env,stdout=log,stderr=subprocess.STDOUT))
    for _ in range(60):
        if any(p.poll() is not None for p in processes):raise RuntimeError('A service stopped. Check .runtime logs.')
        if ready('http://127.0.0.1:8080/api/health') and ready('http://localhost:5173/'):break
        time.sleep(.5)
    else:raise RuntimeError('Startup timed out. Check .runtime logs.')
    print('Health Passport is running at http://localhost:5173/',flush=True)
    print('Keep this window open. Ctrl+C stops the app. Account details are in LOCAL_ACCESS.txt.',flush=True)
    if not args.no_open:webbrowser.open('http://localhost:5173/')
    while all(p.poll() is None for p in processes):time.sleep(1)
except KeyboardInterrupt:pass
finally:
    for process in processes:
        if process.poll() is None:process.terminate()
    for process in processes:
        try:process.wait(timeout=10)
        except subprocess.TimeoutExpired:process.kill()
    for log in logs:log.close()
    active.unlink(missing_ok=True)
