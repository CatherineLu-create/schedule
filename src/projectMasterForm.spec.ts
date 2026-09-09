import { describe, expect, it } from "vitest";
import { devProject003 } from "./fixtures/v2/canonicalProjectFixtures";
import { toCatalogItemId, toProjectId } from "./domain/shared/ids";
import {
  emptyProjectMasterForm,
  overwriteProjectMasterFromForm,
  toCreateProjectMasterInput,
  toProjectMasterForm,
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
};

describe("Project Master form mappings", () => {
  it("builds a complete Create Master from exactly the 13 visible form fields", () => {
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
    expect(Object.values(input.leverage).every((value) => value === null)).toBe(true);
    expect(Object.values(input.cover).every((value) => value === null)).toBe(true);
    expect(input.modelRegulatory).toEqual({
      acerModelName: "Runtime Acer Model",
      acerMarketingName: "Runtime Marketing Name",
      ssid: "RUNTIME-SSID",
      rmn: "RUNTIME-RMN",
    });
    expect(Object.values(input.mechanical.product).every((value) => value === null)).toBe(true);
    expect(Object.values(input.mechanical.package).every((value) => value === null)).toBe(true);
    expect(input.other.remark).toBeNull();
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

  it("initializes Edit form from canonical values and preserves an unresolved catalog ID", () => {
    const unresolvedCustomerId = toCatalogItemId("unresolved-customer");
    const form = toProjectMasterForm({
      ...devProject003.master,
      basicInformation: {
        ...devProject003.master.basicInformation,
        customer: unresolvedCustomerId,
        year: null,
      },
    });

    expect(form.customerId).toBe(unresolvedCustomerId);
    expect(form.year).toBe("");
    expect(form.stnProjectName).toBe(devProject003.master.basicInformation.stnProjectName);
  });

  it("overwrites only visible Edit fields and preserves every hidden Master section", () => {
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

    const result = overwriteProjectMasterFromForm(richMaster, populatedForm);

    expect(result.basicInformation.category).toBe(richMaster.basicInformation.category);
    expect(result.platformHardware.pcbNumber).toBe("HIDDEN-PCB");
    expect(result.platformHardware.housingNumber).toBe("HIDDEN-HOUSING");
    expect(result.leverage).toEqual(richMaster.leverage);
    expect(result.cover).toEqual(richMaster.cover);
    expect(result.mechanical).toEqual(richMaster.mechanical);
    expect(result.other).toEqual(richMaster.other);
    expect(result.basicInformation.stnProjectName).toBe(populatedForm.stnProjectName);
    expect(result.modelRegulatory.rmn).toBe(populatedForm.rmn);
    expect(result).not.toHaveProperty("identityAliases");
    expect(result).not.toHaveProperty("schedule");
    expect(result).not.toHaveProperty("team");
  });
});
