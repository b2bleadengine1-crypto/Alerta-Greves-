export type OperatorId =
  | 'carris_metropolitana'
  | 'metro_lisboa'
  | 'cp'
  | 'fertagus'
  | 'carris'
  | 'transtejo_soflusa';

export type TransportMode = 'bus' | 'subway' | 'train' | 'ferry' | 'walk';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export type AlertCategory =
  | 'strike'
  | 'disruption'
  | 'cancellation'
  | 'detour'
  | 'maintenance'
  | 'weather';

export interface TransitAlert {
  id: string;
  operator: OperatorId;
  operatorName: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  category: AlertCategory;
  affectedLines: string[];
  minimumServices?: string; // Serviços mínimos se for greve
  startDate: string;
  endDate?: string;
  sourceUrl?: string;
  verifiedAt: string;
  isStrike: boolean;
}

export interface TransitStop {
  id: string;
  name: string;
  operator: OperatorId;
  mode: TransportMode;
  latitude: number;
  longitude: number;
  municipality: string;
  lines: string[];
  wheelchairAccessible?: boolean;
}

export interface VehiclePosition {
  id: string;
  lineId: string;
  lineShortName: string;
  lineColor: string;
  operator: OperatorId;
  mode: TransportMode;
  destination: string;
  latitude: number;
  longitude: number;
  bearing?: number; // em graus (0-360)
  speedKmh?: number;
  delaySeconds: number; // positivo = atrasado, negativo = adiantado
  occupancy: 'low' | 'medium' | 'high' | 'unknown';
  nextStopName?: string;
  etaMinutes?: number;
  timestamp: string;
}

export interface ArrivalPrediction {
  id: string;
  stopId: string;
  lineId: string;
  lineShortName: string;
  lineColor: string;
  destination: string;
  operator: OperatorId;
  mode: TransportMode;
  scheduledTime: string;
  estimatedTime?: string;
  etaMinutes: number;
  isRealTime: boolean;
  platform?: string;
  occupancy?: 'low' | 'medium' | 'high';
}

export interface MetroLineStatus {
  id: 'azul' | 'amarela' | 'verde' | 'vermelha';
  name: string;
  color: string;
  status: 'normal' | 'perturbed' | 'interrupted';
  statusLabel: string;
  detailMessage: string;
  terminal1: string;
  terminal2: string;
  averageIntervalMinutes: number;
}

export interface RouteSegment {
  mode: TransportMode;
  operator: OperatorId;
  operatorName: string;
  lineName?: string;
  lineColor?: string;
  fromStop: string;
  toStop: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  stopsCount?: number;
  instructions: string;
  coordinates: [number, number][]; // [lat, lng]
}

export interface RoutePlan {
  id: string;
  originName: string;
  destinationName: string;
  totalDurationMinutes: number;
  departureTime: string;
  arrivalTime: string;
  transfersCount: number;
  walkDistanceMeters: number;
  co2SavedGrams: number;
  segments: RouteSegment[];
  hasAlertWarnings: boolean;
  alertMessages?: string[];
}
