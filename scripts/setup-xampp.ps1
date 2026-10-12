[CmdletBinding()]
param(
    [string]$MysqlBin = 'C:\xampp\mysql\bin',
    [switch]$UseBlankRootPassword
)

$ErrorActionPreference = 'Stop'
$mysql = Join-Path $MysqlBin 'mysql.exe'
if (-not (Test-Path -LiteralPath $mysql)) {
    throw "mysql.exe was not found at $mysql"
}

function New-LocalPassword {
    $bytes = New-Object byte[] 24
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }
    return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

$rootCredential = $null
if (-not $UseBlankRootPassword) {
    $rootCredential = Read-Host 'Enter the local XAMPP MariaDB root password' -AsSecureString
}

$devMigrationPassword = New-LocalPassword
$devRuntimePassword = New-LocalPassword
$testMigrationPassword = New-LocalPassword
$testRuntimePassword = New-LocalPassword

$accounts = @(
    @{ User = 'ahoden_dev_migrator'; Password = $devMigrationPassword; Database = 'ahoden_elite_clean_dev'; Grants = 'ALL PRIVILEGES' },
    @{ User = 'ahoden_dev_app'; Password = $devRuntimePassword; Database = 'ahoden_elite_clean_dev'; Grants = 'SELECT, INSERT, UPDATE, DELETE' },
    @{ User = 'ahoden_test_migrator'; Password = $testMigrationPassword; Database = 'ahoden_elite_clean_test'; Grants = 'ALL PRIVILEGES' },
    @{ User = 'ahoden_test_app'; Password = $testRuntimePassword; Database = 'ahoden_elite_clean_test'; Grants = 'SELECT, INSERT, UPDATE, DELETE' }
)

$sql = [System.Collections.Generic.List[string]]::new()
$sql.Add('CREATE DATABASE IF NOT EXISTS ahoden_elite_clean_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;')
$sql.Add('CREATE DATABASE IF NOT EXISTS ahoden_elite_clean_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;')

foreach ($account in $accounts) {
    foreach ($accountHost in @('localhost', '127.0.0.1')) {
        $sql.Add("CREATE USER IF NOT EXISTS '$($account.User)'@'$accountHost' IDENTIFIED BY '$($account.Password)';")
        $sql.Add("ALTER USER '$($account.User)'@'$accountHost' IDENTIFIED BY '$($account.Password)';")
        $sql.Add("GRANT $($account.Grants) ON $($account.Database).* TO '$($account.User)'@'$accountHost';")
    }
}
$sql.Add('FLUSH PRIVILEGES;')

$previousMysqlPassword = $env:MYSQL_PWD
try {
    if ($UseBlankRootPassword) {
        Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    }
    else {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($rootCredential)
        try {
            $env:MYSQL_PWD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        }
        finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
    }

    ($sql -join [Environment]::NewLine) | & $mysql --user=root --batch
    if ($LASTEXITCODE -ne 0) {
        throw "MariaDB setup failed with exit code $LASTEXITCODE"
    }
}
finally {
    if ($null -eq $previousMysqlPassword) {
        Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    }
    else {
        $env:MYSQL_PWD = $previousMysqlPassword
    }
}

$devEnvironment = @"
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
LOG_LEVEL=info
DATABASE_URL=mysql://ahoden_dev_app:$devRuntimePassword@127.0.0.1:3306/ahoden_elite_clean_dev
MIGRATION_DATABASE_URL=mysql://ahoden_dev_migrator:$devMigrationPassword@127.0.0.1:3306/ahoden_elite_clean_dev
CORS_ORIGINS=http://localhost:5173
TRUST_PROXY=false
BODY_LIMIT=100kb
"@

$testEnvironment = @"
NODE_ENV=test
HOST=127.0.0.1
PORT=3001
LOG_LEVEL=silent
DATABASE_URL=mysql://ahoden_test_app:$testRuntimePassword@127.0.0.1:3306/ahoden_elite_clean_test
MIGRATION_DATABASE_URL=mysql://ahoden_test_migrator:$testMigrationPassword@127.0.0.1:3306/ahoden_elite_clean_test
CORS_ORIGINS=http://localhost:5173
TRUST_PROXY=false
BODY_LIMIT=100kb
ALLOW_TEST_DATABASE_RESET=true
TEST_DATABASE_ALLOWED_HOSTS=127.0.0.1,localhost,mysql
"@

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $PWD '.env.local'), $devEnvironment, $utf8WithoutBom)
[System.IO.File]::WriteAllText((Join-Path $PWD '.env.test.local'), $testEnvironment, $utf8WithoutBom)

Write-Host 'Created/updated isolated development and test databases and least-privilege accounts.'
Write-Host 'Wrote ignored .env.local and .env.test.local files; no passwords were printed.'
Write-Host 'Next: npm run db:migrate; npm run db:test:reset'
