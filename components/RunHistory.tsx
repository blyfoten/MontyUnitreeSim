
import React from 'react';
import { Run, RunStatus } from '../types';
import { DownloadIcon } from './icons/DownloadIcon';

interface RunHistoryProps {
  runs: Run[];
  activeRunId: string | null;
  onSelectRun: (runId: string) => void;
}

const getStatusBadgeClass = (status: RunStatus) => {
  switch (status) {
    case RunStatus.Running:
      return 'bg-blue-500/20 text-blue-300';
    case RunStatus.Completed:
      return 'bg-green-500/20 text-green-300';
    case RunStatus.Failed:
      return 'bg-red-500/20 text-red-300';
    case RunStatus.Pending:
      return 'bg-yellow-500/20 text-yellow-300';
  }
};

export const RunHistory: React.FC<RunHistoryProps> = ({ runs, activeRunId, onSelectRun }) => {
  return (
    <div className="h-full overflow-y-auto">
      <table className="w-full text-sm text-left text-slate-400">
        <thead className="text-xs text-slate-400 uppercase bg-slate-800">
          <tr>
            <th scope="col" className="px-4 py-3">Run Name</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3">Created</th>
            <th scope="col" className="px-4 py-3">Artifacts</th>
          </tr>
        </thead>
        <tbody>
          {runs.slice().reverse().map(run => (
            <tr
              key={run.id}
              onClick={() => onSelectRun(run.id)}
              className={`border-b border-slate-700 cursor-pointer transition-colors ${activeRunId === run.id ? 'bg-slate-700/50' : 'hover:bg-slate-800/50'}`}
            >
              <td className="px-4 py-3 font-medium text-slate-200">{run.name}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadgeClass(run.status)}`}>
                  {run.status}
                </span>
              </td>
              <td className="px-4 py-3">{run.createdAt.toLocaleString()}</td>
              <td className="px-4 py-3">
                {run.artifacts.length > 0 ? (
                  <button className="text-cyan-400 hover:text-cyan-300 p-1 rounded-full hover:bg-slate-600 transition-colors">
                    <DownloadIcon className="w-5 h-5" />
                  </button>
                ) : (
                  '-'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
