# Enable proxy for CLI (foreign access)
$env:HTTP_PROXY = "http://127.0.0.1:9910"
$env:HTTPS_PROXY = "http://127.0.0.1:9910"
Write-Host "Proxy ON  (127.0.0.1:9910)"
