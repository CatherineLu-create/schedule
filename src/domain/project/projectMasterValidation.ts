import type { ValidationIssue } from "../validation/validationIssue";
import type {
	ProjectMaster,
	ProjectMasterBasicInformation,
	ProjectMasterCover,
	ProjectMasterLeverage,
	ProjectMasterMechanicalPackage,
	ProjectMasterMechanicalProduct,
	ProjectMasterModelRegulatory,
	ProjectMasterOther,
	ProjectMasterPlatformHardware,
} from "./projectMaster";

type ProjectMasterCompletenessFieldDescriptor<
	TSection extends string,
	TRecord extends object,
> = {
	readonly section: TSection;
	readonly field: keyof TRecord;
	readonly label: string;
};

export type ProjectMasterCompletenessField =
	| ProjectMasterCompletenessFieldDescriptor<
			"basicInformation",
			ProjectMasterBasicInformation
	  >
	| ProjectMasterCompletenessFieldDescriptor<
			"platformHardware",
			ProjectMasterPlatformHardware
	  >
	| ProjectMasterCompletenessFieldDescriptor<
			"leverage",
			ProjectMasterLeverage
	  >
	| ProjectMasterCompletenessFieldDescriptor<"cover", ProjectMasterCover>
	| ProjectMasterCompletenessFieldDescriptor<
			"modelRegulatory",
			ProjectMasterModelRegulatory
	  >
	| ProjectMasterCompletenessFieldDescriptor<
			"mechanical.product",
			ProjectMasterMechanicalProduct
	  >
	| ProjectMasterCompletenessFieldDescriptor<
			"mechanical.package",
			ProjectMasterMechanicalPackage
	  >
	| ProjectMasterCompletenessFieldDescriptor<"other", ProjectMasterOther>;

type ProjectMasterLeafValue = string | number | null;

function readConfiguredField(
	master: ProjectMaster,
	descriptor: ProjectMasterCompletenessField,
): ProjectMasterLeafValue {
	switch (descriptor.section) {
		case "basicInformation":
			return master.basicInformation[descriptor.field];
		case "platformHardware":
			return master.platformHardware[descriptor.field];
		case "leverage":
			return master.leverage[descriptor.field];
		case "cover":
			return master.cover[descriptor.field];
		case "modelRegulatory":
			return master.modelRegulatory[descriptor.field];
		case "mechanical.product":
			return master.mechanical.product[descriptor.field];
		case "mechanical.package":
			return master.mechanical.package[descriptor.field];
		case "other":
			return master.other[descriptor.field];
	}
}

function isMissing(value: ProjectMasterLeafValue): boolean {
	return value === null || (typeof value === "string" && value.trim() === "");
}

export function validateProjectMasterCompleteness(
	master: ProjectMaster,
	fields: readonly ProjectMasterCompletenessField[],
): readonly ValidationIssue[] {
	return fields.flatMap((descriptor) => {
		if (!isMissing(readConfiguredField(master, descriptor))) {
			return [];
		}

		return [
			{
				code: "projectMaster.data.missing-field",
				domain: "projectMaster" as const,
				source: "data" as const,
				severity: "advisory" as const,
				message: `${descriptor.label} is incomplete.`,
				target: {
					section: `projectMaster.${descriptor.section}`,
					field: descriptor.field,
				},
			},
		];
	});
}
