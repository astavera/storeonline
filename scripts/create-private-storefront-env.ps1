# Creates separate private Storefront runtime and Prisma migrator environment files.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string[]]$SourceEnvPaths,
    [Parameter(Mandatory = $true)]
    [string]$DatabaseEnvPath,
    [Parameter(Mandatory = $true)]
    [string]$RuntimeTargetPath,
    [Parameter(Mandatory = $true)]
    [string]$MigratorTargetPath,
    [string]$StorefrontUrl = "https://shop.srv1849559.hstgr.cloud",
    [string]$OrderProAdminUrl = "https://operations.modernstate.com"
)

$ErrorActionPreference = "Stop"

$runtimeTargetFullPath = [System.IO.Path]::GetFullPath($RuntimeTargetPath)
$migratorTargetFullPath = [System.IO.Path]::GetFullPath($MigratorTargetPath)
if ([string]::Equals($runtimeTargetFullPath, $migratorTargetFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "RUNTIME_AND_MIGRATOR_TARGETS_MUST_DIFFER"
}
foreach ($targetPath in @($runtimeTargetFullPath, $migratorTargetFullPath)) {
    if (Test-Path -LiteralPath $targetPath) {
        throw "TARGET_ENV_ALREADY_EXISTS: $targetPath"
    }
}
foreach ($path in @($SourceEnvPaths + $DatabaseEnvPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "ENV_FILE_NOT_FOUND: $path"
    }
}

function Read-UnquotedEnvValue([string]$Path, [string]$Name) {
    $line = Get-Content -LiteralPath $Path |
        Where-Object { $_ -match "^\s*$([Regex]::Escape($Name))\s*=" } |
        Select-Object -Last 1
    if (-not $line) {
        throw "ENV_VALUE_NOT_FOUND: $Name"
    }
    $value = ($line -split '=', 2)[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
}

function New-Secret {
    $bytes = New-Object byte[] 48
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }
    return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Write-PrivateEnvFile([string]$Path, [System.Collections.IDictionary]$Values) {
    $directory = Split-Path -Parent $Path
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    $content = ($Values.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`n"
    [System.IO.File]::WriteAllText(
        $Path,
        "$content`n",
        [System.Text.UTF8Encoding]::new($false)
    )
}

$runtimePassword = Read-UnquotedEnvValue -Path $DatabaseEnvPath -Name "STOREFRONT_RUNTIME_DB_PASSWORD"
$migratorPassword = Read-UnquotedEnvValue -Path $DatabaseEnvPath -Name "STOREFRONT_MIGRATOR_DB_PASSWORD"
foreach ($passwordRecord in @(
    @{ Name = "STOREFRONT_RUNTIME_DB_PASSWORD"; Value = $runtimePassword },
    @{ Name = "STOREFRONT_MIGRATOR_DB_PASSWORD"; Value = $migratorPassword }
)) {
    if ($passwordRecord.Value -notmatch '^[A-Za-z0-9_-]{40,}$') {
        throw "$($passwordRecord.Name)_FORMAT_INVALID"
    }
}
if ([string]::Equals($runtimePassword, $migratorPassword, [System.StringComparison]::Ordinal)) {
    throw "RUNTIME_AND_MIGRATOR_PASSWORDS_MUST_DIFFER"
}

$runtimeValues = [ordered]@{}
foreach ($path in $SourceEnvPaths) {
    foreach ($line in Get-Content -LiteralPath $path) {
        if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
            continue
        }
        $runtimeValues[$Matches[1]] = $Matches[2].Trim()
    }
}
foreach ($databaseOnlyName in @(
    "DATABASE_URL",
    "DIRECT_URL",
    "STOREFRONT_DB_PASSWORD",
    "STOREFRONT_RUNTIME_DB_PASSWORD",
    "STOREFRONT_MIGRATOR_DB_PASSWORD"
)) {
    $runtimeValues.Remove($databaseOnlyName)
}

$runtimeValues["DATABASE_URL"] = "`"postgresql://storefront_runtime:$runtimePassword@storefront-postgres:5432/storefront_prod?schema=public&connection_limit=20&pool_timeout=10`""
$runtimeValues["DIRECT_URL"] = "`"postgresql://storefront_runtime:$runtimePassword@storefront-postgres:5432/storefront_prod?schema=public`""
$runtimeValues["NEXT_PUBLIC_SITE_URL"] = "`"$StorefrontUrl`""
$runtimeValues["NEXT_PUBLIC_SITE_INDEXABLE"] = "false"
$runtimeValues["STOREFRONT_DATABASE_NETWORK"] = "storefront-production-database"
$runtimeValues["STOREFRONT_ORDERPRO_NETWORK"] = "storefront-orderpro-private"
$runtimeValues["STOREFRONT_GATEWAY_NETWORK"] = "storefront-public-gateway"
$runtimeValues["SQUARE_ENVIRONMENT"] = "production"
$runtimeValues["SQUARE_ALLOW_PRODUCTION_READONLY_SYNC"] = "true"
$runtimeValues["SQUARE_CHECKOUT_ENABLED"] = "false"
$runtimeValues["ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED"] = "false"
$runtimeValues["ORDERPRO_SHIPPING_CHECKOUT_ENABLED"] = "false"
$runtimeValues["ORDERPRO_ADMIN_URL"] = "`"$OrderProAdminUrl`""
$runtimeValues["ORDERPRO_API_BASE_URL"] = "`"http://orderpro-api:3000`""
$runtimeValues["ADMIN_ALLOWED_ORIGINS"] = "`"$StorefrontUrl`""
$runtimeValues["ADMIN_DEV_BYPASS"] = "false"
$runtimeValues["ALLOW_LOCAL_PERSISTENCE_FALLBACK"] = "false"
$runtimeValues["CUSTOMER_AUTH_DEV_PREVIEW"] = "false"
$runtimeValues["SHIPPO_TEST_MODE"] = "true"

if ($runtimeValues.Contains("ADMIN_PASSWORD_HASH")) {
    $adminPasswordHash = $runtimeValues["ADMIN_PASSWORD_HASH"].Trim().Trim('"').Trim("'").Replace('\$', '$')
    $runtimeValues["ADMIN_PASSWORD_HASH"] = "'$adminPasswordHash'"
}
if (-not $runtimeValues.Contains("WEBHOOK_WORKER_SECRET") -or [string]::IsNullOrWhiteSpace(($runtimeValues["WEBHOOK_WORKER_SECRET"] -replace '["'']', ''))) {
    $runtimeValues["WEBHOOK_WORKER_SECRET"] = New-Secret
}

foreach ($name in @(
    "DATABASE_URL",
    "DIRECT_URL",
    "SQUARE_ACCESS_TOKEN",
    "ADMIN_SESSION_SECRET",
    "ADMIN_LOGIN_EMAIL",
    "ADMIN_PASSWORD_HASH",
    "WEBHOOK_WORKER_SECRET"
)) {
    if (-not $runtimeValues.Contains($name) -or [string]::IsNullOrWhiteSpace(($runtimeValues[$name] -replace '^["'']|["'']$', ''))) {
        throw "REQUIRED_RUNTIME_ENV_VALUE_MISSING: $name"
    }
}

$migratorValues = [ordered]@{
    DATABASE_URL = "`"postgresql://storefront_migrator:$migratorPassword@storefront-postgres:5432/storefront_prod?schema=public&connection_limit=2&pool_timeout=10`""
    DIRECT_URL = "`"postgresql://storefront_migrator:$migratorPassword@storefront-postgres:5432/storefront_prod?schema=public`""
}

Write-PrivateEnvFile -Path $runtimeTargetFullPath -Values $runtimeValues
Write-PrivateEnvFile -Path $migratorTargetFullPath -Values $migratorValues

Write-Output "PRIVATE_STOREFRONT_RUNTIME_ENV_CREATED"
Write-Output $runtimeTargetFullPath
Write-Output "PRIVATE_STOREFRONT_MIGRATOR_ENV_CREATED"
Write-Output $migratorTargetFullPath
