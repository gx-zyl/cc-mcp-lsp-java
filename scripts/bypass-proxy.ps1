# Add localhost/127.0.0.1 to Windows proxy bypass list
$reg = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$current = (Get-ItemProperty $reg).ProxyOverride
$add = '<local>;127.0.0.1;localhost'
if ($current) {
  if ($current -notlike '*127.0.0.1*') {
    Set-ItemProperty $reg ProxyOverride "$current;$add"
    Write-Host "Added bypass: $add"
  } else {
    Write-Host "Bypass already contains 127.0.0.1"
  }
} else {
  Set-ItemProperty $reg ProxyOverride $add
  Write-Host "Set bypass: $add"
}
