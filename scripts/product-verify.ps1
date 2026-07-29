param(
  [switch]$Full,
  [switch]$Live,
  [switch]$RequireApk
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$failures = [System.Collections.Generic.List[string]]::new()

function Test-RequiredFile {
  param([string]$RelativePath)

  $fullPath = Join-Path $projectRoot $RelativePath
  if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
    Write-Host "[PASS] file $RelativePath"
    return
  }

  Write-Host "[FAIL] file $RelativePath"
  $failures.Add("Missing file: $RelativePath")
}

function Test-ServiceUrl {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
      Write-Host "[PASS] url  $Url"
      return
    }

    $failures.Add("Unexpected HTTP status for $Url`: $($response.StatusCode)")
  } catch {
    $failures.Add("Unavailable URL: $Url")
  }
}

function Invoke-Validation {
  param(
    [string]$Label,
    [string]$WorkingDirectory,
    [string]$FilePath,
    [string[]]$Arguments
  )

  Write-Host "[RUN ] $Label"
  Push-Location $WorkingDirectory
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$Label exited with code $LASTEXITCODE"
    }
    Write-Host "[PASS] $Label"
  } catch {
    Write-Host "[FAIL] $Label"
    $failures.Add($_.Exception.Message)
  } finally {
    Pop-Location
  }
}

Write-Host "Roomark product verification"
Write-Host "Project: $projectRoot"
Write-Host ""

$requiredFiles = @(
  "README.md",
  "README.en.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "SUPPORT.md",
  "docs\product\release-guide.md",
  "docs\product\roomark-android-verification.md",
  "docs\technical\backend.md",
  "apps\mobile\app.json",
  "apps\website\index.html",
  "apps\web-preview\index.html",
  "apps\web-furnish\index.html",
  "services\backend\Cargo.toml",
  "services\backend\Dockerfile",
  ".env.example",
  ".github\workflows\ci.yml",
  ".github\workflows\pages.yml",
  "docs\images\product\roomark-overview.jpg",
  "docs\images\product\roomark-map.jpg",
  "docs\images\product\roomark-decision.jpg",
  "docs\images\product\roomark-furnishing.jpg"
)

foreach ($file in $requiredFiles) {
  Test-RequiredFile -RelativePath $file
}

if ($RequireApk) {
  Test-RequiredFile -RelativePath "apps\mobile\android\app\build\outputs\apk\release\app-release.apk"
}

if ($Live) {
  Write-Host ""
  Test-ServiceUrl -Url "http://127.0.0.1:5190/"
  Test-ServiceUrl -Url "http://127.0.0.1:5190/web-furnish/index.html"
  Test-ServiceUrl -Url "http://127.0.0.1:5192/"
  Test-ServiceUrl -Url "http://127.0.0.1:8080/health"
}

if ($Full) {
  Write-Host ""
  $mobilePath = Join-Path $projectRoot "apps\mobile"
  $backendPath = Join-Path $projectRoot "services\backend"

  Invoke-Validation -Label "Mobile verification" -WorkingDirectory $mobilePath -FilePath "npm.cmd" -Arguments @("run", "verify")
  Invoke-Validation -Label "Repository contracts" -WorkingDirectory $projectRoot -FilePath "node.exe" -Arguments @(
    "--test",
    "apps\web-preview\tests\*.test.cjs",
    "apps\web-furnish\tests\*.test.cjs",
    "apps\website\tests\*.test.cjs",
    "scripts\tests\*.test.cjs"
  )
  Invoke-Validation -Label "Public content policy" -WorkingDirectory $projectRoot -FilePath "node.exe" -Arguments @(
    "--test",
    "scripts\tests\public-repository-policy.test.cjs"
  )

  $javascriptFiles = @(
    "apps\web-preview\script.js",
    "apps\web-preview\map.js",
    "apps\web-preview\plan-to-3d.js",
    "apps\web-preview\roomark-3d.js",
    "apps\web-furnish\scene.js",
    "apps\website\script.js",
    "apps\website\server.cjs"
  )
  foreach ($file in $javascriptFiles) {
    Invoke-Validation -Label "JavaScript syntax: $file" -WorkingDirectory $projectRoot -FilePath "node.exe" -Arguments @("--check", $file)
  }

  Invoke-Validation -Label "Backend tests" -WorkingDirectory $backendPath -FilePath "cargo.exe" -Arguments @("test", "--locked")
  Invoke-Validation -Label "Backend formatting" -WorkingDirectory $backendPath -FilePath "cargo.exe" -Arguments @("fmt", "--check")
}

Write-Host ""
if ($failures.Count -gt 0) {
  Write-Host "Verification failed with $($failures.Count) issue(s):"
  foreach ($failure in $failures) {
    Write-Host "- $failure"
  }
  exit 1
}

Write-Host "Verification passed."
