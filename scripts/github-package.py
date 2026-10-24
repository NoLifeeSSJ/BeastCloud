"""Split the verified offline ZIP into GitHub-compatible files; no service/user data."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]
archive=root/'releases/BeastCloud-0.1.0-win-x64.zip'
out=root/'distribution/0.1.0';out.mkdir(parents=True,exist_ok=True)
parts=[]
with archive.open('rb') as source:
    while data:=source.read(32*1024*1024):
        name=archive.name+f'.part{len(parts)+1:03}'
        (out/name).write_bytes(data)
        parts.append(dict(name=name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest()))
with archive.open('rb') as source:checksum=hashlib.file_digest(source,'sha256').hexdigest()
manifest=dict(format=1,version='0.1.0',platform='win-x64',archive=archive.name,bytes=archive.stat().st_size,sha256=checksum,parts=parts)
(out/'download.json').write_text(json.dumps(manifest,indent=2)+'\n')
actual=hashlib.sha256()
for part in parts:actual.update((out/part['name']).read_bytes())
assert actual.hexdigest()==checksum
print('Prepared',len(parts),'parts;',manifest['bytes'],'bytes; reassembly SHA256 verified')
