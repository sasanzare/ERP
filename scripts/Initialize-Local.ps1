param(
    [switch] $SkipDatabase
)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $projectRoot '.env'
$testingEnvFile = Join-Path $projectRoot '.env.testing'
$phpPath = if ($env:ERP_PHP_BINARY) { $env:ERP_PHP_BINARY } else { 'C:\php8.5\php.exe' }

if (-not (Test-Path -LiteralPath $phpPath)) {
    throw "PHP executable not found at '$phpPath'. Set ERP_PHP_BINARY to the PHP 8.5 executable."
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'vendor\autoload.php'))) {
    throw 'Composer dependencies are missing. Install them before running this script.'
}

function New-HexSecret {
    $bytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()

    try {
        $generator.GetBytes($bytes)
    } finally {
        $generator.Dispose()
    }

    return ([Convert]::ToHexString($bytes)).ToLowerInvariant()
}

function Get-EnvValue([string] $path, [string] $name) {
    if (-not (Test-Path -LiteralPath $path)) {
        return ''
    }

    $prefix = "$name="
    $line = Get-Content -LiteralPath $path | Where-Object { $_.StartsWith($prefix, [StringComparison]::Ordinal) } | Select-Object -First 1

    if ($null -eq $line) {
        return ''
    }

    return $line.Substring($prefix.Length)
}

function Set-EnvValue([string] $path, [string] $name, [string] $value) {
    $contents = [System.IO.File]::ReadAllText($path)
    $pattern = "(?m)^$([Regex]::Escape($name))=.*$"
    $replacement = "$name=$value"

    if ([Regex]::IsMatch($contents, $pattern)) {
        $contents = [Regex]::Replace($contents, $pattern, [System.Text.RegularExpressions.MatchEvaluator] { param($match) $replacement })
    } else {
        $contents = $contents.TrimEnd("`r", "`n") + "`n$replacement`n"
    }

    [System.IO.File]::WriteAllText($path, $contents, [System.Text.UTF8Encoding]::new($false))
}

Push-Location $projectRoot

try {
    if (-not (Test-Path -LiteralPath $envFile)) {
        Copy-Item -LiteralPath (Join-Path $projectRoot '.env.example') -Destination $envFile
    }

    foreach ($name in @('MARIADB_ROOT_PASSWORD', 'DB_PASSWORD', 'DB_TEST_PASSWORD')) {
        if ([string]::IsNullOrWhiteSpace((Get-EnvValue $envFile $name))) {
            Set-EnvValue $envFile $name (New-HexSecret)
        }
    }

    $forwardPort = Get-EnvValue $envFile 'DB_FORWARD_PORT'
    if ([string]::IsNullOrWhiteSpace($forwardPort)) {
        $forwardPort = '3307'
    }

    if ($forwardPort -notmatch '^\d{1,5}$' -or [int]$forwardPort -lt 1 -or [int]$forwardPort -gt 65535) {
        throw 'DB_FORWARD_PORT must be an integer between 1 and 65535.'
    }

    Set-EnvValue $envFile 'DB_PORT' $forwardPort

    if (-not (Test-Path -LiteralPath $testingEnvFile)) {
        Copy-Item -LiteralPath (Join-Path $projectRoot '.env.testing.example') -Destination $testingEnvFile
    }

    Set-EnvValue $testingEnvFile 'APP_ENV' 'testing'
    Set-EnvValue $testingEnvFile 'DB_CONNECTION' 'mariadb'
    Set-EnvValue $testingEnvFile 'DB_HOST' '127.0.0.1'
    Set-EnvValue $testingEnvFile 'DB_PORT' $forwardPort
    Set-EnvValue $testingEnvFile 'DB_FORWARD_PORT' $forwardPort
    Set-EnvValue $testingEnvFile 'DB_DATABASE' 'erp_test'
    Set-EnvValue $testingEnvFile 'DB_USERNAME' 'erp_test'
    Set-EnvValue $testingEnvFile 'DB_PASSWORD' (Get-EnvValue $envFile 'DB_TEST_PASSWORD')
    Set-EnvValue $testingEnvFile 'DB_URL' ''
    Set-EnvValue $testingEnvFile 'DB_SOCKET' ''

    if ([string]::IsNullOrWhiteSpace((Get-EnvValue $envFile 'APP_KEY'))) {
        & $phpPath artisan key:generate
        if ($LASTEXITCODE -ne 0) {
            throw 'Laravel could not generate APP_KEY.'
        }
    }

    Set-EnvValue $testingEnvFile 'APP_KEY' (Get-EnvValue $envFile 'APP_KEY')

    if ($SkipDatabase) {
        return
    }

    docker compose up -d --wait db
    if ($LASTEXITCODE -ne 0) {
        throw 'MariaDB did not start. On this host, run this initializer from Administrator PowerShell until Docker Engine pipe access is available; then inspect docker compose logs db.'
    }

    & $phpPath artisan migrate --seed --force
    if ($LASTEXITCODE -ne 0) {
        throw 'Laravel migrations or development seeding failed.'
    }

    & $phpPath artisan p03:provision-demo
    if ($LASTEXITCODE -ne 0) {
        throw 'Local P03 demo provisioning failed.'
    }
} finally {
    Pop-Location
}
