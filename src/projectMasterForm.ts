import type { CreateProjectMasterInput } from "./application/commands/projectCommands";
import type { ProjectMaster } from "./domain/project/projectMaster";
import type { CatalogItemId, ProjectId } from "./domain/shared/ids";

export type CatalogSelection = CatalogItemId | "";
export type ProjectSelection = ProjectId | "";

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
  readonly productLengthMm: string;
  readonly productWidthMm: string;
  readonly productHeightMm: string;
  readonly productWeightG: string;
  readonly packageLengthMm: string;
  readonly packageWidthMm: string;
  readonly packageHeightMm: string;
  readonly grossWeightG: string;
  readonly aCoverId: CatalogSelection;
  readonly bCoverId: CatalogSelection;
  readonly cCoverId: CatalogSelection;
  readonly dCoverId: CatalogSelection;
  readonly pcbLeverageId: ProjectSelection;
  readonly aLeverageId: ProjectSelection;
  readonly bLeverageId: ProjectSelection;
  readonly cLeverageId: ProjectSelection;
  readonly dLeverageId: ProjectSelection;
}

export type ProjectMasterFormErrors = Partial<
  Record<keyof ProjectMasterForm, string>
>;

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
  productLengthMm: "",
  productWidthMm: "",
  productHeightMm: "",
  productWeightG: "",
  packageLengthMm: "",
  packageWidthMm: "",
  packageHeightMm: "",
  grossWeightG: "",
  aCoverId: "",
  bCoverId: "",
  cCoverId: "",
  dCoverId: "",
  pcbLeverageId: "",
  aLeverageId: "",
  bLeverageId: "",
  cLeverageId: "",
  dLeverageId: "",
};

const textOrNull = (value: string): string | null =>
  value.trim().length === 0 ? null : value;

const catalogOrNull = (value: CatalogSelection): CatalogItemId | null =>
  value === "" ? null : value;

const projectOrNull = (value: ProjectSelection): ProjectId | null =>
  value === "" ? null : value;

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function yearOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

const displayText = (value: string | null): string => value ?? "";
const displayCatalog = (value: CatalogItemId | null): CatalogSelection => value ?? "";
const displayProject = (value: ProjectId | null): ProjectSelection => value ?? "";
const displayNumber = (value: number | null): string => value?.toString() ?? "";

const mechanicalFormKeys = [
  "productLengthMm",
  "productWidthMm",
  "productHeightMm",
  "productWeightG",
  "packageLengthMm",
  "packageWidthMm",
  "packageHeightMm",
  "grossWeightG",
] as const satisfies readonly (keyof ProjectMasterForm)[];

export function validateProjectMasterMechanicalForm(
  form: ProjectMasterForm,
): ProjectMasterFormErrors {
  const errors: ProjectMasterFormErrors = {};
  for (const key of mechanicalFormKeys) {
    const value = form[key].trim();
    if (value === "") continue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      errors[key] = "Enter a valid number.";
    } else if (parsed < 0) {
      errors[key] = "Must be 0 or greater.";
    }
  }
  return errors;
}

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
    productLengthMm: displayNumber(master.mechanical.product.productLengthMm),
    productWidthMm: displayNumber(master.mechanical.product.productWidthMm),
    productHeightMm: displayNumber(master.mechanical.product.productHeightMm),
    productWeightG: displayNumber(master.mechanical.product.productWeightG),
    packageLengthMm: displayNumber(master.mechanical.package.packageLengthMm),
    packageWidthMm: displayNumber(master.mechanical.package.packageWidthMm),
    packageHeightMm: displayNumber(master.mechanical.package.packageHeightMm),
    grossWeightG: displayNumber(master.mechanical.package.grossWeightG),
    aCoverId: displayCatalog(master.cover.aCover),
    bCoverId: displayCatalog(master.cover.bCover),
    cCoverId: displayCatalog(master.cover.cCover),
    dCoverId: displayCatalog(master.cover.dCover),
    pcbLeverageId: displayProject(master.leverage.pcbLeverage),
    aLeverageId: displayProject(master.leverage.aLeverage),
    bLeverageId: displayProject(master.leverage.bLeverage),
    cLeverageId: displayProject(master.leverage.cLeverage),
    dLeverageId: displayProject(master.leverage.dLeverage),
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
      pcbLeverage: projectOrNull(form.pcbLeverageId),
      aLeverage: projectOrNull(form.aLeverageId),
      bLeverage: projectOrNull(form.bLeverageId),
      cLeverage: projectOrNull(form.cLeverageId),
      dLeverage: projectOrNull(form.dLeverageId),
    },
    cover: {
      aCover: catalogOrNull(form.aCoverId),
      bCover: catalogOrNull(form.bCoverId),
      cCover: catalogOrNull(form.cCoverId),
      dCover: catalogOrNull(form.dCoverId),
    },
    modelRegulatory: {
      acerModelName: textOrNull(form.acerModelName),
      acerMarketingName: textOrNull(form.acerMarketingName),
      ssid: textOrNull(form.ssid),
      rmn: textOrNull(form.rmn),
    },
    mechanical: {
      product: {
        productLengthMm: numberOrNull(form.productLengthMm),
        productWidthMm: numberOrNull(form.productWidthMm),
        productHeightMm: numberOrNull(form.productHeightMm),
        productWeightG: numberOrNull(form.productWeightG),
      },
      package: {
        packageLengthMm: numberOrNull(form.packageLengthMm),
        packageWidthMm: numberOrNull(form.packageWidthMm),
        packageHeightMm: numberOrNull(form.packageHeightMm),
        grossWeightG: numberOrNull(form.grossWeightG),
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
    leverage: {
      pcbLeverage: projectOrNull(form.pcbLeverageId),
      aLeverage: projectOrNull(form.aLeverageId),
      bLeverage: projectOrNull(form.bLeverageId),
      cLeverage: projectOrNull(form.cLeverageId),
      dLeverage: projectOrNull(form.dLeverageId),
    },
    cover: {
      aCover: catalogOrNull(form.aCoverId),
      bCover: catalogOrNull(form.bCoverId),
      cCover: catalogOrNull(form.cCoverId),
      dCover: catalogOrNull(form.dCoverId),
    },
    modelRegulatory: {
      acerModelName: textOrNull(form.acerModelName),
      acerMarketingName: textOrNull(form.acerMarketingName),
      ssid: textOrNull(form.ssid),
      rmn: textOrNull(form.rmn),
    },
    mechanical: {
      product: {
        productLengthMm: numberOrNull(form.productLengthMm),
        productWidthMm: numberOrNull(form.productWidthMm),
        productHeightMm: numberOrNull(form.productHeightMm),
        productWeightG: numberOrNull(form.productWeightG),
      },
      package: {
        packageLengthMm: numberOrNull(form.packageLengthMm),
        packageWidthMm: numberOrNull(form.packageWidthMm),
        packageHeightMm: numberOrNull(form.packageHeightMm),
        grossWeightG: numberOrNull(form.grossWeightG),
      },
    },
  };
}
