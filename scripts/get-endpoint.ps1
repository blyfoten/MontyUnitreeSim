# Get the orchestrator endpoint
param(
    [string]$Namespace = "monty-sim",
    [string]$Region = "eu-west-1",
    [string]$StackName = "MontyUnitreeStack"
)

Write-Host "Getting orchestrator endpoint..." -ForegroundColor Cyan

# Configure kubectl
Write-Host "Configuring kubectl..." -ForegroundColor Yellow
aws eks update-kubeconfig --region $Region --name monty-unitree-eks | Out-Null

# Get ingress endpoint
Write-Host "`nChecking ingress..." -ForegroundColor Yellow
$Ingress = kubectl get ingress -n $Namespace -o json 2>&1

if ($LASTEXITCODE -eq 0 -and $Ingress) {
    $IngressObj = $Ingress | ConvertFrom-Json
    foreach ($item in $IngressObj.items) {
        if ($item.metadata.name -eq "monty-orchestrator-ingress") {
            if ($item.status.loadBalancer.ingress) {
                $Hostname = $item.status.loadBalancer.ingress[0].hostname
                Write-Host "`n✅ Orchestrator endpoint found!" -ForegroundColor Green
                Write-Host "   URL: http://$Hostname" -ForegroundColor White
                Write-Host "   Health check: http://$Hostname/health" -ForegroundColor Gray
            } else {
                Write-Host "`n⚠️  Ingress exists but load balancer is still provisioning..." -ForegroundColor Yellow
                Write-Host "   Check status with: kubectl get ingress -n $Namespace" -ForegroundColor Gray
            }
            break
        }
    }
} else {
    # Fallback: Get service directly
    Write-Host "No ingress found, checking service..." -ForegroundColor Yellow
    $Service = kubectl get service monty-orchestrator-service -n $Namespace -o json 2>&1
    if ($LASTEXITCODE -eq 0 -and $Service) {
        $ServiceObj = $Service | ConvertFrom-Json
        if ($ServiceObj.status.loadBalancer.ingress) {
            $Hostname = $ServiceObj.status.loadBalancer.ingress[0].hostname
            Write-Host "`n✅ Service endpoint found!" -ForegroundColor Green
            Write-Host "   URL: http://$Hostname" -ForegroundColor White
            Write-Host "   Health check: http://$Hostname/health" -ForegroundColor Gray
        } else {
            Write-Host "`n⚠️  Service exists but is not yet exposed externally" -ForegroundColor Yellow
        }
    } else {
        Write-Host "`n❌ No ingress or service found" -ForegroundColor Red
        Write-Host "   The application may not be deployed yet" -ForegroundColor Gray
    }
}

Write-Host "`n--- Alternative Access Methods ---" -ForegroundColor Cyan
Write-Host "If you need to access the API directly from your machine:" -ForegroundColor Yellow
Write-Host "1. Port-forward: kubectl port-forward -n $Namespace svc/monty-orchestrator-service 8000:80" -ForegroundColor White
Write-Host "2. Then access: http://localhost:8000/health" -ForegroundColor Gray

Write-Host "`n--- Cluster Info ---" -ForegroundColor Cyan
Write-Host "Cluster: monty-unitree-eks" -ForegroundColor White
Write-Host "Region: $Region" -ForegroundColor White
Write-Host "Namespace: $Namespace" -ForegroundColor White

