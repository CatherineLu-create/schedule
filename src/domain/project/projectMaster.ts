import type { CatalogItemId, ProjectId } from "../shared/ids";

export interface ProjectMasterBasicInformation {
  readonly status: CatalogItemId | null;
  readonly year: number | null;
  readonly customer: CatalogItemId | null;
  readonly category: CatalogItemId | null;
  readonly productLine: CatalogItemId | null;
  readonly panelSize: CatalogItemId | null;
  readonly stnProjectName: string | null;
  readonly qciModelName: string | null;
}

export interface ProjectMasterPlatformHardware {
  readonly cpu: CatalogItemId | null;
  readonly gpu: CatalogItemId | null;
  readonly pcbNumber: string | null;
  readonly housingNumber: string | null;
}

export interface ProjectMasterLeverage {
  readonly pcbLeverage: ProjectId | null;
  readonly aLeverage: ProjectId | null;
  readonly bLeverage: ProjectId | null;
  readonly cLeverage: ProjectId | null;
  readonly dLeverage: ProjectId | null;
}

export interface ProjectMasterCover {
  readonly aCover: CatalogItemId | null;
  readonly bCover: CatalogItemId | null;
  readonly cCover: CatalogItemId | null;
  readonly dCover: CatalogItemId | null;
}

export interface ProjectMasterModelRegulatory {
  readonly acerModelName: string | null;
  readonly acerMarketingName: string | null;
  readonly ssid: string | null;
  readonly rmn: string | null;
}

export interface ProjectMasterMechanicalProduct {
  readonly productLengthMm: number | null;
  readonly productWidthMm: number | null;
  readonly productHeightMm: number | null;
  readonly productWeightG: number | null;
}

export interface ProjectMasterMechanicalPackage {
  readonly packageLengthMm: number | null;
  readonly packageWidthMm: number | null;
  readonly packageHeightMm: number | null;
  readonly grossWeightG: number | null;
}

export interface ProjectMasterMechanical {
  readonly product: ProjectMasterMechanicalProduct;
  readonly package: ProjectMasterMechanicalPackage;
}

export interface ProjectMasterOther {
  readonly remark: string | null;
}

export interface ProjectMaster {
  readonly basicInformation: ProjectMasterBasicInformation;
  readonly platformHardware: ProjectMasterPlatformHardware;
  readonly leverage: ProjectMasterLeverage;
  readonly cover: ProjectMasterCover;
  readonly modelRegulatory: ProjectMasterModelRegulatory;
  readonly mechanical: ProjectMasterMechanical;
  readonly other: ProjectMasterOther;
}
