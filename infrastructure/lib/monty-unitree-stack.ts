import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface MontyUnitreeStackProps extends cdk.StackProps {
  clusterName?: string;
  nodeInstanceType?: string;
  gpuInstanceType?: string;
  minCapacity?: number;
  maxCapacity?: number;
  gpuMinCapacity?: number;
  gpuMaxCapacity?: number;
}

export class MontyUnitreeStack extends cdk.Stack {
  public readonly cluster: eks.Cluster;
  public readonly vpc: ec2.Vpc;
  public readonly checkpointsBucket: s3.Bucket;
  public readonly artifactsBucket: s3.Bucket;
  public readonly montyRepo: ecr.Repository;
  public readonly simulatorRepo: ecr.Repository;
  public readonly glueRepo: ecr.Repository;

  constructor(scope: Construct, id: string, props: MontyUnitreeStackProps) {
    super(scope, id, props);

    // Configuration
    const clusterName = props.clusterName || 'monty-unitree-eks';
    const nodeInstanceType = props.nodeInstanceType || 'c6i.large';
    const gpuInstanceType = props.gpuInstanceType || 'g5.2xlarge';
    const minCapacity = props.minCapacity || 1;
    const maxCapacity = props.maxCapacity || 6;
    const gpuMinCapacity = props.gpuMinCapacity || 0;
    const gpuMaxCapacity = props.gpuMaxCapacity || 4;

    // Create VPC
    this.vpc = new ec2.Vpc(this, 'MontyUnitreeVPC', {
      maxAzs: 3,
      natGateways: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // Create EKS Cluster
    this.cluster = new eks.Cluster(this, 'MontyUnitreeCluster', {
      clusterName,
      version: eks.KubernetesVersion.V1_30,
      vpc: this.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      defaultCapacity: 0, // We'll add node groups manually
      clusterLogging: [
        eks.ClusterLoggingTypes.API,
        eks.ClusterLoggingTypes.AUDIT,
        eks.ClusterLoggingTypes.AUTHENTICATOR,
        eks.ClusterLoggingTypes.CONTROLLER_MANAGER,
        eks.ClusterLoggingTypes.SCHEDULER,
      ],
    });

    // Add CPU Node Group
    const cpuNodeGroup = this.cluster.addNodegroupCapacity('CpuNodeGroup', {
      instanceTypes: [ec2.InstanceType.of(ec2.InstanceClass.C6I, ec2.InstanceSize.LARGE)],
      minSize: minCapacity,
      maxSize: maxCapacity,
      desiredSize: minCapacity,
      diskSize: 50,
      labels: { role: 'cpu' },
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // Add GPU Node Group
    const gpuNodeGroup = this.cluster.addNodegroupCapacity('GpuNodeGroup', {
      instanceTypes: [ec2.InstanceType.of(ec2.InstanceClass.G5, ec2.InstanceSize.XLARGE2)],
      minSize: gpuMinCapacity,
      maxSize: gpuMaxCapacity,
      desiredSize: gpuMinCapacity,
      diskSize: 200,
      labels: { role: 'gpu' },
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      taints: [
        {
          key: 'nvidia.com/gpu',
          value: 'present',
          effect: eks.TaintEffect.NO_SCHEDULE,
        },
      ],
    });

    // Create S3 Buckets
    this.checkpointsBucket = new s3.Bucket(this, 'MontyCheckpointsBucket', {
      bucketName: `monty-checkpoints-${this.account}-${this.region}`,
      versioned: true,
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    this.artifactsBucket = new s3.Bucket(this, 'SimArtifactsBucket', {
      bucketName: `sim-artifacts-${this.account}-${this.region}`,
      lifecycleRules: [
        {
          id: 'DeleteOldLogs',
          enabled: true,
          expiration: cdk.Duration.days(90),
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(60),
            },
          ],
        },
      ],
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // Create ECR Repositories
    this.montyRepo = new ecr.Repository(this, 'MontyRepository', {
      repositoryName: 'monty',
      imageScanOnPush: true,
      lifecycleRules: [
        {
          maxImageCount: 10,
        },
      ],
    });

    this.simulatorRepo = new ecr.Repository(this, 'SimulatorRepository', {
      repositoryName: 'unitree-sim',
      imageScanOnPush: true,
      lifecycleRules: [
        {
          maxImageCount: 10,
        },
      ],
    });

    this.glueRepo = new ecr.Repository(this, 'GlueRepository', {
      repositoryName: 'glue-base',
      imageScanOnPush: true,
      lifecycleRules: [
        {
          maxImageCount: 5,
        },
      ],
    });

    // Create IAM Roles for IRSA
    const simRunnerRole = new iam.Role(this, 'SimRunnerRole', {
      assumedBy: new iam.FederatedPrincipal(
        this.cluster.openIdConnectProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            [`${this.cluster.clusterOpenIdConnectIssuer}:sub`]: 'system:serviceaccount:monty-sim:sim-runner',
            [`${this.cluster.clusterOpenIdConnectIssuer}:aud`]: 'sts.amazonaws.com',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:PutObject',
                's3:GetObject',
                's3:ListBucket',
                's3:DeleteObject',
              ],
              resources: [
                this.checkpointsBucket.bucketArn,
                `${this.checkpointsBucket.bucketArn}/*`,
                this.artifactsBucket.bucketArn,
                `${this.artifactsBucket.bucketArn}/*`,
              ],
            }),
          ],
        }),
      },
    });

    const runManagerRole = new iam.Role(this, 'RunManagerRole', {
      assumedBy: new iam.FederatedPrincipal(
        this.cluster.openIdConnectProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            [`${this.cluster.clusterOpenIdConnectIssuer}:sub`]: 'system:serviceaccount:monty-sim:run-manager',
            [`${this.cluster.clusterOpenIdConnectIssuer}:aud`]: 'sts.amazonaws.com',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        KubernetesAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'eks:DescribeCluster',
                'eks:ListClusters',
              ],
              resources: [this.cluster.clusterArn],
            }),
          ],
        }),
      },
    });

    // Create CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, 'MontyUnitreeLogGroup', {
      logGroupName: `/aws/eks/${clusterName}`,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    // Add Helm Charts
    this.addHelmCharts();

    // Add Kubernetes Manifests
    this.addKubernetesManifests(simRunnerRole, runManagerRole);

    // Outputs
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'EKS Cluster Name',
    });

    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint,
      description: 'EKS Cluster Endpoint',
    });

    new cdk.CfnOutput(this, 'CheckpointsBucket', {
      value: this.checkpointsBucket.bucketName,
      description: 'S3 Bucket for Checkpoints',
    });

    new cdk.CfnOutput(this, 'ArtifactsBucket', {
      value: this.artifactsBucket.bucketName,
      description: 'S3 Bucket for Artifacts',
    });

    new cdk.CfnOutput(this, 'MontyRepoURI', {
      value: this.montyRepo.repositoryUri,
      description: 'ECR Repository URI for Monty',
    });

    new cdk.CfnOutput(this, 'SimulatorRepoURI', {
      value: this.simulatorRepo.repositoryUri,
      description: 'ECR Repository URI for Simulator',
    });

    new cdk.CfnOutput(this, 'GlueRepoURI', {
      value: this.glueRepo.repositoryUri,
      description: 'ECR Repository URI for Glue',
    });
  }

  private addHelmCharts(): void {
    // NVIDIA Device Plugin
    this.cluster.addHelmChart('NvidiaDevicePlugin', {
      chart: 'nvidia-device-plugin',
      repository: 'https://nvidia.github.io/k8s-device-plugin',
      namespace: 'kube-system',
      values: {
        'tolerations[0].key': 'nvidia.com/gpu',
        'tolerations[0].operator': 'Equal',
        'tolerations[0].value': 'present',
        'tolerations[0].effect': 'NoSchedule',
      },
    });

    // Metrics Server
    this.cluster.addHelmChart('MetricsServer', {
      chart: 'metrics-server',
      repository: 'https://kubernetes-sigs.github.io/metrics-server',
      namespace: 'kube-system',
      values: {
        args: ['--kubelet-insecure-tls'],
      },
    });

    // Cluster Autoscaler
    this.cluster.addHelmChart('ClusterAutoscaler', {
      chart: 'cluster-autoscaler',
      repository: 'https://kubernetes.github.io/autoscaler',
      namespace: 'kube-system',
      values: {
        autoDiscovery: {
          clusterName: this.cluster.clusterName,
        },
        awsRegion: this.region,
        extraArgs: {
          'scale-down-unneeded-time': '5m',
          'scale-down-delay-after-add': '5m',
        },
      },
    });

    // AWS Load Balancer Controller
    this.cluster.addHelmChart('AwsLoadBalancerController', {
      chart: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'kube-system',
      values: {
        clusterName: this.cluster.clusterName,
        serviceAccount: {
          create: false,
          name: 'aws-load-balancer-controller',
        },
      },
    });
  }

  private addKubernetesManifests(simRunnerRole: iam.Role, runManagerRole: iam.Role): void {
    // Namespace
    this.cluster.addManifest('MontySimNamespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: 'monty-sim',
      },
    });

    // Service Accounts
    this.cluster.addManifest('SimRunnerServiceAccount', {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: {
        name: 'sim-runner',
        namespace: 'monty-sim',
        annotations: {
          'eks.amazonaws.com/role-arn': simRunnerRole.roleArn,
        },
      },
    });

    this.cluster.addManifest('RunManagerServiceAccount', {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: {
        name: 'run-manager',
        namespace: 'monty-sim',
        annotations: {
          'eks.amazonaws.com/role-arn': runManagerRole.roleArn,
        },
      },
    });

    // RBAC
    this.cluster.addManifest('RunManagerRole', {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      metadata: {
        name: 'run-manager',
        namespace: 'monty-sim',
      },
      rules: [
        {
          apiGroups: ['batch'],
          resources: ['jobs'],
          verbs: ['create', 'get', 'list', 'watch', 'delete'],
        },
        {
          apiGroups: [''],
          resources: ['pods', 'pods/log'],
          verbs: ['get', 'list', 'watch'],
        },
      ],
    });

    this.cluster.addManifest('RunManagerRoleBinding', {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: {
        name: 'run-manager-binding',
        namespace: 'monty-sim',
      },
      subjects: [
        {
          kind: 'ServiceAccount',
          name: 'run-manager',
          namespace: 'monty-sim',
        },
      ],
      roleRef: {
        kind: 'Role',
        name: 'run-manager',
        apiGroup: 'rbac.authorization.k8s.io',
      },
    });

    // Glue Contract ConfigMap
    this.cluster.addManifest('GlueContractConfigMap', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'glue-contract',
        namespace: 'monty-sim',
      },
      data: {
        'observation.schema.json': JSON.stringify({
          type: 'object',
          required: ['time', 'imu', 'base_vel', 'base_pose'],
          properties: {
            time: { type: 'number' },
            imu: { type: 'array', items: { type: 'number' }, minItems: 6, maxItems: 6 },
            base_vel: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
            base_pose: {
              type: 'object',
              properties: {
                roll: { type: 'number' },
                pitch: { type: 'number' },
                yaw: { type: 'number' },
                height: { type: 'number' },
              },
              required: ['roll', 'pitch', 'yaw', 'height'],
            },
            nociceptor: { type: 'number' },
            energy_rate: { type: 'number' },
          },
        }),
        'action.schema.json': JSON.stringify({
          type: 'object',
          required: ['cmd_type'],
          properties: {
            cmd_type: { type: 'string', enum: ['base', 'ee'] },
            base_cmd: {
              type: 'object',
              properties: {
                vx: { type: 'number' },
                vy: { type: 'number' },
                yaw_rate: { type: 'number' },
                body_pitch: { type: 'number' },
                gait: { type: 'string' },
              },
            },
          },
        }),
      },
    });
  }
}
