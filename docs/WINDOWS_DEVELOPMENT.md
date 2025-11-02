# Windows Development Guide

This guide covers Windows-specific setup and troubleshooting for the Monty Unitree Simulation Platform.

## Prerequisites Installation

### 1. Node.js and npm
```powershell
# Download from https://nodejs.org/
# Or use Chocolatey:
choco install nodejs

# Verify installation:
node --version
npm --version
```

### 2. AWS CLI
```powershell
# Download MSI installer from https://aws.amazon.com/cli/
# Or use Chocolatey:
choco install awscli

# Verify installation:
aws --version
aws configure
```

### 3. Docker Desktop
```powershell
# Download from https://www.docker.com/products/docker-desktop
# Enable WSL 2 backend for better performance
# Verify installation:
docker --version
docker run hello-world
```

### 4. kubectl
```powershell
# Download from https://kubernetes.io/docs/tasks/tools/
# Or use Chocolatey:
choco install kubernetes-cli

# Verify installation:
kubectl version --client
```

### 5. AWS CDK
```powershell
npm install -g aws-cdk
cdk --version
```

## Development Setup

### Quick Setup
```powershell
# Run the cross-platform setup script
node scripts/setup-dev.js

# Or manually:
npm install
cd infrastructure && npm install
pip install -r backend/requirements.txt
```

### Environment Configuration
Create `.env.local` in the project root:
```env
REACT_APP_API_URL=http://localhost:8000
AWS_REGION=us-east-1
AWS_PROFILE=default
```

## Deployment

### Option 1: PowerShell Script (Recommended)
```powershell
# Make sure execution policy allows scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Run deployment
.\scripts\deploy.ps1

# With custom parameters
.\scripts\deploy.ps1 -Region eu-west-1 -StackName MyMontyStack
```

### Option 2: Batch File
```cmd
deploy.bat
```

### Option 3: Manual Steps
```powershell
# 1. Deploy infrastructure
cd infrastructure
npm install
cdk bootstrap
cdk deploy --all

# 2. Configure kubectl
aws eks update-kubeconfig --region us-east-1 --name monty-unitree-eks

# 3. Build and push images
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ecr-registry>
docker build -t monty-orchestrator:latest ./backend
docker tag monty-orchestrator:latest <ecr-registry>/monty-orchestrator:latest
docker push <ecr-registry>/monty-orchestrator:latest

# 4. Deploy Kubernetes manifests
kubectl apply -f k8s/orchestrator-deployment.yaml
```

## Development Servers

### Frontend Development
```powershell
# Option 1: Batch file
.\dev-frontend.bat

# Option 2: npm script
npm run dev

# Option 3: Direct command
npm run dev
```

### Backend Development
```powershell
# Option 1: Batch file
.\dev-backend.bat

# Option 2: npm script
npm run dev-backend

# Option 3: Direct command
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Common Windows Issues

### 1. PowerShell Execution Policy
**Error**: `execution of scripts is disabled on this system`

**Solution**:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 2. Docker Desktop Not Running
**Error**: `Cannot connect to the Docker daemon`

**Solution**:
- Start Docker Desktop
- Ensure WSL 2 backend is enabled
- Restart Docker Desktop if needed

### 3. AWS Credentials Not Found
**Error**: `Unable to locate credentials`

**Solution**:
```powershell
aws configure
# Enter your Access Key ID, Secret Access Key, region, and output format
```

### 4. kubectl Context Issues
**Error**: `error: the server doesn't have a resource type "nodes"`

**Solution**:
```powershell
# Update kubeconfig
aws eks update-kubeconfig --region us-east-1 --name monty-unitree-eks

# Verify context
kubectl config current-context
kubectl get nodes
```

### 5. Python Dependencies Issues
**Error**: `pip install` fails

**Solution**:
```powershell
# Use Python from Microsoft Store or install from python.org
python --version
pip --version

# Install dependencies
pip install -r backend/requirements.txt

# If pip fails, try:
python -m pip install -r backend/requirements.txt
```

### 6. Node.js Version Issues
**Error**: `npm install` fails with version conflicts

**Solution**:
```powershell
# Use Node Version Manager for Windows (nvm-windows)
# Download from https://github.com/coreybutler/nvm-windows

# Install and use Node.js 18+
nvm install 18.17.0
nvm use 18.17.0
```

### 7. Path Issues
**Error**: `'aws' is not recognized as an internal or external command`

**Solution**:
```powershell
# Add AWS CLI to PATH
$env:PATH += ";C:\Program Files\Amazon\AWSCLIV2"

# Or restart PowerShell/Command Prompt after installation
```

### 8. File Permission Issues
**Error**: `Access denied` when creating files

**Solution**:
```powershell
# Run PowerShell as Administrator
# Or change file permissions
icacls "C:\path\to\project" /grant Everyone:F /T
```

## Performance Optimization

### 1. Docker Desktop Settings
- Enable WSL 2 backend
- Increase memory allocation (8GB+ recommended)
- Enable file sharing for project directory

### 2. Windows Defender Exclusions
Add exclusions for:
- Project directory
- Docker Desktop
- Node.js installation
- Python installation

### 3. WSL 2 Integration
```powershell
# Enable WSL 2
wsl --install
wsl --set-default-version 2

# Use WSL 2 for Docker Desktop
# In Docker Desktop settings: General > Use WSL 2 based engine
```

## Testing

### API Testing
```powershell
# Test health endpoint
Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing

# Test with curl (if installed)
curl http://localhost:8000/health
```

### Kubernetes Testing
```powershell
# Check cluster status
kubectl get nodes
kubectl get pods -n monty-sim
kubectl get services -n monty-sim

# View logs
kubectl logs -f deployment/monty-orchestrator -n monty-sim
```

## Useful Windows Commands

### PowerShell Aliases
```powershell
# Add to PowerShell profile
Set-Alias -Name ll -Value Get-ChildItem
Set-Alias -Name grep -Value Select-String

# Create useful functions
function k { kubectl $args }
function aws-eks-config { aws eks update-kubeconfig --region us-east-1 --name monty-unitree-eks }
```

### Batch File Helpers
Create `helpers.bat`:
```batch
@echo off
if "%1"=="deploy" (
    powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
) else if "%1"=="dev" (
    start cmd /k "npm run dev"
    start cmd /k "cd backend && uvicorn main:app --reload"
) else if "%1"=="test" (
    curl http://localhost:8000/health
) else (
    echo Usage: helpers.bat [deploy^|dev^|test]
)
```

## Troubleshooting Checklist

- [ ] All prerequisites installed and verified
- [ ] AWS credentials configured (`aws sts get-caller-identity`)
- [ ] Docker Desktop running and accessible
- [ ] PowerShell execution policy allows scripts
- [ ] Project dependencies installed (`npm install`)
- [ ] Environment variables set correctly
- [ ] kubectl context configured
- [ ] EKS cluster deployed and accessible
- [ ] ECR repositories created
- [ ] S3 buckets created and accessible

## Getting Help

1. Check the main README.md for general troubleshooting
2. Review AWS EKS documentation for cluster issues
3. Check Docker Desktop logs for container issues
4. Review Kubernetes documentation for kubectl issues
5. Check AWS CloudFormation console for deployment issues

## Performance Tips

- Use WSL 2 for better Docker performance
- Exclude project directory from Windows Defender
- Use SSD storage for better I/O performance
- Allocate sufficient memory to Docker Desktop (8GB+)
- Use PowerShell 7+ for better performance
- Enable Windows Subsystem for Linux for Unix compatibility
