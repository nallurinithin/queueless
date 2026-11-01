<#
.SYNOPSIS
  QueueLess MongoDB Database Restore Script
.DESCRIPTION
  Restores a MongoDB database from an archive file created by mongodump.
#>
param(
  [Parameter(Mandatory=$true)]
  [string]$ArchiveFile,
  [string]$DbUri = $(if ($env:MONGODB_URI) { $env:MONGODB_URI } else { "mongodb://localhost:27017/queueless_dev" })
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $ArchiveFile)) {
  Write-Error "Backup archive file not found: $ArchiveFile"
  exit 1
}

Write-Host "==> Starting QueueLess Database Restore..." -ForegroundColor Yellow
Write-Host "    Source Archive:  $ArchiveFile"
Write-Host "    Target Database: $DbUri"

try {
  mongorestore --uri="$DbUri" --archive="$ArchiveFile" --gzip --drop
  if ($LASTEXITCODE -eq 0) {
    Write-Host "==> Database Restore Completed Successfully!" -ForegroundColor Green
  } else {
    Write-Error "mongorestore failed."
  }
} catch {
  Write-Error "Restore encountered an error: $_"
}
