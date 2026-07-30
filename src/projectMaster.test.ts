import {
  buildProjectFromForm,
  dashboardExportRow,
  dashboardProjectsFromWorksheetRows,
  toProjectForm,
  updateProjectFromForm,
  type DashboardProject,
} from "./projectMaster";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const existingProject: DashboardProject = {
  name: "Valour_ARX",
  qciProjectName: "ZPDA",
  acerModelName: "Valour",
  acerMarketingName: "Predator Helios 18 AI",
  customer: "Acer",
  year: "2026",
  platform: "Intel Arrow Lake HX-Refresh",
  productLine: "Helios",
  size: "18\"",
  cpu: "Intel Arrow Lake HX-Refresh",
  gpu: "B1-X9/X11",
  ssid: "SSID-001",
  rmn: "N25Q1",
  projectStatus: "Ongoing",
  currentStage: "EVT",
  mdrr: "2026/03/18",
  nextMilestone: "MDRR",
  dueDate: "2026/03/18",
  workingDraft: "No",
  needsAttention: "Yes",
};

const createdProject = buildProjectFromForm({
  year: "2027",
  customer: "QCI",
  productLine: "Concept",
  projectName: "Phoenix",
  qciModelName: "ZPH",
  acerModelName: "PH16",
  acerMarketingName: "Predator Phoenix",
  panelSize: "16\"",
  cpu: "Intel",
  gpu: "RTX",
  ssid: "SSID-777",
  rmn: "RMN-777",
  projectStatus: "",
});

assertEqual(createdProject.projectStatus, "Pending", "new projects default to Pending");
assertEqual(createdProject.name, "Phoenix", "new project uses project name");
assertEqual(createdProject.qciProjectName, "ZPH", "new project uses QCI model name");
assertEqual(createdProject.year, "2027", "new project preserves entered year");
assertEqual(createdProject.customer, "QCI", "new project preserves entered customer");
assertEqual(createdProject.productLine, "Concept", "new project preserves entered product line");

const editedProject = updateProjectFromForm(existingProject, {
  year: "2028",
  customer: "Lenovo",
  productLine: "Legion",
  projectName: "Valour Refresh",
  qciModelName: "ZPDR",
  acerModelName: "Valour R",
  acerMarketingName: "Predator Helios 18 AI Refresh",
  panelSize: "18\"",
  cpu: "Intel Refresh",
  gpu: "RTX 5090",
  ssid: "SSID-002",
  rmn: "N25Q2",
  projectStatus: "MP",
});

assertEqual(editedProject.name, "Valour Refresh", "edit updates project name");
assertEqual(editedProject.projectStatus, "MP", "edit updates project status");
assertEqual(editedProject.mdrr, existingProject.mdrr, "edit preserves schedule summary fields");
assertEqual(editedProject.year, "2028", "edit updates year");
assertEqual(editedProject.customer, "Lenovo", "edit updates customer");
assertEqual(editedProject.productLine, "Legion", "edit updates product line");

const editedForm = toProjectForm(editedProject);

assertEqual(editedForm.year, "2028", "edit form preloads year");
assertEqual(editedForm.customer, "Lenovo", "edit form preloads customer");
assertEqual(editedForm.productLine, "Legion", "edit form preloads product line");

const exportRow = dashboardExportRow(editedProject);

assertEqual(exportRow["Project Status"], "MP", "dashboard export includes project status");
assertEqual(exportRow["QCI Model Name"], "ZPDR", "dashboard export includes QCI model name");
assertEqual(exportRow["Acer Model Name"], "Valour R", "dashboard export includes Acer model name");
assertEqual(
  exportRow["Acer Marketing Name"],
  "Predator Helios 18 AI Refresh",
  "dashboard export includes Acer marketing name",
);
assertEqual(exportRow["Panel Size"], "18\"", "dashboard export labels panel size");
assertEqual(exportRow.SSID, "SSID-002", "dashboard export includes SSID");
assertEqual(exportRow.RMN, "N25Q2", "dashboard export includes RMN");

const importedProjects = dashboardProjectsFromWorksheetRows([
  ["year", "Product Line", "Panel Size", "CPU", "GPU", "Project Name", "QCI Model Name", "Acer Model Name", "Acer Marketing Name", "SSID", "RMN", ""],
  [" ", " ", " ", " ", " ", " ", " ", " ", " ", " ", " ", ""],
  [2026, " Helios Neo ", "16\"", "Intel\r\nCPU", "B2", "Macan S", "ZBJM", "PHN16", "Predator", "204D", " N25Q4　\r\nN25Q4C ", ""],
  [2026, "Helios Neo", "16\"", "AMD", "B3", "Macan S", "ZBJA", "", "", "", "", ""],
]);

assertEqual(importedProjects.length, 2, "each nonblank Excel row becomes one project");
assertEqual(importedProjects[0].id, "imported-project-1", "imported project gets unique internal id");
assertEqual(importedProjects[1].id, "imported-project-2", "duplicate project name remains separate with unique id");
assertEqual(importedProjects[0].customer, "-", "missing Customer uses prototype default");
assertEqual(importedProjects[0].projectStatus, "Pending", "missing Project Status uses prototype default");
assertEqual(importedProjects[0].platform, "Intel\r\nCPU", "CPU maps to Platform and preserves internal line break");
assertEqual(importedProjects[0].cpu, "Intel\r\nCPU", "CPU value is preserved");
assertEqual(importedProjects[0].productLine, "Helios Neo", "edge spaces are trimmed");
assertEqual(importedProjects[0].rmn, "N25Q4　\r\nN25Q4C", "edge full-width spaces are trimmed while internal line breaks remain");
assertEqual(importedProjects[1].name, "Macan S", "duplicate project names are not merged");
assertEqual(importedProjects[1].acerModelName, "", "empty Excel cells remain empty");
