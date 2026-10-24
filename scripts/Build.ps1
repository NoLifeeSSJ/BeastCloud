#requires -Version 5.1
$ErrorActionPreference='Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try{
 $env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
 & npm.cmd --prefix src/web ci --no-audit --no-fund;if($LASTEXITCODE){throw 'npm install failed'}
 & npm.cmd --prefix src/web run build;if($LASTEXITCODE){throw 'Frontend build failed'}
 foreach($project in @('BeastCloud.Server','BeastCloud.Sync')){
  & dotnet restore "src/$project" --locked-mode;if($LASTEXITCODE){throw 'Restore failed'}
  $dir='server';if($project -eq 'BeastCloud.Sync'){$dir='sync'}
  & dotnet publish "src/$project" -c Release -r win-x64 --self-contained true -o "releases/BeastCloud-0.1.0-win-x64/$dir";if($LASTEXITCODE){throw 'Publish failed'}
 }
 $package=Join-Path (Get-Location) 'releases/BeastCloud-0.1.0-win-x64'
 Copy-Item scripts "$package/scripts" -Recurse -Force
 Copy-Item docs "$package/docs" -Recurse -Force
 Copy-Item THIRD-PARTY-NOTICES.md $package
 $files=[ordered]@{}
 Get-ChildItem $package -File -Recurse|Where-Object {$_.Name -ne 'manifest.json'}|Sort-Object FullName|ForEach-Object {$relative=$_.FullName.Substring($package.Length+1).Replace('\','/');$files[$relative]=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
 @{format=1;version='0.1.0';platform='win-x64';sdk='10.0.402';files=$files}|ConvertTo-Json -Depth 6|Set-Content "$package/manifest.json" -Encoding UTF8
 Compress-Archive -Path "$package/*" -DestinationPath 'releases/BeastCloud-0.1.0-win-x64.zip' -Force
 Get-FileHash 'releases/BeastCloud-0.1.0-win-x64.zip' -Algorithm SHA256
}finally{Pop-Location}
