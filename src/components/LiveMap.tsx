import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Locate, Layers, RefreshCw } from 'lucide-react';
import { RoutePlan, TransitStop, VehiclePosition } from '../types/transit';

interface LiveMapProps {
  vehicles: VehiclePosition[];
  stops: TransitStop[];
  selectedStop: TransitStop | null;
  onSelectStop: (stop: TransitStop) => void;
  selectedVehicle: VehiclePosition | null;
  onSelectVehicle: (vehicle: VehiclePosition) => void;
  activeRoute: RoutePlan | null;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export const LiveMap: React.FC<LiveMapProps> = ({
  vehicles,
  stops,
  selectedStop,
  onSelectStop,
  selectedVehicle,
  onSelectVehicle,
  activeRoute,
  isLoading,
  onRefresh,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const vehicleLayerRef = useRef<L.LayerGroup | null>(null);
  const stopLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  // Inicializar o mapa Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Centro da Área Metropolitana de Lisboa
    const map = L.map(mapContainerRef.current, {
      center: [38.725, -9.145],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    // Camada OpenStreetMap com estilo limpo / escuro adaptável
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    // Adicionar controle de zoom no topo à direita
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Adicionar atribuição discreta no rodapé
    L.control.attribution({ position: 'bottomright', prefix: false })
      .addAttribution('&copy; <a href="https://openstreetmap.org">OSM</a> | AML Transportes')
      .addTo(map);

    // Criar grupos de camadas
    const vehicleLayer = L.layerGroup().addTo(map);
    const stopLayer = L.layerGroup().addTo(map);
    const routeLayer = L.layerGroup().addTo(map);

    vehicleLayerRef.current = vehicleLayer;
    stopLayerRef.current = stopLayer;
    routeLayerRef.current = routeLayer;
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Renderizar Paragens e Nós Intermodais
  useEffect(() => {
    if (!mapRef.current || !stopLayerRef.current) return;
    const layer = stopLayerRef.current;
    layer.clearLayers();

    stops.forEach((stop) => {
      const isSelected = selectedStop?.id === stop.id;
      const size = isSelected ? 34 : 26;

      const stopIcon = L.divIcon({
        className: 'custom-stop-marker',
        html: `
          <div style="
            width: ${size}px;
            height: ${size}px;
            background: ${isSelected ? '#3B82F6' : '#1E293B'};
            border: 2px solid ${isSelected ? '#FFFFFF' : '#94A3B8'};
            border-radius: 9999px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            cursor: pointer;
            transition: transform 0.2s;
          ">
            <span style="font-size: 11px; font-weight: 700; color: #FFFFFF;">
              ${stop.mode === 'subway' ? 'M' : stop.mode === 'train' ? 'CP' : stop.mode === 'ferry' ? '⚓' : '🚏'}
            </span>
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([stop.latitude, stop.longitude], { icon: stopIcon });
      marker.on('click', () => {
        onSelectStop(stop);
        mapRef.current?.panTo([stop.latitude, stop.longitude], { animate: true });
      });

      marker.bindTooltip(
        `<div style="font-weight: 600; font-size: 12px; color: #0F172A;">${stop.name}</div>
         <div style="font-size: 10px; color: #64748B;">${stop.lines.slice(0, 3).join(' · ')}</div>`,
        { direction: 'top', offset: [0, -12], opacity: 0.95 }
      );

      layer.addLayer(marker);
    });
  }, [stops, selectedStop, onSelectStop]);

  // Renderizar Veículos em Tempo Real (Carris Met., Metro, CP, Fertagus, Carris, Barco)
  useEffect(() => {
    if (!mapRef.current || !vehicleLayerRef.current) return;
    const layer = vehicleLayerRef.current;
    layer.clearLayers();

    vehicles.forEach((v) => {
      const isSelected = selectedVehicle?.id === v.id;
      const size = isSelected ? 38 : 30;

      // Ícone SVG por modo de transporte
      let modeEmoji = '🚌';
      if (v.mode === 'subway') modeEmoji = '🚇';
      else if (v.mode === 'train') modeEmoji = '🚆';
      else if (v.mode === 'ferry') modeEmoji = '⛴️';

      const vehicleIcon = L.divIcon({
        className: 'custom-vehicle-marker',
        html: `
          <div style="
            position: relative;
            width: ${size}px;
            height: ${size}px;
            background: ${v.lineColor};
            border: 2px solid #FFFFFF;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.35);
            cursor: pointer;
            transition: all 0.3s ease;
          ">
            ${modeEmoji}
            <div style="
              position: absolute;
              bottom: -6px;
              right: -6px;
              background: #0F172A;
              color: #FFFFFF;
              font-size: 8px;
              font-weight: 700;
              padding: 1px 4px;
              border-radius: 4px;
              border: 1px solid rgba(255,255,255,0.4);
            ">
              ${v.lineShortName}
            </div>
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([v.latitude, v.longitude], { icon: vehicleIcon });
      marker.on('click', () => {
        onSelectVehicle(v);
        mapRef.current?.panTo([v.latitude, v.longitude], { animate: true });
      });

      marker.bindTooltip(
        `<div style="font-weight: 700; font-size: 12px; color: #0F172A;">${v.lineShortName} → ${v.destination}</div>
         <div style="font-size: 10px; color: #475569;">
           Velocidade: ${v.speedKmh || 35} km/h ${v.delaySeconds > 60 ? '· <span style="color:#DC2626;">Atrasado</span>' : '· A horas'}
         </div>`,
        { direction: 'top', offset: [0, -14], opacity: 0.95 }
      );

      layer.addLayer(marker);
    });
  }, [vehicles, selectedVehicle, onSelectVehicle]);

  // Renderizar Trajeto Ativo do Planeador Multimodal
  useEffect(() => {
    if (!mapRef.current || !routeLayerRef.current) return;
    const layer = routeLayerRef.current;
    layer.clearLayers();

    if (!activeRoute) return;

    const allCoords: [number, number][] = [];

    activeRoute.segments.forEach((seg) => {
      if (seg.coordinates && seg.coordinates.length > 0) {
        allCoords.push(...seg.coordinates);

        const polyline = L.polyline(seg.coordinates, {
          color: seg.lineColor || '#2563EB',
          weight: seg.mode === 'walk' ? 4 : 6,
          dashArray: seg.mode === 'walk' ? '6, 8' : undefined,
          opacity: 0.85,
        });

        polyline.bindTooltip(
          `<div style="font-weight: 600; font-size: 11px;">${seg.operatorName}: ${seg.instructions}</div>`,
          { sticky: true }
        );

        layer.addLayer(polyline);
      }
    });

    if (allCoords.length > 1) {
      const bounds = L.latLngBounds(allCoords);
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [activeRoute]);

  const handleLocateUser = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapRef.current?.flyTo([latitude, longitude], 14, { duration: 1.5 });

        if (mapRef.current) {
          const userIcon = L.divIcon({
            className: 'user-pos-marker',
            html: `<div style="width:18px;height:18px;background:#2563EB;border:3px solid #FFFFFF;border-radius:9999px;box-shadow:0 0 0 6px rgba(37,99,235,0.25);"></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          });
          L.marker([latitude, longitude], { icon: userIcon }).addTo(mapRef.current);
        }
      },
      (err) => {
        console.warn('Geolocalização não autorizada ou indisponível', err);
      }
    );
  };

  const handleCenterLisbon = () => {
    mapRef.current?.flyTo([38.725, -9.145], 12, { duration: 1.2 });
  };

  return (
    <div className="relative w-full h-full min-h-[420px] bg-slate-900 overflow-hidden">
      {/* Container Leaflet */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Controlos Flutuantes no Mapa (Ergonomia Mobile) */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
        <button
          onClick={handleLocateUser}
          title="A minha localização"
          className="flex items-center justify-center h-10 w-10 rounded-2xl bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100 shadow-lg backdrop-blur-md border border-slate-200 dark:border-slate-800 active:scale-95 transition-all"
        >
          <Locate className="w-5 h-5 text-blue-600" />
        </button>

        <button
          onClick={handleCenterLisbon}
          title="Ver Área Metropolitana de Lisboa"
          className="flex items-center justify-center h-10 w-10 rounded-2xl bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100 shadow-lg backdrop-blur-md border border-slate-200 dark:border-slate-800 active:scale-95 transition-all"
        >
          <Layers className="w-5 h-5 text-slate-600 dark:text-slate-300" />
        </button>

        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Atualizar posições em tempo real"
            className="flex items-center justify-center h-10 w-10 rounded-2xl bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100 shadow-lg backdrop-blur-md border border-slate-200 dark:border-slate-800 active:scale-95 transition-all"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 dark:text-slate-300 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        )}
      </div>

      {/* Legenda Discreta no Topo */}
      <div className="absolute top-4 right-14 z-20 hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-full bg-slate-900/90 backdrop-blur-md border border-slate-800 text-[11px] text-slate-300 shadow-md">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FED700]" /> Carris Met.
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0090DA]" /> Metro
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00853F]" /> CP
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#003366]" /> Fertagus
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00A3E0]" /> Ferry
        </span>
      </div>
    </div>
  );
};
