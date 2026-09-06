import React, { useState } from 'react';
import { DestinationCountry, GlobalReferenceConfig, Vehicle, CargoVehicleItem } from '../../types';
import { PRELOADED_VEHICLES } from '../../data/defaultData';
import { calculateSimulation } from '../../services/calculationEngine';
import { Container, Plus, Trash2, CheckCircle, Car, TrendingUp, DollarSign, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { Tooltip } from '../common/Tooltip';

interface CargoContainerBuilderProps {
  config: GlobalReferenceConfig;
  defaultCountry?: DestinationCountry;
}

export const CargoContainerBuilder: React.FC<CargoContainerBuilderProps> = ({
  config,
  defaultCountry = 'senegal'
}) => {
  const [destination, setDestination] = useState<DestinationCountry>(defaultCountry);
  const [selectedRouteId, setSelectedRouteId] = useState<string>(
    defaultCountry === 'senegal' ? 'mtl-dkr-cont40' : 'mtl-casa-cont40'
  );

  // Panier de véhicules dans le conteneur (1 à 4 véhicules)
  const [cargoList, setCargoList] = useState<CargoVehicleItem[]>([
    {
      id: 'car_1',
      vehicle: {
        brand: PRELOADED_VEHICLES[0].brand,
        model: PRELOADED_VEHICLES[0].model,
        year: PRELOADED_VEHICLES[0].year,
        purchasePriceCad: PRELOADED_VEHICLES[0].purchasePriceCad,
        engineCc: PRELOADED_VEHICLES[0].engineCc,
        fuelType: PRELOADED_VEHICLES[0].fuelType,
        steering: 'LHD',
        vehicleClassification: PRELOADED_VEHICLES[0].vehicleClassification,
        grossVehicleWeightKg: PRELOADED_VEHICLES[0].grossVehicleWeightKg,
        classificationVerified: true,
        mileageKm: PRELOADED_VEHICLES[0].mileageKm,
        category: PRELOADED_VEHICLES[0].category,
        condition: PRELOADED_VEHICLES[0].condition,
        source: PRELOADED_VEHICLES[0].source,
        auctionFeesCad: 600,
        brokerCommissionCad: 300
      },
      destination: defaultCountry,
      customs: { country: defaultCountry },
      targetMarginPercent: 18
    },
    {
      id: 'car_2',
      vehicle: {
        brand: PRELOADED_VEHICLES[1].brand,
        model: PRELOADED_VEHICLES[1].model,
        year: PRELOADED_VEHICLES[1].year,
        purchasePriceCad: PRELOADED_VEHICLES[1].purchasePriceCad,
        engineCc: PRELOADED_VEHICLES[1].engineCc,
        fuelType: PRELOADED_VEHICLES[1].fuelType,
        steering: 'LHD',
        vehicleClassification: PRELOADED_VEHICLES[1].vehicleClassification,
        grossVehicleWeightKg: PRELOADED_VEHICLES[1].grossVehicleWeightKg,
        classificationVerified: true,
        mileageKm: PRELOADED_VEHICLES[1].mileageKm,
        category: PRELOADED_VEHICLES[1].category,
        condition: PRELOADED_VEHICLES[1].condition,
        source: PRELOADED_VEHICLES[1].source,
        auctionFeesCad: 0,
        brokerCommissionCad: 0
      },
      destination: defaultCountry,
      customs: { country: defaultCountry },
      targetMarginPercent: 18
    }
  ]);

  const [selectedPreloadedToAdd, setSelectedPreloadedToAdd] = useState<string>(PRELOADED_VEHICLES[2].id);

  const containerRoute =
    config.routes.find(r => r.id === selectedRouteId) ||
    config.routes.find(r => r.destinationCountry === destination && r.mode === 'conteneur_complet') ||
    config.routes[2];

  const carCount = cargoList.length;
  const maxCapacity = 4;

  const handleAddVehicle = () => {
    if (carCount >= maxCapacity) return;
    const template = PRELOADED_VEHICLES.find(p => p.id === selectedPreloadedToAdd) || PRELOADED_VEHICLES[0];
    const newItem: CargoVehicleItem = {
      id: `car_${Date.now()}`,
      vehicle: {
        brand: template.brand,
        model: template.model,
        year: template.year,
        purchasePriceCad: template.purchasePriceCad,
        engineCc: template.engineCc,
        fuelType: template.fuelType,
        steering: 'LHD',
        vehicleClassification: template.vehicleClassification,
        grossVehicleWeightKg: template.grossVehicleWeightKg,
        classificationVerified: true,
        mileageKm: template.mileageKm,
        category: template.category,
        condition: template.condition,
        source: template.source,
        auctionFeesCad: template.source === 'encan' ? 600 : 0,
        brokerCommissionCad: 0
      },
      destination,
      customs: { country: destination },
      targetMarginPercent: 18
    };
    setCargoList([...cargoList, newItem]);
  };

  const handleRemoveVehicle = (id: string) => {
    if (cargoList.length <= 1) return;
    setCargoList(cargoList.filter(c => c.id !== id));
  };

  const handleCountryChange = (c: DestinationCountry) => {
    setDestination(c);
    const newRoute = config.routes.find(r => r.destinationCountry === c && r.mode === 'conteneur_complet');
    if (newRoute) {
      setSelectedRouteId(newRoute.id);
    }
    setCargoList(cargoList.map(item => ({
      ...item,
      destination: c,
      customs: { country: c }
    })));
  };

  // Calcul dynamique pour chaque véhicule avec le fret partagé
  const calculatedItems = cargoList.map(item => {
    const sim = calculateSimulation(
      item.vehicle,
      destination,
      {
        method: 'plateforme_transfert',
        fixedFeeCad: 15,
        variableFeePercent: 0.7,
        fxSpreadPercent: 1.2
      },
      {
        routeId: containerRoute.id,
        batchVehiclesCount: carCount
      },
      item.customs,
      item.targetMarginPercent,
      config
    );
    return { item, sim };
  });

  // Totaux combinés pour l'ensemble du conteneur
  const totalPurchaseCad = calculatedItems.reduce((sum, i) => sum + i.sim.vehicle.purchasePriceCad, 0);
  const totalLandedCostCad = calculatedItems.reduce((sum, i) => sum + i.sim.breakdown.landedCostCad, 0);
  const totalSaleCad = calculatedItems.reduce((sum, i) => sum + i.sim.suggestedSalePriceCad, 0);
  const totalProfitCad = calculatedItems.reduce((sum, i) => sum + i.sim.estimatedNetProfitCad, 0);
  const overallRoi = totalLandedCostCad > 0 ? Math.round((totalProfitCad / totalLandedCostCad) * 1000) / 10 : 0;
  const sharedFreightPerCar = Math.round(containerRoute.oceanFreightCad / carCount);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">

      {/* En-tête */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-brand-900 text-white rounded-2xl shadow-md">
              <Container className="w-8 h-8 text-sky-400" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                Organisateur de Cargaison & Panier Conteneur 40'
              </h2>
              <p className="text-sm text-slate-600">
                Regroupez 1 à 4 véhicules dans un conteneur partagé pour diviser le coût du fret maritime
              </p>
            </div>
          </div>

          {/* Choix Destination */}
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 self-start sm:self-center">
            <button
              type="button"
              onClick={() => handleCountryChange('senegal')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${destination === 'senegal'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              SN · Vers Dakar (Sénégal)
            </button>
            <button
              type="button"
              onClick={() => handleCountryChange('maroc')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${destination === 'maroc'
                  ? 'bg-white text-orange-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              MA · Vers Casablanca (Maroc)
            </button>
          </div>
        </div>

        {/* Visualisation 3D du conteneur & jauge de remplissage */}
        <div className="mt-6 bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-sky-300">
                Remplissage du Conteneur 40ft High Cube :
              </span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30">
                {carCount} / {maxCapacity} places occupées ({Math.round((carCount / maxCapacity) * 100)}%)
              </span>
            </div>
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">
              Fret partagé : <strong>{sharedFreightPerCar.toLocaleString('fr-CA')} $ CA</strong> / véhicule
            </span>
          </div>

          {/* Grille visuelle des 4 emplacements */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((slotIdx) => {
              const item = calculatedItems[slotIdx];
              return (
                <div
                  key={slotIdx}
                  className={`p-3.5 rounded-xl border-2 flex flex-col justify-between min-h-[90px] transition-all ${item
                      ? 'border-emerald-500 bg-emerald-950/40'
                      : 'border-dashed border-slate-700 bg-slate-800/50'
                    }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-400">Place #{slotIdx + 1}</span>
                    {item ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    ) : (
                      <span className="text-[10px] text-slate-500">Vide</span>
                    )}
                  </div>

                  {item ? (
                    <div>
                      <div className="font-bold text-xs text-white truncate">
                        {item.sim.vehicle.brand} {item.sim.vehicle.model}
                      </div>
                      <div className="text-[11px] text-emerald-400 font-semibold">
                        Profit : +{item.sim.estimatedNetProfitCad.toLocaleString('fr-CA')} $
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-xs text-slate-500 font-medium">
                      Place disponible
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bannière Totaux du Conteneur */}
        <div className="mt-6 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-6 shadow-lg">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-emerald-100 font-medium">Investissement Achat ({carCount} véh.)</div>
              <div className="text-xl font-black mt-1">
                {totalPurchaseCad.toLocaleString('fr-CA')} $ CA
              </div>
            </div>

            <div>
              <div className="text-xs text-emerald-100 font-medium">Coût Total Rendu (Landed Cost)</div>
              <div className="text-xl font-black mt-1">
                {totalLandedCostCad.toLocaleString('fr-CA')} $ CA
              </div>
            </div>

            <div>
              <div className="text-xs text-emerald-100 font-medium">Revente Suggérée Cumulée</div>
              <div className="text-xl font-black mt-1">
                {totalSaleCad.toLocaleString('fr-CA')} $ CA
              </div>
            </div>

            <div className="bg-white/10 p-3 rounded-xl border border-white/20">
              <div className="text-xs text-amber-200 font-bold uppercase tracking-wider">Profit Net du Conteneur</div>
              <div className="text-2xl font-black text-white mt-0.5">
                +{totalProfitCad.toLocaleString('fr-CA')} $ CA
              </div>
              <div className="text-xs text-emerald-100 font-bold">ROI Global : +{overallRoi}%</div>
            </div>
          </div>
        </div>

        {/* Barre d'ajout d'un véhicule dans le conteneur */}
        {carCount < maxCapacity && (
          <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-700 flex-shrink-0">
                Ajouter une voiture :
              </span>
              <select
                value={selectedPreloadedToAdd}
                onChange={(e) => setSelectedPreloadedToAdd(e.target.value)}
                className="w-full sm:w-80 text-xs py-2 px-3 rounded-lg border border-slate-300 bg-white font-medium"
              >
                {PRELOADED_VEHICLES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.brand} {p.model} ({p.year}) — {p.purchasePriceCad.toLocaleString('fr-CA')} $ CA
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleAddVehicle}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Insérer dans le conteneur</span>
            </button>
          </div>
        )}

        {/* Détail de chaque véhicule dans le conteneur */}
        <div className="mt-6 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Détail des {carCount} véhicule(s) embarqué(s) :
          </div>

          {calculatedItems.map(({ item, sim }, idx) => (
            <div
              key={item.id}
              className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm"
            >
              <div className="flex items-center space-x-3">
                <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                  {idx + 1}
                </span>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-slate-900">
                      {sim.vehicle.brand} {sim.vehicle.model} ({sim.vehicle.year})
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      ({sim.vehicle.mileageKm.toLocaleString('fr-CA')} km)
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                    <span>Achat : {sim.vehicle.purchasePriceCad.toLocaleString('fr-CA')} $</span>
                    <span>Fret alloué : {sharedFreightPerCar.toLocaleString('fr-CA')} $</span>
                    <span>Douane : {sim.breakdown.customsAndTaxesCad.toLocaleString('fr-CA')} $</span>
                    <span>Landed Cost : {sim.breakdown.landedCostCad.toLocaleString('fr-CA')} $</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end space-x-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <div className="text-right">
                  <div className="text-sm font-black text-emerald-700">
                    +{sim.estimatedNetProfitCad.toLocaleString('fr-CA')} $ CA
                  </div>
                  <div className="text-[11px] text-slate-500 font-semibold">
                    Revente : {sim.suggestedSalePriceCad.toLocaleString('fr-CA')} $
                  </div>
                </div>

                {cargoList.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveVehicle(item.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Retirer du conteneur"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

      </div>

    </div>
  );
};

