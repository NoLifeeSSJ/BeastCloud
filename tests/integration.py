"""Runs the real HTTP server against disposable directories; no personal data touched."""
import struct,zlib,io,zipfile,hmac
import unittest,subprocess,os,tempfile,time,json,urllib.request,urllib.error,http.cookiejar,hashlib,sqlite3,pathlib,shutil,base64
ROOT=pathlib.Path(__file__).resolve().parents[1]
DOTNET=os.environ.get('DOTNET','dotnet')
DLL=ROOT/'src/BeastCloud.Server/bin/Debug/net10.0/BeastCloud.Server.dll'
class Client:
 def __init__(self):self.csrf='';self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def call(self,path,method='GET',data=None,headers=None,raw=False):
  body=data if isinstance(data,bytes) else json.dumps(data).encode() if data is not None else None
  h={'X-CSRF':self.csrf,**({'Content-Type':'application/json'} if body is not None and not isinstance(data,bytes) else {}),**(headers or {})}
  req=urllib.request.Request('http://127.0.0.1:5089/api'+path,body,h,method=method)
  try:
   with self.opener.open(req) as r:
    b=r.read();return r.status,b if raw else json.loads(b) if b else None,dict(r.headers)
  except urllib.error.HTTPError as e:
   b=e.read()
   try:b=json.loads(b)
   except:b=b.decode(errors='replace')
   return e.code,b,dict(e.headers)
class Integration(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory(prefix='beast-test-');cls.home=pathlib.Path(cls.tmp.name)/'server';cls.log=open(pathlib.Path(cls.tmp.name)/'server.log','w');cls.start();cls.client=Client();key=(cls.home/'config/setup.key').read_text();s,r,_=cls.client.call('/setup','POST',dict(name='Owner',password='correct horse battery staple',key=key,timezone='UTC'));assert s==200,(s,r);cls.client.csrf=r['session']['csrf'];cls.codes=r['recoveryCodes'];cls.folder=cls.client.call('/folders','POST',dict(name='Test files'))[1]['id']
 @classmethod
 def start(cls):
  e={**os.environ,'BEAST_ROOT':str(cls.home),'ASPNETCORE_ENVIRONMENT':'Development','ASPNETCORE_URLS':'http://127.0.0.1:5089','DOTNET_CLI_TELEMETRY_OPTOUT':'1'}
  cls.proc=subprocess.Popen([DOTNET,str(DLL),'--contentRoot',str(ROOT/'src/BeastCloud.Server')],env=e,stdout=cls.log,stderr=cls.log)
  for _ in range(100):
   try:
    if Client().call('/health')[0]==200:return
   except:pass
   if cls.proc.poll() is not None:raise RuntimeError('Server failed: '+(pathlib.Path(cls.tmp.name)/'server.log').read_text())
   time.sleep(.1)
  raise RuntimeError('Server readiness timed out')
 @classmethod
 def stop(cls):cls.proc.terminate();cls.proc.wait(timeout=15)
 @classmethod
 def tearDownClass(cls):cls.stop();cls.log.close();cls.tmp.cleanup()
 def upload(self,name,data,parent=None,item=None):
  j=dict(name=name,total=len(data),parent=parent,checksum=hashlib.sha256(data).hexdigest())
  if item:j.update(itemId=item['id'],baseRevision=item['revision'])
  s,r,_=self.client.call('/uploads','POST',j);self.assertEqual(s,200,r);id=r['id']
  for offset in range(0,len(data),4194304):
   chunk=data[offset:offset+4194304];s,r,_=self.client.call('/uploads/'+id,'PATCH',chunk,{'Upload-Offset':str(offset),'Upload-Checksum':hashlib.sha256(chunk).hexdigest()});self.assertEqual(s,200,r)
  s,r,_=self.client.call('/uploads/'+id+'/commit','POST');self.assertEqual(s,200,r);return r['id']
 def test_01_auth_csrf_and_setup(self):
  self.assertEqual(Client().call('/items')[0],401)
  self.assertEqual(self.client.call('/folders','POST',{'name':'csrf'}, {'X-CSRF':'wrong'})[0],403)
  self.assertNotEqual(Client().call('/setup','POST',dict(name='attacker',key='bad',password='passwordpassword'))[0],200)
 def test_02_windows_filename_rejection(self):
  for name in ['../escape','CON.txt','x:y','LPT1','trailing.','bad\\path','nul','..','x/other']:
   with self.subTest(name=name):self.assertEqual(self.client.call('/folders','POST',dict(name=name))[0],400)
 def test_03_case_collision_and_cycles(self):
  s,a,_=self.client.call('/folders','POST',dict(name='Collision'));self.assertEqual(s,200)
  self.assertEqual(self.client.call('/folders','POST',dict(name='collision'))[0],409)
  self.assertEqual(self.client.call('/folders','POST',dict(name='Äpfel'))[0],200)
  self.assertEqual(self.client.call('/folders','POST',dict(name='äpfel'))[0],409)
  self.assertEqual(self.client.call('/items/'+a['id'],'PATCH',dict(parent=a['id']))[0],400)
 def test_04_resume_restart_commit_idempotent(self):
  data=b'a'*4194304+b'b'*1024*1024;s,u,_=self.client.call('/uploads','POST',dict(name='resumed.bin',total=len(data),checksum=hashlib.sha256(data).hexdigest()));self.assertEqual(s,200)
  chunk=data[:4194304];path='/uploads/'+u['id'];s,_,_=self.client.call(path,'PATCH',chunk,{'Upload-Offset':'0','Upload-Checksum':hashlib.sha256(chunk).hexdigest()});self.assertEqual(s,200)
  self.stop();self.start();self.assertEqual(self.client.call(path)[1]['offset'],4194304)
  chunk=data[4194304:];self.assertEqual(self.client.call(path,'PATCH',chunk,{'Upload-Offset':'4194304','Upload-Checksum':hashlib.sha256(chunk).hexdigest()})[0],200)
  s,r,_=self.client.call(path+'/commit','POST');self.assertEqual(s,200,r);id=r['id'];self.assertEqual(self.client.call(path+'/commit','POST')[1]['id'],id);self.assertEqual(self.client.call('/items/'+id+'/content',raw=True)[1],data)
 def test_05_chunk_integrity_order_ownership(self):
  s,u,_=self.client.call('/uploads','POST',dict(name='chunks.bin',total=3));p='/uploads/'+u['id']
  self.assertEqual(self.client.call(p,'PATCH',b'abc',{'Upload-Offset':'0','Upload-Checksum':'0'*64})[0],400)
  self.assertEqual(self.client.call(p,'PATCH',b'abc',{'Upload-Offset':'1','Upload-Checksum':hashlib.sha256(b'abc').hexdigest()})[0],409)
  self.assertEqual(Client().call(p)[0],401);self.assertEqual(self.client.call(p+'/commit','POST')[0],409);self.client.call(p,'DELETE')
 def test_06_versions_trash_restore(self):
  id=self.upload('version.txt',b'first');i=self.client.call('/items/'+id)[1];self.upload('version.txt',b'second',item=i)
  v=self.client.call('/items/'+id+'/versions')[1][0];self.assertEqual(self.client.call('/items/'+id+'/versions/'+v['id']+'/restore','POST')[0],200);self.assertEqual(self.client.call('/items/'+id+'/content',raw=True)[1],b'first')
  self.assertEqual(self.client.call('/items/'+id,'DELETE')[0],200);self.assertNotEqual(self.client.call('/items/'+id+'/content')[0],200);self.assertEqual(self.client.call('/items/'+id+'/restore','POST')[0],200);self.assertEqual(self.client.call('/items/'+id+'/content',raw=True)[1],b'first')
 def test_07_missing_volume(self):
  marker=self.home/'data/files/.beastcloud-volume';moved=marker.with_name('offline-marker');marker.rename(moved)
  try:
   self.assertFalse(self.client.call('/dashboard')[1]['available']);self.assertEqual(self.client.call('/uploads','POST',dict(name='missing',total=0))[0],503);self.assertFalse(marker.exists())
  finally:moved.rename(marker)
 def test_08_reparse_escape(self):
  data=b'abc';id=self.upload('reparse.txt',data);i=self.client.call('/items/'+id)[1];blob=self.home/'data/files'/i['blob'];other=blob.with_name('saved-blob');blob.rename(other);blob.symlink_to(other)
  try:self.assertEqual(self.client.call('/items/'+id+'/content')[0],503)
  finally:blob.unlink();other.rename(blob)
 def test_09_notes_tasks_event_revision_export(self):
  for kind,body in [('note',{'text':'local search phrase','tags':'private'}),('task',{'text':'go','due':'2026-12-01','done':False}),('event',{'start':'2026-12-01T09:00:00Z','end':'2026-12-01T10:00:00Z','timezone':'UTC','repeat':'weekly','count':4})]:
   id=os.urandom(16).hex();r=dict(type=kind,title='Fixture '+kind,body=body,revision=0);s,saved,_=self.client.call('/records/'+id,'PUT',r);self.assertEqual(s,200,saved);self.assertEqual(self.client.call('/records/'+id,'PUT',r)[0],409)
  self.assertEqual(self.client.call('/records/export')[0],200);s,b,_=self.client.call('/calendar/export',raw=True);self.assertEqual(s,200);self.assertIn(b'RRULE:FREQ=WEEKLY;COUNT=4',b)
  self.assertEqual(self.client.call('/calendar/import','POST',dict(text=b.decode()))[0],200)
 def test_10_sharing_permissions_revoke(self):
  id=self.upload('shared.txt',b'shared');s,r,_=self.client.call('/users','POST',dict(name='Guest',password='guest password long enough'));self.assertEqual(s,200,r);guestid=r['id'];s,share,_=self.client.call('/shares','POST',dict(itemId=id,userId=guestid));self.assertEqual(s,200)
  guest=Client();s,r,_=guest.call('/login','POST',dict(name='Guest',password='guest password long enough'));self.assertEqual(s,200);guest.csrf=r['csrf']
  self.assertEqual(guest.call('/items/'+id+'/content')[0],403);self.assertEqual(guest.call('/search?q=shared')[0],403);self.assertEqual(guest.call('/shared/'+share['id']+'/content',raw=True)[1],b'shared')
  self.client.call('/shares/'+share['id'],'DELETE');self.assertNotEqual(guest.call('/shared/'+share['id']+'/content')[0],200)
 def test_11_bearer_password_and_expiration(self):
  id=self.upload('bearer.txt',b'bearer');s,r,_=self.client.call('/shares','POST',dict(itemId=id,password='a long secret password'));self.assertEqual(s,200);c=Client()
  self.assertEqual(c.call('/public/download','POST',dict(token=r['token'],password='bad'))[0],404)
  self.assertEqual(c.call('/public/download','POST',dict(token=r['token'],password='a long secret password'),raw=True)[1],b'bearer')
  self.client.call('/shares/'+r['id'],'DELETE');self.assertEqual(c.call('/public/download','POST',dict(token=r['token'],password='a long secret password'))[0],404)
  self.assertEqual(self.client.call('/shares','POST',dict(itemId=id,expires='2000-01-01T00:00:00Z'))[0],400)
 def test_12_device_scope_and_revocation(self):
  inside=self.upload('inside.txt',b'in',self.folder);outside=self.upload('outside.txt',b'out');s,p,_=self.client.call('/devices','POST',dict(name='Test device',folder=self.folder,mode='two-way'));self.assertEqual(s,200)
  device=Client();s,pair,_=device.call('/pair','POST',dict(code=p['code']));self.assertEqual(s,200);headers={'Authorization':'Bearer '+pair['token']}
  s,m,_=device.call('/sync/manifest',headers=headers);self.assertEqual(s,200);self.assertTrue(any(i['id']==inside for i in m['items']));self.assertFalse(any(i['id']==outside for i in m['items']));self.assertEqual(device.call('/sync/content/'+outside,headers=headers)[0],403)
  self.assertEqual(device.call('/pair','POST',dict(code=p['code']))[0],400);self.client.call('/devices/'+pair['id'],'DELETE');self.assertEqual(device.call('/sync/manifest',headers=headers)[0],401)
 def test_13_search_and_thumbnail(self):
  # A generated 1x1 PNG, indexed and decoded locally.
  def chunk(t,b):return struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b)&0xffffffff)
  png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',2,2,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00\xff\x00\x00\xff\x00\x00'*2))+chunk(b'IEND',b'');id=self.upload('tiny.png',png)
  self.client.call('/search/rebuild','POST')
  for _ in range(160):
   jobs=self.client.call('/jobs')[1]
   if not any(j['state'] in ('pending','running') for j in jobs):break
   time.sleep(.2)
  self.assertTrue(self.client.call('/search?q=Fixture')[1]);s,thumb,_=self.client.call('/items/'+id+'/thumbnail',raw=True);self.assertEqual(s,200,[j for j in jobs if j['state']=='failed']);self.assertTrue(thumb.startswith(b'\xff\xd8'))
 def test_14_complete_backup_restore_encryption(self):
  id=self.upload('restore.txt',b'restore exact bytes');self.client.call('/backups','POST');backup=None
  for _ in range(150):
   rows=self.client.call('/backups')[1]['jobs']
   if rows and rows[0]['state']=='completed':backup=pathlib.Path(rows[0]['payload']);break
   if rows and rows[0]['state']=='failed':self.fail(rows[0])
   time.sleep(.2)
  self.assertIsNotNone(backup);dest=pathlib.Path(self.tmp.name)/'restored'
  r=subprocess.run([DOTNET,str(DLL),'--restore',str(backup),str(dest)],capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr)
  db=sqlite3.connect(dest/'data/db/beast.db');blob=db.execute('SELECT blob FROM items WHERE id=?',(id,)).fetchone()[0];self.assertEqual((dest/'data/files'/blob).read_bytes(),b'restore exact bytes');self.assertEqual(db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0],0);db.close()
  enc=pathlib.Path(self.tmp.name)/'backup.beast';decrypt=pathlib.Path(self.tmp.name)/'decrypted';password='correct backup passphrase!\n'
  for command,source,target in [('--encrypt-backup',backup,enc),('--decrypt-backup',enc,decrypt)]:
   r=subprocess.run([DOTNET,str(DLL),command,str(source),str(target)],input=password,text=True,capture_output=True);self.assertEqual(r.returncode,0,r.stderr)
  blobfile=next((decrypt/'data/files').glob('[0-9a-f]*'));blobfile.write_bytes(b'corrupt');r=subprocess.run([DOTNET,str(DLL),'--verify-backup',str(decrypt)],capture_output=True);self.assertNotEqual(r.returncode,0)
 def test_15_range_requests_and_active_content(self):
  id=self.upload('range.mp4',b'0123456789');s,r,h=self.client.call('/items/'+id+'/content?preview=true',headers={'Range':'bytes=2-5'},raw=True);self.assertEqual(s,206);self.assertEqual(r,b'2345')
  id=self.upload('active.svg',b'<svg onload="alert(1)"></svg>');s,r,h=self.client.call('/items/'+id+'/content?preview=true',raw=True);self.assertEqual(h['Content-Type'],'application/octet-stream');self.assertIn('attachment',h['Content-Disposition'])
 def test_16_logout_expiry_revocation(self):
  c=Client();s,u,_=c.call('/login','POST',dict(name='Owner',password='correct horse battery staple'));self.assertEqual(s,200);c.csrf=u['csrf'];self.assertEqual(c.call('/logout','POST')[0],200);self.assertEqual(c.call('/session')[0],401)
  s,u,_=c.call('/login','POST',dict(name='Owner',password='correct horse battery staple'));c.csrf=u['csrf'];db=sqlite3.connect(self.home/'data/db/beast.db');db.execute("UPDATE sessions SET expires='2000-01-01' WHERE csrf=?",(c.csrf,));db.commit();db.close();self.assertEqual(c.call('/session')[0],401)
 def test_18_totp_recovery_and_rate_limit(self):
  self.stop();self.start()
  secret=self.client.call('/totp/begin','POST')[1]['secret']
  step=int(time.time())//30;key=base64.b32decode(secret);h=hmac.new(key,struct.pack('>Q',step),hashlib.sha1).digest();o=h[-1]&15;code=str((int.from_bytes(h[o:o+4],'big')&0x7fffffff)%1000000).zfill(6)
  self.assertEqual(self.client.call('/totp/confirm','POST',dict(code=code))[0],200)
  c=Client();self.assertEqual(c.call('/login','POST',dict(name='Owner',password='correct horse battery staple'))[0],401)
  self.assertEqual(c.call('/login','POST',dict(name='Owner',password='correct horse battery staple',code=code))[0],200)
  self.assertEqual(c.call('/recover','POST',dict(name='Owner',code=self.codes[0],password='correct horse battery staple'))[0],200)
  self.assertNotEqual(c.call('/recover','POST',dict(name='Owner',code=self.codes[0],password='correct horse battery staple'))[0],200)
  # Existing owner session was revoked by recovery; log in for following checks.
  s,u,_=self.client.call('/login','POST',dict(name='Owner',password='correct horse battery staple'));self.assertEqual(s,200);self.client.csrf=u['csrf']
  statuses=[c.call('/login','POST',dict(name='missing',password='invalid'))[0] for _ in range(13)]
  self.assertIn(429,statuses)
 def test_19_recursive_copy_zip_and_search_scope(self):
  folder=self.client.call('/folders','POST',dict(name='Archive source'))[1]['id'];id=self.upload('archive.txt',b'archive bytes',folder)
  s,copy,_=self.client.call('/items/'+folder+'/copy','POST',dict(name='Archive copy'));self.assertEqual(s,200,copy)
  children=self.client.call('/items?parent='+copy['id'])[1];self.assertEqual(len(children),1);self.assertEqual(self.client.call('/items/'+children[0]['id']+'/content',raw=True)[1],b'archive bytes')
  s,data,_=self.client.call('/archive?ids='+folder,raw=True);self.assertEqual(s,200);archive=zipfile.ZipFile(io.BytesIO(data));self.assertEqual(archive.read('Archive source/archive.txt'),b'archive bytes')
  self.assertEqual(Client().call('/archive?ids='+folder)[0],401)
  for _ in range(100):
   results=self.client.call('/search?q=archive&location='+folder)[1]
   if results:break
   time.sleep(.1)
  self.assertTrue(results);self.assertTrue(all(r['id'] in [folder,id] for r in results))
 def test_20_staging_and_thumbnail_reparse_paths(self):
  s,u,_=self.client.call('/uploads','POST',dict(name='safe-stage.bin',total=3));self.assertEqual(s,200)
  external=pathlib.Path(self.tmp.name)/'protected.txt';external.write_bytes(b'preserve outside staging');chunk=self.home/'data/temp'/(u['id']+'.chunk');chunk.symlink_to(external)
  try:
   s,_,_=self.client.call('/uploads/'+u['id'],'PATCH',b'abc',{'Upload-Offset':'0','Upload-Checksum':hashlib.sha256(b'abc').hexdigest()});self.assertEqual(s,503);self.assertEqual(external.read_bytes(),b'preserve outside staging')
  finally:chunk.unlink()
  image=next(i for i in self.client.call('/media')[1] if i['name']=='tiny.png');thumbnail=self.home/'data/thumbnails'/(image['id']+'.jpg');saved=thumbnail.with_suffix('.saved');thumbnail.rename(saved);thumbnail.symlink_to(external)
  try:self.assertEqual(self.client.call('/items/'+image['id']+'/thumbnail')[0],503)
  finally:thumbnail.unlink();saved.rename(thumbnail)
 def test_17_upload_limits_and_schema_failure(self):
  self.assertEqual(self.client.call('/uploads','POST',dict(name='oversize',total=101*1024**3))[0],400)
  self.assertEqual(self.client.call('/uploads','POST',dict(name='no-space',total=90*1024**3))[0],503)
  db=sqlite3.connect(self.home/'data/db/beast.db');db.execute('UPDATE schema_version SET version=999');db.commit();db.close();self.stop()
  self.start_failed=False
  e={**os.environ,'BEAST_ROOT':str(self.home),'ASPNETCORE_ENVIRONMENT':'Development','ASPNETCORE_URLS':'http://127.0.0.1:5089'}
  p=subprocess.run([DOTNET,str(DLL)],env=e,capture_output=True,timeout=15);self.assertNotEqual(p.returncode,0)
  db=sqlite3.connect(self.home/'data/db/beast.db');self.assertGreater(db.execute('SELECT COUNT(*) FROM users').fetchone()[0],0);db.execute('UPDATE schema_version SET version=1');db.commit();db.close();self.start()
if __name__=='__main__':unittest.main(verbosity=2)
