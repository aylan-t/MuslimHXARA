import React from 'react';
import { Car, Globe, DollarSign, Truck, Check } from 'lucide-react';

interface WizardStepperProps {
  currentStep: number;
  onSelectStep: (step: number) => void;
  maxReachedStep: number;
}

export const WizardStepper: React.FC<WizardStepperProps> = ({
  currentStep,
  onSelectStep,
  maxReachedStep
}) => {
  const steps = [
    { num: 1, title: 'Véhicule', subtitle: 'Modèle & prix', icon: Car },
    { num: 2, title: 'Destination', subtitle: 'Maroc / Sénégal', icon: Globe },
    { num: 3, title: 'Financement', subtitle: 'Change & virement', icon: DollarSign },
    { num: 4, title: 'Transport', subtitle: 'Route maritime', icon: Truck },
  ];

  return (
    <div className="w-full bg-white border-b border-slate-200 pt-5 pb-4 px-4 sm:px-6 shadow-sm mb-6">
      <div className="max-w-3xl mx-auto">

        {/* Grille des 4 étapes */}
        <div className="relative">

          {/* Ligne de progression connectant uniquement les centres des cercles en bas */}
          <div className="absolute left-[12.5%] right-[12.5%] bottom-5 h-1 bg-slate-200 z-0">
            <div
              className="h-full bg-brand-600 transition-all duration-300 rounded-full"
              style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
            />
          </div>

          <div className="grid grid-cols-4 relative z-10">
            {steps.map((step) => {
              const Icon = step.icon;
              const isDone = step.num < currentStep;
              const isActive = step.num === currentStep;
              const isClickable = step.num <= maxReachedStep;

              return (
                <button
                  key={step.num}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onSelectStep(step.num)}
                  className={`flex flex-col items-center text-center transition-all group ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                    }`}
                >
                  {/* TEXTE EN HAUT (Section demandée) */}
                  <div className="mb-3 h-11 flex flex-col justify-end">
                    <span
                      className={`text-xs sm:text-sm font-black tracking-tight leading-tight ${isActive ? 'text-brand-900 font-extrabold' : isDone ? 'text-slate-800' : 'text-slate-400'
                        }`}
                    >
                      Étape {step.num}
                    </span>
                    <span
                      className={`text-[11px] sm:text-xs font-semibold leading-tight mt-0.5 ${isActive ? 'text-brand-700' : isDone ? 'text-slate-600' : 'text-slate-400'
                        }`}
                    >
                      {step.title}
                    </span>
                  </div>

                  {/* CERCLES EN BAS (Section demandée) */}
                  <div
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-sm ${isActive
                        ? 'bg-brand-600 text-white ring-4 ring-brand-100 scale-110 shadow-md'
                        : isDone
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-slate-400 border-2 border-slate-300'
                      }`}
                  >
                    {isDone ? <Check className="w-5 h-5 text-white" /> : <Icon className="w-4 h-4 sm:w-5 sm:h-5" />}
                  </div>

                </button>
              );
            })}
          </div>

        </div>

      </div>
    </div>
  );
};
