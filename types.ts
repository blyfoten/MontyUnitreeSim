
export enum RunStatus {
  Pending = 'Pending',
  Running = 'Running',
  Completed = 'Completed',
  Failed = 'Failed',
}

export enum LogLevel {
  Info = 'Info',
  Warn = 'Warn',
  Error = 'Error',
  Debug = 'Debug',
}

export interface DockerImage {
  id: string;
  repo: string;
  tag: string;
  type: 'monty' | 'simulator';
}

export interface BrainProfile {
  id: string;
  name: string;
  config: string; // YAML content
}

export interface Artifact {
  id: string;
  kind: 'checkpoint' | 'log' | 'video' | 'metrics';
  s3_uri: string;
}

export interface Run {
  id: string;
  name: string;
  status: RunStatus;
  createdAt: Date;
  montyImage: DockerImage;
  simulatorImage: DockerImage;
  brainProfile: BrainProfile;
  artifacts: Artifact[];
}

export interface LogEntry {
  id: number;
  runId: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
}

export interface MetricPoint {
  time: number;
  reward: number;
  energy: number;
  nociceptor: number;
}
