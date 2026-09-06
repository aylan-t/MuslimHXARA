import React, { useState, useEffect } from 'react';
import {
  Vehicle,
  DestinationCountry,
  FinancingConfig,
  TransportSelection,
  CustomsSelection,
  SimulationResult,
  GlobalReferenceConfig
} from './types';
import { loadStoredConfig, saveStoredConfig } from './services/storageService';
import { calculateSimulation } from './services/calculationEngine';
import { fetchLiveFxRates } from './services/liveDataService';
import { DEMO_VEHICLE } from './data/defaultData';
import { Header } from './components/common/Header';
import { WizardStepper } from './components/wizard/WizardStepper';
import { StepVehicle } from './components/wizard/StepVehicle';
import { StepDestination } from './components/wizard/StepDestination';
import { StepFinancing } from './components/wizard/StepFinancing';
import { StepTransport } from './components/wizard/StepTransport';
import { ResultsDashboard } from './components/results/ResultsDashboard';
import { CargoContainerBuilder } from './components/batch/CargoContainerBuilder';
import { ContainerOptimizer } from './components/batch/ContainerOptimizer';
import { SimulationHistory } from './components/history/SimulationHistory';
import { ConfigEditor } from './components/admin/ConfigEditor';
import { OfficialSourcesModal } from './components/common/OfficialSourcesModal';

const INITIAL_VEHICLE: Vehicle = {
  brand: '',
  model: '',
  year: 2018,
  mileageKm: 120000,
  purchasePriceCad: 0,
  category: 'suv',
  condition: 'tres_bon',
  source: 'particulier',
  auctionFeesCad: 0,
  brokerCommissionCad: 0,
  originRegionId: 'grand-montreal',
  isNonRunning: false
};

export function App() {
  const [config, setConfig] = useState<GlobalReferenceConfig>(loadStoredConfig());
  const [currentTab, setCurrentTab] = useState<'wizard' | 'results' | 'cargo' | 'optimizer' | 'history' | 'config'>('wizard');
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<number>(1);
  const [isRefreshingRates, setIsRefreshingRates] = useState<boolean>(false);
  const [isSourcesModalOpen, setIsSourcesModalOpen] = useState<boolean>(false);
  const [isNavigationCollapsed, setIsNavigationCollapsed] = useState(false);

  // Formulaire d'entrée
  const [vehicle, setVehicle] = useState<Vehicle>(INITIAL_VEHICLE);
  const [destination, setDestination] = useState<DestinationCountry>('senegal');
  const [financing, setFinancing] = useState<FinancingConfig>({
    method: 'plateforme_transfert',
    fixedFeeCad: 15,
    variableFeePercent: 0.7,
    fxSpreadPercent: 1.2
  });
  const [transport, setTransport] = useState<TransportSelection>({
    routeId: 'mtl-dkr-roro',
    batchVehiclesCount: 1
  });
  const [customs, setCustoms] = useState<CustomsSelection>({
    country: 'senegal',
    valuationBasis: 'invoice',
    moroccoOptions: {
      isMRE: false,
      mreAgeOver60: false,
      residenceOver10Years: false,
      isFirstCarInLife: false
    }
  });
  const [targetMargin, setTargetMargin] = useState<number>(18);

  // Résultat actuel
  const [currentResult, setCurrentResult] = useState<SimulationResult | null>(null);

  // Récupération des taux de change en direct au montage
  useEffect(() => {
    handleRefreshLiveRates();
  }, []);

  const handleRefreshLiveRates = async () => {
    setIsRefreshingRates(true);
    try {
      const liveData = await fetchLiveFxRates();
      setConfig(prev => {
        const updated = {
          ...prev,
          fxRates: {
            ...prev.fxRates,
            CAD_to_MAD: liveData.CAD_to_MAD,
            CAD_to_XOF: liveData.CAD_to_XOF,
            lastUpdated: liveData.lastUpdated,
            isLive: liveData.isLive
          }
        };
        saveStoredConfig(updated);
        return updated;
      });
    } catch (e) {
      console.error('Erreur récupération taux:', e);
    } finally {
      setIsRefreshingRates(false);
    }
  };

  // Synchroniser la route par défaut lors du changement de pays
  const handleCountryChange = (country: DestinationCountry) => {
    setDestination(country);
    setCustoms(prev => ({ ...prev, country }));
    const defRoute = config.routes.find(r => r.destinationCountry === country && r.recommended) || config.routes.find(r => r.destinationCountry === country);
    if (defRoute) {
      setTransport(prev => ({ ...prev, routeId: defRoute.id }));
    }
  };

  const handleStepNext = (nextStep: number) => {
    setCurrentStep(nextStep);
    if (nextStep > maxReachedStep) {
      setMaxReachedStep(nextStep);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Lancement du calcul
  const handleCalculate = () => {
    const res = calculateSimulation(
      vehicle,
      destination,
      financing,
      transport,
      customs,
      targetMargin,
      config
    );
    setCurrentResult(res);
    setCurrentTab('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Ajustement interactif de la marge depuis les résultats
  const handleTargetMarginChange = (margin: number) => {
    setTargetMargin(margin);
    if (currentResult) {
      const updated = calculateSimulation(
        currentResult.vehicle,
        currentResult.destination,
        currentResult.financing,
        currentResult.transport,
        currentResult.customs,
        margin,
        config
      );
      setCurrentResult(updated);
    }
  };

  // Démo en 1 clic
  const handleLoadDemo = () => {
    setVehicle(DEMO_VEHICLE);
    setDestination('senegal');
    const demoFinancing: FinancingConfig = {
      method: 'plateforme_transfert',
      fixedFeeCad: 15,
      variableFeePercent: 0.7,
      fxSpreadPercent: 1.2
    };
    setFinancing(demoFinancing);
    const demoTransport: TransportSelection = {
      routeId: 'mtl-dkr-roro',
      batchVehiclesCount: 1
    };
    setTransport(demoTransport);
    const demoCustoms: CustomsSelection = {
      country: 'senegal'
    };
    setCustoms(demoCustoms);
    setTargetMargin(18);

    const res = calculateSimulation(
      DEMO_VEHICLE,
      'senegal',
      demoFinancing,
      demoTransport,
      demoCustoms,
      18,
      config
    );
    setCurrentResult(res);
    setMaxReachedStep(4);
    setCurrentTab('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Réinitialiser pour une nouvelle simulation
  const handleNewSimulation = () => {
    setVehicle(INITIAL_VEHICLE);
    setCurrentStep(1);
    setMaxReachedStep(1);
    setCurrentResult(null);
    setCurrentTab('wizard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Charger une simulation depuis l'historique
  const handleSelectFromHistory = (sim: SimulationResult) => {
    setVehicle(sim.vehicle);
    setDestination(sim.destination);
    setFinancing(sim.financing);
    setTransport(sim.transport);
    setCustoms(sim.customs);
    setTargetMargin(sim.targetMarginPercent);
    setCurrentResult(sim);
    setCurrentTab('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={`min-h-[100dvh] bg-[hsl(var(--paper))] flex flex-col font-sans transition-[padding] duration-300 ${isNavigationCollapsed ? 'md:pl-[76px]' : 'md:pl-[272px]'}`}>

      {/* Barre de navigation globale */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onLoadDemo={handleLoadDemo}
        hasCurrentResult={currentResult !== null}
        config={config}
        onRefreshLiveRates={handleRefreshLiveRates}
        isRefreshingRates={isRefreshingRates}
        onOpenSourcesModal={() => setIsSourcesModalOpen(true)}
        onCollapsedChange={setIsNavigationCollapsed}
      />

      {/* Contenu principal */}
      <main className="app-enter flex-1 py-6 px-4 pt-20 sm:px-6 lg:px-10 md:pt-10">

        {/* VUE 1 : Formulaire Wizard linéaire */}
        {currentTab === 'wizard' && (
          <div className="space-y-6">
            <WizardStepper
              currentStep={currentStep}
              onSelectStep={setCurrentStep}
              maxReachedStep={maxReachedStep}
            />

            {currentStep === 1 && (
              <StepVehicle
                vehicle={vehicle}
                onChange={(upd) => setVehicle({ ...vehicle, ...upd })}
                onNext={() => handleStepNext(2)}
              />
            )}

            {currentStep === 2 && (
              <StepDestination
                vehicle={vehicle}
                country={destination}
                customs={customs}
                config={config}
                onCountryChange={handleCountryChange}
                onCustomsChange={(upd) => setCustoms({ ...customs, ...upd })}
                onNext={() => handleStepNext(3)}
                onPrev={() => setCurrentStep(1)}
              />
            )}

            {currentStep === 3 && (
              <StepFinancing
                financing={financing}
                purchasePriceCad={vehicle.purchasePriceCad}
                country={destination}
                config={config}
                onChange={(upd) => setFinancing({ ...financing, ...upd })}
                onNext={() => handleStepNext(4)}
                onPrev={() => setCurrentStep(2)}
              />
            )}

            {currentStep === 4 && (
              <StepTransport
                transport={transport}
                vehicle={vehicle}
                country={destination}
                purchasePriceCad={vehicle.purchasePriceCad}
                config={config}
                onChange={(upd) => setTransport({ ...transport, ...upd })}
                onCalculate={handleCalculate}
                onPrev={() => setCurrentStep(3)}
              />
            )}
          </div>
        )}

        {/* VUE 2 : Tableau de bord de résultats */}
        {currentTab === 'results' && currentResult && (
          <ResultsDashboard
            simulation={currentResult}
            onEdit={() => setCurrentTab('wizard')}
            onGoToOptimizer={() => setCurrentTab('cargo')}
            onTargetMarginChange={handleTargetMarginChange}
            onOpenSourcesModal={() => setIsSourcesModalOpen(true)}
          />
        )}

        {/* VUE 3 : Cargaison Conteneur (Multi-véhicules) */}
        {currentTab === 'cargo' && (
          <CargoContainerBuilder config={config} defaultCountry={destination} />
        )}

        {/* VUE 4 : Optimiseur RoRo vs Conteneur */}
        {currentTab === 'optimizer' && (
          <ContainerOptimizer config={config} defaultCountry={destination} />
        )}

        {/* VUE 5 : Historique & Comparateur */}
        {currentTab === 'history' && (
          <SimulationHistory
            onSelectSimulation={handleSelectFromHistory}
            onNewSimulation={handleNewSimulation}
          />
        )}

        {/* VUE 6 : Tables de référence & Éditeur de configuration */}
        {currentTab === 'config' && (
          <ConfigEditor
            config={config}
            onUpdateConfig={(newConf) => setConfig(newConf)}
          />
        )}

      </main>

      {/* Pied de page sobre */}
      <footer className="bg-[hsl(var(--surface))] border-t border-[hsl(var(--line))] py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AutoTransat QC · Solution d'aide à la décision pour l'export automobile Québec → Maroc & Sénégal</span>
          <span className="text-slate-400">Règles douanières : Décret Sénégal du 24 oct. 2025 & Régime MRE Maroc</span>
        </div>
      </footer>

      {/* Modal des sources officielles et références réglementaires */}
      <OfficialSourcesModal
        isOpen={isSourcesModalOpen}
        onClose={() => setIsSourcesModalOpen(false)}
        sources={config.officialSources}
      />

    </div>
  );
}

export default App;
