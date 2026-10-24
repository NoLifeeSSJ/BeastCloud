"""Smoke-test a self-contained Linux publish without Node or dotnet on PATH."""
from pathlib import Path
import subprocess,tempfile,os,time,json,urllib.request,http.cookiejar,hashlib,sys,re
package=Path(sys.argv[1] if len(sys.argv)>1 else '.local/linux-publish').resolve()
with tempfile.TemporaryDirectory(prefix='beast-package-') as root:
 env={**os.environ,'PATH':'/nonexistent','DOTNET_ROOT':'/nonexistent','BEAST_ROOT':root,'ASPNETCORE_ENVIRONMENT':'Development','ASPNETCORE_URLS':'http://127.0.0.1:5092','HTTP_PROXY':'http://127.0.0.1:9','HTTPS_PROXY':'http://127.0.0.1:9','NO_PROXY':'127.0.0.1,localhost'}
 log=Path(root)/'console.log'
 with log.open('w') as output:
  p=subprocess.Popen([str(package/'BeastCloud.Server'),'--contentRoot',str(package)],env=env,stdout=output,stderr=output)
  client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),urllib.request.ProxyHandler({}))
  try:
   for _ in range(100):
    try:
     with client.open('http://127.0.0.1:5092/api/health') as r:assert json.load(r)['status']=='ready'
     break
    except:
     if p.poll() is not None:raise RuntimeError(log.read_text())
     time.sleep(.1)
   else:raise RuntimeError('Readiness timeout')
   def call(path,method='GET',data=None,csrf=''):
    request=urllib.request.Request('http://127.0.0.1:5092'+path,json.dumps(data).encode() if data is not None else None,{'Content-Type':'application/json','X-CSRF':csrf},method=method)
    with client.open(request) as response:return response.read()
   html=call('/').decode();assert '<div id="root">' in html
   for asset in re.findall(r'(?:src|href)="(/assets/[^"]+)"',html):assert len(call(asset))>100
   key=(Path(root)/'config/setup.key').read_text();setup=json.loads(call('/api/setup','POST',dict(name='Packaged fixture',key=key,password='a disposable test password',timezone='UTC')));csrf=setup['session']['csrf']
   folder=json.loads(call('/api/folders','POST',dict(name='Packaged local folder'),csrf))['id'];assert any(i['id']==folder for i in json.loads(call('/api/items',csrf=csrf)))
   print('PASS: self-contained host, static assets, owner setup, authenticated mutation/read; no Node/.NET on PATH, external proxies unavailable.')
  finally:p.terminate();p.wait(timeout=15)
