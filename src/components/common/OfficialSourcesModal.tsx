import React from 'react';
import { OfficialSource } from '../../types';
import { X, ExternalLink, ShieldCheck, FileText, AlertTriangle } from 'lucide-react';

interface OfficialSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  sources: OfficialSource[];
}

export const OfficialSourcesModal: React.FC<OfficialSourcesModalProps> = ({
  isOpen,
  onClose,
  sources
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">

        {/* En-tête */}
        <div className="bg-brand-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-400/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                 Sources et niveau de confiance
              </h2>
              <p className="text-xs text-slate-300">
                 Vérifiez les références qui encadrent chaque hypothèse du calcul
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps avec la liste des sources officielles */}
        <div className="p-6 overflow-y-auto space-y-4 divide-y divide-slate-100">
          <div className="text-xs text-slate-600 bg-sky-50 border border-sky-200 p-3.5 rounded-xl leading-relaxed">
            <strong>Ce que cette liste garantit :</strong> les liens ci-dessous permettent de vérifier les règles et publications de référence. Un lien vers un port ne constitue pas un devis de fret. Les montants sans devis transporteur sont toujours présentés comme indicatifs.
          </div>

          <div className="pt-2 space-y-3">
            {(sources || []).map((src) => (
              <div
                key={src.id}
                className="p-4 rounded-xl border border-slate-200 hover:border-brand-500 hover:bg-brand-50/20 transition-all flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                      {src.institution}
                    </span>
                    <span className="font-bold text-sm text-slate-900">{src.title}</span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {src.description}
                  </p>

                  {src.legalReference && (
                    <div className="text-[11px] text-slate-500 font-medium flex items-center space-x-1.5 pt-1">
                      <FileText className="w-3.5 h-3.5 text-brand-600" />
                      <span>Réf : {src.legalReference}</span>
                    </div>
                  )}
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200 text-xs font-bold transition-colors"
                  >
                    <span>Vérifier la source</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <span className="text-[10px] text-slate-400">
                    Vérifié : {src.lastVerified}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pied */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-amber-600" /> Vérifiez les dates et obtenez un devis avant tout engagement.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};

