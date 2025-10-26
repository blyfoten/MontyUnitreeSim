import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Run, RunStatus, DockerImage, BrainProfile, LogEntry, LogLevel, MetricPoint, Artifact
} from '../types';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

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
  const [montyImages, setMontyImages] = useState<DockerImage[]>(MOCK_MONTY_IMAGES);
  const [simulatorImages, setSimulatorImages] = useState<DockerImage[]>(MOCK_SIMULATOR_IMAGES);
  const [brainProfiles, setBrainProfiles] = useState<BrainProfile[]>(MOCK_BRAIN_PROFILES);

  const logCounter = useRef(0);
  const timeRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);

  // API Functions
  const fetchRuns = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/runs`);
      if (response.ok) {
        const data = await response.json();
        setRuns(data);
      }
    } catch (error) {
      console.error('Failed to fetch runs:', error);
    }
  }, []);

  const fetchMontyImages = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/images/monty`);
      if (response.ok) {
        const data = await response.json();
        setMontyImages(data);
      }
    } catch (error) {
      console.error('Failed to fetch Monty images:', error);
    }
  }, []);

  const fetchSimulatorImages = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/images/simulator`);
      if (response.ok) {
        const data = await response.json();
        setSimulatorImages(data);
      }
    } catch (error) {
      console.error('Failed to fetch simulator images:', error);
    }
  }, []);

  const fetchBrainProfiles = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/brain-profiles`);
      if (response.ok) {
        const data = await response.json();
        setBrainProfiles(data);
      }
    } catch (error) {
      console.error('Failed to fetch brain profiles:', error);
    }
  }, []);

  const connectWebSocket = useCallback((runId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`${API_BASE_URL.replace('http', 'ws')}/ws/${runId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
          setLogs(prev => [...prev, data.data]);
        } else if (data.type === 'metric') {
          setMetrics(prev => [...prev, data.data]);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, []);

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
  
  const launchRun = async (runConfig?: {
    montyImage?: DockerImage;
    simulatorImage?: DockerImage;
    brainProfile?: BrainProfile;
    glueCode?: string;
    checkpointIn?: string;
  }) => {
    if (runs.some(r => r.status === RunStatus.Running)) {
        alert("Another run is already in progress.");
        return;
    }

    setIsLaunching(true);
    
    try {
      const requestBody = {
        name: `Run #${runs.length + 1} - ${new Date().toLocaleTimeString()}`,
        montyImage: runConfig?.montyImage || montyImages[0],
        simulatorImage: runConfig?.simulatorImage || simulatorImages[0],
        brainProfile: runConfig?.brainProfile || brainProfiles[1],
        glueCode: runConfig?.glueCode || '',
        checkpointIn: runConfig?.checkpointIn,
        activeDeadlineSeconds: 3600,
      };

      const response = await fetch(`${API_BASE_URL}/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const newRun = await response.json();
        setRuns(prev => [...prev, newRun]);
        setActiveRunId(newRun.id);
        setMetrics([]);
        timeRef.current = 0;
        
        // Connect WebSocket for real-time updates
        connectWebSocket(newRun.id);
        
        // Refresh runs list
        await fetchRuns();
      } else {
        const error = await response.text();
        alert(`Failed to launch run: ${error}`);
      }
    } catch (error) {
      console.error('Failed to launch run:', error);
      alert('Failed to launch run. Please try again.');
    } finally {
      setIsLaunching(false);
    }
  };

  const selectRun = (runId: string) => {
    setActiveRunId(runId);
    // Connect WebSocket for the selected run
    connectWebSocket(runId);
  };

  // Initialize data on component mount
  useEffect(() => {
    fetchRuns();
    fetchMontyImages();
    fetchSimulatorImages();
    fetchBrainProfiles();
  }, [fetchRuns, fetchMontyImages, fetchSimulatorImages, fetchBrainProfiles]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    runs,
    logs,
    metrics,
    activeRunId,
    montyImages,
    simulatorImages,
    brainProfiles,
    isLaunching,
    launchRun,
    selectRun,
  };
};