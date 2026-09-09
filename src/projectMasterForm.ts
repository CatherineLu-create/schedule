import type { CreateProjectMasterInput } from "./application/commands/projectCommands";
import type { ProjectMaster } from "./domain/project/projectMaster";
import type { CatalogItemId } from "./domain/shared/ids";

export type CatalogSelection = CatalogItemId | "";

export interface ProjectMasterForm {
  readonly stnProjectName: string;
  readonly qciModelName: string;
  readonly acerModelName: string;
  readonly acerMarketingName: string;
  readonly year: string;
  readonly customerId: CatalogSelection;
  readonly productLineId: CatalogSelection;
  readonly panelSizeId: CatalogSelection;
  readonly cpuId: CatalogSelection;
  readonly gpuId: CatalogSelection;
  readonly ssid: string;
  readonly rmn: string;
  readonly statusId: CatalogSelection;
}

export const emptyProjectMasterForm: ProjectMasterForm = {
  stnProjectName: "",
  qciModelName: "",
  acerModelName: "",
  acerMarketingName: "",
  year: "",
  customerId: "",
  productLineId: "",
  panelSizeId: "",
  cpuId: "",
  gpuId: "",
  ssid: "",
  rmn: "",
  statusId: "",
};

const textOrNull = (value: string): string | null =>
  value.trim().length === 0 ? null : value;

const catalogOrNull = (value: CatalogSelection): CatalogItemId | null =>
  value === "" ? null : value;

function yearOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

const displayText = (value: string | null): string => value ?? "";
const displayCatalog = (value: CatalogItemId | null): CatalogSelection => value ?? "";

export function toProjectMasterForm(master: ProjectMaster): ProjectMasterForm {
  return {
    stnProjectName: displayText(master.basicInformation.stnProjectName),
    qciModelName: displayText(master.basicInformation.qciModelName),
    acerModelName: displayText(master.modelRegulatory.acerModelName),
    acerMarketingName: displayText(master.modelRegulatory.acerMarketingName),
    year: master.basicInformation.year?.toString() ?? "",
    customerId: displayCatalog(master.basicInformation.customer),
    productLineId: displayCatalog(master.basicInformation.productLine),
    panelSizeId: displayCatalog(master.basicInformation.panelSize),
    cpuId: displayCatalog(master.platformHardware.cpu),
    gpuId: displayCatalog(master.platformHardware.gpu),
    ssid: displayText(master.modelRegulatory.ssid),
    rmn: displayText(master.modelRegulatory.rmn),
    statusId: displayCatalog(master.basicInformation.status),
  };
}

export function toCreateProjectMasterInput(
  form: ProjectMasterForm,
): CreateProjectMasterInput {
  return {
    basicInformation: {
      year: yearOrNull(form.year),
      category: null,
      productLine: catalogOrNull(form.productLineId),
      panelSize: catalogOrNull(form.panelSizeId),
      stnProjectName: textOrNull(form.stnProjectName),
      qciModelName: textOrNull(form.qciModelName),
      ...(form.customerId === "" ? {} : { customer: form.customerId }),
      ...(form.statusId === "" ? {} : { status: form.statusId }),
    },
    platformHardware: {
      cpu: catalogOrNull(form.cpuId),
      gpu: catalogOrNull(form.gpuId),
      pcbNumber: null,
      housingNumber: null,
    },
    leverage: {
      pcbLeverage: null,
      aLeverage: null,
      bLeverage: null,
      cLeverage: null,
      dLeverage: null,
    },
    cover: {
      aCover: null,
      bCover: null,
      cCover: null,
      dCover: null,
    },
    modelRegulatory: {
      acerModelName: textOrNull(form.acerModelName),
      acerMarketingName: textOrNull(form.acerMarketingName),
      ssid: textOrNull(form.ssid),
      rmn: textOrNull(form.rmn),
    },
    mechanical: {
      product: {
        productLengthMm: null,
        productWidthMm: null,
        productHeightMm: null,
        productWeightG: null,
      },
      package: {
        packageLengthMm: null,
        packageWidthMm: null,
        packageHeightMm: null,
        grossWeightG: null,
      },
    },
    other: { remark: null },
  };
}

export function overwriteProjectMasterFromForm(
  currentMaster: ProjectMaster,
  form: ProjectMasterForm,
): ProjectMaster {
  return {
    ...currentMaster,
    basicInformation: {
      ...currentMaster.basicInformation,
      status: catalogOrNull(form.statusId),
      year: yearOrNull(form.year),
      customer: catalogOrNull(form.customerId),
      productLine: catalogOrNull(form.productLineId),
      panelSize: catalogOrNull(form.panelSizeId),
      stnProjectName: textOrNull(form.stnProjectName),
      qciModelName: textOrNull(form.qciModelName),
    },
    platformHardware: {
      ...currentMaster.platformHardware,
      cpu: catalogOrNull(form.cpuId),
      gpu: catalogOrNull(form.gpuId),
    },
    modelRegulatory: {
      acerModelName: textOrNull(form.acerModelName),
      acerMarketingName: textOrNull(form.acerMarketingName),
      ssid: textOrNull(form.ssid),
      rmn: textOrNull(form.rmn),
    },
  };
}
