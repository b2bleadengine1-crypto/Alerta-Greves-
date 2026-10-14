import React, { useState } from 'react';
import {
  Navigation,
  ArrowRight,
  Clock,
  Shuffle,
  Leaf,
  AlertTriangle,
  Bus,
  Train,
  Ship,
  MapPin,
  ChevronRight,
} from 'lucide-react';
import { AML_KEY_STOPS } from '../data/amlTransportData';
import { planMultimodalTrip } from '../services/plannerService';
import { RoutePlan } from '../types/transit';

interface MultimodalPlannerProps {
  onSelectRouteOnMap: (route: RoutePlan) => void;
  activeRoute: RoutePlan | null;
}

export const MultimodalPlanner: React.FC<MultimodalPlannerProps> = ({
  onSelectRouteOnMap,
  activeRoute,
}) => {
  const [originId, setOriginId] = useState<string>('stop-sete-rios');
  const [destinationId, setDestinationId] = useState<string>('stop-pragal');
  const [preference, setPreference] = useState<'fastest' | 'fewest_transfers' | 'eco'>('fastest');
  const [allowedModes, setAllowedModes] = useState({
    subway: true,
    bus: true,
    train: true,
    ferry: true,
  });

  const [routes, setRoutes] = useState<RoutePlan[]>(() =>
    planMultimodalTrip({
      originId: 'stop-sete-rios',
      destinationId: 'stop-pragal',
      allowedModes: { subway: true, bus: true, train: true, ferry: true },
      preference: 'fastest',
    })
  );

  const handleCalculate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const results = planMultimodalTrip({
      originId,
      destinationId,
      allowedModes,
      preference,
    });
    setRoutes(results);
    if (results.length > 0) {
      onSelectRouteOnMap(results[0]);
    }
  };

  const handleSwap = () => {
    const temp = originId;
    setOriginId(destinationId);
    setDestinationId(temp);
  };

  const toggleMode = (mode: keyof typeof allowedModes) => {
    const updated = { ...allowedModes, [mode]: !allowedModes[mode] };
    setAllowedModes(updated);
    const results = planMultimodalTrip({
      originId,
      destinationId,
      allowedModes: updated,
      preference,
    });
    setRoutes(results);
  };

  return (
    <div className="space-y-6">
      {/* Formulário de Planeamento Multimodal */}
      <form onSubmit={handleCalculate} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Navigation className="w-5 h-5 text-blue-500" />
            <span>Planeador de Trajetos Multimodal da AML</span>
          </h2>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setPreference('fastest'); handleCalculate(); }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                preference === 'fastest' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Rápido
            </button>
            <button
              type="button"
              onClick={() => { setPreference('fewest_transfers'); handleCalculate(); }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                preference === 'fewest_transfers' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Direto
            </button>
            <button
              type="button"
              onClick={() => { setPreference('eco'); handleCalculate(); }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                preference === 'eco' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ecológico
            </button>
          </div>
        </div>

        {/* Seleção de Origem e Destino com Inversor */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] items-center gap-2">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-blue-400" /> Origem
            </label>
            <select
              value={originId}
              onChange={(e) => setOriginId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {AML_KEY_STOPS.map((stop) => (
                <option key={`orig-${stop.id}`} value={stop.id}>
                  {stop.name} ({stop.municipality})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-center pt-3 sm:pt-4">
            <button
              type="button"
              onClick={handleSwap}
              title="Inverter origem e destino"
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <Shuffle className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-rose-400" /> Destino
            </label>
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {AML_KEY_STOPS.map((stop) => (
                <option key={`dest-${stop.id}`} value={stop.id}>
                  {stop.name} ({stop.municipality})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Modos de Transporte Permitidos */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs border-t border-slate-800/60">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Modos:</span>
            <button
              type="button"
              onClick={() => toggleMode('subway')}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors ${
                allowedModes.subway ? 'bg-sky-950 text-sky-300 border border-sky-800' : 'bg-slate-800/40 text-slate-500'
              }`}
            >
              <Train className="w-3.5 h-3.5" /> Metro
            </button>
            <button
              type="button"
              onClick={() => toggleMode('bus')}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors ${
                allowedModes.bus ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-slate-800/40 text-slate-500'
              }`}
            >
              <Bus className="w-3.5 h-3.5" /> Autocarro
            </button>
            <button
              type="button"
              onClick={() => toggleMode('train')}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors ${
                allowedModes.train ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800/40 text-slate-500'
              }`}
            >
              <Train className="w-3.5 h-3.5" /> Comboio
            </button>
            <button
              type="button"
              onClick={() => toggleMode('ferry')}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors ${
                allowedModes.ferry ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'bg-slate-800/40 text-slate-500'
              }`}
            >
              <Ship className="w-3.5 h-3.5" /> Barco
            </button>
          </div>

          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-semibold shadow-md shadow-blue-600/20 transition-all self-end"
          >
            Calcular Trajetos
          </button>
        </div>
      </form>

      {/* Resultados de Rotas */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-300">Opções Recomendadas ({routes.length})</h3>

        <div className="space-y-3">
          {routes.map((plan) => {
            const isActive = activeRoute?.id === plan.id;

            return (
              <div
                key={plan.id}
                onClick={() => onSelectRouteOnMap(plan)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 border-blue-500 ring-2 ring-blue-500/20 shadow-xl'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-slate-100 tabular-nums">
                      {plan.totalDurationMinutes} min
                    </span>
                    <div className="text-xs text-slate-400">
                      <span className="tabular-nums font-medium text-slate-200">
                        {plan.departureTime} → {plan.arrivalTime}
                      </span>
                      <span className="mx-1.5">·</span>
                      <span>{plan.transfersCount === 0 ? 'Sem transbordo' : `${plan.transfersCount} transbordo(s)`}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <Leaf className="w-3.5 h-3.5" />
                      <span>-{plan.co2SavedGrams}g CO₂</span>
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectRouteOnMap(plan);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <span>Ver no Mapa</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Aviso se a rota usa um serviço com Greve */}
                {plan.hasAlertWarnings && (
                  <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Atenção: Este trajeto inclui operadores com greve decretada ou perturbação de serviço.</span>
                  </div>
                )}

                {/* Linha do Tempo dos Segmentos */}
                <div className="mt-4 space-y-2">
                  {plan.segments.map((seg, sIdx) => (
                    <div key={sIdx} className="flex items-start gap-3 text-xs">
                      <div
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white font-bold text-[10px]"
                        style={{ backgroundColor: seg.lineColor || '#64748B' }}
                      >
                        {seg.mode === 'subway' ? 'M' : seg.mode === 'train' ? 'CP' : seg.mode === 'ferry' ? '⚓' : seg.mode === 'bus' ? 'CM' : '🚶'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-200">
                            {seg.operatorName} {seg.lineName ? `(${seg.lineName})` : ''}
                          </span>
                          <span className="text-slate-400 tabular-nums">
                            {seg.departureTime} · {seg.durationMinutes} min
                          </span>
                        </div>
                        <p className="text-slate-400 mt-0.5">{seg.instructions}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
