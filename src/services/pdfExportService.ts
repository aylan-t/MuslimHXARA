import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { SimulationResult } from '../types';

const CAD = (value: number) => `${value.toLocaleString('fr-CA')} $ CA`;

function download(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function generateSimulationPdf(sim: SimulationResult): Promise<void> {
  const document = await PDFDocument.create();
  const page = document.addPage([595.28, 841.89]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.04, 0.16, 0.25);
  const teal = rgb(0.02, 0.52, 0.52);
  const amber = rgb(0.96, 0.65, 0.14);
  const ink = rgb(0.09, 0.13, 0.2);
  const muted = rgb(0.36, 0.42, 0.5);
  const pale = rgb(0.95, 0.97, 0.98);
  const margin = 44;

  const text = (value: string, x: number, y: number, size = 10, font = regular, color = ink) => {
    page.drawText(value.split('→').join('->'), { x, y, size, font, color });
  };
  const line = (label: string, value: string, y: number, strong = false) => {
    text(label, margin + 12, y, 9, strong ? bold : regular, strong ? ink : muted);
    text(value, 355, y, 9, strong ? bold : regular, ink);
  };

  page.drawRectangle({ x: 0, y: 755, width: 595.28, height: 87, color: navy });
  text('QCAR EXPORT', margin, 804, 19, bold, rgb(1, 1, 1));
  text('Étude de rentabilité export automobile', margin, 783, 10, regular, rgb(0.78, 0.88, 0.91));
  text(new Date(sim.createdAt).toLocaleDateString('fr-CA'), 460, 804, 9, regular, rgb(1, 1, 1));

  text(`${sim.vehicle.brand} ${sim.vehicle.model} · ${sim.vehicle.year} · ${sim.vehicle.engineCc} cm³ · ${sim.vehicle.fuelType} · ${sim.vehicle.steering}`, margin, 720, 17, bold);
  text(`${sim.vehicle.mileageKm.toLocaleString('fr-CA')} km · destination ${sim.destination === 'senegal' ? 'Sénégal' : 'Maroc'}`, margin, 701, 10, regular, muted);

  const isDocumentedByUser = sim.calculationStatus === 'user_documented_quote';
  page.drawRectangle({ x: margin, y: 612, width: 507, height: 66, color: sim.calculationStatus === 'carrier_quote' ? rgb(0.9, 0.98, 0.95) : sim.calculationStatus === 'marketplace_rate' ? rgb(0.9, 0.95, 1) : rgb(1, 0.96, 0.84), borderColor: sim.calculationStatus === 'carrier_quote' ? teal : sim.calculationStatus === 'marketplace_rate' ? rgb(0.15, 0.45, 0.75) : amber, borderWidth: 1 });
  text(sim.calculationStatus === 'carrier_quote' ? 'FRET BASÉ SUR UN DEVIS TRANSPORTEUR VALIDÉ' : isDocumentedByUser ? 'FRET BASÉ SUR UN DOCUMENT FOURNI — NON VÉRIFIÉ' : sim.calculationStatus === 'marketplace_rate' ? 'FRET BASÉ SUR UNE ESTIMATION MARKETPLACE' : 'RÉSULTAT INDICATIF — DEVIS TRANSPORTEUR REQUIS', margin + 14, 654, 10, bold, sim.calculationStatus === 'carrier_quote' ? teal : sim.calculationStatus === 'marketplace_rate' ? rgb(0.1, 0.35, 0.65) : rgb(0.65, 0.38, 0.02));
  text(sim.calculationStatus === 'carrier_quote'
    ? `${sim.transport.marketOffer?.provider || 'Transporteur'} · ${CAD(sim.breakdown.oceanFreightCad)} · validité contrôlée`
    : isDocumentedByUser
      ? `${sim.transport.quote?.carrierName || 'Transporteur déclaré'} · ${CAD(sim.breakdown.oceanFreightCad)} · authenticité non vérifiée`
    : sim.calculationStatus === 'marketplace_rate'
      ? `${sim.transport.marketOffer?.provider || 'Marketplace'} · ${CAD(sim.breakdown.oceanFreightCad)} · confirmation requise`
    : 'Le fret maritime est une hypothèse de travail et doit être remplacé par un devis officiel.', margin + 14, 632, 9, regular, ink);

  text('SYNTHÈSE', margin, 575, 12, bold, navy);
  const cards = [
    ['Profit net estimé', CAD(sim.estimatedNetProfitCad)],
    ['Coût total rendu', CAD(sim.breakdown.landedCostCad)],
    ['Prix de revente suggéré', CAD(sim.suggestedSalePriceCad)],
  ];
  cards.forEach(([label, value], index) => {
    const x = margin + index * 171;
    page.drawRectangle({ x, y: 507, width: 158, height: 52, color: pale });
    text(label, x + 10, 540, 8, regular, muted);
    text(value, x + 10, 520, 13, bold, index === 0 ? teal : ink);
  });

  text('DÉCOMPOSITION DES COÛTS', margin, 470, 12, bold, navy);
  const rows: [string, string][] = [
    ['Prix d’achat du véhicule', CAD(sim.breakdown.vehiclePurchaseCad)],
    ['Change et transfert', CAD(sim.breakdown.fxSpreadCostCad + sim.breakdown.bankTransferCostCad)],
    ['Transport complet', CAD(sim.breakdown.totalTransportCad)],
    ['Encan et intermédiaires', CAD(sim.breakdown.auctionAndBrokerFeesCad)],
    ['Frais complémentaires', CAD(sim.breakdown.totalAdditionalFeesCad)],
    ['Douanes et taxes', CAD(sim.breakdown.customsAndTaxesCad)],
    ['TOTAL RENDU', CAD(sim.breakdown.landedCostCad)],
  ];
  rows.forEach(([label, value], index) => {
    const y = 444 - index * 30;
    if (index % 2 === 0) page.drawRectangle({ x: margin, y: y - 9, width: 507, height: 26, color: pale });
    line(label, value, y, index === rows.length - 1);
  });

  text('HYPOTHÈSES À VÉRIFIER', margin, 211, 12, bold, navy);
  sim.assumptions.slice(0, 3).forEach((assumption, index) => {
    const clipped = assumption.length > 92 ? `${assumption.slice(0, 89)}...` : assumption;
    text(`• ${clipped}`, margin + 4, 186 - index * 22, 8.5, regular, muted);
  });

  page.drawLine({ start: { x: margin, y: 90 }, end: { x: 551, y: 90 }, color: rgb(0.82, 0.86, 0.9), thickness: 1 });
  text('Outil d’aide à la décision. Confirmez les tarifs, taxes et conditions avant tout engagement.', margin, 70, 8, regular, muted);
  text(`Référence ${sim.id.slice(0, 18)}`, margin, 53, 7.5, regular, muted);

  const bytes = await document.save();
  download(bytes, `QCar_export_${sim.vehicle.brand}_${sim.vehicle.model}_${sim.destination}.pdf`);
}