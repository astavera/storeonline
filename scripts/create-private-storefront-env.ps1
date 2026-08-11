# Creates a private local storefront environment file from approved operator inputs.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string[]]$SourceEnvPaths,
    [Parameter(Mandatory = $true)]
    [string]$DatabaseEnvPath,
    [Parameter(Mandatory = $true)]
    [string]$TargetPath,
    [string]$StorefrontUrl = "https://shop.srv1849559.hstgr.cloud",
    [string]$OrderProAdminUrl = "https://operations.modernstate.com"
)

$ErrorActionPreference = "Stop"

if (Test-Path -LiteralPath $TargetPath) {
    throw "TARGET_ENV_ALREADY_EXISTS: $TargetPath"
}
foreach ($path in @($SourceEnvPaths + $DatabaseEnvPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "ENV_FILE_NOT_FOUND: $path"
    }
}

$values = [ordered]@{}
foreach ($path in $SourceEnvPaths) {
    foreach ($line in Get-Content -LiteralPath $path) {
        if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
            continue
        }
        $values[$Matches[1]] = $Matches[2].Trim()
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

$password = Read-UnquotedEnvValue -Path $DatabaseEnvPath -Name "STOREFRONT_DB_PASSWORD"
if ($password -notmatch '^[A-Za-z0-9_-]{40,}$') {
    throw "STOREFRONT_DATABASE_PASSWORD_FORMAT_INVALID"
}

$values["DATABASE_URL"] = "`"postgresql://storefront_app:$password@storefront-postgres:5432/storefront_prod?schema=public&connection_limit=20&pool_timeout=10`""
$values["DIRECT_URL"] = "`"postgresql://storefront_app:$password@storefront-postgres:5432/storefront_prod?schema=public`""
$values["NEXT_PUBLIC_SITE_URL"] = "`"$StorefrontUrl`""
$values["NEXT_PUBLIC_SITE_INDEXABLE"] = "false"
$values["STOREFRONT_DATABASE_NETWORK"] = "storefront-production-database"
$values["STOREFRONT_ORDERPRO_NETWORK"] = "storefront-orderpro-private"
$values["STOREFRONT_GATEWAY_NETWORK"] = "storefront-public-gateway"
$values["SQUARE_ENVIRONMENT"] = "production"
$values["SQUARE_ALLOW_PRODUCTION_READONLY_SYNC"] = "true"
$values["SQUARE_CHECKOUT_ENABLED"] = "false"
$values["ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED"] = "false"
$values["ORDERPRO_SHIPPING_CHECKOUT_ENABLED"] = "false"
$values["ORDERPRO_ADMIN_URL"] = "`"$OrderProAdminUrl`""
$values["ORDERPRO_API_BASE_URL"] = "`"http://orderpro-api:3000`""
$values["ADMIN_ALLOWED_ORIGINS"] = "`"$StorefrontUrl`""
$values["ADMIN_DEV_BYPASS"] = "false"
$values["ALLOW_LOCAL_PERSISTENCE_FALLBACK"] = "false"
$values["CUSTOMER_AUTH_DEV_PREVIEW"] = "false"
$values["SHIPPO_TEST_MODE"] = "true"

if ($values.Contains("ADMIN_PASSWORD_HASH")) {
    $adminPasswordHash = $values["ADMIN_PASSWORD_HASH"].Trim().Trim('"').Trim("'").Replace('\$', '$')
    $values["ADMIN_PASSWORD_HASH"] = "'$adminPasswordHash'"
}

if (-not $values.Contains("WEBHOOK_WORKER_SECRET") -or [string]::IsNullOrWhiteSpace(($values["WEBHOOK_WORKER_SECRET"] -replace '["'']', ''))) {
    $values["WEBHOOK_WORKER_SECRET"] = New-Secret
}

$required = @(
    "DATABASE_URL",
    "DIRECT_URL",
    "SQUARE_ACCESS_TOKEN",
    "ADMIN_SESSION_SECRET",
    "ADMIN_LOGIN_EMAIL",
    "ADMIN_PASSWORD_HASH",
    "WEBHOOK_WORKER_SECRET"
)
foreach ($name in $required) {
    if (-not $values.Contains($name) -or [string]::IsNullOrWhiteSpace(($values[$name] -replace '^["'']|["'']$', ''))) {
        throw "REQUIRED_ENV_VALUE_MISSING: $name"
    }
}

$directory = Split-Path -Parent $TargetPath
[System.IO.Directory]::CreateDirectory($directory) | Out-Null
$content = ($values.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`n"
[System.IO.File]::WriteAllText(
    [System.IO.Path]::GetFullPath($TargetPath),
    "$content`n",
    [System.Text.UTF8Encoding]::new($false)
)

Write-Output "PRIVATE_STOREFRONT_ENV_CREATED"
Write-Output ([System.IO.Path]::GetFullPath($TargetPath))
