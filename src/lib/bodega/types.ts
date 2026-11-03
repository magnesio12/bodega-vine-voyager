export type PlantId = "MQ" | "FO";
export type VesselKind = "tanque" | "pileta" | "barrica";
export type LineId = "joven" | "liviana" | "crianza" | "icono";

export interface Parcel {
  id: string;
  variety: string;
  plantedYear: number;
  is1958: boolean;
  ha: number;
  organic: boolean;
  color: "tinto" | "blanco";
  origin: string;
}

export interface Vessel {
  id: string;
  plant: PlantId;
  kind: VesselKind;
  capacity: number;
  material: string;
}

export interface Product {
  id: string;
  line: LineId;
  name: string;
}

export type MovementType =
  | "ingreso"
  | "descube"
  | "corte"
  | "maceracion"
  | "crianza_llenado"
  | "crianza_reunion"
  | "traslado"
  | "recepcion"
  | "embotellado"
  | "limpieza";

export interface SourceRef {
  lotId: string;
  liters: number;
}

export interface MovementData {
  parcelId?: string;
  kg?: number;
  factor?: number;
  vesselId?: string;
  vesselIds?: string[];
  macStart?: string;
  macEnd?: string;
  remito?: string;
  truck?: string;
  driver?: string;
  destPlant?: PlantId;
  sentLiters?: number;
  receivedLiters?: number;
  productId?: string;
  bottles?: number;
}

export interface Movement {
  id: string;
  seq: number;
  type: MovementType;
  date: string; // ISO local "2025-03-12T09:00"
  sources: SourceRef[];
  outputs: string[];
  merma: number;
  note?: string;
  annulled?: boolean;
  data: MovementData;
}

export type LotStatus = "activo" | "transito" | "embotellado";

export interface Lot {
  id: string;
  code: string;
  name: string;
  plant: PlantId | null;
  vesselId: string | null;
  movementId: string;
  date: string;
  litersIn: number;
  status: LotStatus;
  parcelId?: string;
  harvestDate?: string;
  productId?: string;
  bottles?: number;
  remito?: string;
}

export interface Db {
  version: number;
  parcels: Parcel[];
  vessels: Vessel[];
  products: Product[];
  lots: Lot[];
  movements: Movement[];
  seq: number;
  lotSeq: number;
  remitoSeq: number;
}

export interface MovementInput {
  type: MovementType;
  date: string;
  sources?: SourceRef[];
  vesselId?: string;
  vesselIds?: string[];
  merma?: number;
  parcelId?: string;
  kg?: number;
  factor?: number;
  macStart?: string;
  macEnd?: string;
  truck?: string;
  driver?: string;
  receivedLiters?: number;
  productId?: string;
  name?: string;
  note?: string;
}
