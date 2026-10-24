function Assert-NoReparse([string]$Path) {
 $p=[IO.DirectoryInfo]::new([IO.Path]::GetFullPath($Path))
 while($p){if($p.Exists -and ($p.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw "Reparse point refused: $($p.FullName)"};$p=$p.Parent}
}
function Test-BeastPackage([string]$Package) {
 $manifestPath=Join-Path $Package 'manifest.json'
 if(!(Test-Path $manifestPath)){throw 'Release manifest missing.'}
 $m=Get-Content $manifestPath -Raw|ConvertFrom-Json
 if($m.format -ne 1 -or $m.platform -ne 'win-x64' -or $m.version -notmatch '^\d+\.\d+\.\d+$'){throw 'Unsupported package manifest.'}
 foreach($p in $m.files.PSObject.Properties){
  if([IO.Path]::IsPathRooted($p.Name) -or $p.Name -match '(^|[\\/])\.\.([\\/]|$)' -or $p.Name.Contains(':')){throw 'Unsafe manifest path.'}
  $file=Join-Path $Package $p.Name
  Assert-NoReparse $file
  if(!(Test-Path $file -PathType Leaf) -or (Get-Item $file).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Package file missing or unsafe.'}
  if((Get-FileHash $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $p.Value){throw "Package checksum mismatch: $($p.Name)"}
 }
 foreach($file in Get-ChildItem $Package -File -Recurse){$relative=$file.FullName.Substring($Package.TrimEnd('\').Length+1).Replace('\','/');if($relative -ne 'manifest.json' -and !$m.files.PSObject.Properties[$relative]){throw "Unlisted package file: $relative"}}
 foreach($required in @('server/BeastCloud.Server.exe','sync/BeastCloud.Sync.exe','scripts/Install.ps1','scripts/Maintain.ps1')){if(!$m.files.PSObject.Properties[$required]){throw "Missing required package member: $required"}}
 return $m
}
