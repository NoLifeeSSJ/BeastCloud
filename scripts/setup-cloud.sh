#!/usr/bin/env bash
set -euo pipefail
# Linux cloud development only. The installed Windows product does not run this.
cd /workspace/BeastCloud
mkdir -p /workspace/tools
if [ ! -x /workspace/tools/dotnet/dotnet ]; then
python3 - <<'PY'
import urllib.request,json,hashlib,pathlib,tarfile
base=pathlib.Path('/workspace/tools')
metadata=json.load(urllib.request.urlopen('https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json'))
sdk=next(s for r in metadata['releases'] for s in r.get('sdks',[]) if s['version']=='10.0.402')
artifact=next(f for f in sdk['files'] if f['rid']=='linux-x64' and f['name'].endswith('.tar.gz'))
archive=base/'dotnet-sdk-10.0.402-linux-x64.tar.gz'
with urllib.request.urlopen(artifact['url']) as source,archive.open('wb') as target:
    while data:=source.read(1024*1024):target.write(data)
with archive.open('rb') as f:actual=hashlib.file_digest(f,'sha512').hexdigest()
if actual.lower()!=artifact['hash'].lower():raise SystemExit('Official SDK SHA512 mismatch')
(base/'dotnet').mkdir(exist_ok=True)
with tarfile.open(archive) as bundle:bundle.extractall(base/'dotnet',filter='data')
archive.unlink()
PY
fi
export PATH="/workspace/tools/dotnet:$PATH"
export DOTNET_ROOT=/workspace/tools/dotnet
export DOTNET_CLI_HOME=/workspace/tools/dotnet-home
export NUGET_PACKAGES=/workspace/tools/nuget
export npm_config_cache=/workspace/tools/npm
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_NOLOGO=1
node --version
dotnet --version
npm --prefix src/web ci --no-audit --no-fund
npm --prefix src/web run build
dotnet restore BeastCloud.sln --locked-mode
dotnet build BeastCloud.sln --no-restore
