"""Publish a checksum-verified installer fix while reusing the immutable app ZIP."""
from pathlib import Path
import hashlib,json,shutil
root=Path(__file__).resolve().parents[1]
destination=root/'distribution/0.1.0/installer';destination.mkdir(exist_ok=True)
metadata=[]
for name in ('Install.ps1','InstallerSupport.ps1','Get-BeastCloud.ps1','GITHUB-INSTALL.md','BeastCloud.Server.dll'):
    source=(root/'.local/installer-runtime-0.1.2/win-x64'/name) if name.endswith('.dll') else root/('docs' if name.endswith('.md') else 'scripts')/name
    shutil.copyfile(source,destination/name)
    data=source.read_bytes()
    metadata.append(dict(name=name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest()))
manifest=root/'distribution/0.1.0/download.json'
data=json.loads(manifest.read_text());data['installerPatch']=dict(version='0.1.2',files=metadata)
manifest.write_text(json.dumps(data,indent=2)+'\n')
print('Installer revision 0.1.2 prepared; application archive and download parts unchanged')
