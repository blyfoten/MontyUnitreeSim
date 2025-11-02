# Access Guide for Monty Unitree Platform

This guide explains how to access your deployed platform and troubleshoot access issues.

## Current Status

Your infrastructure is deployed and includes:
- ✅ EKS Cluster: `monty-unitree-eks` in `eu-west-1`
- ✅ VPC with public and private subnets
- ✅ S3 Buckets: Checkpoints and Artifacts
- ✅ ECR Repositories: monty, unitree-sim, glue-base
- ✅ EKS Node Groups: CPU and GPU
- ✅ Helm Charts: NVIDIA Device Plugin, Metrics Server, Cluster Autoscaler, AWS Load Balancer Controller

## Access Methods

### 1. Using kubectl Port-Forward (Quick Start)

This is the fastest way to access the API when the full application isn't deployed yet:

```powershell
# Configure kubectl
aws eks update-kubeconfig --region eu-west-1 --name monty-unitree-eks

# Port-forward the orchestrator service (if deployed)
kubectl port-forward -n monty-sim svc/monty-orchestrator-service 8000:80

# In another terminal, test the API
curl http://localhost:8000/health
```

**Access Points:**
- Health endpoint: http://localhost:8000/health
- API docs: http://localhost:8000/docs
- Main API: http://localhost:8000/api

### 2. Using AWS ALB (Production Access)

Once the AWS Load Balancer Controller provisions an ALB:

```powershell
# Get the ALB DNS name
kubectl get ingress -n monty-sim -o jsonpath='{.items[0].status.loadBalancer.ingress[0].hostname}'

# Or use the helper script
.\scripts\get-endpoint.ps1
```

The ALB will be accessible at the returned hostname.

### 3. Direct Cluster Access

Access the Kubernetes API directly:

```powershell
# Configure kubectl
aws eks update-kubeconfig --region eu-west-1 --name monty-unitree-eks

# Check cluster status
kubectl get nodes
kubectl get pods -A
kubectl get services -A
```

## Troubleshooting Access Issues

### Issue: kubectl Authentication Error

**Error:** `error: exec plugin: invalid apiVersion "client.authentication.k8s.io/v1alpha1"`

**Solution:**
```powershell
# Update kubectl to latest version
# Windows: Download from https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/
# Or use Chocolatey: choco install kubernetes-cli

# Or use aws-cli v2 which has better support
# Windows: Download from https://awscli.amazonaws.com/AWSCLIV2.msi

# After updating, reconfigure kubectl
aws eks update-kubeconfig --region eu-west-1 --name monty-unitree-eks
```

### Issue: No Application Deployed

**Symptoms:** Can connect to cluster but no pods/services visible

**Solution:** Deploy the application manually:

```powershell
# Make sure Docker Desktop is running
docker ps

# Deploy the application
.\scripts\deploy.ps1 -SkipInfrastructure

# Or manually:
cd infrastructure
.\scripts\deploy.ps1
```

### Issue: Ingress Not Provisioning ALB

**Check AWS Load Balancer Controller:**

```powershell
# Check if controller is running
kubectl get pods -n kube-system | findstr load-balancer-controller

# Check controller logs
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Check ingress status
kubectl describe ingress -n monty-sim
```

**Common issues:**
- Controller pod not running: Check IAM roles
- Missing service account: Need to create IRSA role
- VPC/Subnet issues: Check controller can discover resources

### Issue: Can't Access Cluster

**Check Network Connectivity:**

```powershell
# Verify cluster endpoint is accessible
$ENDPOINT = "https://562CF25EC995866796791FCB1002A4DD.gr7.eu-west-1.eks.amazonaws.com"
curl -k $ENDPOINT

# Check your IP is in the allowlist (if configured)
# Check security groups
aws ec2 describe-security-groups --region eu-west-1 --filters "Name=tag:aws:eks:cluster-name,Values=monty-unitree-eks"

# Check route tables
aws ec2 describe-route-tables --region eu-west-1
```

### Issue: Docker Desktop Not Running

**Solution:**

```powershell
# Start Docker Desktop manually
# Or check status:
Get-Process "Docker Desktop" -ErrorAction SilentlyContinue

# If not running, start it:
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# Wait for it to start
Start-Sleep -Seconds 30
docker ps
```

## Quick Access Commands

**Create aliases in PowerShell profile:**

```powershell
# Add to $PROFILE
notepad $PROFILE

# Add these lines:
function Set-MontyCluster {
    aws eks update-kubeconfig --region eu-west-1 --name monty-unitree-eks
}

function Get-MontyEndpoint {
    .\scripts\get-endpoint.ps1
}

function Start-MontyForward {
    kubectl port-forward -n monty-sim svc/monty-orchestrator-service 8000:80
}

# Reload profile
. $PROFILE
```

**Usage:**
```powershell
Set-MontyCluster    # Configure kubectl
Get-MontyEndpoint   # Show endpoints
Start-MontyForward  # Start port-forward
```

## Full Deployment Checklist

To deploy the complete application:

- [ ] Update kubectl to latest version
- [ ] Ensure Docker Desktop is running
- [ ] Configure kubectl for cluster
- [ ] Build and push Docker images
- [ ] Deploy Kubernetes manifests
- [ ] Wait for ALB provisioning
- [ ] Test endpoints

**Run full deployment:**
```powershell
.\deploy.bat
```

## Next Steps

1. **Fix kubectl authentication** (see above)
2. **Deploy the application** with proper images
3. **Set up the frontend** to connect to the orchestrator
4. **Create simulation runs** and monitor them

## Useful Resources

- [EKS User Guide](https://docs.aws.amazon.com/eks/latest/userguide/)
- [kubectl Troubleshooting](https://kubernetes.io/docs/tasks/tools/)
- [AWS Load Balancer Controller](https://github.com/kubernetes-sigs/aws-load-balancer-controller)

## Get Help

```powershell
# Check all resources
aws cloudformation describe-stacks --stack-name MontyUnitreeStack --region eu-west-1

# View deployment logs
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# View orchestrator logs
kubectl logs -n monty-sim deployment/monty-orchestrator

# Get cluster info
.\scripts\get-endpoint.ps1
```

