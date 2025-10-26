#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MontyUnitreeStack } from './monty-unitree-stack';

const app = new cdk.App();

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Stack configuration
const stackProps = {
  env,
  description: 'Monty Unitree Simulation Platform on EKS',
  tags: {
    Project: 'MontyUnitree',
    Environment: 'dev',
  },
};

new MontyUnitreeStack(app, 'MontyUnitreeStack', stackProps);

app.synth();
