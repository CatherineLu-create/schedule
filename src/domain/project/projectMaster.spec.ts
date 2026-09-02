import { describe, expect, expectTypeOf, it } from "vitest";

import {
  toCatalogItemId,
  toProjectId,
  type CatalogItemId,
  type ProjectId,
} from "../shared/ids";
import * as projectMasterModule from "./projectMaster";
import type {
  ProjectMaster,
  ProjectMasterBasicInformation,
  ProjectMasterCover,
  ProjectMasterLeverage,
  ProjectMasterMechanical,
  ProjectMasterMechanicalPackage,
  ProjectMasterMechanicalProduct,
  ProjectMasterModelRegulatory,
  ProjectMasterOther,
  ProjectMasterPlatformHardware,
} from "./projectMaster";

const completeProjectMaster: ProjectMaster = {
  basicInformation: {
    status: toCatalogItemId("status-on-going"),
    year: 2027,
    customer: toCatalogItemId("customer-fixture"),
    category: toCatalogItemId("category-fixture"),
    productLine: toCatalogItemId("product-line-fixture"),
    panelSize: toCatalogItemId("panel-size-fixture"),
    stnProjectName: "Fixture Project Alpha",
    qciModelName: "Fixture Model Alpha",
  },
  platformHardware: {
    cpu: toCatalogItemId("cpu-fixture"),
    gpu: toCatalogItemId("gpu-fixture"),
    pcbNumber: "PCB-FIXTURE-01",
    housingNumber: "HOUSING-FIXTURE-01",
  },
  leverage: {
    pcbLeverage: toProjectId("dev-project-pcb-source"),
    aLeverage: toProjectId("dev-project-a-source"),
    bLeverage: toProjectId("dev-project-b-source"),
    cLeverage: toProjectId("dev-project-c-source"),
    dLeverage: toProjectId("dev-project-d-source"),
  },
  cover: {
    aCover: toCatalogItemId("cover-a-fixture"),
    bCover: toCatalogItemId("cover-b-fixture"),
    cCover: toCatalogItemId("cover-c-fixture"),
    dCover: toCatalogItemId("cover-d-fixture"),
  },
  modelRegulatory: {
    acerModelName: "Acer Fixture Model",
    acerMarketingName: "Acer Fixture Marketing Name",
    ssid: "SSID-FIXTURE",
    rmn: "RMN-FIXTURE",
  },
  mechanical: {
    product: {
      productLengthMm: 320.5,
      productWidthMm: 220.25,
      productHeightMm: 18.75,
      productWeightG: 1500,
    },
    package: {
      packageLengthMm: 450,
      packageWidthMm: 330,
      packageHeightMm: 90,
      grossWeightG: 2800,
    },
  },
  other: {
    remark: "Development fixture only",
  },
};

const incompleteProjectMaster: ProjectMaster = {
  basicInformation: {
    status: null,
    year: null,
    customer: null,
    category: null,
    productLine: null,
    panelSize: null,
    stnProjectName: null,
    qciModelName: null,
  },
  platformHardware: {
    cpu: null,
    gpu: null,
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
    acerModelName: null,
    acerMarketingName: null,
    ssid: null,
    rmn: null,
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
  other: {
    remark: null,
  },
};

describe("ProjectMaster", () => {
  it("represents the complete V2 field set in logical groups", () => {
    expect(projectMasterModule).toBeDefined();
    expect(Object.keys(completeProjectMaster)).toEqual([
      "basicInformation",
      "platformHardware",
      "leverage",
      "cover",
      "modelRegulatory",
      "mechanical",
      "other",
    ]);
    expect(completeProjectMaster.basicInformation.stnProjectName).toBe(
      "Fixture Project Alpha",
    );
    expect(completeProjectMaster.mechanical.product.productLengthMm).toBe(
      320.5,
    );
    expect(completeProjectMaster.mechanical.package.grossWeightG).toBe(2800);
    expectTypeOf<keyof ProjectMaster>().toEqualTypeOf<
      | "basicInformation"
      | "platformHardware"
      | "leverage"
      | "cover"
      | "modelRegulatory"
      | "mechanical"
      | "other"
    >();
    expectTypeOf<keyof ProjectMasterMechanical>().toEqualTypeOf<
      "product" | "package"
    >();
  });

  it("uses stable catalog IDs, project IDs, and nullable numeric values", () => {
    type CatalogBackedField =
      | ProjectMasterBasicInformation["status"]
      | ProjectMasterBasicInformation["customer"]
      | ProjectMasterBasicInformation["category"]
      | ProjectMasterBasicInformation["productLine"]
      | ProjectMasterBasicInformation["panelSize"]
      | ProjectMasterPlatformHardware["cpu"]
      | ProjectMasterPlatformHardware["gpu"]
      | ProjectMasterCover[keyof ProjectMasterCover];
    type LeverageField =
      ProjectMasterLeverage[keyof ProjectMasterLeverage];
    type MechanicalNumericField =
      | ProjectMasterMechanicalProduct[keyof ProjectMasterMechanicalProduct]
      | ProjectMasterMechanicalPackage[keyof ProjectMasterMechanicalPackage];

    expectTypeOf<CatalogBackedField>().toEqualTypeOf<
      CatalogItemId | null
    >();
    expectTypeOf<LeverageField>().toEqualTypeOf<ProjectId | null>();
    expectTypeOf<MechanicalNumericField>().toEqualTypeOf<number | null>();
  });

  it("keeps mutable display names separate from immutable IDs", () => {
    expectTypeOf<
      ProjectMasterBasicInformation["stnProjectName"]
    >().toEqualTypeOf<string | null>();
    expectTypeOf<
      ProjectMasterBasicInformation["qciModelName"]
    >().toEqualTypeOf<string | null>();
    expectTypeOf<ProjectMasterLeverage["aLeverage"]>().toEqualTypeOf<
      ProjectId | null
    >();
  });

  it("represents an early incomplete Project Master without validation", () => {
    expect(incompleteProjectMaster.basicInformation.productLine).toBeNull();
    expect(incompleteProjectMaster.basicInformation.qciModelName).toBeNull();
    expect(incompleteProjectMaster.platformHardware.cpu).toBeNull();
    expect(
      incompleteProjectMaster.mechanical.product.productLengthMm,
    ).toBeNull();
    expect(incompleteProjectMaster.leverage.pcbLeverage).toBeNull();
  });

  it("excludes team, schedule, warning, and Dashboard-only fields", () => {
    type ProjectMasterFieldKey =
      | keyof ProjectMaster
      | keyof ProjectMasterBasicInformation
      | keyof ProjectMasterPlatformHardware
      | keyof ProjectMasterLeverage
      | keyof ProjectMasterCover
      | keyof ProjectMasterModelRegulatory
      | keyof ProjectMasterMechanical
      | keyof ProjectMasterMechanicalProduct
      | keyof ProjectMasterMechanicalPackage
      | keyof ProjectMasterOther;
    type ExcludedKey = Extract<
      ProjectMasterFieldKey,
      | "qciPm"
      | "qciPjm"
      | "qciPjM"
      | "acerPm"
      | "mdrr"
      | "scheduleStage"
      | "scheduleStatus"
      | "scheduleVersion"
      | "teamMembers"
      | "warnings"
      | "dashboardStatus"
      | "aliases"
      | "identityAliases"
    >;

    expectTypeOf<ExcludedKey>().toEqualTypeOf<never>();
    expect(JSON.stringify(completeProjectMaster)).not.toContain('"mdrr"');
    expect(JSON.stringify(completeProjectMaster)).not.toContain('"qciPm"');
    expect(JSON.stringify(completeProjectMaster)).not.toContain('"acerPm"');
  });
});
