import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Run, RunStatus, DockerImage, BrainProfile, LogEntry, LogLevel, MetricPoint, Artifact
} from '../types';

const MOCK_MONTY_IMAGES: DockerImage[] = [
  { id: 'm1', repo: 'monty', tag: 'latest', type: 'monty' },
  { id: 'm2', repo: 'monty', tag: 'exp-brain-v2', type: 'monty' },
];

const MOCK_SIMULATOR_IMAGES: DockerImage[] = [
  { id: 's1', repo: 'unitree-sim', tag: 'isaac-5.0', type: 'simulator' },
  { id: 's2', repo: 'unitree-sim', tag: 'isaac-4.8-h1', type: 'simulator' },
];

const MOCK_BRAIN_PROFILES: BrainProfile[] = [
  { id: 'bp1', name: 'Small (Fast)', config: 'size: small\nlayers: 2' },
  { id: 'bp2', name: 'Medium (Balanced)', config: 'size: medium\nlayers: 4' },
  { id: 'bp3', name: 'Large (Complex)', config: 'size: large\nlayers: 8' },
];

const MOCK_ARTIFACTS: Artifact[] = [
    { id: 'art1', kind: 'checkpoint', s3_uri: 's3://.../checkpoint.mstate' },
    { id: 'art2', kind: 'video', s3_uri: 's3://.../episode.mp4' },
];

export const useSimulationData = () => {
  const [runs, setRuns] = useState<Run[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  const logCounter = useRef(0);
  const timeRef = useRef(0);

  const addLog = useCallback((runId: string, level: LogLevel, message: string) => {
    setLogs(prev => [...prev, { id: logCounter.current++, runId, level, message, timestamp: new Date() }]);
  }, []);

  const addMetricPoint = useCallback(() => {
    setMetrics(prev => [
      ...prev,
      {
        time: timeRef.current,
        reward: Math.sin(timeRef.current / 10) * 50 + 50 + (Math.random() - 0.5) * 5,
        energy: Math.cos(timeRef.current / 15) * 20 + 80 + (Math.random() - 0.5) * 3,
        nociceptor: Math.max(0, Math.sin(timeRef.current / 5 + Math.PI) * 0.1 + (Math.random() * 0.05)),
      }
    ]);
    timeRef.current += 1;
  }, []);

  useEffect(() => {
    const runningRun = runs.find(r => r.status === RunStatus.Running);
    // Fix: In a browser environment, setInterval returns a number, not a NodeJS.Timeout object.
    let interval: number | null = null;
    
    if (runningRun) {
      interval = setInterval(() => {
        addLog(runningRun.id, LogLevel.Info, `Simulation step ${timeRef.current} completed.`);
        if (Math.random() < 0.05) {
            addLog(runningRun.id, LogLevel.Warn, 'Joint temperature approaching threshold.');
        }
        addMetricPoint();

        if (timeRef.current > 100) {
            addLog(runningRun.id, LogLevel.Info, 'Simulation completed successfully.');
            setRuns(prev => prev.map(r => r.id === runningRun.id ? { ...r, status: RunStatus.Completed, artifacts: MOCK_ARTIFACTS } : r));
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, addLog, addMetricPoint]);
  
  const launchRun = () => {
    if (runs.some(r => r.status === RunStatus.Running)) {
        alert("Another run is already in progress.");
        return;
    }

    setIsLaunching(true);
    const newRunId = `run-${runs.length + 1}`;
    const newRunName = `Run #${runs.length + 1} - ${new Date().toLocaleTimeString()}`;
    
    addLog(newRunId, LogLevel.Info, `Preparing to launch ${newRunName}...`);
    
    setTimeout(() => {
        const newRun: Run = {
            id: newRunId,
            name: newRunName,
            status: RunStatus.Pending,
            createdAt: new Date(),
            montyImage: MOCK_MONTY_IMAGES[0],
            simulatorImage: MOCK_SIMULATOR_IMAGES[0],
            brainProfile: MOCK_BRAIN_PROFILES[1],
            artifacts: [],
        };
        setRuns(prev => [...prev, newRun]);
        setActiveRunId(newRunId);
        setMetrics([]);
        timeRef.current = 0;
        
        addLog(newRunId, LogLevel.Info, 'Pulling Docker images...');
        setTimeout(() => {
            addLog(newRunId, LogLevel.Info, 'Images pulled. Starting containers...');
            setTimeout(() => {
                setRuns(prev => prev.map(r => r.id === newRunId ? { ...r, status: RunStatus.Running } : r));
                addLog(newRunId, LogLevel.Info, 'Simulation is now running.');
                setIsLaunching(false);
            }, 2000);
        }, 1500);

    }, 500);
  };

  const selectRun = (runId: string) => {
    setActiveRunId(runId);
  };

  return {
    runs,
    logs,
    metrics,
    activeRunId,
    montyImages: MOCK_MONTY_IMAGES,
    simulatorImages: MOCK_SIMULATOR_IMAGES,
    brainProfiles: MOCK_BRAIN_PROFILES,
    isLaunching,
    launchRun,
    selectRun,
  };
};