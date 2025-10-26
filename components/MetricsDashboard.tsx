
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { MetricPoint } from '../types';

interface MetricsDashboardProps {
  metrics: MetricPoint[];
  activeRunId: string | null;
}

const Chart: React.FC<{ data: MetricPoint[]; dataKey: keyof MetricPoint; color: string; title: string; }> = ({ data, dataKey, color, title }) => (
    <div className="h-1/3 p-2">
        <h3 className="text-slate-300 text-sm font-semibold mb-2">{title}</h3>
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                    labelStyle={{ color: '#cbd5e1' }}
                />
                <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
        </ResponsiveContainer>
    </div>
);

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ metrics, activeRunId }) => {
    if (!activeRunId) {
        return <div className="p-4 text-slate-400">No active run selected.</div>;
    }

    return (
        <div className="h-full flex flex-col">
            <Chart data={metrics} dataKey="reward" color="#06b6d4" title="Reward" />
            <Chart data={metrics} dataKey="energy" color="#f59e0b" title="Energy Consumption" />
            <Chart data={metrics} dataKey="nociceptor" color="#ef4444" title="Nociceptor (Pain)" />
        </div>
    );
};
