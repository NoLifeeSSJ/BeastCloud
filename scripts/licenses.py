from pathlib import Path
import os,json,shutil,xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1]
output=root/'docs'/'third-party-licenses';output.mkdir(parents=True,exist_ok=True)
cache=Path(os.environ.get('NUGET_PACKAGES',str(Path.home()/'.nuget/packages')))
inventory=[]
for project in ('BeastCloud.Server','BeastCloud.Sync'):
    lock=json.loads((root/'src'/project/'packages.lock.json').read_text())
    for target,packages in lock['dependencies'].items():
        for name,item in packages.items():
            if item.get('type')=='Project':continue
            version=item['resolved'];folder=cache/name.lower()/version
            if not folder.exists():continue
            dest=output/'nuget'/f'{name}-{version}';dest.mkdir(parents=True,exist_ok=True)
            for file in folder.rglob('*'):
                if file.is_file() and any(k in file.name.lower() for k in ['license','notice','copying','copyright']):
                    rel=file.relative_to(folder);(dest/rel).parent.mkdir(parents=True,exist_ok=True);shutil.copy2(file,dest/rel)
            for spec in folder.glob('*.nuspec'):
                document=ET.parse(spec);license=next((e.text for e in document.iter() if e.tag.endswith('}license') or e.tag=='license'),'See upstream package')
                inventory.append(dict(package=name,version=version,license=license,project=project,target=target))
for name in ('react','react-dom','scheduler','lucide-react'):
    folder=root/'src/web/node_modules'/name;manifest=json.loads((folder/'package.json').read_text());dest=output/'npm'/name;dest.mkdir(parents=True,exist_ok=True)
    for file in folder.glob('*'):
        if file.is_file() and any(k in file.name.lower() for k in ['license','notice','copyright']):shutil.copy2(file,dest/file.name)
    inventory.append(dict(package=name,version=manifest['version'],license=manifest.get('license'),project='web'))
(output/'inventory.json').write_text(json.dumps(inventory,indent=2))
print('Wrote license files and',len(inventory),'resolved dependency records')
