param(
  [string]$Version
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot "release"
$appConfigPath = Join-Path $projectRoot "apps\mobile\app.json"
$apkPath = Join-Path $projectRoot "apps\mobile\android\app\build\outputs\apk\release\app-release.apk"

if ([string]::IsNullOrWhiteSpace($Version)) {
  $appConfig = Get-Content -LiteralPath $appConfigPath -Raw | ConvertFrom-Json
  $Version = $appConfig.expo.version
}

if ($Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$') {
  throw "Version must use semantic versioning."
}

$bundleName = "Roomark-$Version"
$bundleRoot = Join-Path $releaseRoot $bundleName
$zipPath = Join-Path $releaseRoot "$bundleName.zip"
$resolvedProject = [System.IO.Path]::GetFullPath($projectRoot)
$resolvedRelease = [System.IO.Path]::GetFullPath($releaseRoot)
$resolvedBundle = [System.IO.Path]::GetFullPath($bundleRoot)

if (-not $resolvedRelease.StartsWith($resolvedProject, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Release directory must stay inside the Roomark project."
}

if (-not $resolvedBundle.StartsWith($resolvedRelease, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Bundle directory must stay inside the release directory."
}

Push-Location $projectRoot
try {
  $status = & git.exe status --porcelain
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect the Git working tree."
  }
  if ($status) {
    throw "The working tree must be clean before creating a release bundle."
  }

  & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "product-verify.ps1") -Full -RequireApk
  if ($LASTEXITCODE -ne 0) {
    throw "Product verification failed."
  }

  $commit = (& git.exe rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to resolve the release commit."
  }

  New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
  if (Test-Path -LiteralPath $bundleRoot) {
    Remove-Item -LiteralPath $bundleRoot -Recurse -Force
  }
  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }

  New-Item -ItemType Directory -Force -Path $bundleRoot | Out-Null
  $sourceArchive = Join-Path $bundleRoot "Roomark-source-$Version.zip"
  & git.exe archive --format=zip --output=$sourceArchive HEAD
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to create the source archive."
  }

  Copy-Item -LiteralPath $apkPath -Destination (Join-Path $bundleRoot "Roomark-android-$Version.apk")
  @(
    "Roomark $Version",
    "Commit: $commit",
    "License: MIT"
  ) | Set-Content -LiteralPath (Join-Path $bundleRoot "VERSION.txt") -Encoding UTF8

  $hashFile = Join-Path $bundleRoot "SHA256SUMS.txt"
  Get-ChildItem -LiteralPath $bundleRoot -File |
    Where-Object { $_.FullName -ne $hashFile } |
    Sort-Object Name |
    ForEach-Object {
      $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      "$hash  $($_.Name)"
    } |
    Set-Content -LiteralPath $hashFile -Encoding ASCII

  Compress-Archive -LiteralPath $bundleRoot -DestinationPath $zipPath -CompressionLevel Optimal
  $zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $zipHash | Set-Content -LiteralPath "$zipPath.sha256" -Encoding ASCII

  Write-Host "Release bundle: $zipPath"
  Write-Host "SHA-256:        $zipHash"
} finally {
  Pop-Location
}
