#!/bin/bash

# Monty Unitree Simulation Platform Deployment Script
# This script deploys the complete infrastructure and application

set -e

# Configuration
STACK_NAME="MontyUnitreeStack"
REGION="us-east-1"
NAMESPACE="monty-sim"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check CDK
    if ! command -v cdk &> /dev/null; then
        log_error "AWS CDK is not installed. Please install it first."
        exit 1
    fi
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed. Please install it first."
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install it first."
        exit 1
    fi
    
    log_success "All prerequisites are installed"
}

# Deploy CDK infrastructure
deploy_infrastructure() {
    log_info "Deploying CDK infrastructure..."
    
    cd infrastructure
    
    # Install dependencies
    log_info "Installing CDK dependencies..."
    npm install
    
    # Bootstrap CDK (if needed)
    log_info "Bootstrapping CDK..."
    cdk bootstrap --region $REGION
    
    # Deploy the stack
    log_info "Deploying CDK stack..."
    cdk deploy --all --require-approval never
    
    cd ..
    log_success "Infrastructure deployed successfully"
}

# Get stack outputs
get_stack_outputs() {
    log_info "Getting stack outputs..."
    
    cd infrastructure
    
    # Get outputs using AWS CLI
    CLUSTER_NAME=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`ClusterName`].OutputValue' \
        --output text)
    
    CLUSTER_ENDPOINT=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`ClusterEndpoint`].OutputValue' \
        --output text)
    
    CHECKPOINTS_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`CheckpointsBucket`].OutputValue' \
        --output text)
    
    ARTIFACTS_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`ArtifactsBucket`].OutputValue' \
        --output text)
    
    MONTY_REPO_URI=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`MontyRepoURI`].OutputValue' \
        --output text)
    
    SIMULATOR_REPO_URI=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`SimulatorRepoURI`].OutputValue' \
        --output text)
    
    GLUE_REPO_URI=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`GlueRepoURI`].OutputValue' \
        --output text)
    
    cd ..
    
    log_success "Stack outputs retrieved"
    log_info "Cluster Name: $CLUSTER_NAME"
    log_info "Checkpoints Bucket: $CHECKPOINTS_BUCKET"
    log_info "Artifacts Bucket: $ARTIFACTS_BUCKET"
}

# Configure kubectl
configure_kubectl() {
    log_info "Configuring kubectl..."
    
    aws eks update-kubeconfig --region $REGION --name $CLUSTER_NAME
    
    # Verify connection
    kubectl get nodes
    
    log_success "kubectl configured successfully"
}

# Build and push Docker images
build_and_push_images() {
    log_info "Building and pushing Docker images..."
    
    # Get ECR login token
    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $MONTY_REPO_URI
    
    # Build orchestrator image
    log_info "Building orchestrator image..."
    docker build -t monty-orchestrator:latest ./backend
    
    # Tag and push orchestrator
    docker tag monty-orchestrator:latest $MONTY_REPO_URI:latest
    docker push $MONTY_REPO_URI:latest
    
    log_success "Docker images built and pushed"
}

# Deploy Kubernetes manifests
deploy_kubernetes() {
    log_info "Deploying Kubernetes manifests..."
    
    # Update ConfigMap with actual values
    sed -i.bak "s/monty-checkpoints-dev/$CHECKPOINTS_BUCKET/g" k8s/orchestrator-deployment.yaml
    sed -i.bak "s/sim-artifacts-dev/$ARTIFACTS_BUCKET/g" k8s/orchestrator-deployment.yaml
    sed -i.bak "s/123456789012.dkr.ecr.us-east-1.amazonaws.com/$(echo $MONTY_REPO_URI | cut -d'/' -f1)/g" k8s/orchestrator-deployment.yaml
    sed -i.bak "s/us-east-1/$REGION/g" k8s/orchestrator-deployment.yaml
    
    # Apply manifests
    kubectl apply -f k8s/orchestrator-deployment.yaml
    
    # Wait for deployment to be ready
    kubectl wait --for=condition=available --timeout=300s deployment/monty-orchestrator -n $NAMESPACE
    
    log_success "Kubernetes manifests deployed"
}

# Setup ingress
setup_ingress() {
    log_info "Setting up ingress..."
    
    # Create ingress for orchestrator
    cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: monty-orchestrator-ingress
  namespace: $NAMESPACE
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    alb.ingress.kubernetes.io/ssl-redirect: '443'
spec:
  rules:
  - host: monty-unitree.local  # Replace with your domain
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: monty-orchestrator-service
            port:
              number: 80
EOF
    
    log_success "Ingress configured"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check pods
    kubectl get pods -n $NAMESPACE
    
    # Check services
    kubectl get services -n $NAMESPACE
    
    # Check ingress
    kubectl get ingress -n $NAMESPACE
    
    # Test health endpoint
    ORCHESTRATOR_IP=$(kubectl get service monty-orchestrator-service -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    if [ ! -z "$ORCHESTRATOR_IP" ]; then
        log_info "Testing orchestrator health endpoint..."
        curl -f http://$ORCHESTRATOR_IP/health || log_warning "Health check failed, but deployment may still be starting"
    fi
    
    log_success "Deployment verification completed"
}

# Main deployment function
main() {
    log_info "Starting Monty Unitree Simulation Platform deployment..."
    
    check_prerequisites
    deploy_infrastructure
    get_stack_outputs
    configure_kubectl
    build_and_push_images
    deploy_kubernetes
    setup_ingress
    verify_deployment
    
    log_success "Deployment completed successfully!"
    log_info "You can now access the orchestrator API at the ingress endpoint"
    log_info "Frontend should be configured to point to the orchestrator service"
}

# Run main function
main "$@"
