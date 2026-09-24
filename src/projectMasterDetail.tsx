import React from "react";
import type { DashboardProjectRow } from "./application/selectors/dashboardProjectRows";
import type {
  ProjectLeverageDisplay,
  ProjectReferenceOption,
} from "./application/selectors/projectReferenceOptions";
import {
  coverCatalog,
  statusCatalog,
} from "./config/v2/referenceData";
import type { Project } from "./domain/project/project";
import type { CatalogItemId } from "./domain/shared/ids";
import type { ValidationIssue } from "./domain/validation/validationIssue";
import {
  cpuReferenceFixtures,
  customerReferenceFixtures,
  gpuReferenceFixtures,
  panelSizeReferenceFixtures,
  productLineReferenceFixtures,
} from "./fixtures/v2/referenceFixtures";
import {
  ProjectCatalogSelect,
  ProjectFieldInput,
  ProjectReferencePicker,
} from "./projectMasterControls";
import type {
  CatalogSelection,
  ProjectMasterForm,
  ProjectMasterFormErrors,
  ProjectSelection,
} from "./projectMasterForm";

type SectionKey = "basic" | "mechanical" | "coverLeverage";

const sectionLabels: Readonly<Record<SectionKey, string>> = {
  basic: "Basic Information",
  mechanical: "Mechanical",
  coverLeverage: "Cover / Leverage",
};

const defaultExpanded: Readonly<Record<SectionKey, boolean>> = {
  basic: true,
  mechanical: true,
  coverLeverage: true,
};

const mechanicalKeys: readonly (keyof ProjectMasterForm)[] = [
  "productLengthMm",
  "productWidthMm",
  "productHeightMm",
  "productWeightG",
  "packageLengthMm",
  "packageWidthMm",
  "packageHeightMm",
  "grossWeightG",
];

interface CommonProps {
  readonly leverageDisplay: ProjectLeverageDisplay;
  readonly project: Project;
  readonly projectReferenceOptions: readonly ProjectReferenceOption[];
  readonly row: DashboardProjectRow;
}

interface ReadProps extends CommonProps {
  readonly feedback: readonly ValidationIssue[];
  readonly mode: "read";
  readonly onBack: () => void;
  readonly onBeginEdit: () => void;
}

interface EditProps extends CommonProps {
  readonly fieldErrors: ProjectMasterFormErrors;
  readonly form: ProjectMasterForm;
  readonly issues: readonly ValidationIssue[];
  readonly mode: "edit";
  readonly onCancel: () => void;
  readonly onChange: (form: ProjectMasterForm) => void;
  readonly onSave: () => void;
}

export type ProjectMasterDetailProps = ReadProps | EditProps;

function CollapsibleSection({
  children,
  expanded,
  id,
  onToggle,
}: {
  readonly children: React.ReactNode;
  readonly expanded: boolean;
  readonly id: SectionKey;
  readonly onToggle: () => void;
}): React.ReactElement {
  const label = sectionLabels[id];
  const contentId = `project-master-${id}-content`;
  const headingId = `project-master-${id}-heading`;
  return (
    <section className="min-w-0 rounded-md border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="text-lg font-semibold" id={headingId}>{label}</h2>
        <button
          aria-controls={contentId}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 text-lg font-semibold"
          onClick={onToggle}
          type="button"
        >
          {expanded ? "−" : "+"}
        </button>
      </div>
      <div
        aria-labelledby={headingId}
        aria-label={`${label} content`}
        className="min-w-0 border-t border-slate-200 p-4"
        hidden={!expanded}
        id={contentId}
        role="region"
      >
        {children}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { readonly status: string }): React.ReactElement {
  const colorClass = ({
    RFQ: "border-violet-200 bg-violet-50 text-violet-700",
    "Kick off": "border-cyan-200 bg-cyan-50 text-cyan-700",
    Pending: "border-slate-300 bg-slate-100 text-slate-700",
    "On Going": "border-blue-200 bg-blue-50 text-blue-700",
    MP: "border-emerald-200 bg-emerald-50 text-emerald-700",
    EOL: "border-zinc-300 bg-zinc-100 text-zinc-700",
  } satisfies Record<string, string>)[status] ?? "border-slate-300 bg-white text-slate-700";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {status}
    </span>
  );
}

function BasicInformationRead({ row }: { readonly row: DashboardProjectRow }): React.ReactElement {
  return (
    <div className="grid gap-5 text-sm md:grid-cols-2 xl:grid-cols-3">
      <div>
        <h3 className="font-semibold">Project Identity</h3>
        <div className="mt-2 grid gap-1">
          <div>Project Name: {row.projectName}</div>
          <div>QCI Model Name: {row.qciModelName}</div>
          <div>Acer Model Name: {row.acerModelName}</div>
          <div>Acer Marketing Name: {row.acerMarketingName}</div>
        </div>
      </div>
      <div>
        <h3 className="font-semibold">Project Classification</h3>
        <div className="mt-2 grid gap-1">
          <div>Year: {row.year}</div>
          <div>Customer: {row.customer}</div>
          <div>Product Line: {row.productLine}</div>
        </div>
      </div>
      <div>
        <h3 className="font-semibold">Hardware</h3>
        <div className="mt-2 grid gap-1">
          <div>Panel Size: {row.panelSize}</div>
          <div>CPU: {row.cpu}</div>
          <div>GPU: {row.gpu}</div>
        </div>
      </div>
      <div>
        <h3 className="font-semibold">Internal Identifier</h3>
        <div className="mt-2 grid gap-1">
          <div>SSID: {row.ssid}</div>
          <div>RMN: {row.rmn}</div>
        </div>
      </div>
      <div>
        <h3 className="font-semibold">Project Management</h3>
        <div className="mt-2"><StatusBadge status={row.projectStatus} /></div>
      </div>
    </div>
  );
}

function updateFormValue<TKey extends keyof ProjectMasterForm>(
  form: ProjectMasterForm,
  key: TKey,
  value: ProjectMasterForm[TKey],
): ProjectMasterForm {
  return { ...form, [key]: value };
}

function BasicInformationEdit({
  fieldErrors,
  form,
  onChange,
}: {
  readonly fieldErrors: ProjectMasterFormErrors;
  readonly form: ProjectMasterForm;
  readonly onChange: (form: ProjectMasterForm) => void;
}): React.ReactElement {
  const update = <TKey extends keyof ProjectMasterForm>(
    key: TKey,
    value: ProjectMasterForm[TKey],
  ) => onChange(updateFormValue(form, key, value));
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <fieldset className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Project Identity</legend>
        <ProjectFieldInput error={fieldErrors.stnProjectName} label="STN Project Name" value={form.stnProjectName} onChange={(value) => update("stnProjectName", value)} />
        <ProjectFieldInput label="QCI Model Name" value={form.qciModelName} onChange={(value) => update("qciModelName", value)} />
        <ProjectFieldInput label="Acer Model Name" value={form.acerModelName} onChange={(value) => update("acerModelName", value)} />
        <ProjectFieldInput label="Acer Marketing Name" value={form.acerMarketingName} onChange={(value) => update("acerMarketingName", value)} />
      </fieldset>
      <fieldset className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Project Classification</legend>
        <ProjectFieldInput error={fieldErrors.year} label="Year" value={form.year} onChange={(value) => update("year", value)} />
        <ProjectCatalogSelect emptyLabel="Select Customer" label="Customer" options={customerReferenceFixtures} value={form.customerId} onChange={(value) => update("customerId", value)} />
        <ProjectCatalogSelect error={fieldErrors.productLineId} emptyLabel="Select Product Line" label="Product Line" options={productLineReferenceFixtures} value={form.productLineId} onChange={(value) => update("productLineId", value)} />
      </fieldset>
      <fieldset className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Hardware</legend>
        <ProjectCatalogSelect emptyLabel="Select Panel Size" label="Panel Size" options={panelSizeReferenceFixtures} value={form.panelSizeId} onChange={(value) => update("panelSizeId", value)} />
        <ProjectCatalogSelect emptyLabel="Select CPU" label="CPU" options={cpuReferenceFixtures} value={form.cpuId} onChange={(value) => update("cpuId", value)} />
        <ProjectCatalogSelect emptyLabel="Select GPU" label="GPU" options={gpuReferenceFixtures} value={form.gpuId} onChange={(value) => update("gpuId", value)} />
      </fieldset>
      <fieldset className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Internal Identifier</legend>
        <ProjectFieldInput label="SSID" value={form.ssid} onChange={(value) => update("ssid", value)} />
        <ProjectFieldInput label="RMN" value={form.rmn} onChange={(value) => update("rmn", value)} />
      </fieldset>
      <fieldset className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-4 xl:col-span-2">
        <legend className="px-1 text-sm font-semibold">Project Management</legend>
        <ProjectCatalogSelect emptyLabel="Select Project Status" label="Project Status" options={statusCatalog} value={form.statusId} onChange={(value) => update("statusId", value)} />
      </fieldset>
    </div>
  );
}

function measurement(value: number | null, unit: "mm" | "g"): string {
  return value === null ? "—" : `${value} ${unit}`;
}

function MechanicalRead({ project }: { readonly project: Project }): React.ReactElement {
  const { product, package: packageDimension } = project.master.mechanical;
  const groups = [
    {
      heading: "Product Dimension",
      values: [
        ["Length", measurement(product.productLengthMm, "mm")],
        ["Width", measurement(product.productWidthMm, "mm")],
        ["Height", measurement(product.productHeightMm, "mm")],
        ["Weight", measurement(product.productWeightG, "g")],
      ],
    },
    {
      heading: "Package Dimension",
      values: [
        ["Length", measurement(packageDimension.packageLengthMm, "mm")],
        ["Width", measurement(packageDimension.packageWidthMm, "mm")],
        ["Height", measurement(packageDimension.packageHeightMm, "mm")],
        ["Gross Weight", measurement(packageDimension.grossWeightG, "g")],
      ],
    },
  ] as const;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map(({ heading, values }) => (
        <div className="min-w-0 rounded-md border border-slate-200 p-3" key={heading}>
          <h3 className="font-semibold">{heading}</h3>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {values.map(([label, value]) => (
              <div className="min-w-0" key={label}>
                <div className="text-xs text-slate-500">{label}</div>
                <div className="mt-1 break-words font-medium">{value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MechanicalEdit({
  fieldErrors,
  form,
  onChange,
}: {
  readonly fieldErrors: ProjectMasterFormErrors;
  readonly form: ProjectMasterForm;
  readonly onChange: (form: ProjectMasterForm) => void;
}): React.ReactElement {
  const update = <TKey extends keyof ProjectMasterForm>(key: TKey, value: ProjectMasterForm[TKey]) =>
    onChange(updateFormValue(form, key, value));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <fieldset className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Product Dimension</legend>
        <ProjectFieldInput error={fieldErrors.productLengthMm} inputMode="decimal" label="Product Length (mm)" value={form.productLengthMm} onChange={(value) => update("productLengthMm", value)} />
        <ProjectFieldInput error={fieldErrors.productWidthMm} inputMode="decimal" label="Product Width (mm)" value={form.productWidthMm} onChange={(value) => update("productWidthMm", value)} />
        <ProjectFieldInput error={fieldErrors.productHeightMm} inputMode="decimal" label="Product Height (mm)" value={form.productHeightMm} onChange={(value) => update("productHeightMm", value)} />
        <ProjectFieldInput error={fieldErrors.productWeightG} inputMode="decimal" label="Product Weight (g)" value={form.productWeightG} onChange={(value) => update("productWeightG", value)} />
      </fieldset>
      <fieldset className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Package Dimension</legend>
        <ProjectFieldInput error={fieldErrors.packageLengthMm} inputMode="decimal" label="Package Length (mm)" value={form.packageLengthMm} onChange={(value) => update("packageLengthMm", value)} />
        <ProjectFieldInput error={fieldErrors.packageWidthMm} inputMode="decimal" label="Package Width (mm)" value={form.packageWidthMm} onChange={(value) => update("packageWidthMm", value)} />
        <ProjectFieldInput error={fieldErrors.packageHeightMm} inputMode="decimal" label="Package Height (mm)" value={form.packageHeightMm} onChange={(value) => update("packageHeightMm", value)} />
        <ProjectFieldInput error={fieldErrors.grossWeightG} inputMode="decimal" label="Gross Weight (g)" value={form.grossWeightG} onChange={(value) => update("grossWeightG", value)} />
      </fieldset>
    </div>
  );
}

function coverDisplay(id: CatalogItemId | null): string {
  if (id === null) return "—";
  return coverCatalog.find((item) => item.id === id)?.displayName ?? "—";
}

function CoverLeverageRead({
  leverageDisplay,
  project,
}: {
  readonly leverageDisplay: ProjectLeverageDisplay;
  readonly project: Project;
}): React.ReactElement {
  const rows = [
    ["PCB", "—", leverageDisplay.pcbLeverage],
    ["A Cover", coverDisplay(project.master.cover.aCover), leverageDisplay.aLeverage],
    ["B Cover", coverDisplay(project.master.cover.bCover), leverageDisplay.bLeverage],
    ["C Cover", coverDisplay(project.master.cover.cCover), leverageDisplay.cLeverage],
    ["D Cover", coverDisplay(project.master.cover.dCover), leverageDisplay.dLeverage],
  ] as const;
  return (
    <div className="grid min-w-0 gap-2 text-sm">
      <div className="hidden grid-cols-[minmax(100px,0.5fr)_minmax(120px,0.8fr)_minmax(0,1.7fr)] gap-3 border-b border-slate-200 px-3 pb-2 font-medium text-slate-600 sm:grid">
        <div>Component</div><div>Material</div><div>Leverage Project</div>
      </div>
      {rows.map(([component, material, leverage]) => (
        <div className="grid min-w-0 gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[minmax(100px,0.5fr)_minmax(120px,0.8fr)_minmax(0,1.7fr)] sm:items-center sm:gap-3 sm:border-x-0 sm:border-t-0 sm:px-3" key={component}>
          <div className="font-medium">{component}</div>
          <div><span className="mr-2 text-xs text-slate-500 sm:hidden">Material</span>{material}</div>
          <div className="min-w-0 break-words"><span className="mr-2 text-xs text-slate-500 sm:hidden">Leverage</span>{leverage}</div>
        </div>
      ))}
    </div>
  );
}

function CoverLeverageEditRow({
  component,
  currentProjectId,
  leverageLabel,
  leverageValue,
  materialLabel,
  materialValue,
  onLeverageChange,
  onMaterialChange,
  options,
}: {
  readonly component: string;
  readonly currentProjectId: Project["id"];
  readonly leverageLabel: string;
  readonly leverageValue: ProjectSelection;
  readonly materialLabel?: string;
  readonly materialValue?: CatalogSelection;
  readonly onLeverageChange: (value: ProjectSelection) => void;
  readonly onMaterialChange?: (value: CatalogSelection) => void;
  readonly options: readonly ProjectReferenceOption[];
}): React.ReactElement {
  return (
    <div className="grid min-w-0 gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[minmax(100px,0.5fr)_minmax(120px,0.8fr)_minmax(0,1.7fr)] sm:items-start sm:gap-3 sm:border-x-0 sm:border-t-0 sm:px-3">
      <div className="pt-2 font-medium">{component}</div>
      <div className="min-w-0">
        <span className="mb-1 block text-xs text-slate-500 sm:hidden">Material</span>
        {materialLabel === undefined || materialValue === undefined || onMaterialChange === undefined
          ? <div className="py-2">—</div>
          : (
              <ProjectCatalogSelect
                compact
                emptyLabel="Not specified"
                label={materialLabel}
                onChange={onMaterialChange}
                options={coverCatalog}
                value={materialValue}
              />
            )}
      </div>
      <div className="min-w-0">
        <span className="mb-1 block text-xs text-slate-500 sm:hidden">Leverage Project</span>
        <ProjectReferencePicker
          currentProjectId={currentProjectId}
          label={leverageLabel}
          onChange={onLeverageChange}
          options={options}
          value={leverageValue}
        />
      </div>
    </div>
  );
}

function CoverLeverageEdit({
  form,
  onChange,
  options,
  project,
}: {
  readonly form: ProjectMasterForm;
  readonly onChange: (form: ProjectMasterForm) => void;
  readonly options: readonly ProjectReferenceOption[];
  readonly project: Project;
}): React.ReactElement {
  const update = <TKey extends keyof ProjectMasterForm>(key: TKey, value: ProjectMasterForm[TKey]) =>
    onChange(updateFormValue(form, key, value));
  return (
    <div className="grid min-w-0 gap-2 text-sm">
      <div className="hidden grid-cols-[minmax(100px,0.5fr)_minmax(120px,0.8fr)_minmax(0,1.7fr)] gap-3 border-b border-slate-200 px-3 pb-2 font-medium text-slate-600 sm:grid">
        <div>Component</div><div>Material</div><div>Leverage Project</div>
      </div>
      <CoverLeverageEditRow component="PCB" currentProjectId={project.id} leverageLabel="PCB Leverage Project" leverageValue={form.pcbLeverageId} onLeverageChange={(value) => update("pcbLeverageId", value)} options={options} />
      <CoverLeverageEditRow component="A Cover" currentProjectId={project.id} leverageLabel="A Cover Leverage Project" leverageValue={form.aLeverageId} materialLabel="A Cover Material" materialValue={form.aCoverId} onLeverageChange={(value) => update("aLeverageId", value)} onMaterialChange={(value) => update("aCoverId", value)} options={options} />
      <CoverLeverageEditRow component="B Cover" currentProjectId={project.id} leverageLabel="B Cover Leverage Project" leverageValue={form.bLeverageId} materialLabel="B Cover Material" materialValue={form.bCoverId} onLeverageChange={(value) => update("bLeverageId", value)} onMaterialChange={(value) => update("bCoverId", value)} options={options} />
      <CoverLeverageEditRow component="C Cover" currentProjectId={project.id} leverageLabel="C Cover Leverage Project" leverageValue={form.cLeverageId} materialLabel="C Cover Material" materialValue={form.cCoverId} onLeverageChange={(value) => update("cLeverageId", value)} onMaterialChange={(value) => update("cCoverId", value)} options={options} />
      <CoverLeverageEditRow component="D Cover" currentProjectId={project.id} leverageLabel="D Cover Leverage Project" leverageValue={form.dLeverageId} materialLabel="D Cover Material" materialValue={form.dCoverId} onLeverageChange={(value) => update("dLeverageId", value)} onMaterialChange={(value) => update("dCoverId", value)} options={options} />
    </div>
  );
}

export function ProjectMasterDetail(props: ProjectMasterDetailProps): React.ReactElement {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const hasMechanicalErrors = props.mode === "edit" && mechanicalKeys.some(
    (key) => props.fieldErrors[key] !== undefined,
  );

  React.useEffect(() => {
    setExpanded(defaultExpanded);
  }, [props.project.id]);

  React.useEffect(() => {
    if (hasMechanicalErrors) {
      setExpanded((current) => ({ ...current, mechanical: true }));
    }
  }, [hasMechanicalErrors]);

  const toggle = (key: SectionKey): void => {
    setExpanded((current) => ({ ...current, [key]: !current[key] }));
  };
  const sections: readonly SectionKey[] = ["basic", "mechanical", "coverLeverage"];

  return (
    <div aria-label="Project Master Detail" className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6" role="region">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {props.mode === "read" && (
            <button aria-label="Back to Project Workspace" className="mb-2 text-sm text-slate-600 underline" onClick={props.onBack} type="button">
              ← Project Workspace
            </button>
          )}
          <h1 className="text-2xl font-semibold">Project Master Detail</h1>
          <p className="mt-1 text-sm text-slate-600">{props.row.year} | {props.row.projectName} | {props.row.qciModelName}</p>
        </div>
        {props.mode === "read" ? (
          <button className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white" onClick={props.onBeginEdit} type="button">Edit Master</button>
        ) : (
          <div className="flex gap-2">
            <button className="rounded-md border border-slate-300 px-4 py-2 text-sm" onClick={props.onCancel} type="button">Cancel</button>
            <button className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white" onClick={props.onSave} type="button">Save Changes</button>
          </div>
        )}
      </div>

      {sections.map((section) => (
        <CollapsibleSection expanded={expanded[section]} id={section} key={section} onToggle={() => toggle(section)}>
          {section === "basic" && (props.mode === "read"
            ? <BasicInformationRead row={props.row} />
            : <BasicInformationEdit fieldErrors={props.fieldErrors} form={props.form} onChange={props.onChange} />)}
          {section === "mechanical" && (props.mode === "read"
            ? <MechanicalRead project={props.project} />
            : <MechanicalEdit fieldErrors={props.fieldErrors} form={props.form} onChange={props.onChange} />)}
          {section === "coverLeverage" && (props.mode === "read"
            ? <CoverLeverageRead leverageDisplay={props.leverageDisplay} project={props.project} />
            : <CoverLeverageEdit form={props.form} onChange={props.onChange} options={props.projectReferenceOptions} project={props.project} />)}
        </CollapsibleSection>
      ))}

      {(props.mode === "read" ? props.feedback : props.issues).map((issue) => (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm" key={`${issue.code}-${issue.target.field ?? "section"}`}>
          {issue.message}
        </div>
      ))}
    </div>
  );
}
