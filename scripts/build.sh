#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DOTNET_CLI_TELEMETRY_OPTOUT=1
npm --prefix src/web ci --no-audit --no-fund
npm --prefix src/web run build
dotnet restore src/BeastCloud.Server --locked-mode
dotnet restore src/BeastCloud.Sync --locked-mode
for target in win-x64 linux-x64; do
  dotnet publish src/BeastCloud.Server -c Release -r "$target" --self-contained true -o "releases/BeastCloud-0.1.0-$target/server"
  dotnet publish src/BeastCloud.Sync -c Release -r "$target" --self-contained true -o "releases/BeastCloud-0.1.0-$target/sync"
done
python3 scripts/licenses.py
python3 scripts/package.py
