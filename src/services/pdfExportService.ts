import { jsPDF } from 'jspdf';
import { SimulationResult } from '../types';

export function generateSimulationPdf(sim: SimulationResult): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const primaryColor = [15, 43, 72]; // #0f2b48
  const accentColor = sim.destination === 'senegal' ? [22, 163, 74] : [234, 88, 12];
  const darkText = [30, 41, 59];
  const mutedText = [100, 116, 139];

  // En-tête / Bannière
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('AutoTransat QC', 15, 14);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Étude de rentabilité pour l\'export de véhicule d\'occasion (Québec -> Afrique)', 15, 22);

  const dateStr = new Date(sim.createdAt).toLocaleDateString('fr-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  doc.text(`Émis le : ${dateStr}`, 155, 14);
  doc.text(`Réf : ${sim.id.substring(0, 12)}`, 155, 22);

  // Synthèse
  let y = 42;
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Synthèse du Véhicule & Destination', 15, y);

  y += 8;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(15, y, 180, 26, 2, 2, 'FD');

  doc.setFontSize(10);
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(`Véhicule : ${sim.vehicle.brand} ${sim.vehicle.model} (${sim.vehicle.year})`, 20, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Kilométrage : ${sim.vehicle.mileageKm.toLocaleString('fr-CA')} km`, 20, y + 15);
  doc.text(`Prix d'achat initial : ${sim.vehicle.purchasePriceCad.toLocaleString('fr-CA')} $ CAD`, 20, y + 21);

  const destCountry = sim.destination === 'senegal' ? 'Sénégal (Port de Dakar)' : 'Maroc (Casablanca / Tanger)';
  const destDevise = sim.destination === 'senegal' ? 'Franc CFA (XOF)' : 'Dirham marocain (MAD)';
  doc.setFont('helvetica', 'bold');
  doc.text(`Destination : ${destCountry}`, 110, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Devise locale : ${destDevise}`, 110, y + 15);
  doc.text(`Statut : ${sim.isEligible ? 'Véhicule éligible' : 'Avertissement éligibilité'}`, 110, y + 21);

  // Résultat Financier Clé (Bannière mise en valeur)
  y += 34;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('2. Rentabilité Financière Estimée', 15, y);

  y += 6;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.setLineWidth(0.8);
  doc.roundedRect(15, y, 180, 30, 2, 2, 'FD');

  doc.setFontSize(11);
  doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  doc.text('Profit net estimé :', 22, y + 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.text(`${sim.estimatedNetProfitCad >= 0 ? '+' : ''}${sim.estimatedNetProfitCad.toLocaleString('fr-CA')} $ CAD`, 22, y + 18);
  doc.setFontSize(9);
  doc.text(`(${sim.estimatedNetProfitLocal.toLocaleString('fr-CA')} ${sim.breakdown.localCurrencyCode})`, 22, y + 24);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  doc.text('Coût total rendu (Landed Cost) :', 80, y + 10);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.text(`${sim.breakdown.landedCostCad.toLocaleString('fr-CA')} $ CAD`, 80, y + 18);
  doc.setFontSize(9);
  doc.text(`(${sim.breakdown.landedCostLocal.toLocaleString('fr-CA')} ${sim.breakdown.localCurrencyCode})`, 80, y + 24);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  doc.text('Prix de revente suggéré :', 138, y + 10);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.text(`${sim.suggestedSalePriceCad.toLocaleString('fr-CA')} $ CAD`, 138, y + 18);
  doc.setFontSize(9);
  doc.text(`(Marge cible : ${sim.targetMarginPercent}%)`, 138, y + 24);

  // Décomposition détaillée des coûts
  y += 38;
  doc.setFontSize(14);
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('3. Décomposition Complète des Coûts (Landed Cost)', 15, y);

  y += 6;
  const tableData = [
    ['Poste de coût', 'Montant CAD', '% du total', 'Détail'],
    ['1. Prix d\'achat véhicule', `${sim.breakdown.vehiclePurchaseCad.toLocaleString('fr-CA')} $`, `${Math.round((sim.breakdown.vehiclePurchaseCad / sim.breakdown.landedCostCad) * 100)}%`, 'Prix d\'acquisition initial au Québec'],
    ['2. Écart de change (Spread FX)', `${sim.breakdown.fxSpreadCostCad.toLocaleString('fr-CA')} $`, `${Math.round((sim.breakdown.fxSpreadCostCad / sim.breakdown.landedCostCad) * 100)}%`, `Spread bancaire appliqué (${sim.financing.fxSpreadPercent}%)`],
    ['3. Frais de transfert d\'argent', `${sim.breakdown.bankTransferCostCad.toLocaleString('fr-CA')} $`, `${Math.round((sim.breakdown.bankTransferCostCad / sim.breakdown.landedCostCad) * 100)}%`, 'Frais fixes + commission de virement'],
    ['4. Transport complet de A à Z', `${sim.breakdown.totalTransportCad.toLocaleString('fr-CA')} $`, `${Math.round((sim.breakdown.totalTransportCad / sim.breakdown.landedCostCad) * 100)}%`, `Fret maritime, ports départ/arrivée, convoyage & assurance`],
    ['5. Encan & Intermédiaires', `${sim.breakdown.auctionAndBrokerFeesCad.toLocaleString('fr-CA')} $`, `${Math.round((sim.breakdown.auctionAndBrokerFeesCad / sim.breakdown.landedCostCad) * 100)}%`, 'Frais de vente aux enchères ou courtage'],
    ['6. Douane & Taxes à destination', `${sim.breakdown.customsAndTaxesCad.toLocaleString('fr-CA')} $`, `${Math.round((sim.breakdown.customsAndTaxesCad / sim.breakdown.landedCostCad) * 100)}%`, `Droits de dédouanement (Base taxable : ${sim.breakdown.customsTaxableValueCad.toLocaleString('fr-CA')} $)`],
    ['TOTAL COÛT RENDU (LANDED COST)', `${sim.breakdown.landedCostCad.toLocaleString('fr-CA')} $`, '100%', 'Coût d\'entrée complet rendu sur place']
  ];

  doc.setFontSize(9);
  doc.setLineWidth(0.2);

  tableData.forEach((row, idx) => {
    const isHeader = idx === 0;
    const isTotal = idx === tableData.length - 1;
    const rowHeight = 7.5;

    if (isHeader) {
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.rect(15, y, 180, rowHeight, 'F');
    } else if (isTotal) {
      doc.setFillColor(241, 245, 249);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.setFont('helvetica', 'bold');
      doc.rect(15, y, 180, rowHeight, 'F');
      doc.line(15, y, 195, y);
    } else {
      doc.setFillColor(idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 250 : 255);
      doc.setTextColor(darkText[0], darkText[1], darkText[2]);
      doc.setFont('helvetica', 'normal');
      doc.rect(15, y, 180, rowHeight, 'F');
      doc.line(15, y, 195, y);
    }

    doc.text(row[0], 18, y + 5);
    doc.text(row[1], 88, y + 5);
    doc.text(row[2], 120, y + 5);
    doc.text(row[3], 138, y + 5);

    y += rowHeight;
  });

  // Comparaison Marché
  y += 6;
  if (sim.marketComparison) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkText[0], darkText[1], darkText[2]);
    doc.text(`Positionnement Marché : ${sim.marketComparison.verdictLabel}`, 15, y);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
    doc.text(
      `Prix moyen observé sur place (${sim.marketComparison.source}) : ${sim.marketComparison.averageMarketPriceLocal.toLocaleString('fr-CA')} ${sim.breakdown.localCurrencyCode} (env. ${sim.marketComparison.averageMarketPriceCad.toLocaleString('fr-CA')} $ CAD). Écart : ${sim.marketComparison.priceDifferencePercent > 0 ? '+' : ''}${sim.marketComparison.priceDifferencePercent}%`,
      15,
      y + 5
    );
    y += 10;
  }

  // Mentions Légales & Avis
  y += 4;
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(245, 158, 11);
  doc.roundedRect(15, y, 180, 16, 1.5, 1.5, 'FD');

  doc.setTextColor(146, 64, 14);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('AVERTISSEMENT ET CONDITIONS LÉGALES :', 18, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Ce document constitue une estimation prévisionnelle d\'aide à la décision. Les taxes douanières, taux de fret et taux de change réels',
    18,
    y + 9
  );
  doc.text(
    'doivent être formellement validés auprès des autorités douanières et des transitaires agréés avant tout engagement d\'achat.',
    18,
    y + 13
  );

  // Pied de page
  doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
  doc.setFontSize(8);
  doc.text('AutoTransat QC — Outil d\'aide à la décision export automobile', 15, 290);
  doc.text('Page 1 / 1', 185, 290);

  // Sauvegarde / Téléchargement
  const filename = `AutoTransat_${sim.vehicle.brand}_${sim.vehicle.model}_${sim.destination}.pdf`;
  doc.save(filename);
}

