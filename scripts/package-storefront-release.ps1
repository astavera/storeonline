# Packages one clean, committed Storefront revision for SCP transfer to the VPS.

[CmdletBinding()]
param(
    [string]$Ref = "HEAD",
    [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repositoryRoot "output/releases"
}
elseif (-not [System.IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory = Join-Path $repositoryRoot $OutputDirectory
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)

$status = & git -C $repositoryRoot status --porcelain
if ($LASTEXITCODE -ne 0) {
    throw "GIT_STATUS_FAILED"
}
if ($status) {
    throw "WORKTREE_NOT_CLEAN: Commit or intentionally remove every change before packaging."
}

$commit = (& git -C $repositoryRoot rev-parse --verify "$Ref^{commit}").Trim()
if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') {
    throw "GIT_REF_INVALID: $Ref"
}

$shortCommit = $commit.Substring(0, 12)
$releaseName = "storefront-$shortCommit"
[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null

$archivePath = Join-Path $OutputDirectory "$releaseName.tar.gz"
$checksumPath = "$archivePath.sha256"
$metadataPath = Join-Path $OutputDirectory "$releaseName.json"

foreach ($path in @($archivePath, $checksumPath, $metadataPath)) {
    if (Test-Path -LiteralPath $path) {
        throw "RELEASE_OUTPUT_ALREADY_EXISTS: $path"
    }
}

& git -C $repositoryRoot archive --format=tar.gz --output=$archivePath $commit
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $archivePath)) {
    throw "GIT_ARCHIVE_FAILED"
}

$checksum = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText(
    $checksumPath,
    "$checksum  $([System.IO.Path]::GetFileName($archivePath))`n",
    [System.Text.UTF8Encoding]::new($false)
)

$metadata = [ordered]@{
    service = "storefront"
    commit = $commit
    release = $releaseName
    createdAtUtc = [DateTime]::UtcNow.ToString("o")
}
[System.IO.File]::WriteAllText(
    $metadataPath,
    (($metadata | ConvertTo-Json) + "`n"),
    [System.Text.UTF8Encoding]::new($false)
)

Write-Output "STOREFRONT_RELEASE_CREATED"
Write-Output $archivePath
Write-Output $checksumPath
Write-Output $metadataPath
