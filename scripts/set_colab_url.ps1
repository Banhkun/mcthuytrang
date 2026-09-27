param (
    [string]$Url = "https://oasis-referenced-med-recommendations.trycloudflare.com"
)

$Url = $Url.Trim().TrimEnd('/')
Write-Host "Setting COLAB_URL to: $Url"

# Set persistently for the Windows User
[Environment]::SetEnvironmentVariable('COLAB_URL', $Url, 'User')
$env:COLAB_URL = $Url

Write-Host "Saved to Windows User Environment (persistent)!"

# Quick test connection
try {
    $res = Invoke-RestMethod -Uri "$Url/list" -Method Get -TimeoutSec 10
    Write-Host "Connected successfully! Root folders found: $($res.items.Count)"
} catch {
    Write-Host "Connection test note: $_"
}
