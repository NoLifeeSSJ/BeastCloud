from pathlib import Path
import hashlib,json,shutil,zipfile
root=Path(__file__).resolve().parent.parent
for target in ('win-x64','linux-x64'):
    package=root/'releases'/f'BeastCloud-0.1.0-{target}'
    if not (package/'server').exists():continue
    for folder in ('scripts','docs'):
        shutil.copytree(root/folder,package/folder,dirs_exist_ok=True)
    for file in ('README.md','THIRD-PARTY-NOTICES.md'):
        shutil.copy2(root/file,package/file)
    files={str(p.relative_to(package)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(package.rglob('*')) if p.is_file() and p.name!='manifest.json'}
    (package/'manifest.json').write_text(json.dumps(dict(format=1,version='0.1.0',platform=target,sdk='10.0.402',files=files),indent=2))
    archive=package.parent/(package.name+'.zip')
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in sorted(package.rglob('*')):
            if p.is_file():z.write(p,str(p.relative_to(package)))
    archive.with_suffix('.zip.sha256').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
    print(archive,archive.stat().st_size)
