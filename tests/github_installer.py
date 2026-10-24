"""Tests the actual PowerShell bootstrap with generated local download fixtures."""
from pathlib import Path
import tempfile,json,hashlib,zipfile,subprocess,os,unittest,shutil
ROOT=Path(__file__).resolve().parents[1]
PWSH=os.environ.get('PWSH','pwsh')
ENV={**os.environ,'XDG_CACHE_HOME':'/workspace/tools/cache','XDG_CONFIG_HOME':'/workspace/tools/config','XDG_DATA_HOME':'/workspace/tools/data'}
class Downloader(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='beast-bootstrap-');self.root=Path(self.temp.name);self.fixture=self.root/'fixture';self.fixture.mkdir();self.cache=self.root/'cache';self.calls=self.root/'calls.txt'
  files={'scripts/Install.ps1':b'throw "This must not run during DownloadOnly"','scripts/Maintain.ps1':b'# fixture','scripts/Package.ps1':b'throw "Do not execute cache code during validation"','server/BeastCloud.Server.exe':b'fixture, not an executable','sync/BeastCloud.Sync.exe':b'fixture, not an executable','server/wwwroot/index.html':b'<html>local fixture</html>'}
  inner=dict(format=1,version='0.1.0',platform='win-x64',files={p:hashlib.sha256(b).hexdigest() for p,b in files.items()})
  self.archive=self.root/'BeastCloud-0.1.0-win-x64.zip'
  with zipfile.ZipFile(self.archive,'w') as z:
   for p,b in files.items():z.writestr(p,b)
   z.writestr('manifest.json',json.dumps(inner))
  data=self.archive.read_bytes();pieces=[data[:len(data)//2],data[len(data)//2:]]
  self.manifest=dict(format=1,version='0.1.0',platform='win-x64',archive=self.archive.name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),parts=[])
  for i,piece in enumerate(pieces,1):
   name=self.archive.name+f'.part{i:03}';(self.fixture/name).write_bytes(piece);self.manifest['parts'].append(dict(name=name,bytes=len(piece),sha256=hashlib.sha256(piece).hexdigest()))
  self.write_manifest()
  self.wrapper=self.root/'run.ps1'
  def q(v):return "'"+str(v).replace("'","''")+"'"
  self.wrapper.write_text('''$ErrorActionPreference='Stop'
function Invoke-WebRequest { [CmdletBinding()]param([string]$Uri,[string]$OutFile,[switch]$UseBasicParsing)
 $name=[IO.Path]::GetFileName(([uri]$Uri).AbsolutePath)
 Add-Content -LiteralPath '''+q(self.calls)+''' -Value $name
 if($env:MOCK_ONCE -and $name -like '*.part001' -and !$global:failedOnce){$global:failedOnce=$true;throw 'Simulated interrupted download'}
 Copy-Item -LiteralPath (Join-Path '''+q(self.fixture)+''' $name) -Destination $OutFile -Force
}
function Start-Sleep {param([int]$Seconds)}
& '''+q(ROOT/'scripts/Get-BeastCloud.ps1')+''' -DownloadOnly -CacheDirectory '''+q(self.cache)+'''
if($LASTEXITCODE){exit $LASTEXITCODE}
''')
 def tearDown(self):self.temp.cleanup()
 def write_manifest(self):(self.fixture/'download.json').write_text(json.dumps(self.manifest))
 def run_script(self,**env):return subprocess.run([PWSH,'-NoProfile','-File',str(self.wrapper)],capture_output=True,text=True,env={**ENV,**env},timeout=30)
 def cache_root(self):return self.cache/('0.1.0-'+self.manifest['sha256'][:16])
 def test_verified_download_extract_and_cache_reuse(self):
  result=self.run_script();self.assertEqual(result.returncode,0,result.stdout+result.stderr);self.assertTrue((self.cache_root()/'package/server/BeastCloud.Server.exe').exists());self.assertEqual((self.cache_root()/self.archive.name).read_bytes(),self.archive.read_bytes());calls=self.calls.read_text().splitlines();self.assertEqual(len(calls),3)
  result=self.run_script();self.assertEqual(result.returncode,0,result.stdout+result.stderr);self.assertEqual(len(self.calls.read_text().splitlines()),4)
 def test_interrupted_download_retries(self):
  result=self.run_script(MOCK_ONCE='1');self.assertEqual(result.returncode,0,result.stdout+result.stderr);self.assertEqual(self.calls.read_text().splitlines().count(self.manifest['parts'][0]['name']),2)
 def test_corrupt_part_never_extracts(self):
  (self.fixture/self.manifest['parts'][0]['name']).write_bytes(b'corrupt');result=self.run_script();self.assertNotEqual(result.returncode,0);self.assertFalse((self.cache_root()/'package').exists())
 def test_incorrect_combined_hash_never_extracts(self):
  self.manifest['sha256']='0'*64;self.write_manifest();result=self.run_script();self.assertNotEqual(result.returncode,0);self.assertFalse((self.cache_root()/'package').exists())
 def test_traversal_part_rejected_before_download(self):
  self.manifest['parts'][0]['name']='../escape';self.write_manifest();result=self.run_script();self.assertNotEqual(result.returncode,0);self.assertEqual(self.calls.read_text().splitlines(),['download.json'])
 def test_changed_cached_checker_is_not_executed(self):
  result=self.run_script();self.assertEqual(result.returncode,0,result.stdout+result.stderr);marker=self.root/'must-not-execute'
  (self.cache_root()/'package/scripts/Package.ps1').write_text("New-Item -ItemType File '"+str(marker)+"'")
  result=self.run_script();self.assertNotEqual(result.returncode,0);self.assertFalse(marker.exists())
 def test_unsafe_zip_entry_is_refused(self):
  with zipfile.ZipFile(self.archive,'a') as archive:archive.writestr('../escape.txt',b'must not extract')
  data=self.archive.read_bytes();self.manifest['bytes']=len(data);self.manifest['sha256']=hashlib.sha256(data).hexdigest()
  pieces=[data[:len(data)//2],data[len(data)//2:]]
  for part,piece in zip(self.manifest['parts'],pieces):
   (self.fixture/part['name']).write_bytes(piece);part['bytes']=len(piece);part['sha256']=hashlib.sha256(piece).hexdigest()
  self.write_manifest();result=self.run_script();self.assertNotEqual(result.returncode,0);self.assertFalse((self.cache_root()/'package').exists());self.assertEqual(list(self.root.rglob('escape.txt')),[])
 def test_verified_patch_is_downloaded_without_running_it(self):
  patch=[]
  for name in ['Install.ps1','InstallerSupport.ps1','Get-BeastCloud.ps1','GITHUB-INSTALL.md','BeastCloud.Server.dll']:
   content=b'throw "Patch must not execute in DownloadOnly mode"';(self.fixture/name).write_bytes(content);patch.append(dict(name=name,bytes=len(content),sha256=hashlib.sha256(content).hexdigest()))
  self.manifest['installerPatch']=dict(version='0.1.2',files=patch);self.write_manifest()
  result=self.run_script();self.assertEqual(result.returncode,0,result.stdout+result.stderr);self.assertTrue((self.cache_root()/'installer-0.1.2/Install.ps1').exists());self.assertIn('Verified installer revision 0.1.2',result.stdout)
 def test_bad_installer_patch_is_rejected(self):
  patch=[]
  for name in ['Install.ps1','InstallerSupport.ps1','Get-BeastCloud.ps1','GITHUB-INSTALL.md','BeastCloud.Server.dll']:
   content=b'fixture';(self.fixture/name).write_bytes(content);patch.append(dict(name=name,bytes=len(content),sha256='0'*64))
  self.manifest['installerPatch']=dict(version='0.1.2',files=patch);self.write_manifest()
  result=self.run_script();self.assertNotEqual(result.returncode,0);self.assertFalse((self.cache_root()/'installer-0.1.2/Install.ps1').exists())
 def test_cache_symlink_refused(self):
  if os.name=='nt':self.skipTest('requires fixture symlink privilege')
  elsewhere=self.root/'elsewhere';elsewhere.mkdir();self.cache.symlink_to(elsewhere,target_is_directory=True);result=self.run_script();self.assertNotEqual(result.returncode,0);self.assertEqual(list(elsewhere.iterdir()),[])
if __name__=='__main__':unittest.main(verbosity=2)
