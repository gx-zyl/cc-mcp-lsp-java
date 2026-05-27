Write-Host "=== 1. 环境变量 ==="
Write-Host "HTTP_PROXY  = $env:HTTP_PROXY"
Write-Host "HTTPS_PROXY = $env:HTTPS_PROXY"
Write-Host "NO_PROXY    = $env:NO_PROXY"
Write-Host ""

Write-Host "=== 2. Windows 系统代理 ==="
$reg = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$enabled = (Get-ItemProperty $reg).ProxyEnable
$server = (Get-ItemProperty $reg).ProxyServer
$bypass = (Get-ItemProperty $reg).ProxyOverride
$pac = (Get-ItemProperty $reg).AutoConfigURL
Write-Host "Enabled     : $enabled"
Write-Host "Server      : $server"
Write-Host "Override    : $bypass"
Write-Host "PAC URL     : $pac"
Write-Host ""

Write-Host "=== 3. WinHTTP 代理 ==="
netsh winhttp show proxy | Select-String "直接|代理"
Write-Host ""

Write-Host "=== 4. Git 代理 ==="
$gp = git config --global --get http.proxy 2>$null
Write-Host "Git proxy : $gp"
Write-Host ""

Write-Host "=== 5. 代理进程 ==="
$procs = Get-Process | Where-Object { $_.ProcessName -match 'geph|v2ray|clash|trojan|ss-local|tun2' }
if ($procs) { $procs | Select-Object Name, Id } else { Write-Host "未发现代理客户端进程" }
Write-Host ""

Write-Host "=== 6. Geph 连通性 ==="
try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:9910' -TimeoutSec 2 -UseBasicParsing; Write-Host "Geph :9910 — OK" } catch { Write-Host "Geph :9910 — FAIL (not responding)" }
