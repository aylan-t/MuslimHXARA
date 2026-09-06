import React from 'react';
import { DestinationCountry, Vehicle } from '../../types';
import { getPlatformsForCountry } from '../../services/platformLinksService';
import { ExternalLink, ShoppingBag, AlertCircle } from 'lucide-react';

interface LocalMarketLinksProps {
  vehicle: Vehicle;
  destination: DestinationCountry;
}

export const LocalMarketLinks: React.FC<LocalMarketLinksProps> = ({ vehicle, destination }) => {
  const platforms = getPlatformsForCountry(destination);
  const countryName = destination === 'senegal' ? 'au Sénégal' : 'au Maroc';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">

      {/* En-tête de la section 5.12 */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-brand-50 text-brand-700 rounded-xl">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Comparer avec les annonces réelles en vente {countryName}
            </h3>
            <p className="text-xs text-slate-500">
              Vérifiez « à l'œil » les prix demandés en ce moment pour des {vehicle.brand} {vehicle.model} similaires
            </p>
          </div>
        </div>

        <span className="hidden sm:inline-flex items-center text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
          Recherches pré-filtrées
        </span>
      </div>

      {/* Les 2 Cartes cliquables vers les plateformes locales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {platforms.map((platform) => {
          const searchUrl = platform.buildSearchUrl(vehicle.brand, vehicle.model, vehicle.year);

          return (
            <a
              key={platform.id}
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group p-4 rounded-xl border-2 border-slate-200 hover:border-brand-500 hover:bg-brand-50/30 transition-all shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${platform.badgeColor}`}>
                    {platform.logoText}
                  </span>
                  <span className="flex items-center space-x-1 text-xs font-bold text-brand-600 group-hover:translate-x-0.5 transition-transform">
                    <span>Ouvrir l'annonce</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </span>
                </div>

                <div className="font-bold text-sm text-slate-900 group-hover:text-brand-700 transition-colors">
                  Voir des {vehicle.brand} {vehicle.model} en vente sur {platform.name}
                </div>

                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {platform.description}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Année approx : {vehicle.year - 1} à {vehicle.year + 1}</span>
                <span className="text-brand-600 font-semibold group-hover:underline">Recherche directe ↗</span>
              </div>
            </a>
          );
        })}
      </div>

      {/* Mention légale obligatoire (Section 5.12 imposée) */}
      <div className="flex items-start space-x-2 p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <strong>Note informative :</strong> Ces liens ouvrent une recherche sur des sites externes, non affiliés à l'application. Les prix affichés sur ces sites sont ceux du marché local, à titre indicatif — ils ne sont pas vérifiés par l'application.
        </div>
      </div>

    </div>
  );
};

