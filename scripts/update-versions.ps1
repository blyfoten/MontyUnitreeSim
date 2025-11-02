# Script to update key tools to latest versions
# This script helps you update kubectl, AWS CLI, and Helm to compatible versions

param(
    [switch]$Force,
    [switch]$Help
)

# Colors
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Blue"
$Cyan = "Cyan"
$White = "White"
$Gray = "Gray"

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Red
}

# Help message
if ($Help) {
    Write-Host @"
Update Versions Script

This script helps you update essential tools for the Monty Unitree platform:
- AWS CLI v2
- kubectl
- Helm

Usage: .\scripts\update-versions.ps1 [options]

Options:
  -Force    Force update even if versions seem compatible
  -Help     Show this help message

The script will:
1. Check current versions
2. Provide download links and instructions
3. Guide you through the update process

Examples:
  .\scripts\update-versions.ps1
  .\scripts\update-versions.ps1 -Force
"@
    exit 0
}

# Check current versions
Write-Host "`n=== Checking Current Versions ===" -ForegroundColor $Cyan

# Check kubectl
Write-Info "Checking kubectl..."
try {
    $KubeVersion = kubectl version --client --output=json 2>$null | ConvertFrom-Json
    $KubeVer = $KubeVersion.clientVersion.gitVersion
    Write-Success "kubectl: $KubeVer"
} catch {
    Write-Error "kubectl not found or incompatible version"
    $KubeVer = "Not installed"
}

# Check AWS CLI
Write-Info "Checking AWS CLI..."
try {
    $AwsVersion = aws --version 2>&1 | Out-String
    Write-Success "AWS CLI: $($AwsVersion.Trim())"
} catch {
    Write-Error "AWS CLI not found"
}

# Check Helm
Write-Info "Checking Helm..."
try {
    $HelmVersion = helm version --short 2>&1 | Out-String
    Write-Success "Helm: $($HelmVersion.Trim())"
} catch {
    Write-Warning "Helm: Not installed"
}

Write-Host "`n=== Update Instructions ===" -ForegroundColor $Cyan

# AWS CLI update
Write-Host "`n1. Update AWS CLI v2" -ForegroundColor $Yellow
Write-Host "   Current is old (v2.0.30 from 2020). Latest is v2.31+" -ForegroundColor $Red
Write-Host "`n   Download: https://awscli.amazonaws.com/AWSCLIV2.msi" -ForegroundColor $White
Write-Host "   Steps:" -ForegroundColor $White
Write-Host "   1. Download the MSI installer above" -ForegroundColor $Gray
Write-Host "   2. Run the installer (will update in place)" -ForegroundColor $Gray
Write-Host "   3. Restart PowerShell" -ForegroundColor $Gray
Write-Host "   4. Verify: aws --version" -ForegroundColor $Gray

# kubectl update
Write-Host "`n2. Update kubectl (optional)" -ForegroundColor $Yellow
Write-Host "   Current: $KubeVer" -ForegroundColor $White
Write-Host "   Download: https://dl.k8s.io/release/v1.31.0/bin/windows/amd64/kubectl.exe" -ForegroundColor $White
Write-Host "   Or use Chocolatey:" -ForegroundColor $White
Write-Host "   choco upgrade kubernetes-cli" -ForegroundColor $Gray

# Helm install
Write-Host "`n3. Install Helm (required for some operations)" -ForegroundColor $Yellow
Write-Host "   Helm is not currently installed" -ForegroundColor $Red
Write-Host "`n   Download: https://get.helm.sh/helm-v3.15.0-windows-amd64.zip" -ForegroundColor $White
Write-Host "   Or use Chocolatey:" -ForegroundColor $White
Write-Host "   choco install kubernetes-helm" -ForegroundColor $Gray
Write-Host "   Or use WinGet:" -ForegroundColor $White
Write-Host "   winget install Helm.Helm" -ForegroundColor $Gray

# Chocolatey check
Write-Host "`n=== Quick Update via Chocolatey (Recommended) ===" -ForegroundColor $Cyan
try {
    $null = Get-Command choco -ErrorAction Stop
    Write-Success "Chocolatey is installed!"
    Write-Host "`nRun these commands to update everything:" -ForegroundColor $Yellow
    Write-Host "  choco upgrade awscli -y" -ForegroundColor $White
    Write-Host "  choco upgrade kubernetes-cli -y" -ForegroundColor $White
    Write-Host "  choco install kubernetes-helm -y" -ForegroundColor $White
    Write-Host "`nOr run all at once:" -ForegroundColor $Yellow
    Write-Host "  choco upgrade awscli kubernetes-cli -y; choco install kubernetes-helm -y" -ForegroundColor $White
} catch {
    Write-Warning "Chocolatey is not installed"
    Write-Host "  Install Chocolatey: https://chocolatey.org/install" -ForegroundColor $Gray
    Write-Host "  Or download installers manually from links above" -ForegroundColor $Gray
}

# Winget check
Write-Host "`n=== Alternative: Use WinGet ===" -ForegroundColor $Cyan
try {
    $null = Get-Command winget -ErrorAction Stop
    Write-Success "WinGet is available!"
    Write-Host "`nRun these commands:" -ForegroundColor $Yellow
    Write-Host "  winget upgrade -h Amazon.AWSCLI" -ForegroundColor $White
    Write-Host "  winget upgrade -h Kubernetes.kubectl" -ForegroundColor $White
    Write-Host "  winget install Helm.Helm" -ForegroundColor $White
} catch {
    Write-Warning "WinGet is not available (Windows 10 version 1809+)"
}

Write-Host "`n=== After Updating ===" -ForegroundColor $Cyan
Write-Host "1. Restart PowerShell or your terminal" -ForegroundColor $White
Write-Host "2. Run: .\scripts\update-versions.ps1 to verify" -ForegroundColor $White
Write-Host "3. Configure kubectl: aws eks update-kubeconfig --region eu-west-1 --name monty-unitree-eks" -ForegroundColor $White

Write-Host "`n"

