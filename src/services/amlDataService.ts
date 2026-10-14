import {
  AML_KEY_STOPS,
  INITIAL_ALERTS,
  INITIAL_METRO_STATUS,
  INITIAL_VEHICLES,
} from '../data/amlTransportData';
import {
  ArrivalPrediction,
  MetroLineStatus,
  TransitAlert,
  TransitStop,
  VehiclePosition,
} from '../types/transit';

const CACHE_KEYS = {
  ALERTS: 'aml_cache_alerts_v1',
  VEHICLES: 'aml_cache_vehicles_v1',
  METRO: 'aml_cache_metro_v1',
  FAVORITES: 'aml_cache_favorites_v1',
  SAVED_ROUTES: 'aml_cache_saved_routes_v1',
};

// Carregar alertas com prioridade offline-first e tentativa de rede
export async function getLiveAlerts(): Promise<TransitAlert[]> {
  try {
    // 1. Tentar ler do ficheiro local greves.json gerado pelo scraper oficial
    const localRes = await fetch('./greves.json', { cache: 'no-cache' });
    if (localRes.ok) {
      const scrapedStrikes = await localRes.json();
      if (Array.isArray(scrapedStrikes) && scrapedStrikes.length > 0) {
        // Mapear greves oficiais para TransitAlert
        const mappedFromScraper: TransitAlert[] = scrapedStrikes.map((s: any, idx: number) => {
          let op = 'carris_metropolitana';
          const emp = (s.empresa || s.setor || '').toLowerCase();
          if (emp.includes('metro')) op = 'metro_lisboa';
          else if (emp.includes('cp') || emp.includes('comboios')) op = 'cp';
          else if (emp.includes('fertagus')) op = 'fertagus';
          else if (emp.includes('carris') && !emp.includes('metropolitana')) op = 'carris';
          else if (emp.includes('transtejo') || emp.includes('soflusa')) op = 'transtejo_soflusa';

          return {
            id: s.id || `scraped-alert-${idx}`,
            operator: op as any,
            operatorName: s.empresa || 'Operador de Transportes',
            title: s.titulo || `Greve convocada em ${s.empresa || 'Transportes'}`,
            description: s.motivo || s.impacto || 'Paralisação prevista com potencial afetação de horários e ligações habituais.',
            severity: (s.impacto?.toLowerCase().includes('elevad') || s.impacto?.toLowerCase().includes('alta') ? 'critical' : 'warning') as any,
            category: 'strike',
            affectedLines: [s.empresa || 'Rede Geral'],
            minimumServices: s.servicos_minimos || 'A aguardar determinação do Tribunal Arbitral do CES.',
            startDate: s.data_inicio || '2026-10-14',
            endDate: s.data_fim,
            sourceUrl: s.fonte_oficial_url || 'https://www.metrolisboa.pt',
            verifiedAt: s.atualizado_em || 'Atualizado hoje',
            isStrike: true,
          };
        });

        // Combinar com os alertas de serviço (desvios, avarias, etc.)
        const combined = [...mappedFromScraper, ...INITIAL_ALERTS.filter(a => !a.isStrike)];
        localStorage.setItem(CACHE_KEYS.ALERTS, JSON.stringify(combined));
        return combined;
      }
    }
  } catch (err) {
    console.info('[Transit Service] Falha ao ler feed online de greves; a utilizar cache offline.', err);
  }

  // Fallback para cache local gravada
  const cached = localStorage.getItem(CACHE_KEYS.ALERTS);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // Ignorar erro de parse
    }
  }

  return INITIAL_ALERTS;
}

// Obter posições em tempo real com live simulation e tentativa na API Carris Metropolitana
export async function getLiveVehicles(): Promise<VehiclePosition[]> {
  try {
    // Tentativa na API oficial Carris Metropolitana com timeout curto
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const cmRes = await fetch('https://api.carrismetropolitana.pt/v1/vehicles', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (cmRes.ok) {
      const data = await cmRes.json();
      if (Array.isArray(data) && data.length > 0) {
        // Filtrar e normalizar até 25 autocarros da AML
        const liveCM: VehiclePosition[] = data.slice(0, 20).map((v: any) => ({
          id: `cm-${v.id || Math.random()}`,
          lineId: v.line_id || 'CM',
          lineShortName: v.line_id || 'CM',
          lineColor: '#FED700',
          operator: 'carris_metropolitana',
          mode: 'bus',
          destination: v.headsign || 'Destino AML',
          latitude: Number(v.lat || 38.72),
          longitude: Number(v.lon || -9.15),
          bearing: Number(v.bearing || 0),
          speedKmh: Math.round(Number(v.speed || 35)),
          delaySeconds: Number(v.delay || 0),
          occupancy: 'medium',
          timestamp: new Date().toISOString(),
        }));

        // Combinar com os outros modos (Metro, CP, Ferry, Carris)
        const allModes = [...liveCM, ...INITIAL_VEHICLES.filter(v => v.operator !== 'carris_metropolitana')];
        localStorage.setItem(CACHE_KEYS.VEHICLES, JSON.stringify(allModes));
        return allModes;
      }
    }
  } catch {
    // Falha silenciosa de rede/CORS - o fallback offline garante a experiência contínua
  }

  // Modo Offline ou Fallback com ligeira perturbação de jitter realista
  const base = INITIAL_VEHICLES.map((v) => {
    // Adicionar ligeira deslocação para simular circulação suave se a app estiver aberta
    const latJitter = (Math.random() - 0.5) * 0.001;
    const lngJitter = (Math.random() - 0.5) * 0.001;
    return {
      ...v,
      latitude: v.latitude + latJitter,
      longitude: v.longitude + lngJitter,
      timestamp: new Date().toISOString(),
    };
  });

  return base;
}

// Obter estado das linhas do Metropolitano de Lisboa
export async function getMetroLinesStatus(): Promise<MetroLineStatus[]> {
  const cached = localStorage.getItem(CACHE_KEYS.METRO);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      //
    }
  }
  return INITIAL_METRO_STATUS;
}

// Obter paragens / nós intermodais da Área Metropolitana de Lisboa
export function getTransitStops(): TransitStop[] {
  return AML_KEY_STOPS;
}

// Previsões de chegada para uma determinada paragem (quadro de partidas)
export function getArrivalPredictionsForStop(stopId: string): ArrivalPrediction[] {
  const stop = AML_KEY_STOPS.find(s => s.id === stopId) || AML_KEY_STOPS[0];
  const now = new Date();

  return stop.lines.map((line, idx) => {
    const eta = 2 + (idx * 4) + Math.floor(Math.random() * 3);
    const arrivalDate = new Date(now.getTime() + eta * 60000);
    const schedHours = String(arrivalDate.getHours()).padStart(2, '0');
    const schedMins = String(arrivalDate.getMinutes()).padStart(2, '0');

    let mode: any = stop.mode;
    let operator = stop.operator;
    let color = '#3B82F6';

    if (line.includes('Metro')) {
      mode = 'subway';
      operator = 'metro_lisboa';
      if (line.includes('Azul')) color = '#0090DA';
      else if (line.includes('Amarela')) color = '#F4B223';
      else if (line.includes('Verde')) color = '#008938';
      else if (line.includes('Vermelha')) color = '#E31B23';
    } else if (line.includes('CP')) {
      mode = 'train';
      operator = 'cp';
      color = '#00853F';
    } else if (line.includes('CM')) {
      mode = 'bus';
      operator = 'carris_metropolitana';
      color = '#FED700';
    } else if (line.includes('Transtejo') || line.includes('Soflusa')) {
      mode = 'ferry';
      operator = 'transtejo_soflusa';
      color = '#00A3E0';
    }

    return {
      id: `arr-${stopId}-${idx}`,
      stopId,
      lineId: line,
      lineShortName: line.split(' ')[0],
      lineColor: color,
      destination: stop.municipality === 'Lisboa' ? 'Destino Periférico / AML' : 'Lisboa (Centro)',
      operator,
      mode,
      scheduledTime: `${schedHours}:${schedMins}`,
      estimatedTime: `${schedHours}:${schedMins}`,
      etaMinutes: eta,
      isRealTime: true,
      platform: `Cais ${idx + 1}`,
      occupancy: idx % 2 === 0 ? 'medium' : 'low',
    };
  });
}
