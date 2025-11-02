#!/usr/bin/env node
/**
 * Cross-platform development setup script
 * Works on Windows (PowerShell), macOS, and Linux
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(level, message) {
  const timestamp = new Date().toISOString();
  const color = colors[level] || colors.reset;
  console.log(`${color}[${level.toUpperCase()}]${colors.reset} ${message}`);
}

function isWindows() {
  return os.platform() === 'win32';
}

function isMacOS() {
  return os.platform() === 'darwin';
}

function isLinux() {
  return os.platform() === 'linux';
}

function checkCommand(command) {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    try {
      execSync(`where ${command}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

function installPrerequisites() {
  log('info', 'Checking prerequisites...');
  
  const prerequisites = [
    { name: 'Node.js', command: 'node', install: 'https://nodejs.org/' },
    { name: 'npm', command: 'npm', install: 'https://nodejs.org/' },
    { name: 'AWS CLI', command: 'aws', install: 'https://aws.amazon.com/cli/' },
    { name: 'Docker', command: 'docker', install: 'https://www.docker.com/products/docker-desktop' },
    { name: 'kubectl', command: 'kubectl', install: 'https://kubernetes.io/docs/tasks/tools/' }
  ];

  const missing = [];
  
  for (const prereq of prerequisites) {
    if (checkCommand(prereq.command)) {
      log('success', `${prereq.name} is installed`);
    } else {
      log('error', `${prereq.name} is not installed`);
      missing.push(prereq);
    }
  }

  if (missing.length > 0) {
    log('error', 'Missing prerequisites:');
    missing.forEach(prereq => {
      console.log(`  - ${prereq.name}: ${prereq.install}`);
    });
    process.exit(1);
  }

  // Check AWS CDK separately
  try {
    execSync('cdk --version', { stdio: 'ignore' });
    log('success', 'AWS CDK is installed');
  } catch {
    log('warning', 'AWS CDK not found, installing globally...');
    try {
      execSync('npm install -g aws-cdk', { stdio: 'inherit' });
      log('success', 'AWS CDK installed');
    } catch {
      log('error', 'Failed to install AWS CDK. Please install manually: npm install -g aws-cdk');
      process.exit(1);
    }
  }
}

function setupEnvironment() {
  log('info', 'Setting up development environment...');
  
  // Create .env.local for frontend
  const envContent = `# Monty Unitree Simulation Platform Environment Variables
# Backend API URL (update this to your deployed orchestrator endpoint)
REACT_APP_API_URL=http://localhost:8000

# AWS Configuration (for local development)
AWS_REGION=us-east-1
AWS_PROFILE=default

# Kubernetes Configuration
K8S_NAMESPACE=monty-sim

# S3 Buckets (will be set after infrastructure deployment)
S3_CHECKPOINTS_BUCKET=monty-checkpoints-dev
S3_ARTIFACTS_BUCKET=sim-artifacts-dev

# ECR Registry (will be set after infrastructure deployment)
ECR_REGISTRY=123456789012.dkr.ecr.us-east-1.amazonaws.com
`;

  if (!fs.existsSync('.env.local')) {
    fs.writeFileSync('.env.local', envContent);
    log('success', 'Created .env.local file');
  } else {
    log('info', '.env.local already exists');
  }

  // Create .env for backend
  const backendEnvContent = `# Backend Environment Variables
K8S_NAMESPACE=monty-sim
S3_CHECKPOINTS_BUCKET=monty-checkpoints-dev
S3_ARTIFACTS_BUCKET=sim-artifacts-dev
ECR_REGISTRY=123456789012.dkr.ecr.us-east-1.amazonaws.com
AWS_REGION=us-east-1
`;

  if (!fs.existsSync('backend/.env')) {
    fs.writeFileSync('backend/.env', backendEnvContent);
    log('success', 'Created backend/.env file');
  } else {
    log('info', 'backend/.env already exists');
  }
}

function installDependencies() {
  log('info', 'Installing dependencies...');
  
  // Install frontend dependencies
  if (fs.existsSync('package.json')) {
    log('info', 'Installing frontend dependencies...');
    try {
      execSync('npm install', { stdio: 'inherit' });
      log('success', 'Frontend dependencies installed');
    } catch {
      log('error', 'Failed to install frontend dependencies');
      process.exit(1);
    }
  }

  // Install backend dependencies
  if (fs.existsSync('backend/requirements.txt')) {
    log('info', 'Installing backend dependencies...');
    try {
      execSync('pip install -r backend/requirements.txt', { stdio: 'inherit' });
      log('success', 'Backend dependencies installed');
    } catch {
      log('warning', 'Failed to install backend dependencies with pip. You may need to install Python dependencies manually.');
    }
  }

  // Install CDK dependencies
  if (fs.existsSync('infrastructure/package.json')) {
    log('info', 'Installing CDK dependencies...');
    try {
      execSync('cd infrastructure && npm install', { stdio: 'inherit' });
      log('success', 'CDK dependencies installed');
    } catch {
      log('error', 'Failed to install CDK dependencies');
      process.exit(1);
    }
  }
}

function createDevelopmentScripts() {
  log('info', 'Creating development scripts...');
  
  const scripts = {
    'dev-frontend': 'npm run dev',
    'dev-backend': 'cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000',
    'build-infrastructure': 'cd infrastructure && cdk synth',
    'deploy-infrastructure': 'cd infrastructure && cdk deploy --all',
    'test-api': 'curl http://localhost:8000/health',
    'kubectl-config': 'aws eks update-kubeconfig --region us-east-1 --name monty-unitree-eks'
  };

  // Update package.json scripts
  if (fs.existsSync('package.json')) {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    packageJson.scripts = { ...packageJson.scripts, ...scripts };
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
    log('success', 'Updated package.json scripts');
  }
}

function createWindowsBatchFiles() {
  if (!isWindows()) return;
  
  log('info', 'Creating Windows batch files...');
  
  // Create dev-frontend.bat
  const devFrontendBat = `@echo off
echo Starting frontend development server...
npm run dev
pause
`;
  fs.writeFileSync('dev-frontend.bat', devFrontendBat);

  // Create dev-backend.bat
  const devBackendBat = `@echo off
echo Starting backend development server...
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
pause
`;
  fs.writeFileSync('dev-backend.bat', devBackendBat);

  // Create deploy.bat
  const deployBat = `@echo off
echo Deploying Monty Unitree Simulation Platform...
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
pause
`;
  fs.writeFileSync('deploy.bat', deployBat);

  log('success', 'Created Windows batch files');
}

function createUnixScripts() {
  if (isWindows()) return;
  
  log('info', 'Creating Unix scripts...');
  
  // Create dev-frontend.sh
  const devFrontendSh = `#!/bin/bash
echo "Starting frontend development server..."
npm run dev
`;
  fs.writeFileSync('dev-frontend.sh', devFrontendSh);

  // Create dev-backend.sh
  const devBackendSh = `#!/bin/bash
echo "Starting backend development server..."
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
`;
  fs.writeFileSync('dev-backend.sh', devBackendSh);

  // Make scripts executable
  try {
    execSync('chmod +x dev-frontend.sh dev-backend.sh scripts/deploy.sh', { stdio: 'inherit' });
    log('success', 'Created Unix scripts and made them executable');
  } catch {
    log('warning', 'Failed to make scripts executable');
  }
}

function displayInstructions() {
  log('info', 'Development environment setup complete!');
  
  console.log('\n' + '='.repeat(60));
  console.log('🚀 MONTY UNITTREE SIMULATION PLATFORM - DEVELOPMENT SETUP');
  console.log('='.repeat(60));
  
  console.log('\n📋 Next Steps:');
  console.log('1. Configure AWS credentials: aws configure');
  console.log('2. Update .env.local with your AWS region and settings');
  console.log('3. Deploy infrastructure:');
  
  if (isWindows()) {
    console.log('   - Windows: .\\deploy.bat or powershell -File scripts/deploy.ps1');
  } else {
    console.log('   - Unix: ./scripts/deploy.sh');
  }
  
  console.log('4. Start development servers:');
  
  if (isWindows()) {
    console.log('   - Frontend: .\\dev-frontend.bat');
    console.log('   - Backend: .\\dev-backend.bat');
  } else {
    console.log('   - Frontend: ./dev-frontend.sh or npm run dev');
    console.log('   - Backend: ./dev-backend.sh or npm run dev-backend');
  }
  
  console.log('\n🔧 Development Commands:');
  console.log('- Test API: npm run test-api');
  console.log('- Build infrastructure: npm run build-infrastructure');
  console.log('- Deploy infrastructure: npm run deploy-infrastructure');
  console.log('- Configure kubectl: npm run kubectl-config');
  
  console.log('\n📚 Documentation:');
  console.log('- README.md: Complete setup and usage guide');
  console.log('- monty-unitree-eks-handoff/: Reference architecture');
  
  console.log('\n🆘 Troubleshooting:');
  console.log('- Check prerequisites are installed');
  console.log('- Verify AWS credentials: aws sts get-caller-identity');
  console.log('- Check Docker is running');
  console.log('- Review logs for specific error messages');
  
  console.log('\n' + '='.repeat(60));
}

// Main execution
function main() {
  try {
    log('info', 'Setting up Monty Unitree Simulation Platform development environment...');
    
    installPrerequisites();
    setupEnvironment();
    installDependencies();
    createDevelopmentScripts();
    createWindowsBatchFiles();
    createUnixScripts();
    displayInstructions();
    
    log('success', 'Development environment setup completed successfully!');
  } catch (error) {
    log('error', `Setup failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('setup-dev.js')) {
  main();
}

export { main };
