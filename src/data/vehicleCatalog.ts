import { VehicleCategory } from '../types';

export interface VehicleCatalogModel {
  name: string;
  category: VehicleCategory;
}

export interface VehicleCatalogBrand {
  name: string;
  models: VehicleCatalogModel[];
}

export const VEHICLE_CATALOG: VehicleCatalogBrand[] = [
  { name: 'Acura', models: [{ name: 'MDX', category: 'suv' }, { name: 'RDX', category: 'suv' }, { name: 'TLX', category: 'berline' }] },
  { name: 'Audi', models: [{ name: 'A4', category: 'berline' }, { name: 'Q3', category: 'suv' }, { name: 'Q5', category: 'suv' }] },
  { name: 'BMW', models: [{ name: 'Série 3', category: 'berline' }, { name: 'X1', category: 'suv' }, { name: 'X3', category: 'suv' }] },
  { name: 'Chevrolet', models: [{ name: 'Equinox', category: 'suv' }, { name: 'Malibu', category: 'berline' }, { name: 'Silverado', category: 'camionnette' }, { name: 'Trax', category: 'suv' }] },
  { name: 'Ford', models: [{ name: 'Escape', category: 'suv' }, { name: 'Explorer', category: 'suv' }, { name: 'F-150', category: 'camionnette' }, { name: 'Fusion', category: 'berline' }] },
  { name: 'Honda', models: [{ name: 'Accord', category: 'berline' }, { name: 'Civic', category: 'berline' }, { name: 'CR-V', category: 'suv' }, { name: 'Fit', category: 'citadine' }, { name: 'HR-V', category: 'suv' }] },
  { name: 'Hyundai', models: [{ name: 'Accent', category: 'citadine' }, { name: 'Elantra', category: 'berline' }, { name: 'Kona', category: 'suv' }, { name: 'Santa Fe', category: 'suv' }, { name: 'Tucson', category: 'suv' }] },
  { name: 'Jeep', models: [{ name: 'Cherokee', category: 'suv' }, { name: 'Compass', category: 'suv' }, { name: 'Grand Cherokee', category: 'suv' }, { name: 'Wrangler', category: 'suv' }] },
  { name: 'Kia', models: [{ name: 'Forte', category: 'berline' }, { name: 'Rio', category: 'citadine' }, { name: 'Sorento', category: 'suv' }, { name: 'Sportage', category: 'suv' }] },
  { name: 'Lexus', models: [{ name: 'ES', category: 'berline' }, { name: 'NX', category: 'suv' }, { name: 'RX', category: 'suv' }] },
  { name: 'Mazda', models: [{ name: 'Mazda3', category: 'berline' }, { name: 'CX-3', category: 'suv' }, { name: 'CX-5', category: 'suv' }, { name: 'CX-9', category: 'suv' }] },
  { name: 'Mercedes-Benz', models: [{ name: 'Classe C', category: 'berline' }, { name: 'GLA', category: 'suv' }, { name: 'GLC', category: 'suv' }] },
  { name: 'Mitsubishi', models: [{ name: 'Eclipse Cross', category: 'suv' }, { name: 'Lancer', category: 'berline' }, { name: 'Outlander', category: 'suv' }] },
  { name: 'Nissan', models: [{ name: 'Altima', category: 'berline' }, { name: 'Kicks', category: 'suv' }, { name: 'Rogue', category: 'suv' }, { name: 'Sentra', category: 'berline' }] },
  { name: 'Subaru', models: [{ name: 'Crosstrek', category: 'suv' }, { name: 'Forester', category: 'suv' }, { name: 'Impreza', category: 'berline' }, { name: 'Outback', category: 'suv' }] },
  { name: 'Tesla', models: [{ name: 'Model 3', category: 'berline' }, { name: 'Model Y', category: 'suv' }] },
  { name: 'Toyota', models: [{ name: '4Runner', category: 'suv' }, { name: 'Camry', category: 'berline' }, { name: 'Corolla', category: 'berline' }, { name: 'Highlander', category: 'suv' }, { name: 'RAV4', category: 'suv' }, { name: 'Tacoma', category: 'camionnette' }, { name: 'Yaris', category: 'citadine' }] },
  { name: 'Volkswagen', models: [{ name: 'Golf', category: 'citadine' }, { name: 'Jetta', category: 'berline' }, { name: 'Taos', category: 'suv' }, { name: 'Tiguan', category: 'suv' }] },
  { name: 'Volvo', models: [{ name: 'S60', category: 'berline' }, { name: 'XC40', category: 'suv' }, { name: 'XC60', category: 'suv' }] },
];
