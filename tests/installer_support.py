"""Portable PowerShell regressions for Windows installer helper behavior."""
import unittest,tempfile,subprocess,os,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PWSH=os.environ.get('PWSH','pwsh')
ENV={**os.environ,'XDG_CACHE_HOME':'/workspace/tools/cache','XDG_CONFIG_HOME':'/workspace/tools/config','XDG_DATA_HOME':'/workspace/tools/data'}
def quote(value):return "'"+str(value).replace("'","''")+"'"
class InstallerSupport(unittest.TestCase):
 def ps(self,code):
  with tempfile.TemporaryDirectory(prefix='beast-support-') as folder:
   p=Path(folder)/'test.ps1';p.write_text("$ErrorActionPreference='Stop'\n. "+quote(ROOT/'scripts/InstallerSupport.ps1')+'\n'+code)
   return subprocess.run([PWSH,'-NoProfile','-File',str(p)],env=ENV,text=True,capture_output=True,timeout=15)
 def test_certificate_san_is_one_string(self):
  r=self.ps("New-BeastCertificateParameters -ComputerName 'BEAST-TEST' | ConvertTo-Json -Depth 4")
  self.assertEqual(r.returncode,0,r.stderr);p=json.loads(r.stdout);self.assertEqual(len(p['TextExtension']),2);self.assertEqual(p['TextExtension'][1],'2.5.29.17={text}DNS=localhost&DNS=BEAST-TEST&IPAddress=127.0.0.1');self.assertEqual(p['KeyLength'],3072);self.assertEqual(p['HashAlgorithm'],'SHA256')
 def test_lan_certificate_has_explicit_ip_in_same_san(self):
  r=self.ps("New-BeastCertificateParameters -ComputerName 'BEAST-TEST' -Lan -LanAddress '192.168.1.50' | ConvertTo-Json -Depth 4")
  self.assertEqual(r.returncode,0,r.stderr);p=json.loads(r.stdout);self.assertEqual(len(p['TextExtension']),2);self.assertTrue(p['TextExtension'][1].endswith('&IPAddress=127.0.0.1&IPAddress=192.168.1.50'))
 def test_setup_log_redacts_known_secret(self):
  with tempfile.TemporaryDirectory(prefix='beast-log-') as folder:
   log=Path(folder)/'setup.log';r=self.ps("Write-BeastSetupLog -Path "+quote(log)+" -Message 'Failed: fixture-secret' -Secrets @('fixture-secret');Write-BeastSetupLog -Path "+quote(log)+" -Message 'Next stage'")
   self.assertEqual(r.returncode,0,r.stderr);text=log.read_text();self.assertNotIn('fixture-secret',text);self.assertIn('[redacted]',text);self.assertIn('Next stage',text)
 def test_early_failure_is_logged_before_root_creation(self):
  if os.name=='nt':self.skipTest('Portable negative-platform fixture')
  with tempfile.TemporaryDirectory(prefix='beast-early-') as folder:
   log=Path(folder)/'early.log'
   r=subprocess.run([PWSH,'-NoProfile','-File',str(ROOT/'scripts/Install.ps1'),'-SetupLogPath',str(log)],env=ENV,capture_output=True,text=True,timeout=15)
   self.assertNotEqual(r.returncode,0);self.assertTrue(log.exists(),r.stdout+r.stderr);text=log.read_text();self.assertIn('FAILED during Checking Windows and arguments',text);self.assertIn('requires Windows',text);self.assertIn(str(log),r.stdout)
 def test_setup_log_does_not_follow_symlink(self):
  if os.name=='nt':self.skipTest('Portable symlink fixture')
  with tempfile.TemporaryDirectory(prefix='beast-log-link-') as folder:
   protected=Path(folder)/'protected';protected.write_text('preserve');link=Path(folder)/'log';link.symlink_to(protected)
   r=self.ps("Write-BeastSetupLog -Path "+quote(link)+" -Message 'overwrite'");self.assertNotEqual(r.returncode,0);self.assertEqual(protected.read_text(),'preserve')
if __name__=='__main__':unittest.main(verbosity=2)
