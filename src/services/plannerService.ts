import { RoutePlan } from '../types/transit';

export interface PlanTripParams {
  originId: string;
  destinationId: string;
  allowedModes: {
    subway: boolean;
    bus: boolean;
    train: boolean;
    ferry: boolean;
  };
  preference: 'fastest' | 'fewest_transfers' | 'eco';
}

export function planMultimodalTrip(params: PlanTripParams): RoutePlan[] {
  const { originId, destinationId, allowedModes } = params;

  const now = new Date();
  const formatTime = (minutesFromNow: number) => {
    const d = new Date(now.getTime() + minutesFromNow * 60000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // Trajeto 1: Multimodal Rápido (ex: Metro + Barco ou Comboio + Metro)
  const route1: RoutePlan = {
    id: 'route-fastest',
    originName: getStopName(originId),
    destinationName: getStopName(destinationId),
    totalDurationMinutes: 32,
    departureTime: formatTime(3),
    arrivalTime: formatTime(35),
    transfersCount: 1,
    walkDistanceMeters: 450,
    co2SavedGrams: 1450,
    hasAlertWarnings: true,
    alertMessages: ['Greve parcial no Metro com tempos de espera alargados.'],
    segments: [
      {
        mode: 'subway',
        operator: 'metro_lisboa',
        operatorName: 'Metropolitano de Lisboa',
        lineName: 'Linha Azul',
        lineColor: '#0090DA',
        fromStop: getStopName(originId),
        toStop: 'Baixa-Chiado',
        departureTime: formatTime(3),
        arrivalTime: formatTime(15),
        durationMinutes: 12,
        stopsCount: 5,
        instructions: 'Apanhar Metro Linha Azul direção Santa Apolónia e sair em Baixa-Chiado.',
        coordinates: [
          [38.7408, -9.1678],
          [38.7253, -9.1501],
          [38.7107, -9.1394],
        ],
      },
      {
        mode: 'walk',
        operator: 'carris',
        operatorName: 'Caminhada',
        fromStop: 'Baixa-Chiado',
        toStop: 'Cais do Sodré',
        departureTime: formatTime(15),
        arrivalTime: formatTime(21),
        durationMinutes: 6,
        instructions: 'Caminhar cerca de 400m em direção ao Cais do Sodré.',
        coordinates: [
          [38.7107, -9.1394],
          [38.7058, -9.1444],
        ],
      },
      {
        mode: allowedModes.ferry ? 'ferry' : 'train',
        operator: allowedModes.ferry ? 'transtejo_soflusa' : 'cp',
        operatorName: allowedModes.ferry ? 'Transtejo Soflusa' : 'CP Linha de Cascais',
        lineName: allowedModes.ferry ? 'Cacilheiro' : 'Comboio Urbano',
        lineColor: allowedModes.ferry ? '#00A3E0' : '#00853F',
        fromStop: 'Cais do Sodré',
        toStop: getStopName(destinationId),
        departureTime: formatTime(23),
        arrivalTime: formatTime(35),
        durationMinutes: 12,
        stopsCount: 1,
        instructions: 'Embarcar no cais fluvial direção ao terminal pretendido.',
        coordinates: [
          [38.7058, -9.1444],
          [38.6875, -9.1485],
        ],
      },
    ],
  };

  // Trajeto 2: Conexão Direta Rodoviária / Carris Metropolitana (Alternativa a Greves)
  const route2: RoutePlan = {
    id: 'route-direct-bus',
    originName: getStopName(originId),
    destinationName: getStopName(destinationId),
    totalDurationMinutes: 44,
    departureTime: formatTime(7),
    arrivalTime: formatTime(51),
    transfersCount: 0,
    walkDistanceMeters: 280,
    co2SavedGrams: 1100,
    hasAlertWarnings: false,
    alertMessages: [],
    segments: [
      {
        mode: 'bus',
        operator: 'carris_metropolitana',
        operatorName: 'Carris Metropolitana',
        lineName: 'Linha 3710',
        lineColor: '#FED700',
        fromStop: getStopName(originId),
        toStop: getStopName(destinationId),
        departureTime: formatTime(7),
        arrivalTime: formatTime(51),
        durationMinutes: 44,
        stopsCount: 12,
        instructions: 'Apanhar Carris Metropolitana via Eixo Norte-Sul / Ponte sem necessidade de transbordo (Ideal em dias de greve no Metro).',
        coordinates: [
          [38.7408, -9.1678],
          [38.7100, -9.1700],
          [38.6750, -9.1700],
          [38.6698, -9.1764],
        ],
      },
    ],
  };

  // Trajeto 3: Ferroviário Estruturante (CP + Fertagus)
  const route3: RoutePlan = {
    id: 'route-rail',
    originName: getStopName(originId),
    destinationName: getStopName(destinationId),
    totalDurationMinutes: 38,
    departureTime: formatTime(10),
    arrivalTime: formatTime(48),
    transfersCount: 1,
    walkDistanceMeters: 310,
    co2SavedGrams: 1650,
    hasAlertWarnings: false,
    alertMessages: [],
    segments: [
      {
        mode: 'train',
        operator: 'cp',
        operatorName: 'CP - Comboios de Portugal',
        lineName: 'Linha de Sintra / Cintura',
        lineColor: '#00853F',
        fromStop: getStopName(originId),
        toStop: 'Entrecampos',
        departureTime: formatTime(10),
        arrivalTime: formatTime(22),
        durationMinutes: 12,
        stopsCount: 3,
        instructions: 'Comboio suburbano Linha de Sintra / Cintura com transbordo rápido de cais em Entrecampos.',
        coordinates: [
          [38.7678, -9.0991],
          [38.7490, -9.1450],
        ],
      },
      {
        mode: 'train',
        operator: 'fertagus',
        operatorName: 'Fertagus',
        lineName: 'Comboio da Ponte',
        lineColor: '#003366',
        fromStop: 'Entrecampos',
        toStop: getStopName(destinationId),
        departureTime: formatTime(28),
        arrivalTime: formatTime(48),
        durationMinutes: 20,
        stopsCount: 4,
        instructions: 'Travessia da Ponte 25 de Abril em alta capacidade.',
        coordinates: [
          [38.7490, -9.1450],
          [38.6698, -9.1764],
        ],
      },
    ],
  };

  if (params.preference === 'fewest_transfers') {
    return [route2, route1, route3];
  } else if (params.preference === 'eco') {
    return [route3, route1, route2];
  }
  return [route1, route2, route3];
}

function getStopName(stopId: string): string {
  const map: Record<string, string> = {
    'stop-oriente': 'Gare do Oriente',
    'stop-cais-sodre': 'Cais do Sodré',
    'stop-marques': 'Marquês de Pombal',
    'stop-rossio': 'Rossio',
    'stop-sete-rios': 'Sete Rios',
    'stop-campo-grande': 'Campo Grande',
    'stop-pragal': 'Pragal (Almada)',
    'stop-cacilhas': 'Cacilhas (Fluvial)',
    'stop-aeroporto': 'Aeroporto Humberto Delgado',
    'stop-costa-caparica': 'Costa da Caparica',
    'stop-sintra': 'Sintra (Vila)',
    'stop-cascais': 'Cascais',
    'stop-barreiro': 'Barreiro',
  };
  return map[stopId] || 'Lisboa Centro';
}
