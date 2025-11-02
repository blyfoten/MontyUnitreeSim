# Monty Unitree Simulation Platform

A production-ready platform for running Monty + Unitree/Isaac Lab simulations on AWS EKS with GPU orchestration.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Frontend │    │ FastAPI Backend │    │   EKS Cluster   │
│                 │    │                 │    │                 │
│ • Run Config     │◄──►│ • Orchestrator  │◄──►│ • GPU NodeGroup │
│ • Glue Editor    │    │ • WebSocket     │    │ • CPU NodeGroup │
│ • Monitoring     │    │ • Job Manager   │    │ • Multi-Container│
└─────────────────┘    └─────────────────┘    │   Pods          │
                                              └─────────────────┘
                                                       │
                                              ┌─────────────────┐
                                              │   AWS Services  │
                                              │                 │
                                              │ • S3 Buckets    │
                                              │ • ECR Repos     │
                                              │ • IAM/IRSA      │
                                              └─────────────────┘
```

## Features

- **GPU Orchestration**: Automatic scheduling on EKS GPU nodes
- **Multi-Container Pods**: unitree-sim, monty, glue, artifact-uploader
- **Real-time Monitoring**: WebSocket streaming for logs and metrics
- **Artifact Management**: Automatic S3 upload of checkpoints and results
- **Job-per-Run Model**: Isolated simulations with automatic cleanup
- **Secure Access**: IRSA-based S3 permissions
- **Cost Optimization**: Spot instances and auto-scaling

## Quick Start

> **Already deployed?** Jump to [Access Guide](docs/ACCESS_GUIDE.md) to find your endpoints and troubleshoot access issues.  
> **Need to update tools?** Run `.\scripts\update-versions.ps1` to update AWS CLI, kubectl, and Helm.

### Prerequisites

**Cross-platform requirements:**
- AWS CLI configured with appropriate permissions
- AWS CDK installed (`npm install -g aws-cdk`)
- kubectl installed
- Docker installed (Docker Desktop on Windows)
- Node.js 18+ for frontend development

**Windows-specific:**
- PowerShell 5.1+ (PowerShell 7+ recommended)
- WSL 2 (optional, for better Docker performance)
- Git for Windows

**macOS/Linux:**
- Bash shell
- Standard Unix tools

### 1. Setup Development Environment

**Cross-platform setup:**
```bash
# Run the automated setup script
node scripts/setup-dev.js
```

**Windows:**
```powershell
# PowerShell
.\scripts\deploy.ps1

# Or batch file
deploy.bat
```

**macOS/Linux:**
```bash
# Bash
./scripts/deploy.sh
```

The deployment script will handle:
- CDK infrastructure deployment
- EKS cluster creation with GPU/CPU node groups
- S3 buckets and ECR repositories
- Kubernetes manifest deployment
- Docker image building and pushing

### 3. Configure Frontend

Update the frontend to connect to your orchestrator:

```typescript
// In hooks/useSimulationData.ts
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
```

### 4. Run Frontend Locally

**Windows:**
```powershell
# Option 1: Batch file
.\dev-frontend.bat

# Option 2: npm script
npm run dev
```

**macOS/Linux:**
```bash
# Option 1: Shell script
./dev-frontend.sh

# Option 2: npm script
npm run dev
```

## Project Structure

```
MontyUnitreeSim/
├── backend/                 # FastAPI orchestrator service
│   ├── main.py             # Main application
│   ├── requirements.txt    # Python dependencies
│   └── Dockerfile          # Container image
├── infrastructure/         # AWS CDK infrastructure
│   ├── lib/
│   │   └── monty-unitree-stack.ts
│   ├── bin/
│   │   └── app.ts
│   └── package.json
├── k8s/                    # Kubernetes manifests
│   └── orchestrator-deployment.yaml
├── scripts/                # Deployment scripts
│   └── deploy.sh
├── components/             # React frontend components
├── hooks/                  # React hooks
└── monty-unitree-eks-handoff/  # Reference documentation
```

## Configuration

### Environment Variables

**Backend (Orchestrator)**:
- `K8S_NAMESPACE`: Kubernetes namespace (default: monty-sim)
- `S3_CHECKPOINTS_BUCKET`: S3 bucket for checkpoints
- `S3_ARTIFACTS_BUCKET`: S3 bucket for artifacts
- `ECR_REGISTRY`: ECR registry URL
- `AWS_REGION`: AWS region

**Frontend**:
- `REACT_APP_API_URL`: Backend API URL

### CDK Configuration

Modify `infrastructure/lib/monty-unitree-stack.ts`:

```typescript
const stackProps = {
  clusterName: 'your-cluster-name',
  nodeInstanceType: 'c6i.large',
  gpuInstanceType: 'g5.2xlarge',
  minCapacity: 1,
  maxCapacity: 6,
  gpuMinCapacity: 0,
  gpuMaxCapacity: 4,
};
```

## Usage

### Creating a Simulation Run

1. **Configure Run**: Select Monty image, simulator image, and brain profile
2. **Edit Glue Code**: Write the observation-to-action bridge code
3. **Launch**: Click "Launch Run" to start the simulation
4. **Monitor**: Watch real-time logs and metrics in the monitoring panel

### Glue Code Contract

The glue code must implement the observation-to-action contract:

```python
# observation.schema.json
{
  "time": number,
  "imu": [ax, ay, az, gx, gy, gz],
  "base_vel": [vx, vy, wz],
  "base_pose": {"roll": r, "pitch": p, "yaw": y, "height": h},
  "joints": {"q": [...], "qd": [...], "tau": [...]},
  "contacts": {"feet": [true, true, false, false]},
  "nociceptor": 0.14,
  "energy_rate": 127.5
}

# action.schema.json
{
  "cmd_type": "base",
  "base_cmd": {
    "vx": 0.6,
    "vy": 0.0,
    "yaw_rate": 0.1,
    "body_pitch": -0.05,
    "gait": "trot"
  }
}
```

## API Reference

### REST Endpoints

- `GET /runs` - List all simulation runs
- `POST /runs` - Create a new simulation run
- `GET /runs/{id}` - Get specific run details
- `DELETE /runs/{id}` - Cancel a running simulation
- `GET /runs/{id}/logs` - Get run logs
- `GET /runs/{id}/metrics` - Get run metrics
- `GET /images/monty` - List available Monty images
- `GET /images/simulator` - List available simulator images
- `GET /brain-profiles` - List brain profiles

### WebSocket Endpoints

- `WS /ws/{run_id}` - Real-time logs and metrics streaming

## Monitoring and Observability

### Logs
- Real-time streaming via WebSocket
- Structured logging with levels (INFO, WARN, ERROR, DEBUG)
- Automatic S3 archival

### Metrics
- Reward, energy, nociceptor values
- Real-time visualization
- Historical data storage

### Kubernetes Monitoring
- Pod status and resource usage
- Job completion status
- Node group scaling events

## Cost Optimization

### Spot Instances
Configure GPU node group for spot instances:

```typescript
const gpuNodeGroup = this.cluster.addNodegroupCapacity('GpuNodeGroup', {
  instanceTypes: [ec2.InstanceType.of(ec2.InstanceClass.G5, ec2.InstanceSize.XLARGE2)],
  capacityType: eks.CapacityType.SPOT, // Use spot instances
  // ... other config
});
```

### Auto-scaling
- CPU nodes scale based on orchestrator load
- GPU nodes scale to zero when no simulations running
- Automatic cleanup with TTL

### S3 Lifecycle
- Logs transition to IA after 30 days
- Videos transition to Glacier after 60 days
- Automatic deletion after 90 days

## Security

### IAM Roles
- IRSA (IAM Roles for Service Accounts)
- Least-privilege S3 access
- No long-term credentials

### Network Security
- Private subnets for worker nodes
- Public ALB only for API access
- Security groups restrict traffic

### Container Security
- Non-root containers
- Image scanning enabled
- Regular security updates

## Troubleshooting

### Common Issues

**GPU Scheduling Fails**:
```bash
kubectl describe pod <pod-name> -n monty-sim
kubectl get nodes --show-labels
```

**NVIDIA Device Plugin Conflicts**:
If you encounter a deployment failure with the message "daemonsets.apps already exists":
```powershell
# Run the cleanup script with Kubernetes cleanup
.\scripts\cleanup.ps1 -CleanupKubernetes

# Or manually clean up if the cluster still exists
kubectl delete daemonset -n kube-system --selector app.kubernetes.io/instance=nvidia-device-plugin
helm uninstall nvidia-device-plugin -n kube-system
```
The deployment script now automatically handles this during rollback scenarios.

**WebRTC Connection Issues**:
- Check TURN server configuration
- Verify security group rules
- Test TCP fallback

**S3 Upload Failures**:
```bash
kubectl logs <pod-name> -c artifact-uploader -n monty-sim
```

**Orchestrator Health Check**:
```bash
kubectl get pods -n monty-sim
curl http://<orchestrator-ip>/health
```

### Windows-Specific Issues

**PowerShell Execution Policy**:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Docker Desktop Not Running**:
- Start Docker Desktop
- Enable WSL 2 backend
- Check Windows Defender exclusions

**AWS Credentials Not Found**:
```powershell
aws configure
aws sts get-caller-identity
```

**Path Issues**:
- Restart PowerShell after installing AWS CLI
- Check PATH environment variable
- Use full paths if needed

For detailed Windows troubleshooting, see [Windows Development Guide](docs/WINDOWS_DEVELOPMENT.md).

### Debugging Commands

```bash
# Check cluster status
kubectl get nodes
kubectl get pods -n monty-sim

# View logs
kubectl logs -f deployment/monty-orchestrator -n monty-sim

# Check job status
kubectl get jobs -n monty-sim
kubectl describe job <job-name> -n monty-sim

# Monitor resources
kubectl top nodes
kubectl top pods -n monty-sim
```

## Development

### Local Development

**Backend**:
```bash
# Windows
.\dev-backend.bat
# Or
cd backend && uvicorn main:app --reload

# macOS/Linux
./dev-backend.sh
# Or
cd backend && uvicorn main:app --reload
```

**Frontend**:
```bash
# Windows
.\dev-frontend.bat
# Or
npm run dev

# macOS/Linux
./dev-frontend.sh
# Or
npm run dev
```

### Testing

**API Testing**:
```bash
# Windows PowerShell
Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing

# Cross-platform
curl http://localhost:8000/health
```

**WebSocket Testing**:
```bash
# Install wscat globally
npm install -g wscat

# Test WebSocket connection
wscat -c ws://localhost:8000/ws/test-run
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

[Your License Here]

## Support

For issues and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the reference documentation in `monty-unitree-eks-handoff/`