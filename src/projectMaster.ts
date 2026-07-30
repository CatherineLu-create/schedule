import { cleanCellText, removeBlankRowsAndColumns } from "./worksheetImport";

export type ProjectStatus = "Pending" | "Ongoing" | "MP" | "EOL";

export type ProjectForm = {
  year: string;
  customer: string;
  productLine: string;
  projectName: string;
  qciModelName: string;
  acerModelName: string;
  acerMarketingName: string;
  panelSize: string;
  cpu: string;
  gpu: string;
  ssid: string;
  rmn: string;
  projectStatus: ProjectStatus | "";
};

export type DashboardProject = {
  id?: string;
  name: string;
  qciProjectName: string;
  acerModelName?: string;
  acerMarketingName?: string;
  customer: string;
  year: string;
  platform: string;
  productLine: string;
  size: string;
  cpu: string;
  gpu: string;
  ssid?: string;
  rmn?: string;
  projectStatus: ProjectStatus;
  currentStage: string;
  mdrr: string;
  nextMilestone: string;
  dueDate: string;
  pm?: string;
  targetMp?: string;
  workingDraft?: string;
  needsAttention?: string;
};

export const projectStatusOptions: ProjectStatus[] = ["Pending", "Ongoing", "MP", "EOL"];

const fallback = (value: string, placeholder = "-") => value.trim() || placeholder;

export function buildProjectFromForm(input: ProjectForm): DashboardProject {
  return {
    name: fallback(input.projectName, "New Project"),
    qciProjectName: fallback(input.qciModelName),
    acerModelName: fallback(input.acerModelName),
    acerMarketingName: fallback(input.acerMarketingName),
    customer: fallback(input.customer),
    year: fallback(input.year),
    platform: fallback(input.cpu),
    productLine: fallback(input.productLine),
    size: fallback(input.panelSize),
    cpu: fallback(input.cpu),
    gpu: fallback(input.gpu),
    ssid: fallback(input.ssid),
    rmn: fallback(input.rmn),
    projectStatus: input.projectStatus || "Pending",
    currentStage: "EVT",
    mdrr: "2026/12/31",
    nextMilestone: "MDRR",
    dueDate: "2026/12/31",
    workingDraft: "No",
    needsAttention: "No",
  };
}

export function updateProjectFromForm(project: DashboardProject, input: ProjectForm): DashboardProject {
  return {
    ...project,
    year: fallback(input.year),
    customer: fallback(input.customer),
    productLine: fallback(input.productLine),
    name: fallback(input.projectName, "New Project"),
    qciProjectName: fallback(input.qciModelName),
    acerModelName: fallback(input.acerModelName),
    acerMarketingName: fallback(input.acerMarketingName),
    platform: fallback(input.cpu),
    size: fallback(input.panelSize),
    cpu: fallback(input.cpu),
    gpu: fallback(input.gpu),
    ssid: fallback(input.ssid),
    rmn: fallback(input.rmn),
    projectStatus: input.projectStatus || "Pending",
  };
}

export function toProjectForm(project: DashboardProject): ProjectForm {
  return {
    year: project.year,
    customer: project.customer,
    productLine: project.productLine,
    projectName: project.name,
    qciModelName: project.qciProjectName,
    acerModelName: project.acerModelName || "",
    acerMarketingName: project.acerMarketingName || "",
    panelSize: project.size,
    cpu: project.cpu,
    gpu: project.gpu,
    ssid: project.ssid || "",
    rmn: project.rmn || "",
    projectStatus: project.projectStatus,
  };
}

export function dashboardExportRow(project: DashboardProject) {
  return {
    Year: project.year,
    Customer: project.customer,
    "Product Line": project.productLine,
    "Project Name": project.name,
    "QCI Model Name": project.qciProjectName,
    "Acer Model Name": project.acerModelName || "",
    "Acer Marketing Name": project.acerMarketingName || "",
    "Panel Size": project.size,
    CPU: project.cpu,
    GPU: project.gpu,
    SSID: project.ssid || "",
    RMN: project.rmn || "",
    "Project Status": project.projectStatus,
    "Current Stage": project.currentStage,
    MDRR: project.mdrr,
  };
}

function headerIndex(headers: string[], name: string) {
  return headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
}

function valueForHeader(row: unknown[], headers: string[], name: string) {
  const index = headerIndex(headers, name);

  return index >= 0 ? cleanCellText(row[index]) : "";
}

export function dashboardProjectsFromWorksheetRows(rows: unknown[][]): DashboardProject[] {
  const cleanedRows = removeBlankRowsAndColumns(rows);
  const headers = (cleanedRows[0] || []).map(cleanCellText);

  return cleanedRows.slice(1).map((row, index) => {
    const cpu = valueForHeader(row, headers, "CPU");

    return {
      id: `imported-project-${index + 1}`,
      name: valueForHeader(row, headers, "Project Name"),
      qciProjectName: valueForHeader(row, headers, "QCI Model Name"),
      acerModelName: valueForHeader(row, headers, "Acer Model Name"),
      acerMarketingName: valueForHeader(row, headers, "Acer Marketing Name"),
      customer: "-",
      year: valueForHeader(row, headers, "year"),
      platform: cpu,
      productLine: valueForHeader(row, headers, "Product Line"),
      size: valueForHeader(row, headers, "Panel Size"),
      cpu,
      gpu: valueForHeader(row, headers, "GPU"),
      ssid: valueForHeader(row, headers, "SSID"),
      rmn: valueForHeader(row, headers, "RMN"),
      projectStatus: "Pending",
      currentStage: "-",
      mdrr: "-",
      nextMilestone: "-",
      dueDate: "-",
      workingDraft: "No",
      needsAttention: "No",
    };
  });
}
