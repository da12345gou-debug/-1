param(
  [string]$BaseUrl = "https://landing-page-extension-tool.onrender.com",
  [string]$AdminPassword = "DUUE2026_OWNER",
  [int]$Days = 5,
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

$base = $BaseUrl.TrimEnd("/")
if (-not $OutputDir) {
  $desktop = [Environment]::GetFolderPath("Desktop")
  $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $OutputDir = Join-Path $desktop "GTM_Workbench_Public_Generated_Images_Last_$($Days)_Days_$stamp"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$headers = @{ "X-Admin-Password" = $AdminPassword }
$listUrl = "$base/api/admin/generated-images?days=$Days"
$data = Invoke-RestMethod -Method Get -Uri $listUrl -Headers $headers
$items = @($data.images)

if ($items.Count -eq 0) {
  @(
    "No generated images were found on the public server in the last $Days days.",
    "Checked at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "Base URL: $base",
    "Note: old images may be gone if the Render service restarted or redeployed without persistent disk."
  ) | Set-Content -LiteralPath (Join-Path $OutputDir "no-public-images-found.txt") -Encoding UTF8
  Write-Output "Downloaded=0"
  Write-Output "Folder=$OutputDir"
  exit 0
}

$manifest = foreach ($item in $items) {
  $safeTool = ($item.toolName -replace '[\\/:*?"<>|]', "_")
  $toolDir = Join-Path $OutputDir $safeTool
  New-Item -ItemType Directory -Force -Path $toolDir | Out-Null

  $safeName = ($item.filename -replace '[\\/:*?"<>|]', "_")
  $timePrefix = ([DateTime]$item.createdAt).ToLocalTime().ToString("yyyyMMdd_HHmmss")
  $targetPath = Join-Path $toolDir "$timePrefix`_$safeName"
  $downloadUrl = "$base$($item.downloadUrl)"
  Invoke-WebRequest -Method Get -Uri $downloadUrl -Headers $headers -OutFile $targetPath | Out-Null

  [PSCustomObject]@{
    Tool = $item.toolName
    CreatedAt = ([DateTime]$item.createdAt).ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")
    Filename = $item.filename
    Size = $item.size
    LocalPath = $targetPath
  }
}

$manifest | Export-Csv -LiteralPath (Join-Path $OutputDir "public-generated-images-manifest.csv") -NoTypeInformation -Encoding UTF8

Write-Output "Downloaded=$($items.Count)"
Write-Output "Folder=$OutputDir"
