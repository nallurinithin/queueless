import React, { useState, useEffect } from 'react';

export default function App() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Health check failed:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 border border-slate-200">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-xl">
            Q
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">QueueLess</h1>
            <p className="text-xs text-slate-500">Clinic Appointment & Queue Management</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Backend Connection</h2>
            {loading ? (
              <p className="text-sm text-slate-500">Testing /api/health...</p>
            ) : health?.status === 'ok' ? (
              <div className="text-sm text-emerald-600 font-medium flex items-center space-x-2">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                <span>API Online ({health.service})</span>
              </div>
            ) : (
              <div className="text-sm text-rose-500 font-medium">
                Offline or not responding
              </div>
            )}
          </div>

          <div className="text-xs text-slate-400 space-y-1">
            <p>Milestone: <strong>M0 (Environment & Repository)</strong></p>
            <p>Languages: English (Primary), Hindi, Telugu</p>
          </div>
        </div>
      </div>
    </div>
  );
}

