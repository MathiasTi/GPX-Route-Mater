import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Activity, Zap, TrendingUp, BarChart2, Shield, Heart, Clock } from 'lucide-react';
import { GPXTrack } from '../types';
import { calculatePowerStats } from '../utils/gpxUtils';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from 'recharts';

interface AdvancedAnalyticsProps {
  track: GPXTrack;
  onClose: () => void;
  ftp: number;
  selectionBounds?: {minLat: number, maxLat: number, minLng: number, maxLng: number} | null;
}

const AdvancedAnalytics: React.FC<AdvancedAnalyticsProps> = ({ track, onClose, ftp, selectionBounds }) => {
  // Filter points if selection bounds are provided
  const analysisPoints = useMemo(() => {
    if (!selectionBounds) return track.points;
    return track.points.filter(p => 
      p.lat >= selectionBounds.minLat && p.lat <= selectionBounds.maxLat &&
      p.lng >= selectionBounds.minLng && p.lng <= selectionBounds.maxLng
    );
  }, [track.points, selectionBounds]);

  const powerStats = useMemo(() => {
    if (!selectionBounds) return track.powerStats;
    return calculatePowerStats(analysisPoints, ftp);
  }, [analysisPoints, ftp, selectionBounds, track.powerStats]);

  const duration = useMemo(() => {
    if (analysisPoints.length < 2) return 0;
    const firstTime = analysisPoints.find(p => p.time !== undefined)?.time;
    const lastTime = [...analysisPoints].reverse().find(p => p.time !== undefined)?.time;
    if (firstTime && lastTime) {
      return (lastTime.getTime() - firstTime.getTime()) / 1000;
    }
    return 0;
  }, [analysisPoints]);

  // Calculate Power Duration Curve data
  const pdData = useMemo(() => {
    if (analysisPoints.length < 2) return [];
    
    // We already have some bests in powerStats, but for a full curve we'd need more.
    // For now, let's use the provided bests + interpolate some
    const bests = [
      { time: 1, power: powerStats?.maxPower || 0 },
      { time: 20, power: powerStats?.best20s || 0 },
      { time: 60, power: powerStats?.best1m || 0 },
      { time: 300, power: (powerStats?.best1m || 0) * 0.9 }, // Mock 5m
      { time: 1200, power: powerStats?.best20m || 0 },
      { time: 3600, power: ftp },
    ].sort((a, b) => a.time - b.time);

    return bests.map(d => ({
      name: d.time < 60 ? `${d.time}s` : `${Math.round(d.time/60)}m`,
      seconds: d.time,
      power: Math.round(d.power)
    }));
  }, [analysisPoints, powerStats, ftp]);

  // Calculate Power Zones
  const powerZones = useMemo(() => {
    if (analysisPoints.length === 0) return [];
    const zones = [
      { name: 'Z1 Recovery', min: 0, max: 0.55 * ftp, color: '#94a3b8', count: 0 },
      { name: 'Z2 Endurance', min: 0.55 * ftp, max: 0.75 * ftp, color: '#22c55e', count: 0 },
      { name: 'Z3 Tempo', min: 0.75 * ftp, max: 0.90 * ftp, color: '#eab308', count: 0 },
      { name: 'Z4 Threshold', min: 0.90 * ftp, max: 1.05 * ftp, color: '#f97316', count: 0 },
      { name: 'Z5 VO2 Max', min: 1.05 * ftp, max: 1.20 * ftp, color: '#ef4444', count: 0 },
      { name: 'Z6 Anaerobic', min: 1.20 * ftp, max: 1.50 * ftp, color: '#be185d', count: 0 },
      { name: 'Z7 Neuromuscular', min: 1.50 * ftp, max: 2500, color: '#701a75', count: 0 },
    ];

    analysisPoints.forEach(p => {
      if (p.power !== undefined) {
        const zone = zones.find(z => p.power! >= z.min && p.power! < z.max);
        if (zone) zone.count++;
      }
    });

    const total = analysisPoints.filter(p => p.power !== undefined).length;
    return zones.map(z => ({
      ...z,
      percent: total > 0 ? (z.count / total) * 100 : 0
    }));
  }, [analysisPoints, ftp]);

  const avgHr = useMemo(() => {
    const hrPoints = analysisPoints.filter(p => p.hr !== undefined).map(p => p.hr!);
    if (hrPoints.length === 0) return null;
    return Math.round(hrPoints.reduce((a, b) => a + b, 0) / hrPoints.length);
  }, [analysisPoints]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className="fixed inset-0 z-[100] bg-slate-50 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-100">
            <TrendingUp size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {track.name}
              {selectionBounds && <span className="ml-3 text-sm bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-bold uppercase tracking-wider">Auswahl</span>}
            </h1>
            <p className="text-slate-500 text-sm font-medium">Erweiterte Analyse & Leistungsdaten</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-3 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
        >
          <X size={32} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Advanced Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard 
              label="Normalized Power" 
              value={`${Math.round(powerStats?.normalizedPower || 0)} W`} 
              icon={<Zap className="text-yellow-500" />}
              subValue={`VI: ${(powerStats?.variabilityIndex || 1).toFixed(2)}`}
              color="border-yellow-200 bg-yellow-50/30"
            />
            <MetricCard 
              label="TSS" 
              value={Math.round(powerStats?.tss || 0)} 
              icon={<Shield className="text-indigo-500" />}
              subValue="Training Stress Score"
              color="border-indigo-200 bg-indigo-50/30"
            />
            <MetricCard 
              label="Intensity Factor" 
              value={(powerStats?.intensityFactor || 0).toFixed(2)} 
              icon={<TrendingUp className="text-emerald-500" />}
              subValue={`${Math.round((powerStats?.intensityFactor || 0) * 100)}% von FTP`}
              color="border-emerald-200 bg-emerald-50/30"
            />
            <MetricCard 
              label="Arbeit" 
              value={`${Math.round(powerStats?.work || 0)} kJ`} 
              icon={<Activity className="text-rose-500" />}
              subValue="Gesamtenergie"
              color="border-rose-200 bg-rose-50/30"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Power Duration Curve */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <BarChart2 size={20} className="text-indigo-600" />
                  Power Duration Curve
                </h3>
                <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500 font-mono">Watt / Zeit</span>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pdData}>
                    <defs>
                      <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 12 }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      unit=" W"
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                      formatter={(value) => [`${value} W`, 'Leistung']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="power" 
                      stroke="#4f46e5" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorPower)" 
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Power Zones Distribution */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Activity size={20} className="text-rose-600" />
                  Leistungszonen
                </h3>
                <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500 font-mono">FTP: {ftp}W</span>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={powerZones} layout="vertical" margin={{ left: 40 }}>
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false}
                      width={100}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                    />
                    <Tooltip 
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                      formatter={(value) => [`${(value as number).toFixed(1)}%`, 'Zeit in Zone']}
                    />
                    <Bar dataKey="percent" radius={[0, 4, 4, 0]} barSize={20}>
                      {powerZones.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-center bg-white p-8 rounded-2xl border border-slate-200">
            <div className="space-y-2">
              <div className="text-slate-400 text-sm font-medium">Beste 60 Sek.</div>
              <div className="text-3xl font-black text-slate-900">{Math.round(powerStats?.best1m || 0)}W</div>
              <div className="text-xs text-indigo-500 font-bold uppercase tracking-widest">Sprint / Attacke</div>
            </div>
            <div className="space-y-2 border-x border-slate-100">
              <div className="text-slate-400 text-sm font-medium">Beste 20 Min.</div>
              <div className="text-3xl font-black text-slate-900">{Math.round(powerStats?.best20m || 0)}W</div>
              <div className="text-xs text-emerald-500 font-bold uppercase tracking-widest">Klettern / TT</div>
            </div>
            <div className="space-y-2">
              <div className="text-slate-400 text-sm font-medium">Geschätztes FTP</div>
              <div className="text-3xl font-black text-slate-900">{Math.round((powerStats?.best20m || 0) * 0.95)}W</div>
              <div className="text-xs text-rose-500 font-bold uppercase tracking-widest">Basierend auf 20m</div>
            </div>
          </div>

          {/* GoldenCheetah inspired additional metrics section if needed */}
          <div className="bg-indigo-900 text-white p-8 rounded-3xl overflow-hidden relative shadow-2xl shadow-indigo-200">
             <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-12">
               <div className="space-y-4">
                 <div className="flex items-center gap-2 opacity-80">
                   <Clock size={18} />
                   <span className="text-sm font-bold uppercase tracking-widest">Dauer</span>
                 </div>
                 <div className="text-4xl font-black">
                   {duration ? `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m ${Math.floor(duration % 60)}s` : '--'}
                 </div>
                 <p className="text-indigo-200 text-sm leading-relaxed">Gesamtzeit der Aufzeichnung inklusive Standzeiten.</p>
               </div>
               
               <div className="space-y-4">
                 <div className="flex items-center gap-2 opacity-80">
                   <Heart size={18} />
                   <span className="text-sm font-bold uppercase tracking-widest">Herzrate</span>
                 </div>
                 <div className="text-4xl font-black">
                   {avgHr || '--'} <span className="text-xl">avg</span>
                 </div>
                 <p className="text-indigo-200 text-sm leading-relaxed">Durchschnittliche Belastung des Herz-Kreislauf-Systems.</p>
               </div>

               <div className="space-y-4">
                 <div className="flex items-center gap-2 opacity-80">
                   <TrendingUp size={18} />
                   <span className="text-sm font-bold uppercase tracking-widest">Variabilität</span>
                 </div>
                 <div className="text-4xl font-black">
                   {(powerStats?.variabilityIndex || 1).toFixed(2)}
                 </div>
                 <p className="text-indigo-200 text-sm leading-relaxed">Verhältnis von NP zu Average Power. Ein Wert nahe 1.0 bedeutet gleichmäßige Belastung.</p>
               </div>
             </div>
             
             {/* Abstract background shape */}
             <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -mr-48 -mt-48 blur-3xl" />
             <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-400/20 rounded-full -ml-32 -mb-32 blur-3xl" />
          </div>

        </div>
      </div>
    </motion.div>
  );
};

const MetricCard = ({ label, value, icon, subValue, color }: { label: string, value: string | number, icon: React.ReactNode, subValue?: string, color: string }) => (
  <div className={`p-6 rounded-2xl border ${color} shadow-sm transition-all hover:shadow-md group`}>
    <div className="flex items-center justify-between mb-4">
      <div className="p-2 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">{label}</span>
    </div>
    <div className="text-3xl font-black text-slate-900 mb-1">{value}</div>
    {subValue && <div className="text-slate-500 text-sm font-medium">{subValue}</div>}
  </div>
);

export default AdvancedAnalytics;
