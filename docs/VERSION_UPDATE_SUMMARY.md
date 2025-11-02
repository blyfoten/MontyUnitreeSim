# Version Update Summary

## ✅ Successfully Updated

1. **AWS CLI v2**: Updated from v2.0.30 (2020) to v2.31.26
   - Download: `winget upgrade -h Amazon.AWSCLI`
   - Status: Working correctly, can authenticate and manage AWS resources

2. **Helm**: Installed v3.19.0
   - Download: `winget install Helm.Helm`
   - Status: Installed and ready to use

3. **kubectl**: v1.30.5
   - Status: Already at a compatible version

## ⚠️ Issue: kubectl Authentication

**Problem**: kubectl cannot authenticate with the EKS cluster
- Error: "the server has asked for the client to provide credentials"
- Status: 401 Unauthorized

**Root Cause**: The EKS cluster is configured with CONFIG_MAP authentication mode, which requires the IAM user to be explicitly added to the cluster's aws-auth ConfigMap.

**Investigation Results**:
- ✅ AWS CLI v2 can generate valid tokens
- ✅ `aws eks get-token` command works correctly
- ✅ Cluster exists and is in ACTIVE state
- ✅ Cluster endpoint is publicly accessible
- ❌ kubectl cannot use the token to authenticate

## Solutions

### Option 1: Add IAM User to aws-auth ConfigMap (Current Mode)

Since the cluster uses CONFIG_MAP authentication, add your IAM user:

```powershell
# Get your IAM user ARN
$USER_ARN = (aws sts get-caller-identity | ConvertFrom-Json).Arn

# Edit the aws-auth ConfigMap (requires access via CDK or another method)
# Or update via CDK stack to include access configuration
```

### Option 2: Update Cluster to API/API_AND_CONFIG_MAP Mode

Update the CDK stack to use API authentication mode which auto-grants access to the creator:

```typescript
// In infrastructure/lib/monty-unitree-stack.ts
this.cluster = new eks.Cluster(this, 'MontyUnitreeCluster', {
  // ... other config ...
  accessConfig: {
    authenticationMode: eks.AuthenticationMode.API_AND_CONFIG_MAP,
  }
});
```

Then redeploy: `cdk deploy`

### Option 3: Quick Workaround - Use Port-Forward Locally

For immediate access while fixing authentication:

```powershell
# Use the CDK's kubectl layer approach
# Or access via AWS Console
# Or use aws eks update-kubeconfig with proper access
```

## Current Status

✅ **Infrastructure**: Fully deployed and operational
- EKS Cluster: monty-unitree-eks (ACTIVE)
- VPC, Subnets, Security Groups: ✓
- S3 Buckets: ✓
- ECR Repositories: ✓
- Node Groups: CPU and GPU ✓
- Helm Charts: Installed via CDK ✓

⚠️ **Access**: kubectl authentication needs configuration

## Next Steps

1. **Short Term**: Use AWS Console or update cluster authentication mode
2. **Long Term**: Update CDK stack to use API_AND_CONFIG_MAP mode for easier access
3. **Development**: Access via port-forward or use the application directly without kubectl

## Useful Commands

```powershell
# Check versions
aws --version
helm version
kubectl version --client

# Try authentication
aws eks get-token --cluster-name monty-unitree-eks --region eu-west-1

# Check cluster status
aws eks describe-cluster --name monty-unitree-eks --region eu-west-1 --query "cluster.status"

# Get your IAM identity
aws sts get-caller-identity
```

## Documentation

- Main access guide: `docs/ACCESS_GUIDE.md`
- This summary: `docs/VERSION_UPDATE_SUMMARY.md`
- Deployment guide: `README.md`

