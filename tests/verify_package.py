from pathlib import Path
import json,hashlib,zipfile,sys
archive=Path(sys.argv[1] if len(sys.argv)>1 else 'releases/BeastCloud-0.1.0-win-x64.zip')
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None,'ZIP CRC failure'
    manifest=json.loads(z.read('manifest.json'))
    assert manifest['platform']=='win-x64'
    assert set(z.namelist())==set(manifest['files'])|{'manifest.json'},'Unexpected or missing archive members'
    for name,expected in manifest['files'].items():
        assert not name.startswith(('/','\\')) and '..' not in name.split('/'),'Unsafe archive name'
        assert hashlib.sha256(z.read(name)).hexdigest()==expected,name
    for required in ['server/BeastCloud.Server.exe','sync/BeastCloud.Sync.exe','scripts/Install.ps1','scripts/Maintain.ps1','server/wwwroot/index.html']:
        assert required in manifest['files'],required
expected=archive.with_suffix('.zip.sha256').read_text().split()[0]
assert hashlib.sha256(archive.read_bytes()).hexdigest()==expected,'Archive SHA256 mismatch'
print('PASS: ZIP CRC, exact membership, manifest SHA256, archive SHA256 and required runtime members:',len(manifest['files']),'files,',archive.stat().st_size,'bytes')
