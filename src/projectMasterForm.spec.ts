import { describe, expect, it } from "vitest";
import { devProject003 } from "./fixtures/v2/canonicalProjectFixtures";
import { toCatalogItemId, toProjectId } from "./domain/shared/ids";
import {
  emptyProjectMasterForm,
  overwriteProjectMasterFromForm,
  toCreateProjectMasterInput,
  toProjectMasterForm,
  validateProjectMasterMechanicalForm,
  type ProjectMasterForm,
} from "./projectMasterForm";

const populatedForm: ProjectMasterForm = {
  stnProjectName: "Runtime Project",
  qciModelName: "RUNTIME-QCI",
  acerModelName: "Runtime Acer Model",
  acerMarketingName: "Runtime Marketing Name",
  year: "2030",
  customerId: toCatalogItemId("dev-customer-b"),
  productLineId: toCatalogItemId("dev-product-line-beta"),
  panelSizeId: toCatalogItemId("dev-panel-size-18"),
  cpuId: toCatalogItemId("dev-cpu-beta"),
  gpuId: toCatalogItemId("dev-gpu-beta"),
  ssid: "RUNTIME-SSID",
  rmn: "RUNTIME-RMN",
  statusId: toCatalogItemId("status-mp"),
  productLengthMm: "320.5",
  productWidthMm: "220",
  productHeightMm: "17.25",
  productWeightG: "0",
  packageLengthMm: "480.5",
  packageWidthMm: "310",
  packageHeightMm: "65.75",
  grossWeightG: "2500.5",
  aCoverId: toCatalogItemId("cover-plastic-paint"),
  bCoverId: toCatalogItemId("cover-plastic-texture"),
  cCoverId: toCatalogItemId("cover-al-plate"),
  dCoverId: toCatalogItemId("unresolved-cover"),
  pcbLeverageId: toProjectId("runtime-project"),
  aLeverageId: toProjectId("source-a"),
  bLeverageId: toProjectId("source-b"),
  cLeverageId: toProjectId("unresolved-project"),
  dLeverageId: "",
};

describe("Project Master form mappings", () => {
  it("builds a complete Create Master from the shared form backing values", () => {
    const input = toCreateProjectMasterInput(populatedForm);

    expect(input.basicInformation).toEqual({
      year: 2030,
      customer: populatedForm.customerId,
      category: null,
      productLine: populatedForm.productLineId,
      panelSize: populatedForm.panelSizeId,
      status: populatedForm.statusId,
      stnProjectName: "Runtime Project",
      qciModelName: "RUNTIME-QCI",
    });
    expect(input.platformHardware).toEqual({
      cpu: populatedForm.cpuId,
      gpu: populatedForm.gpuId,
      pcbNumber: null,
      housingNumber: null,
    });
    expect(input.leverage).toEqual({
      pcbLeverage: populatedForm.pcbLeverageId,
      aLeverage: populatedForm.aLeverageId,
      bLeverage: populatedForm.bLeverageId,
      cLeverage: populatedForm.cLeverageId,
      dLeverage: null,
    });
    expect(input.cover).toEqual({
      aCover: populatedForm.aCoverId,
      bCover: populatedForm.bCoverId,
      cCover: populatedForm.cCoverId,
      dCover: populatedForm.dCoverId,
    });
    expect(input.modelRegulatory).toEqual({
      acerModelName: "Runtime Acer Model",
      acerMarketingName: "Runtime Marketing Name",
      ssid: "RUNTIME-SSID",
      rmn: "RUNTIME-RMN",
    });
    expect(input.mechanical).toEqual({
      product: {
        productLengthMm: 320.5,
        productWidthMm: 220,
        productHeightMm: 17.25,
        productWeightG: 0,
      },
      package: {
        packageLengthMm: 480.5,
        packageWidthMm: 310,
        packageHeightMm: 65.75,
        grossWeightG: 2500.5,
      },
    });
    expect(input.other.remark).toBeNull();
  });

  it("keeps Create expansion backing values blank and canonical values null by default", () => {
    expect(emptyProjectMasterForm).toMatchObject({
      productLengthMm: "",
      grossWeightG: "",
      aCoverId: "",
      dCoverId: "",
      pcbLeverageId: "",
      dLeverageId: "",
    });

    const input = toCreateProjectMasterInput(emptyProjectMasterForm);
    expect(Object.values(input.leverage).every((value) => value === null)).toBe(true);
    expect(Object.values(input.cover).every((value) => value === null)).toBe(true);
    expect(Object.values(input.mechanical.product).every((value) => value === null)).toBe(true);
    expect(Object.values(input.mechanical.package).every((value) => value === null)).toBe(true);
  });

  it("omits blank Customer and Status so command-owned defaults remain authoritative", () => {
    const input = toCreateProjectMasterInput({
      ...populatedForm,
      customerId: "",
      statusId: "",
    });

    expect(input.basicInformation).not.toHaveProperty("customer");
    expect(input.basicInformation).not.toHaveProperty("status");
  });

  it("initializes Edit from canonical decimal and unresolved ID values without rounding", () => {
    const unresolvedCustomerId = toCatalogItemId("unresolved-customer");
    const unresolvedCoverId = toCatalogItemId("unresolved-cover");
    const unresolvedProjectId = toProjectId("unresolved-project");
    const form = toProjectMasterForm({
      ...devProject003.master,
      basicInformation: {
        ...devProject003.master.basicInformation,
        customer: unresolvedCustomerId,
        year: null,
      },
      cover: { ...devProject003.master.cover, dCover: unresolvedCoverId },
      leverage: {
        ...devProject003.master.leverage,
        cLeverage: unresolvedProjectId,
      },
      mechanical: {
        product: {
          productLengthMm: 320.5,
          productWidthMm: null,
          productHeightMm: 17.25,
          productWeightG: 0,
        },
        package: {
          packageLengthMm: 480.5,
          packageWidthMm: 310,
          packageHeightMm: 65.75,
          grossWeightG: 2500.5,
        },
      },
    });

    expect(form.customerId).toBe(unresolvedCustomerId);
    expect(form.year).toBe("");
    expect(form.stnProjectName).toBe(devProject003.master.basicInformation.stnProjectName);
    expect(form.productLengthMm).toBe("320.5");
    expect(form.productWidthMm).toBe("");
    expect(form.productWeightG).toBe("0");
    expect(form.dCoverId).toBe(unresolvedCoverId);
    expect(form.cLeverageId).toBe(unresolvedProjectId);
  });

  it("overwrites approved Edit leaves while preserving unrelated Master authority", () => {
    const richMaster = {
      ...devProject003.master,
      basicInformation: {
        ...devProject003.master.basicInformation,
        category: toCatalogItemId("dev-category-notebook"),
      },
      platformHardware: {
        ...devProject003.master.platformHardware,
        pcbNumber: "HIDDEN-PCB",
        housingNumber: "HIDDEN-HOUSING",
      },
      leverage: {
        pcbLeverage: toProjectId("hidden-pcb-leverage"),
        aLeverage: toProjectId("hidden-a-leverage"),
        bLeverage: toProjectId("hidden-b-leverage"),
        cLeverage: toProjectId("hidden-c-leverage"),
        dLeverage: toProjectId("hidden-d-leverage"),
      },
      cover: {
        aCover: toCatalogItemId("cover-plastic-paint"),
        bCover: toCatalogItemId("cover-plastic-texture"),
        cCover: toCatalogItemId("cover-al-plate"),
        dCover: toCatalogItemId("cover-mg-al"),
      },
      mechanical: {
        product: {
          productLengthMm: 1,
          productWidthMm: 2,
          productHeightMm: 3,
          productWeightG: 4,
        },
        package: {
          packageLengthMm: 5,
          packageWidthMm: 6,
          packageHeightMm: 7,
          grossWeightG: 8,
        },
      },
      other: { remark: "Hidden remark" },
    };

    const richForm = toProjectMasterForm(richMaster);
    const result = overwriteProjectMasterFromForm(richMaster, {
      ...richForm,
      productLengthMm: "",
      productWeightG: "0",
      grossWeightG: "2500.75",
      aCoverId: toCatalogItemId("replacement-cover"),
      cLeverageId: toProjectId("replacement-source"),
    });

    expect(result.basicInformation.category).toBe(richMaster.basicInformation.category);
    expect(result.platformHardware.pcbNumber).toBe("HIDDEN-PCB");
    expect(result.platformHardware.housingNumber).toBe("HIDDEN-HOUSING");
    expect(result.leverage).toEqual({
      ...richMaster.leverage,
      cLeverage: toProjectId("replacement-source"),
    });
    expect(result.cover).toEqual({
      ...richMaster.cover,
      aCover: toCatalogItemId("replacement-cover"),
    });
    expect(result.mechanical).toEqual({
      product: {
        ...richMaster.mechanical.product,
        productLengthMm: null,
        productWeightG: 0,
      },
      package: {
        ...richMaster.mechanical.package,
        grossWeightG: 2500.75,
      },
    });
    expect(result.other).toEqual(richMaster.other);
    expect(result.basicInformation.stnProjectName).toBe(richMaster.basicInformation.stnProjectName);
    expect(result.modelRegulatory.rmn).toBe(richMaster.modelRegulatory.rmn);
    expect(result).not.toHaveProperty("identityAliases");
    expect(result).not.toHaveProperty("schedule");
    expect(result).not.toHaveProperty("team");
  });
});

describe("Mechanical form validation", () => {
  it.each(["", "0", "12", "320.5"])("accepts blank and finite non-negative value %s", (value) => {
    expect(
      validateProjectMasterMechanicalForm({
        ...populatedForm,
        productLengthMm: value,
      }),
    ).toEqual({});
  });

  it("rejects negative values without coercing them", () => {
    expect(
      validateProjectMasterMechanicalForm({
        ...populatedForm,
        productLengthMm: "-0.1",
      }),
    ).toMatchObject({ productLengthMm: "Must be 0 or greater." });
  });

  it.each(["not-a-number", "Infinity", "1e309"])("rejects non-finite input %s", (value) => {
    expect(
      validateProjectMasterMechanicalForm({
        ...populatedForm,
        grossWeightG: value,
      }),
    ).toMatchObject({ grossWeightG: "Enter a valid number." });
  });
});
