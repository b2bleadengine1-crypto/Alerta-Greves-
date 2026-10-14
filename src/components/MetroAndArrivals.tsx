import React, { useState } from 'react';
import { Clock, CheckCircle2, AlertCircle, MapPin, Users, Train } from 'lucide-react';
import { getArrivalPredictionsForStop } from '../services/amlDataService';
import { MetroLineStatus, TransitStop } from '../types/transit';

interface MetroAndArrivalsProps {
  metroLines: MetroLineStatus[];
  stops: TransitStop[];
  selectedStop: TransitStop | null;
  onSelectStop: (stop: TransitStop) => void;
}

export const MetroAndArrivals: React.FC<MetroAndArrivalsProps> = ({
  metroLines,
  stops,
  selectedStop,
  onSelectStop,
}) => {
  const currentStop = selectedStop || stops[0];
  const predictions = getArrivalPredictionsForStop(currentStop.id);

  return (
    <div className="space-y-6">
      {/* Estado das Linhas do Metropolitano de Lisboa */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Train className="w-5 h-5 text-blue-500" />
            <span>Estado da Rede do Metropolitano de Lisboa</span>
          </h2>
          <span className="text-xs text-slate-400">Frequência média em tempo real</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {metroLines.map((line) => {
            const isNormal = line.status === 'normal';
            return (
              <div
                key={line.id}
                className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col justify-between space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: line.color }}
                    />
                    <span className="font-semibold text-xs text-slate-100">{line.name}</span>
                  </div>

                  {isNormal ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                  )}
                </div>

                <p className="text-[11px] text-slate-300 leading-snug line-clamp-2">
                  {line.detailMessage}
                </p>

                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{line.terminal1} ↔ {line.terminal2}</span>
                  <span className="font-semibold text-slate-200 tabular-nums">~{line.averageIntervalMinutes}m</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quadro de Partidas e Próximos Veículos por Paragem */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-rose-500" />
              <span>Quadro de Partidas em Tempo Real</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Escolhe um nó intermodal para ver as chegadas estimadas
            </p>
          </div>

          <select
            value={currentStop.id}
            onChange={(e) => {
              const found = stops.find((s) => s.id === e.target.value);
              if (found) onSelectStop(found);
            }}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
          >
            {stops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.name} ({stop.municipality})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2.5">
          {predictions.map((pred) => (
            <div
              key={pred.id}
              className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-colors flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white font-bold text-xs shadow-sm"
                  style={{ backgroundColor: pred.lineColor }}
                >
                  {pred.lineShortName}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-100">{pred.lineId}</span>
                    <span className="text-xs text-slate-400">→ {pred.destination}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span>{pred.platform}</span>
                    <span aria-hidden="true">·</span>
                    <span className="flex items-center gap-1 text-slate-300">
                      <Users className="w-3 h-3" />
                      {pred.occupancy === 'high' ? 'Lotação Elevada' : pred.occupancy === 'medium' ? 'Lotação Média' : 'Lugares Livres'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-lg font-bold text-blue-400 tabular-nums">
                  {pred.etaMinutes <= 1 ? 'A chegar' : `${pred.etaMinutes} min`}
                </div>
                <div className="text-[10px] text-slate-400 tabular-nums">
                  Previsto: {pred.estimatedTime}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
