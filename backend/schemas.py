from typing import Optional, List, Literal
from pydantic import BaseModel, Field

DestinationCountry = Literal['senegal', 'maroc']
VehicleCategory = Literal['citadine', 'berline', 'suv', 'camionnette']
VehicleCondition = Literal['excellent', 'tres_bon', 'bon', 'moyen']
VehicleSource = Literal['particulier', 'concessionnaire', 'encan']
FinancingMethod = Literal['virement_bancaire',
                          'plateforme_transfert', 'interac_autre']
TransportMode = Literal['roro', 'conteneur_partage', 'conteneur_complet']


class VehicleInput(BaseModel):
    brand: str
    model: str
    year: int
    mileageKm: int = 100000
    purchasePriceCad: float
    category: VehicleCategory = 'suv'
    condition: VehicleCondition = 'bon'
    source: VehicleSource = 'particulier'
    auctionFeesCad: float = 0.0
    brokerCommissionCad: float = 0.0


class FinancingConfigInput(BaseModel):
    method: FinancingMethod = 'virement_bancaire'
    fixedFeeCad: float = 45.0
    variableFeePercent: float = 0.5
    fxSpreadPercent: float = 2.5


class TransportSelectionInput(BaseModel):
    routeId: str = 'mtl-dkr-roro'
    batchVehiclesCount: int = 1
    customInlandOriginCad: Optional[float] = None
    customOceanFreightCad: Optional[float] = None
    customInlandDestinationCad: Optional[float] = None


class MoroccoCustomsOptions(BaseModel):
    isMRE: bool = False
    mreAgeOver60: bool = False
    residenceOver10Years: bool = False
    isFirstCarInLife: bool = False


class CustomsSelectionInput(BaseModel):
    country: DestinationCountry = 'senegal'
    moroccoOptions: Optional[MoroccoCustomsOptions] = None
    customTaxRatePercent: Optional[float] = None


class CalculationRequest(BaseModel):
    vehicle: VehicleInput
    destination: DestinationCountry
    financing: FinancingConfigInput
    transport: TransportSelectionInput
    customs: CustomsSelectionInput
    targetMarginPercent: float = 18.0


class CostBreakdownResponse(BaseModel):
    vehiclePurchaseCad: float
    fxSpreadCostCad: float
    bankTransferCostCad: float
    inlandOriginCad: float
    originPortFeesCad: float
    oceanFreightCad: float
    marineInsuranceCad: float
    destinationPortFeesCad: float
    inlandDestinationCad: float
    totalTransportCad: float
    auctionAndBrokerFeesCad: float
    customsTaxableValueCad: float
    customsAndTaxesCad: float
    landedCostCad: float
    landedCostLocal: float
    localCurrencyCode: str
    effectiveFxRate: float
    baseFxRate: float


class CalculationResponse(BaseModel):
    id: str
    createdAt: str
    isEligible: bool
    eligibilityMessage: str
    eligibilitySeverity: str
    breakdown: CostBreakdownResponse
    targetMarginPercent: float
    suggestedSalePriceCad: float
    suggestedSalePriceLocal: float
    estimatedNetProfitCad: float
    estimatedNetProfitLocal: float
    estimatedRoiPercent: float
