# Monty Unitree Simulation Platform Cleanup Script (PowerShell)
# This script helps clean up failed stacks and existing resources

param(
    [string]$StackName = "MontyUnitreeStack",
    [string]$Region = "eu-west-1",
    [switch]$DeleteStack,
    [switch]$DeleteResources,
    [switch]$CleanupKubernetes,
    [switch]$Help
)

# Help message
if ($Help) {
    Write-Host @"
Monty Unitree Simulation Platform Cleanup Script (Windows)

Usage: .\cleanup.ps1 [options]

Options:
  -StackName <name>     CDK stack name (default: MontyUnitreeStack)
  -Region <region>      AWS region (default: eu-west-1)
  -DeleteStack          Delete the CloudFormation stack
  -DeleteResources      Delete existing ECR repos, S3 buckets, and log groups
  -CleanupKubernetes    Clean up leftover Kubernetes resources from failed deployments
  -Help                 Show this help message

Examples:
  .\cleanup.ps1 -DeleteStack
  .\cleanup.ps1 -DeleteResources
  .\cleanup.ps1 -DeleteStack -DeleteResources
  .\cleanup.ps1 -CleanupKubernetes
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

# Get AWS account ID
function Get-AwsAccountId {
    try {
        return (aws sts get-caller-identity --query Account --output text).Trim()
    }
    catch {
        Write-Error "Failed to get AWS account ID"
        exit 1
    }
}

# Delete CloudFormation stack
function Remove-CloudFormationStack {
    Write-Info "Checking stack status..."
    
    try {
        $StackStatus = (aws cloudformation describe-stacks --stack-name $StackName --region $Region --query 'Stacks[0].StackStatus' --output text 2>$null).Trim()
        
        if ($LASTEXITCODE -ne 0) {
            Write-Info "Stack does not exist"
            return
        }
        
        Write-Info "Stack status: $StackStatus"
        
        if ($StackStatus -eq "DELETE_COMPLETE") {
            Write-Info "Stack is already deleted"
            return
        }
        
        Write-Warning "Deleting stack: $StackName"
        aws cloudformation delete-stack --stack-name $StackName --region $Region
        
        Write-Info "Waiting for stack deletion to complete (this may take several minutes)..."
        aws cloudformation wait stack-delete-complete --stack-name $StackName --region $Region
        
        Write-Success "Stack deleted successfully"
    }
    catch {
        Write-Error "Failed to delete stack: $_"
        Write-Warning "You may need to delete the stack manually from the AWS Console"
    }
}

# Delete existing resources
function Remove-ExistingResources {
    Write-Info "Deleting existing resources..."
    
    $AccountId = Get-AwsAccountId
    
    # Delete ECR repositories
    $EcrRepos = @('monty', 'unitree-sim', 'glue-base')
    foreach ($Repo in $EcrRepos) {
        Write-Info "Checking ECR repository: $Repo"
        try {
            $Exists = aws ecr describe-repositories --repository-names $Repo --region $Region 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Warning "Deleting ECR repository: $Repo"
                aws ecr delete-repository --repository-name $Repo --region $Region --force
                Write-Success "Deleted ECR repository: $Repo"
            }
            else {
                Write-Info "ECR repository does not exist: $Repo"
            }
        }
        catch {
            Write-Warning "Could not delete ECR repository $Repo : $_"
        }
    }
    
    # Delete S3 buckets
    $S3Buckets = @(
        "monty-checkpoints-$AccountId-$Region",
        "sim-artifacts-$AccountId-$Region"
    )
    
    foreach ($Bucket in $S3Buckets) {
        Write-Info "Checking S3 bucket: $Bucket"
        try {
            $Exists = aws s3api head-bucket --bucket $Bucket --region $Region 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Warning "Deleting S3 bucket: $Bucket"
                # Empty bucket first
                aws s3 rm s3://$Bucket --recursive --region $Region
                # Delete bucket
                aws s3api delete-bucket --bucket $Bucket --region $Region
                Write-Success "Deleted S3 bucket: $Bucket"
            }
            else {
                Write-Info "S3 bucket does not exist: $Bucket"
            }
        }
        catch {
            Write-Warning "Could not delete S3 bucket $Bucket : $_"
        }
    }
    
    # Delete CloudWatch log group
    $LogGroup = "/aws/eks/monty-unitree-eks"
    Write-Info "Checking CloudWatch log group: $LogGroup"
    try {
        $Exists = aws logs describe-log-groups --log-group-name-prefix $LogGroup --region $Region --query "logGroups[?logGroupName=='$LogGroup']" --output text 2>&1
        if ($Exists) {
            Write-Warning "Deleting CloudWatch log group: $LogGroup"
            aws logs delete-log-group --log-group-name $LogGroup --region $Region
            Write-Success "Deleted CloudWatch log group: $LogGroup"
        }
        else {
            Write-Info "CloudWatch log group does not exist: $LogGroup"
        }
    }
    catch {
        Write-Warning "Could not delete CloudWatch log group $LogGroup : $_"
    }
    
    Write-Success "Resource cleanup completed"
}

# Clean up leftover Kubernetes resources
function Remove-KubernetesResources {
    Write-Info "Cleaning up leftover Kubernetes resources..."
    
    $ClusterName = "monty-unitree-eks"
    
    # Check if cluster exists
    try {
        $ClusterExists = aws eks describe-cluster --name $ClusterName --region $Region 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Info "Cluster does not exist or is already deleted"
            return
        }
    }
    catch {
        Write-Info "Cluster does not exist or is already deleted"
        return
    }
    
    # Check if kubectl is available
    try {
        $null = Get-Command kubectl -ErrorAction Stop
    }
    catch {
        Write-Warning "kubectl is not installed. Skipping Kubernetes cleanup."
        return
    }
    
    # Configure kubectl for the cluster
    Write-Info "Configuring kubectl for cluster: $ClusterName"
    aws eks update-kubeconfig --name $ClusterName --region $Region
    
    # Clean up any leftover Helm releases
    Write-Info "Checking for leftover Helm releases..."
    try {
        $HelmReleases = helm list --namespace kube-system --output json 2>&1
        if ($LASTEXITCODE -eq 0 -and $HelmReleases) {
            $Releases = $HelmReleases | ConvertFrom-Json
            foreach ($Release in $Releases) {
                Write-Warning "Uninstalling Helm release: $($Release.name)"
                helm uninstall $Release.name --namespace kube-system 2>&1 | Out-Null
            }
        }
    }
    catch {
        Write-Warning "Could not clean up Helm releases: $_"
    }
    
    # Clean up any leftover DaemonSets that might cause conflicts
    Write-Info "Checking for leftover DaemonSets in kube-system..."
    try {
        $DaemonSets = kubectl get daemonsets -n kube-system -o json 2>&1
        if ($LASTEXITCODE -eq 0 -and $DaemonSets) {
            $DS = $DaemonSets | ConvertFrom-Json
            foreach ($DSItem in $DS.items) {
                if ($DSItem.metadata.name -like "*nvidia*") {
                    Write-Warning "Deleting leftover DaemonSet: $($DSItem.metadata.name)"
                    kubectl delete daemonset $DSItem.metadata.name -n kube-system 2>&1 | Out-Null
                }
            }
        }
    }
    catch {
        Write-Warning "Could not clean up DaemonSets: $_"
    }
    
    Write-Success "Kubernetes resource cleanup completed"
}

# Main cleanup function
function Start-Cleanup {
    Write-Info "Starting cleanup process..."
    
    if ($DeleteStack) {
        Remove-CloudFormationStack
    }
    
    if ($DeleteResources) {
        Remove-ExistingResources
    }
    
    if ($CleanupKubernetes) {
        Remove-KubernetesResources
    }
    
    if (-not $DeleteStack -and -not $DeleteResources -and -not $CleanupKubernetes) {
        Write-Warning "No cleanup action specified. Use -DeleteStack, -DeleteResources, and/or -CleanupKubernetes"
        Write-Info "Run with -Help to see usage information"
        exit 1
    }
    
    Write-Success "Cleanup completed!"
}

# Run cleanup
Start-Cleanup

