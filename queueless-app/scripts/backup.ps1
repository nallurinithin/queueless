<#
.SYNOPSIS
  QueueLess MongoDB Database Backup Script
.DESCRIPTION
  Performs an automated mongodump backup to an archive file with timestamping.
#>
param(
  [string]$DbUri = $(if ($env:MONGODB_URI) { $env:MONGODB_URI } else { "mongodb://localhost:27017/queueless_dev" }),
  [string]$BackupDir = "backups"
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
if (!(Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$archiveFile = Join-Path $BackupDir "queueless_backup_$timestamp.archive"

Write-Host "==> Starting QueueLess Database Backup..." -ForegroundColor Cyan
Write-Host "    Target Database: $DbUri"
Write-Host "    Backup Archive:  $archiveFile"

try {
  mongodump --uri="$DbUri" --archive="$archiveFile" --gzip
  if ($LASTEXITCODE -eq 0 -and (Test-Path $archiveFile)) {
    $size = (Get-Item $archiveFile).Length / 1KB
    Write-Host "==> Backup Succeeded! Archive size: $($size.ToString('F2')) KB" -ForegroundColor Green
  } else {
    Write-Error "mongodump failed or archive was not generated."
  }
} catch {
  Write-Error "Backup encountered an error: $_"
}

