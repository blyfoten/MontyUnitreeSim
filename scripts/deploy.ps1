# Monty Unitree Simulation Platform Deployment Script (PowerShell)
# This script deploys the complete infrastructure and application on Windows

param(
    [string]$StackName = "MontyUnitreeStack",
    [string]$Region = "eu-west-1",
    [string]$Namespace = "monty-sim",
    [switch]$SkipInfrastructure,
    [switch]$SkipHelm,
    [switch]$SkipImages,
    [switch]$SkipKubernetes,
    [switch]$Help
)

# Help message
if ($Help) {
    Write-Host @"
Monty Unitree Simulation Platform Deployment Script (Windows)

Usage: .\deploy.ps1 [options]

Options:
  -StackName <name>     CDK stack name (default: MontyUnitreeStack)
  -Region <region>      AWS region (default: us-east-1)
  -Namespace <ns>       Kubernetes namespace (default: monty-sim)
  -SkipInfrastructure   Skip CDK infrastructure deployment
  -SkipHelm             Skip Helm chart installation
  -SkipImages           Skip Docker image building and pushing
  -SkipKubernetes       Skip Kubernetes manifest deployment
  -Help                 Show this help message

Examples:
  .\deploy.ps1
  .\deploy.ps1 -Region eu-west-1 -StackName MyMontyStack
  .\deploy.ps1 -SkipInfrastructure -SkipImages
"@
    exit 0
}

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Blue"
$Cyan = "Cyan"

# Logging functions
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

# Check prerequisites
function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    # Check AWS CLI
    try {
        $null = Get-Command aws -ErrorAction Stop
        Write-Success "AWS CLI is installed"
    }
    catch {
        Write-Error "AWS CLI is not installed. Please install it first: https://aws.amazon.com/cli/"
        exit 1
    }
    
    # Check CDK
    try {
        $null = Get-Command cdk -ErrorAction Stop
        Write-Success "AWS CDK is installed"
    }
    catch {
        Write-Error "AWS CDK is not installed. Please install it first: npm install -g aws-cdk"
        exit 1
    }
    
    # Check kubectl
    try {
        $null = Get-Command kubectl -ErrorAction Stop
        Write-Success "kubectl is installed"
    }
    catch {
        Write-Error "kubectl is not installed. Please install it first: https://kubernetes.io/docs/tasks/tools/"
        exit 1
    }
    
    # Check Docker
    try {
        $null = Get-Command docker -ErrorAction Stop
        Write-Success "Docker is installed"
    }
    catch {
        Write-Error "Docker is not installed. Please install Docker Desktop first: https://www.docker.com/products/docker-desktop"
        exit 1
    }
    
    # Check Node.js
    try {
        $null = Get-Command node -ErrorAction Stop
        Write-Success "Node.js is installed"
    }
    catch {
        Write-Error "Node.js is not installed. Please install it first: https://nodejs.org/"
        exit 1
    }
    
    Write-Success "All prerequisites are installed"
}

# Check and handle stack status
function Test-StackStatus {
    Write-Info "Checking stack status..."
    
    try {
        $StackOutput = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query 'Stacks[0].StackStatus' --output text 2>&1
        $ExitCode = $LASTEXITCODE
        
        if ($ExitCode -ne 0) {
            Write-Info "Stack does not exist, will create new stack"
            return $null
        }
        
        $StackStatus = $StackOutput.Trim()
        
        if ([string]::IsNullOrWhiteSpace($StackStatus)) {
            Write-Info "Could not determine stack status, will attempt deployment"
            return $null
        }
        
        Write-Info "Current stack status: $StackStatus"
        
        # Handle ROLLBACK_COMPLETE state - stack must be deleted before redeployment
        if ($StackStatus -eq "ROLLBACK_COMPLETE") {
            Write-Warning "Stack is in ROLLBACK_COMPLETE state. It must be deleted before redeployment."
            Write-Info "Deleting failed stack..."
            
            aws cloudformation delete-stack --stack-name $StackName --region $Region
            
            Write-Info "Waiting for stack deletion to complete (this may take several minutes)..."
            aws cloudformation wait stack-delete-complete --stack-name $StackName --region $Region
            
            Write-Success "Failed stack deleted successfully"
            
            # Clean up any leftover Kubernetes resources after stack deletion
            Write-Info "Cleaning up leftover Kubernetes resources from failed deployment..."
            try {
                # We're in the infrastructure directory, go up one level to find scripts
                $ProjectRoot = Split-Path -Parent (Get-Location)
                $CleanupScript = Join-Path $ProjectRoot "scripts\cleanup.ps1"
                
                # Alternative: try from script's own directory (if called from project root)
                if (-not (Test-Path $CleanupScript)) {
                    $ScriptDir = Split-Path -Parent $PSCommandPath
                    $CleanupScript = Join-Path $ScriptDir "cleanup.ps1"
                }
                
                if (Test-Path $CleanupScript) {
                    Push-Location (Split-Path -Parent $CleanupScript)
                    & powershell -ExecutionPolicy Bypass -File $CleanupScript -CleanupKubernetes -StackName $StackName -Region $Region
                    Pop-Location
                }
            }
            catch {
                Write-Warning "Could not clean up Kubernetes resources: $_"
            }
            
            return $null
        }
        
        # Handle other failed states
        if ($StackStatus -match "FAILED|ROLLBACK") {
            Write-Warning "Stack is in state: $StackStatus"
            Write-Warning "You may need to manually delete the stack from the AWS Console"
            Write-Warning "Or wait for automatic cleanup if it's still in progress"
            return $StackStatus
        }
        
        return $StackStatus
    }
    catch {
        Write-Info "Could not determine stack status: $_"
        Write-Info "Will attempt deployment anyway"
        return $null
    }
}

# Deploy CDK infrastructure
function Deploy-Infrastructure {
    Write-Info "Deploying CDK infrastructure..."
    
    Push-Location infrastructure
    
    try {
        # Check stack status first
        Test-StackStatus
        
        # Install dependencies
        Write-Info "Installing CDK dependencies..."
        npm install
        
        # Bootstrap CDK (if needed)
        Write-Info "Bootstrapping CDK..."
        cdk bootstrap --region $Region
        
        # Deploy the stack
        Write-Info "Deploying CDK stack..."
        $ErrorActionPreference = 'Continue'
        
        # Capture both stdout and stderr
        $DeployOutput = cdk deploy --all --require-approval never 2>&1 | Out-String
        $DeployExitCode = $LASTEXITCODE
        
        # Check if deployment failed due to existing resources
        if ($DeployExitCode -ne 0) {
            $HasExistingResources = $DeployOutput -match "already exists" -or $DeployOutput -match "AlreadyExists"
            
            if ($HasExistingResources) {
                Write-Warning "Deployment failed due to existing resources"
                Write-Info "The following resources already exist and need to be handled:"
                Write-Info "  - ECR Repositories: monty, unitree-sim, glue-base"
                Write-Info "  - S3 Buckets: monty-checkpoints-*, sim-artifacts-*"
                Write-Info "  - CloudWatch Log Group: /aws/eks/monty-unitree-eks"
                Write-Info ""
                
                # First, check if there's a failed stack that needs deletion
                Write-Info "Checking for failed stack that needs deletion..."
                try {
                    $StackOutput = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query 'Stacks[0].StackStatus' --output text 2>&1
                    $StackCheckExitCode = $LASTEXITCODE
                    
                    if ($StackCheckExitCode -eq 0) {
                        $CurrentStackStatus = $StackOutput.Trim()
                        if ($CurrentStackStatus -and $CurrentStackStatus -match "ROLLBACK|FAILED") {
                            Write-Warning "Found failed stack in state: $CurrentStackStatus"
                            Write-Info "Deleting failed stack first..."
                            aws cloudformation delete-stack --stack-name $StackName --region $Region
                            Write-Info "Waiting for stack deletion..."
                            aws cloudformation wait stack-delete-complete --stack-name $StackName --region $Region 2>$null
                            Write-Success "Stack deleted"
                        }
                    }
                }
                catch {
                    Write-Info "No stack to delete or already deleted"
                }
                
                Write-Warning "Attempting to delete existing resources automatically..."
                
                # Run cleanup script automatically
                try {
                    # We're currently in the infrastructure directory, so go up one level to find scripts
                    $ProjectRoot = Split-Path -Parent (Get-Location)
                    $CleanupScript = Join-Path $ProjectRoot "scripts\cleanup.ps1"
                    
                    # Alternative: try from script's own directory
                    if (-not (Test-Path $CleanupScript)) {
                        $ScriptDir = Split-Path -Parent $PSCommandPath
                        $CleanupScript = Join-Path $ScriptDir "cleanup.ps1"
                    }
                    
                    if (Test-Path $CleanupScript) {
                        Write-Info "Running cleanup script to remove existing resources..."
                        Push-Location $ProjectRoot
                        & powershell -ExecutionPolicy Bypass -File $CleanupScript -DeleteResources -StackName $StackName -Region $Region
                        Pop-Location
                        
                        Write-Info "Waiting 15 seconds for resources to be deleted..."
                        Start-Sleep -Seconds 15
                        
                        Write-Info "Retrying deployment..."
                        $RetryOutput = cdk deploy --all --require-approval never 2>&1 | Out-String
                        $RetryExitCode = $LASTEXITCODE
                        
                        if ($RetryExitCode -eq 0) {
                            Write-Success "Deployment succeeded after cleanup"
                            Pop-Location
                            return
                        }
                        else {
                            Write-Warning "Deployment still failed after cleanup. Exit code: $RetryExitCode"
                            $RetryHasExisting = $RetryOutput -match "already exists" -or $RetryOutput -match "AlreadyExists"
                            if ($RetryHasExisting) {
                                Write-Warning "Resources may still exist. You may need to wait longer or delete manually."
                            }
                            Write-Info "Last deployment output:"
                            Write-Host $RetryOutput
                        }
                    }
                    else {
                        Write-Warning "Cleanup script not found at: $CleanupScript"
                    }
                }
                catch {
                    Write-Warning "Could not run cleanup script automatically: $_"
                }
                
                Write-Info ""
                Write-Warning "Manual cleanup options:"
                Write-Info "1. Run: .\cleanup.bat -DeleteResources"
                Write-Info "2. Or delete resources manually from AWS Console"
                Write-Info ""
                Write-Error "Deployment failed. Please resolve existing resources and retry."
                Pop-Location
                exit 1
            }
            else {
                Write-Error "CDK deployment failed with exit code: $DeployExitCode"
                Write-Info "Deployment output:"
                Write-Host $DeployOutput
                throw "CDK deployment failed with exit code: $DeployExitCode"
            }
        }
        
        Write-Success "Infrastructure deployed successfully"
    }
    catch {
        Write-Error "Failed to deploy infrastructure: $_"
        Pop-Location
        exit 1
    }
    finally {
        Pop-Location
    }
}

# Get stack outputs
function Get-StackOutputs {
    Write-Info "Getting stack outputs..."
    
    Push-Location infrastructure
    
    try {
        # Check if stack exists and is in a valid state
        $StackStatus = (aws cloudformation describe-stacks --stack-name $StackName --region $Region --query 'Stacks[0].StackStatus' --output text 2>$null).Trim()
        
        if ($LASTEXITCODE -ne 0 -or -not $StackStatus -or $StackStatus -match "FAILED|ROLLBACK") {
            Write-Error "Stack is not in a valid state. Current status: $StackStatus"
            Write-Error "Please ensure the stack is successfully deployed before retrieving outputs."
            Pop-Location
            exit 1
        }
        
        # Get outputs using AWS CLI
        $ClusterName = (aws cloudformation describe-stacks --stack-name $StackName --region $Region --query 'Stacks[0].Outputs[?OutputKey==`ClusterName`].OutputValue' --output text 2>$null).Trim()
        $ClusterEndpoint = (aws cloudformation describe-stacks --stack-name $StackName --region $Region --query 'Stacks[0].Outputs[?OutputKey==`ClusterEndpoint`].OutputValue' --output text 2>$null).Trim()
        $CheckpointsBucket = (aws cloudformation describe-stacks --stack-name $StackName --region $Region --query 'Stacks[0].Outputs[?OutputKey==`CheckpointsBucket`].OutputValue' --output text 2>$null).Trim()
        $ArtifactsBucket = (aws cloudformation describe-stacks --stack-name $StackName --region $Region --query 'Stacks[0].Outputs[?OutputKey==`ArtifactsBucket`].OutputValue' --output text 2>$null).Trim()
        $MontyRepoURI = (aws cloudformation describe-stacks --stack-name $StackName --region $Region --query 'Stacks[0].Outputs[?OutputKey==`MontyRepoURI`].OutputValue' --output text 2>$null).Trim()
        $SimulatorRepoURI = (aws cloudformation describe-stacks --stack-name $StackName --region $Region --query 'Stacks[0].Outputs[?OutputKey==`SimulatorRepoURI`].OutputValue' --output text 2>$null).Trim()
        $GlueRepoURI = (aws cloudformation describe-stacks --stack-name $StackName --region $Region --query 'Stacks[0].Outputs[?OutputKey==`GlueRepoURI`].OutputValue' --output text 2>$null).Trim()
        
        # Validate that we got meaningful outputs
        if (-not $ClusterName -or $ClusterName -eq "None") {
            Write-Error "Failed to retrieve stack outputs. The stack may not have completed deployment successfully."
            Pop-Location
            exit 1
        }
        
        Write-Success "Stack outputs retrieved"
        Write-Info "Cluster Name: $ClusterName"
        Write-Info "Checkpoints Bucket: $CheckpointsBucket"
        Write-Info "Artifacts Bucket: $ArtifactsBucket"
        
        # Return values for use in other functions
        return @{
            ClusterName = $ClusterName
            ClusterEndpoint = $ClusterEndpoint
            CheckpointsBucket = $CheckpointsBucket
            ArtifactsBucket = $ArtifactsBucket
            MontyRepoURI = $MontyRepoURI
            SimulatorRepoURI = $SimulatorRepoURI
            GlueRepoURI = $GlueRepoURI
        }
    }
    catch {
        Write-Error "Failed to get stack outputs: $_"
        Pop-Location
        exit 1
    }
    finally {
        Pop-Location
    }
}

# Configure kubectl
function Set-KubectlConfig {
    param([string]$ClusterName)
    
    Write-Info "Configuring kubectl..."
    
    if (-not $ClusterName -or $ClusterName -eq "None") {
        Write-Warning "Cluster name is not available, skipping kubectl configuration"
        return
    }
    
    try {
        aws eks update-kubeconfig --region $Region --name $ClusterName
        
        # Verify connection
        kubectl get nodes
        
        Write-Success "kubectl configured successfully"
    }
    catch {
        Write-Error "Failed to configure kubectl: $_"
        exit 1
    }
}

# Install Helm charts
function Install-HelmCharts {
    param([string]$ClusterName)
    
    Write-Info "Installing Helm charts..."
    
    if (-not $ClusterName -or $ClusterName -eq "None") {
        Write-Warning "Cluster name is not available, skipping Helm chart installation"
        return
    }
    
    # Check if helm is installed
    try {
        $helmVersion = helm version --short 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Helm is not installed. Skipping Helm chart installation."
            Write-Info "To install Helm charts manually, run the following commands after installing helm:"
            Write-Info "  helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/"
            Write-Info "  helm repo add nvidia https://nvidia.github.io/k8s-device-plugin"
            Write-Info "  helm repo add autoscaler https://kubernetes.github.io/autoscaler"
            Write-Info "  helm repo add eks https://aws.github.io/eks-charts"
            Write-Info "  helm repo update"
            return
        }
    }
    catch {
        Write-Warning "Could not verify helm installation. Skipping Helm chart installation."
        return
    }
    
    try {
        # Add Helm repositories
        Write-Info "Adding Helm repositories..."
        helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/ 2>$null
        helm repo add nvidia https://nvidia.github.io/k8s-device-plugin 2>$null
        helm repo add autoscaler https://kubernetes.github.io/autoscaler 2>$null
        helm repo add eks https://aws.github.io/eks-charts 2>$null
        helm repo update
        
        # Install Metrics Server
        Write-Info "Installing Metrics Server..."
        helm upgrade --install metrics-server metrics-server/metrics-server `
            --namespace kube-system `
            --set args='{--kubelet-insecure-tls}' `
            --wait 2>&1 | Out-String | Write-Host
        
        # Install NVIDIA Device Plugin
        Write-Info "Installing NVIDIA Device Plugin..."
        helm upgrade --install nvidia-device-plugin nvidia/nvidia-device-plugin `
            --namespace kube-system `
            --set tolerations[0].key=nvidia.com/gpu `
            --set tolerations[0].operator=Equal `
            --set tolerations[0].value=present `
            --set tolerations[0].effect=NoSchedule `
            --wait 2>&1 | Out-String | Write-Host
        
        # Install Cluster Autoscaler
        Write-Info "Installing Cluster Autoscaler..."
        helm upgrade --install cluster-autoscaler autoscaler/cluster-autoscaler `
            --namespace kube-system `
            --set autoDiscovery.clusterName=$ClusterName `
            --set awsRegion=$Region `
            --set extraArgs.scale-down-unneeded-time=5m `
            --set extraArgs.scale-down-delay-after-add=5m `
            --wait 2>&1 | Out-String | Write-Host
        
        # Install AWS Load Balancer Controller
        Write-Info "Installing AWS Load Balancer Controller..."
        helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller `
            --namespace kube-system `
            --set clusterName=$ClusterName `
            --set serviceAccount.create=false `
            --set serviceAccount.name=aws-load-balancer-controller `
            --wait 2>&1 | Out-String | Write-Host
        
        Write-Success "Helm charts installed successfully"
    }
    catch {
        Write-Warning "Failed to install Helm charts: $_"
        Write-Warning "You may need to install them manually. Check the error messages above."
    }
}

# Build and push Docker images
function Build-AndPushImages {
    param([string]$MontyRepoURI)
    
    Write-Info "Building and pushing Docker images..."
    
    if (-not $MontyRepoURI -or $MontyRepoURI -eq "None") {
        Write-Warning "ECR repository URI is not available, skipping image build and push"
        return
    }
    
    try {
        # Extract registry from URI (format: account.dkr.ecr.region.amazonaws.com)
        $Registry = ($MontyRepoURI -split "/")[0]
        
        # Get ECR login token
        aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $Registry
        
        # Build orchestrator image
        Write-Info "Building orchestrator image..."
        docker build -t monty-orchestrator:latest ./backend
        
        # Tag and push orchestrator
        docker tag monty-orchestrator:latest $MontyRepoURI:latest
        docker push $MontyRepoURI:latest
        
        Write-Success "Docker images built and pushed"
    }
    catch {
        Write-Error "Failed to build and push images: $_"
        exit 1
    }
}

# Deploy Kubernetes manifests
function Deploy-KubernetesManifests {
    param(
        [string]$CheckpointsBucket,
        [string]$ArtifactsBucket,
        [string]$MontyRepoURI
    )
    
    Write-Info "Deploying Kubernetes manifests..."
    
    try {
        # Create a temporary file for the updated manifest
        $TempManifest = [System.IO.Path]::GetTempFileName()
        $ManifestContent = Get-Content "k8s/orchestrator-deployment.yaml" -Raw
        
        # Replace placeholders
        $ManifestContent = $ManifestContent -replace "monty-checkpoints-dev", $CheckpointsBucket
        $ManifestContent = $ManifestContent -replace "sim-artifacts-dev", $ArtifactsBucket
        $ManifestContent = $ManifestContent -replace "123456789012\.dkr\.ecr\.us-east-1\.amazonaws\.com", ($MontyRepoURI -split "/")[0]
        $ManifestContent = $ManifestContent -replace "us-east-1", $Region
        
        # Write to temporary file
        Set-Content -Path $TempManifest -Value $ManifestContent
        
        # Apply manifests
        kubectl apply -f $TempManifest
        
        # Wait for deployment to be ready
        kubectl wait --for=condition=available --timeout=300s deployment/monty-orchestrator -n $Namespace
        
        # Clean up temporary file
        Remove-Item $TempManifest
        
        Write-Success "Kubernetes manifests deployed"
    }
    catch {
        Write-Error "Failed to deploy Kubernetes manifests: $_"
        exit 1
    }
}

# Setup ingress
function Set-Ingress {
    Write-Info "Setting up ingress..."
    
    try {
        # Create ingress for orchestrator
        $IngressManifest = @"
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: monty-orchestrator-ingress
  namespace: $Namespace
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    alb.ingress.kubernetes.io/ssl-redirect: '443'
spec:
  rules:
  - host: monty-unitree.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: monty-orchestrator-service
            port:
              number: 80
"@
        
        $IngressManifest | kubectl apply -f -
        
        Write-Success "Ingress configured"
    }
    catch {
        Write-Error "Failed to setup ingress: $_"
        exit 1
    }
}

# Verify deployment
function Test-Deployment {
    Write-Info "Verifying deployment..."
    
    try {
        # Check pods
        kubectl get pods -n $Namespace
        
        # Check services
        kubectl get services -n $Namespace
        
        # Check ingress
        kubectl get ingress -n $Namespace
        
        # Test health endpoint
        $OrchestratorIP = (kubectl get service monty-orchestrator-service -n $Namespace -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
        if ($OrchestratorIP) {
            Write-Info "Testing orchestrator health endpoint..."
            try {
                Invoke-WebRequest -Uri "http://$OrchestratorIP/health" -UseBasicParsing | Out-Null
                Write-Success "Health check passed"
            }
            catch {
                Write-Warning "Health check failed, but deployment may still be starting"
            }
        }
        
        Write-Success "Deployment verification completed"
    }
    catch {
        Write-Error "Failed to verify deployment: $_"
        exit 1
    }
}

# Main deployment function
function Start-Deployment {
    Write-Info "Starting Monty Unitree Simulation Platform deployment..."
    
    Test-Prerequisites
    
    if (-not $SkipInfrastructure) {
        Deploy-Infrastructure
    }
    
    # Only continue if infrastructure deployment was successful
    try {
        $Outputs = Get-StackOutputs
        
        # Only proceed with subsequent steps if we have valid outputs
        if ($Outputs.ClusterName -and $Outputs.ClusterName -ne "None") {
            Set-KubectlConfig -ClusterName $Outputs.ClusterName
            
            # Install Helm charts (required for cluster functionality)
            if (-not $SkipHelm) {
                Install-HelmCharts -ClusterName $Outputs.ClusterName
            }
            
            if (-not $SkipImages) {
                Build-AndPushImages -MontyRepoURI $Outputs.MontyRepoURI
            }
            
            if (-not $SkipKubernetes) {
                Deploy-KubernetesManifests -CheckpointsBucket $Outputs.CheckpointsBucket -ArtifactsBucket $Outputs.ArtifactsBucket -MontyRepoURI $Outputs.MontyRepoURI
                Set-Ingress
                Test-Deployment
            }
            
            Write-Success "Deployment completed successfully!"
            Write-Info "You can now access the orchestrator API at the ingress endpoint"
            Write-Info "Frontend should be configured to point to the orchestrator service"
            
            # Display useful information
            Write-Host "`n" -NoNewline
            Write-Host "=== Deployment Summary ===" -ForegroundColor $Cyan
            Write-Host "Cluster Name: $($Outputs.ClusterName)" -ForegroundColor $Green
            Write-Host "Checkpoints Bucket: $($Outputs.CheckpointsBucket)" -ForegroundColor $Green
            Write-Host "Artifacts Bucket: $($Outputs.ArtifactsBucket)" -ForegroundColor $Green
            Write-Host "Monty ECR URI: $($Outputs.MontyRepoURI)" -ForegroundColor $Green
            Write-Host "Simulator ECR URI: $($Outputs.SimulatorRepoURI)" -ForegroundColor $Green
            Write-Host "Glue ECR URI: $($Outputs.GlueRepoURI)" -ForegroundColor $Green
        }
        else {
            Write-Warning "Stack outputs are not available. Infrastructure deployment may have failed."
            Write-Warning "Please check the CDK deployment output above for errors."
            exit 1
        }
    }
    catch {
        Write-Error "Deployment failed: $_"
        Write-Warning "Infrastructure may have been partially deployed. Check AWS Console for details."
        exit 1
    }
}

# Run main deployment function
Start-Deployment
