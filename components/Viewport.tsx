
import React from 'react';

export const Viewport: React.FC = () => {
  return (
    <div className="w-full h-full bg-slate-900 rounded-lg flex items-center justify-center border border-slate-700 overflow-hidden">
      <div 
        className="w-full h-full bg-cover bg-center relative" 
        style={{ backgroundImage: "url('https://picsum.photos/seed/robot/1280/720')" }}
      >
        <div className="absolute inset-0 bg-black bg-opacity-40 flex flex-col items-center justify-center">
            <div className="text-center">
                <div className="relative flex items-center justify-center mb-2">
                    <div className="absolute h-6 w-6 bg-red-500 rounded-full animate-ping"></div>
                    <div className="relative h-3 w-3 bg-red-500 rounded-full"></div>
                </div>
                <p className="text-white font-semibold uppercase tracking-widest">Live Viewport</p>
                <p className="text-slate-400 text-sm">WebRTC stream from Isaac Sim</p>
            </div>
        </div>
      </div>
    </div>
  );
};
