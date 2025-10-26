
import React, { useRef, useEffect } from 'react';
import { LogEntry, LogLevel } from '../types';

interface LogViewerProps {
  logs: LogEntry[];
  activeRunId: string | null;
}

const getLogLevelColor = (level: LogLevel) => {
  switch (level) {
    case LogLevel.Info:
      return 'text-green-400';
    case LogLevel.Warn:
      return 'text-yellow-400';
    case LogLevel.Error:
      return 'text-red-400';
    case LogLevel.Debug:
      return 'text-blue-400';
    default:
      return 'text-slate-400';
  }
};

export const LogViewer: React.FC<LogViewerProps> = ({ logs, activeRunId }) => {
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!activeRunId) {
    return <div className="p-4 text-slate-400">No active run selected. Launch a new run or select one from history.</div>;
  }

  const runLogs = logs.filter(log => log.runId === activeRunId);

  return (
    <div ref={logContainerRef} className="h-full overflow-y-auto bg-slate-900 p-4 rounded-b-lg font-mono text-xs">
      {runLogs.map(log => (
        <div key={log.id} className="flex">
          <span className="text-slate-500 mr-2">{log.timestamp.toLocaleTimeString()}</span>
          <span className={`font-bold mr-2 ${getLogLevelColor(log.level)}`}>[{log.level.toUpperCase()}]</span>
          <span className="text-slate-300 whitespace-pre-wrap">{log.message}</span>
        </div>
      ))}
    </div>
  );
};
