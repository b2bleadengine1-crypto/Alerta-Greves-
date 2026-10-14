import React, { useEffect, useState } from 'react';
import {
  Map,
  ShieldAlert,
  Navigation,
  Train,
  Send,
  Radio,
  Clock,
  ExternalLink,
  Share2,
} from 'lucide-react';
import { AlertsMonitor } from './components/AlertsMonitor';
import { BottomSheet } from './components/BottomSheet';
import { BottomTabBar, TabType } from './components/BottomTabBar';
import { LiveMap } from './components/LiveMap';
import { MetroAndArrivals } from './components/MetroAndArrivals';
import { MultimodalPlanner } from './components/MultimodalPlanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import {
  getArrivalPredictionsForStop,
  getLiveAlerts,
  getLiveVehicles,
  getMetroLinesStatus,
  getTransitStops,
} from './services/amlDataService';
import {
  MetroLineStatus,
  RoutePlan,
  TransitAlert,
  TransitStop,
  VehiclePosition,
} from './types/transit';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [alerts, setAlerts] = useState<TransitAlert[]>([]);
  const [vehicles, setVehicles] = useState<VehiclePosition[]>([]);
  const [stops, setStops] = useState<TransitStop[]>([]);
  const [metroLines, setMetroLines] = useState<MetroLineStatus[]>([]);
  const [selectedStop, setSelectedStop] = useState<TransitStop | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehiclePosition | null>(null);
  const [activeRoute, setActiveRoute] = useState<RoutePlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Carregar dados iniciais
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [liveAlerts, liveVehicles, lines] = await Promise.all([
          getLiveAlerts(),
          getLiveVehicles(),
          getMetroLinesStatus(),
        ]);
        setAlerts(liveAlerts);
        setVehicles(liveVehicles);
        setMetroLines(lines);
        const stopsList = getTransitStops();
        setStops(stopsList);
        if (stopsList.length > 0) setSelectedStop(stopsList[0]);
      } catch (err) {
        console.warn('Erro ao carregar dados de transporte:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();

    // Atualização periódica de veículos a cada 15 segundos
    const interval = setInterval(async () => {
      const updatedVehicles = await getLiveVehicles();
      setVehicles(updatedVehicles);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const handleRefreshVehicles = async () => {
    setIsLoading(true);
    const updated = await getLiveVehicles();
    setVehicles(updated);
    setIsLoading(false);
  };

  const handleSelectRoute = (route: RoutePlan) => {
    setActiveRoute(route);
    setActiveTab('map');
  };

  const criticalAlertsCount = alerts.filter((a) => a.severity === 'critical' || a.isStrike).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Indicador Flutuante Offline */}
      <OfflineIndicator />

      {/* Top Bar Contract (3 Zonas: Wordmark, Nav Links, Primary CTA / PWA) */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zona 1: Brand Wordmark */}
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-sm shadow-md shadow-blue-500/20">
                AML
              </span>
              <span>Mobilidade & Greves</span>
            </span>

            <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-medium text-emerald-400">
              <Radio className="w-3 h-3 animate-pulse" />
              GTFS-RT Ativo
            </span>
          </div>

          {/* Zona 2: Navegação Desktop */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <button
              onClick={() => setActiveTab('map')}
              className={`transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'map' ? 'text-white font-semibold underline underline-offset-8 decoration-blue-500' : 'hover:text-white'
              }`}
            >
              Mapa Ao Vivo
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeTab === 'alerts' ? 'text-white font-semibold underline underline-offset-8 decoration-blue-500' : 'hover:text-white'
              }`}
            >
              <span>Alertas & Greves</span>
              {criticalAlertsCount > 0 && (
                <span className="flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                  {criticalAlertsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('planner')}
              className={`transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'planner' ? 'text-white font-semibold underline underline-offset-8 decoration-blue-500' : 'hover:text-white'
              }`}
            >
              Planeador Multimodal
            </button>
            <button
              onClick={() => setActiveTab('metro')}
              className={`transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'metro' ? 'text-white font-semibold underline underline-offset-8 decoration-blue-500' : 'hover:text-white'
              }`}
            >
              Metro & Cais
            </button>
          </nav>

          {/* Zona 3: Ações Primárias (Instalar PWA + Canal Telegram) */}
          <div className="flex items-center gap-2.5 shrink-0">
            <a
              href="https://t.me/alertagreves_pt"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
            >
              <Send className="w-3.5 h-3.5 text-blue-400" />
              <span>Telegram</span>
            </a>

            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 flex flex-col max-w-7xl w-full mx-auto p-4 sm:p-6 pb-20 sm:pb-8">
        {/* Visualização de Mapa (Desktop: Pode conviver em grelha; Mobile: Tela inteira se aba 'map') */}
        {activeTab === 'map' ? (
          <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-6 min-h-[550px]">
            {/* Mapa Leaflet */}
            <div className="lg:col-span-8 flex flex-col h-[450px] sm:h-[550px] lg:h-full rounded-2xl overflow-hidden border border-slate-800 shadow-2xl relative">
              <LiveMap
                vehicles={vehicles}
                stops={stops}
                selectedStop={selectedStop}
                onSelectStop={(stop) => setSelectedStop(stop)}
                selectedVehicle={selectedVehicle}
                onSelectVehicle={(v) => setSelectedVehicle(v)}
                activeRoute={activeRoute}
                isLoading={isLoading}
                onRefresh={handleRefreshVehicles}
              />
            </div>

            {/* Painel Lateral Desktop (Informações em tempo real do nó ou veículo selecionado) */}
            <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto">
              {/* Alerta de Greve em Destaque se Existir */}
              {alerts.find((a) => a.isStrike) && (
                <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-900/60 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-400 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4" /> Greve em Curso na AML
                    </span>
                    <button
                      onClick={() => setActiveTab('alerts')}
                      className="text-[11px] text-rose-300 underline font-semibold"
                    >
                      Ver detalhes
                    </button>
                  </div>
                  <p className="text-slate-300">
                    {alerts.find((a) => a.isStrike)?.title}
                  </p>
                </div>
              )}

              {/* Informação do Veículo Selecionado */}
              {selectedVehicle ? (
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded-lg text-slate-950 font-bold text-xs"
                        style={{ backgroundColor: selectedVehicle.lineColor }}
                      >
                        {selectedVehicle.lineShortName}
                      </span>
                      <span className="text-xs font-semibold text-slate-200">
                        {selectedVehicle.operator === 'carris_metropolitana' ? 'Carris Metropolitana' : selectedVehicle.operator === 'metro_lisboa' ? 'Metro de Lisboa' : selectedVehicle.operator.toUpperCase()}
                      </span>
                    </div>

                    <span className={`text-[11px] font-semibold ${selectedVehicle.delaySeconds > 60 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {selectedVehicle.delaySeconds > 60 ? `+${Math.round(selectedVehicle.delaySeconds / 60)}m atraso` : 'A horas'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400">Destino:</span>
                    <h4 className="text-sm font-bold text-slate-100">{selectedVehicle.destination}</h4>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 text-slate-300">
                    <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block">Velocidade</span>
                      <span className="font-semibold text-slate-100 tabular-nums">{selectedVehicle.speedKmh || 32} km/h</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block">Lotação</span>
                      <span className="font-semibold text-slate-100">
                        {selectedVehicle.occupancy === 'high' ? 'Alta' : selectedVehicle.occupancy === 'medium' ? 'Média' : 'Baixa'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Quadro de Partidas do Nó Selecionado */}
              {selectedStop && (
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div>
                      <h4 className="text-sm font-bold text-slate-100">{selectedStop.name}</h4>
                      <span className="text-[11px] text-slate-400">{selectedStop.municipality} · Interface Multimodal</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {getArrivalPredictionsForStop(selectedStop.id).slice(0, 4).map((p) => (
                      <div
                        key={p.id}
                        className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-6 w-6 items-center justify-center rounded-lg text-white font-bold text-[10px]"
                            style={{ backgroundColor: p.lineColor }}
                          >
                            {p.lineShortName}
                          </span>
                          <div>
                            <span className="font-semibold text-slate-200 block">{p.destination}</span>
                            <span className="text-[10px] text-slate-500">{p.platform}</span>
                          </div>
                        </div>

                        <span className="font-bold text-blue-400 tabular-nums">
                          {p.etaMinutes <= 1 ? 'A chegar' : `${p.etaMinutes} min`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'alerts' ? (
          <AlertsMonitor alerts={alerts} isLoading={isLoading} />
        ) : activeTab === 'planner' ? (
          <MultimodalPlanner
            onSelectRouteOnMap={handleSelectRoute}
            activeRoute={activeRoute}
          />
        ) : (
          <MetroAndArrivals
            metroLines={metroLines}
            stops={stops}
            selectedStop={selectedStop}
            onSelectStop={(stop) => setSelectedStop(stop)}
          />
        )}
      </main>

      {/* Drawer / BottomSheet Tátil no Mobile quando um veículo ou paragem é clicado */}
      <BottomSheet
        isOpen={activeTab === 'map' && !!selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
        title={selectedVehicle ? `${selectedVehicle.lineShortName} → ${selectedVehicle.destination}` : 'Detalhes do Veículo'}
      >
        {selectedVehicle && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Operador</span>
              <span className="font-semibold text-slate-200">
                {selectedVehicle.operator === 'carris_metropolitana' ? 'Carris Metropolitana' : selectedVehicle.operator === 'metro_lisboa' ? 'Metro de Lisboa' : selectedVehicle.operator.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Velocidade</span>
                <span className="text-base font-bold text-slate-100 tabular-nums">{selectedVehicle.speedKmh || 35} km/h</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Pontualidade</span>
                <span className={`text-base font-bold tabular-nums ${selectedVehicle.delaySeconds > 60 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {selectedVehicle.delaySeconds > 60 ? `+${Math.round(selectedVehicle.delaySeconds / 60)} min` : 'A horas'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedVehicle(null)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors"
            >
              Fechar Detalhes
            </button>
          </div>
        )}
      </BottomSheet>

      {/* Bottom Tab Bar Tátil para Smartphones */}
      <BottomTabBar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        alertsCount={criticalAlertsCount}
      />
    </div>
  );
}
