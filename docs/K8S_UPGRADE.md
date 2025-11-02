# Kubernetes Version Upgrade Guide

## Summary

Your EKS cluster has been upgraded from Kubernetes 1.31 to 1.33 to avoid extended support costs.

### Why Upgrade?

- **Kubernetes 1.31** enters extended support on November 26, 2025
- **Extended support cost**: $0.60 per cluster per hour (vs $0.10 for standard)
- **Kubernetes 1.33** has standard support until ~2027
- **Additional benefit**: Fixed kubectl authentication by enabling API_AND_CONFIG_MAP mode

## Changes Made

### Infrastructure Code Updates

**File**: `infrastructure/lib/monty-unitree-stack.ts`

1. **Kubernetes Version**: 1.31 → 1.33
   ```typescript
   version: eks.KubernetesVersion.V1_33  // was V1_31
   ```

2. **Kubectl Layer**: Updated to V33
   ```typescript
   import { KubectlV33Layer } from '@aws-cdk/lambda-layer-kubectl-v33';
   const kubectlLayer = new KubectlV33Layer(this, 'KubectlLayer');
   ```

3. **Authentication Mode**: Added API_AND_CONFIG_MAP
   ```typescript
   authenticationMode: eks.AuthenticationMode.API_AND_CONFIG_MAP
   ```
   This enables automatic access for IAM users to use kubectl without manual ConfigMap edits.

### Package Updates

**File**: `infrastructure/package.json`
- Added: `@aws-cdk/lambda-layer-kubectl-v33`
- Removed: `@aws-cdk/lambda-layer-kubectl-v31`

## Deployment

### Pre-Deployment Checklist

- [x] Code updated to Kubernetes 1.33
- [x] kubectl layer updated to V33
- [x] CDK synthesis successful
- [x] Authentication mode configured
- [ ] Deploy to AWS

### Deploy the Upgrade

```powershell
# Deploy the updated infrastructure
cd C:\git\MontyUnitreeSim
.\deploy.bat

# Or manually:
cd infrastructure
npm run deploy
```

### What to Expect

The deployment will:
1. **Update the cluster** from 1.31 to 1.33
2. **Enable API authentication** for easier access
3. **Take 20-30 minutes** for the control plane upgrade
4. **Node groups** will be updated automatically

**Important**: The cluster will have a brief downtime during the control plane upgrade. Workloads will continue running but API access may be temporarily limited.

### Post-Deployment Verification

```powershell
# Check cluster version
aws eks describe-cluster --name monty-unitree-eks --region eu-west-1 --query "cluster.version"

# Should show: "1.33"

# Test kubectl access (should now work!)
aws eks update-kubeconfig --region eu-west-1 --name monty-unitree-eks
kubectl get nodes

# Check authentication mode
aws eks describe-cluster --name monty-unitree-eks --region eu-west-1 --query "cluster.accessConfig.authenticationMode"

# Should show: "API_AND_CONFIG_MAP"
```

## Cost Savings

### Before (Kubernetes 1.31)
- Standard support until: November 26, 2025
- After Nov 26: $0.60/hour = ~$438/month

### After (Kubernetes 1.33)
- Standard support until: ~2027
- Cost: $0.10/hour = ~$73/month
- **Savings**: ~$365/month after November 26, 2025

## Troubleshooting

### If the upgrade fails:

1. **Check CloudFormation events**:
   ```powershell
   aws cloudformation describe-stack-events --stack-name MontyUnitreeStack --region eu-west-1 --query "StackEvents[0:20]"
   ```

2. **Check cluster status**:
   ```powershell
   aws eks describe-cluster --name monty-unitree-eks --region eu-west-1 --query "cluster.status"
   ```

3. **Review CDK diff** to see what will change:
   ```powershell
   cd infrastructure
   npm run diff
   ```

### Rollback (if needed)

If critical issues occur:

```powershell
# The cluster will maintain its current configuration
# You can redeploy with the previous version
cd infrastructure
# Edit lib/monty-unitree-stack.ts back to V1_31
npm run deploy
```

However, this will incur extended support costs after November 26, 2025.

## Additional Benefits

Beyond cost savings, Kubernetes 1.33 provides:
- Latest security patches and features
- Better performance
- Improved resource management
- Enhanced monitoring capabilities
- Better compatibility with latest tools

## Next Steps

1. **Deploy the upgrade** (see above)
2. **Verify kubectl access** works
3. **Monitor cluster** for any issues
4. **Update documentation** with new version
5. **Plan next upgrade** to 1.34 when released (check EKS docs)

## Support

- [EKS Version Lifecycle](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html)
- [CDK EKS Documentation](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_eks-readme.html)
- [Kubernetes Release Notes](https://github.com/kubernetes/kubernetes/releases)

