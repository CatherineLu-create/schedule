# PIP — Project Information Platform

PIP 是一個前端 Prototype，用來探索「Project Information 的正式資訊中心」應該如何呈現、編輯、版本化與交接。此專案目前使用 React、TypeScript、Vite、Tailwind CSS 與本地假資料，所有狀態都存在瀏覽器記憶體中，沒有 Backend、Database、API、Authentication 或 Permissions。

PIP 不是 Schedule Parser、Task Management Tool、傳統 Project Management Tool，也不是可正式上線的 Enterprise System。它目前的重點是示範 Project Master、Schedule、Working Draft、Published Version、Import Warning、Team Members 與 Excel Import/Export 的前端互動模型。

## 1. 產品目的

PIP 的定位是 Project Information Platform：一個保存可信任、可追蹤、可版本化 Project Information 的正式資訊中心。

核心原則是：

```text
Document != Official Truth
```

Weekly Report、PPT、Excel、PDF、Email 等文件可以是 Evidence、Import Source 或 Historical Reference，但文件本身不直接等於正式專案資訊。PIP 的目標是將原始文件與經確認的結構化資料分離：資料先進入 Working Data 或 Working Draft，經 PM 或負責人 Review、修正與 Publish 後，才成為 Published Official Information。

目前 Prototype 中的三種概念可這樣理解：

| 類型 | 意義 | 目前實作狀態 |
| --- | --- | --- |
| Evidence / Import Source | Excel 或其他文件來源，提供資料輸入或參考 | 部分實作：Project List 使用已轉成 JSON 的 Excel 資料；Team Members 支援使用者手動 Import Excel |
| Working Data / Working Draft | 可編輯、尚未發布的資料 | 已實作：Schedule Working Draft 以 React State 暫存 |
| Published Official Information | 發布後的版本化資料 | 已實作於前端記憶體：Publish 會新增 `v2`, `v3` 等版本 |

## 2. 目前 Prototype 範圍

| 功能 | 狀態 | 說明 |
| --- | --- | --- |
| Dashboard | 已實作 | 顯示 Header、Needs Attention、Search、Filters、Project List、Create Project、Export to Excel |
| Needs Attention | 已實作 | Blocking Issues 維持未啟用；Upcoming Milestones 與 Overdue 由 Current Published Schedule 顯示唯一 Project 數量及 Project / Milestone 明細 |
| Project Search | 已實作 | 搜尋 Project Name、QCI Model Name、Product Line、Customer、CPU、GPU |
| Dashboard Filters | 已實作 | Year、Product Line、Panel Size、CPU、Customer；AND logic；chips 可移除；Clear All 可清空 |
| Project List | 已實作 | 使用 `src/dashboardProjectRows.json` 產生 Project；支援水平捲動與欄寬拖曳 |
| Create Project | 已實作 | 使用 modal 建立 Project，新增後立即出現在 Dashboard |
| Edit Project Master | 已實作 | 在 Project Master Detail 相同章節中 inline 編輯，儲存在前端 state，Dashboard 立即更新 |
| Project Workspace | 已實作 | 保留固定 Project Header、View Project Master 入口、Resources 及 Current Schedule，順序固定 |
| Schedule | 已實作 | 顯示 Phase、Stage、Milestone、Plan、Actual |
| Schedule Filters | 已實作 | Phase、Stage、Milestone、Plan From/To、Actual From/To |
| Working Draft | 已實作 | 最新版本可進入 draft 編輯 Schedule cell |
| Publish Flow | 已實作 | 無 unresolved warning 時可 Publish，建立下一個 Published Version |
| Import Warning | 已實作 | Warning 以 `rowId:field` 追蹤；編輯對應 cell 後解除；有 warning 時阻止 Publish |
| Team Members | 已實作 | Import Excel、Dynamic Columns、Editable Table、Add/Delete Member、Add/Delete Custom Column |
| Excel Import | 部分實作 | Team Members 可由 browser 手動選檔匯入；Project List 使用預先轉換的 JSON |
| Excel Export | 部分實作 | Dashboard Project List 與 Schedule 可輸出 Excel；Schedule export 目前輸出初始 schedule 常數，不是 selected version |
| Backend / Database / API | 尚未實作 | 所有資料皆為 local fake data 或 browser memory state |

## 3. 主要使用流程

目前可操作流程：

```text
Dashboard
-> 選擇 Project
-> Project Workspace
-> 開啟 Schedule
-> Edit Schedule
-> Working Draft
-> 雙擊 cell 編輯或處理 Import Warning
-> Publish
-> 建立新的 Published Version
```

Project Workspace 本身對 Schedule 是 read-only：使用者必須點擊 `Edit Schedule` 進入 Working Draft 才能修改 Schedule cell。`Edit Schedule` 只在最新 Published Version 啟用；選到舊版本時 UI 會標示 `Read-only version` 並停用 Edit。

Working Draft 與 Published Version 在操作上是分離的。Draft 使用 local component state，Cancel 會離開 Draft 並丟棄未發布修改。Publish 會把完整 `draftSchedule` 傳入 version history，新增下一個版本，並選中最新版本。舊 Published Versions 在目前操作流程中不會被直接修改。

Prototype 限制：Version history 目前是整個 App 共用的一份 Schedule state，尚未做到每個 Project 各自擁有獨立 Schedule versions。Refresh browser 後，所有 create/edit/publish/import 狀態都會重置。

## 4. 主要頁面與功能

### Dashboard

Header 實作為：

| UI | 文字 |
| --- | --- |
| 主標題 | `Project Information` |
| 下方小字 | `Dashboard` |

Dashboard 目前包含：

- `Needs Attention`
- `Search Project`
- `Filters`
- `Project List`
- `Export to Excel`
- `Create Project`

`Needs Attention` 目前有三張卡片：

- `Blocking Issues`：計算尚未啟用
- `Upcoming Milestones`：Current Published Schedule 未來 14 天內到期的唯一 Project 數量
- `Overdue`：Current Published Schedule 已逾期的唯一 Project 數量

Upcoming / Overdue 會依 Project 分組顯示 Project Name、符合條件的 Milestone Type 與 Plan Date；點擊 Project Name 會開啟既有 Project Workspace。這兩張卡片不讀取 Working Draft；成功 Publish 後才會反映新的 Current Published Schedule。

Dashboard Filters 實際包含：

- `Year`
- `Product Line`
- `Panel Size`
- `CPU`
- `Customer`

Search 與 Filters 是獨立條件，但最後都會一起影響 Project List。Search 先做文字比對；Filters 使用 AND logic。Active filter chips 顯示在 `Filters` 標題旁，點擊 chip 可移除單一條件，`Clear All` 可清空所有 Dashboard filters。Filter options 由目前 `projects` state 產生，因此 Create/Edit Project 後會反映新值。

Project List 欄位來自 `src/dashboardColumns.ts`：

- Year
- Customer
- Product Line
- Project Name
- QCI Model Name
- Panel Size
- CPU
- GPU
- Project Status
- Current Stage
- MDRR

既有 MDRR 欄位從 Current Published Schedule 顯示 MDRR 的 Plan / Actual；Not Applicable、缺少 MDRR 或沒有可顯示日期時顯示 `—`。Working Draft 不影響此欄位，直到成功 Publish。

### Project Workspace

Project Workspace 包含：

- Back to Dashboard
- 固定 Project Header 摘要
- View Project Master
- Resources
- Current Schedule / Working Draft

Project Workspace 層級的 Resources 目前狀態：

| Resource | 狀態 |
| --- | --- |
| Schedule | Enabled in Project Workspace |
| Team Member | Enabled from Project Workspace Resources |
| Weekly Report | Migration pending |
| AVL | Migration pending |

### Project Master

Project Master 實際欄位分組如下：

| 分組 | 欄位 |
| --- | --- |
| Project Identity | Project Name、QCI Model Name、Acer Model Name、Acer Marketing Name |
| Project Classification | Year、Customer、Product Line |
| Hardware | Panel Size、CPU、GPU |
| Internal Identifier | SSID、RMN |
| Project Management | Project Status |

The Project Workspace keeps its fixed Project Header compact. **View Project
Master** opens a dedicated full-width detail surface with three collapsible
sections in this order: **Basic Information**, **Mechanical**, and **Cover /
Leverage**. All three sections start expanded so their saved information is
visible on first entry. The visible disclosure controls use `+` and `−`, and
their state is transient UI state only. Resources remains at the Project
Workspace level between Project Master and Current Schedule.

- **Mechanical** shows Product Length, Width, Height, and Weight plus Package
  Length, Width, Height, and Gross Weight. Dimensions use `mm`, weights use
  `g`, and a null value displays `—` while numeric zero remains visible.
- **Cover / Leverage** shows PCB and A/B/C/D Cover rows. A/B/C/D materials are
  resolved from the existing Cover catalog; PCB material is not applicable.
  Leverage stores only the directly selected ProjectId and resolves the
  source's current `Year | STN Project Name | QCI Model Name` on render.
  Self-reference displays `New Design`, null displays `—`, and a dangling
  ProjectId displays `Unavailable Project` without clearing the stored ID.

**Edit Master** edits fields inline in the same section order. Mechanical blanks
save as null, zero and decimals remain valid, and negative or non-finite values
block Save and expand Mechanical to expose the error. Cover materials use
catalog dropdowns. Each leverage field uses one compact searchable Project
picker that searches Year, STN Project Name, and QCI Model Name while persisting
ProjectId only. Save and Cancel return to read-only Project Master Detail.
Normal Back navigation is unavailable during edit so changes cannot be silently
discarded.

Create Project remains a separate modal at its existing visible scope; it does
not expose Mechanical, Cover, Leverage, or disclosure controls. Save and Cancel
continue through the existing in-memory Project Master lifecycle; no second
Master authority or persistence layer is introduced.

`Project Status` options 來自 `projectStatusOptions`：

- Pending
- Ongoing
- MP
- EOL

Create Project 使用獨立 modal；Edit Master 使用 Project Master Detail 的 inline section UI。兩者仍透過既有 Project command/reducer lifecycle 更新 canonical `Project.master`，Create Project 的 visible scope 與 duplicate review flow 維持不變。

目前沒有永久儲存；Browser Refresh 後 Project Master 的新增與修改會重置。

### Schedule

Schedule Row type 實際欄位：

- `id`
- `phase`
- `stage`
- `milestone`
- `plan`
- `actual`

Schedule Table 顯示欄位：

- Phase
- Stage
- Milestone
- Plan
- Actual

Schedule Filters 實際包含：

- Phase
- Stage
- Milestone
- Plan From
- Plan To
- Actual From
- Actual To

程式碼中沒有 `Actual Status` filter、Completed/Not Completed selector 或相關 filtering logic。

Filter 行為：

- Phase / Stage options 由目前 Schedule rows 產生，去重並忽略空白。
- Milestone 使用 trim 後的 case-insensitive partial match。
- Plan / Actual date range 使用 `Date.parse()` 解析；有 active date filter 時，無效日期不會 match。
- Filters 只影響畫面顯示，不修改底層 Schedule。
- Published Version view 與 Working Draft view 各自有獨立的 filter state。
- 顯示 result count，例如 `Showing 12 of 48 milestones`。

Actual Row Styling 已實作於 `isScheduleRowCompleteOrNotApplicable()`。當 `Actual` 符合以下條件時，整列套用 `text-slate-500` 灰色文字：

- 可辨識日期，例如 `2026/08/15`、`2026-08-15`、`Aug 15, 2026`，或日期加文字 notes
- 完整值 `-`
- 完整值 `*`
- 完整值 `NA`
- 完整值 `N/A`

`NA`、`N/A`、`*` 與 `-` 會 trim 前後空白；`NA` 與 `N/A` 忽略大小寫；必須完整符合。以下值不會變灰：

- 空白
- `TBC`
- `TBD`
- 無效或無法辨識的文字
- 尚未解除的 Import Warning 內容

灰色狀態由目前 `Actual` value 動態推導，沒有另外保存 completed flag。

### Team Members

Team Members 實際功能：

- `Import Team Member`：使用 browser file input 選擇 `.csv`, `.xls`, `.xlsx`
- 使用 `xlsx` 讀取第一個 worksheet
- `sheet_to_json(..., { header: 1, defval: "" })` 讀成二維陣列
- 移除完全空白 rows
- 移除完全空白 columns
- 保留部分有資料 rows/columns
- 空白 header 轉成 `Column 1`, `Column 2` 等
- 重複 header 加上 suffix，例如 `Department 2`
- 匯入後以 dynamic columns 顯示整張表
- 所有 cell 以 input 呈現，可編輯
- Add Member
- Delete Member
- Add Field
- Delete Field

Prototype 限制：預設空表仍使用 `Name`, `Role`, `Department`, `Email` 四個欄位；匯入 Excel 後才會完全依 worksheet headers 動態建立欄位。Default fields 不允許透過 `Delete Field` 刪除。

## 5. Data Model

主要 TypeScript data model 位於：

- `src/projectMaster.ts`
- `src/scheduleFilters.ts`
- `src/scheduleWarnings.ts`
- `src/versionHistory.ts`
- `src/teamMembers.ts`
- `src/main.tsx`

簡化後的實際資料關係：

```json
{
  "project": {
    "id": "imported-project-1",
    "name": "Example Project",
    "qciProjectName": "QCI Model",
    "acerModelName": "Acer Model",
    "acerMarketingName": "Marketing Name",
    "customer": "-",
    "year": "2026",
    "platform": "CPU value",
    "productLine": "Product Line",
    "size": "16\"",
    "cpu": "CPU value",
    "gpu": "GPU value",
    "ssid": "SSID",
    "rmn": "RMN",
    "projectStatus": "Pending",
    "currentStage": "-",
    "mdrr": "-",
    "nextMilestone": "-",
    "dueDate": "-"
  },
  "scheduleRow": {
    "id": "schedule-row-1",
    "phase": "ID & ME Design",
    "stage": "ID & ME Design",
    "milestone": "Kick-off",
    "plan": "2026/7/1",
    "actual": "2026/7/1"
  },
  "versionHistory": {
    "versions": [
      {
        "version": "v1",
        "schedule": ["scheduleRow"],
        "meta": {
          "warnings": {
            "schedule-row-1:plan": true
          }
        }
      }
    ],
    "selectedVersion": "v1",
    "currentSchedule": ["scheduleRow"],
    "currentMeta": {
      "warnings": {
        "schedule-row-1:plan": true
      }
    }
  },
  "teamMembers": {
    "fields": ["Name", "Role", "Department", "Email"],
    "members": [
      {
        "id": "member-1",
        "values": {
          "Name": "",
          "Role": "",
          "Department": "",
          "Email": ""
        }
      }
    ],
    "sourceFileName": "team.xlsx"
  }
}
```

Schedule Row 已使用 stable `id`。這很重要，因為 filters 會改變畫面上可見 rows；Working Draft 編輯時必須用 `row.id` 更新正確底層資料；Import Warning 也必須用 `rowId:field` 附著在正確 cell，不可使用 filtered array index 作為資料識別。

## 6. Schedule 資料流

目前 Schedule data flow：

```text
src/schedule-output_3108.json
-> scheduleOutput.records
-> map 成 ScheduleItem[]，產生 schedule-row-* stable id
-> createInitialVersionHistory(schedule, meta)
-> React state: versionHistory
-> selectedVersion / currentSchedule
-> Schedule Filters
-> Visible Schedule Table
```

Working Draft data flow：

```text
Published Version currentSchedule
-> WorkingDraft local draftSchedule state
-> 使用 row.id + field 編輯 cell
-> resolveScheduleWarning()
-> Publish 完整 draftSchedule
-> publishVersion()
-> versions append vN
-> selectedVersion 切到新版本
```

已實作規則：

- Filters 只影響目前顯示 rows。
- Filters 不刪除底層資料。
- Filters 不直接修改原始 Schedule。
- Working Draft 編輯使用 stable row id。
- Publish 使用完整 `draftSchedule`，不是 filtered visible rows。
- 舊版本可透過 Version Selector 切換檢視。

Prototype 限制：

- Schedule version history 目前是 app-level state，不是 per-project state。
- `Export Section` 的 Schedule export 使用 module-level `schedule` 常數，尚未輸出 selected version 或 draft。
- Version note textarea 目前沒有保存到 version metadata。

## 7. Project Data 與 Excel Data Flow

根目錄存在：

```text
D:\011superpowers-schedule\schedule 的假資料.xlsx
```

目前檢查結果：此 Excel 檔第一個 worksheet 為 `工作表1`，共 34 rows；內容已轉成 `src/dashboardProjectRows.json`，兩者目前完全一致。Browser runtime 並沒有直接讀取 Windows absolute path；Dashboard 是 import JSON。

Project Master data flow：

```text
schedule 的假資料.xlsx
-> src/dashboardProjectRows.json
-> dashboardProjectsFromWorksheetRows()
-> DashboardProject[]
-> React state: projects
-> Dashboard Project List / Filters
-> Project Workspace Project Master
```

Project Excel mapping 來自 `dashboardProjectsFromWorksheetRows()`：

| Excel Header | DashboardProject field |
| --- | --- |
| `year` | `year` |
| `Product Line` | `productLine` |
| `Panel Size` | `size` |
| `CPU` | `cpu`, `platform` |
| `GPU` | `gpu` |
| `Project Name` | `name` |
| `QCI Model Name` | `qciProjectName` |
| `Acer Model Name` | `acerModelName` |
| `Acer Marketing Name` | `acerMarketingName` |
| `SSID` | `ssid` |
| `RMN` | `rmn` |

目前 Excel 沒有 Customer 欄位對應，imported projects 的 `customer` 預設為 `"-"`，但 Create/Edit Project 可修改 Customer。

Schedule Row data flow 是另一條資料流：

```text
src/schedule-output_3108.json
-> scheduleOutput.records
-> ScheduleItem[]
-> Version History
-> Working Draft
-> Publish
```

不要把 Project Master Excel 描述為 Schedule 明細來源。Schedule rows 目前來自 `src/schedule-output_3108.json`，該 JSON records 包含原始欄位如 `section`、`stage`、`milestone`、`plan_content`、`actual_content`，在 `main.tsx` 中 map 成 UI 使用的 `phase`、`stage`、`milestone`、`plan`、`actual`。

Team Members Excel flow：

```text
使用者透過 browser file input 選擇 Excel/CSV
-> XLSX.read(await file.arrayBuffer())
-> 讀第一個 worksheet
-> 清理空白 rows/columns 與 headers
-> TeamMembersState
-> editable table
```

## 8. Version 與 Working Draft 規則

已實作行為：

- 初始版本為 `v1`。
- Version Selector 顯示 `versions` 中所有版本。
- Publish 建立 `v2`, `v3` 等新版本。
- Publish 後自動選中新版本。
- 舊 Published Version 可切回檢視。
- 舊版本的 `Edit Schedule` button 會 disabled。
- Schedule cell editing 只發生在 Working Draft 頁面。
- 有 unresolved warning 時 Publish button disabled。

設計原則：

- Published Version 應視為 Immutable。
- 不應直接覆蓋舊版本。
- 若要恢復舊內容，應以該內容建立新的 Published Version，而不是修改舊版本。

尚未實作：

- Restore Version
- Delete Version
- Version Comparison / Diff View
- Multi-user concurrency control
- Backend persistence
- Per-project schedule version storage

Prototype 限制：

- Refresh 後 versions、draft、project edits、team member imports 都會重置。
- Working Draft 只存在目前頁面 component state，沒有持久化 draft store。
- 目前只有一份 app-level Schedule version history，不是每個 Project 各自維護。

## 9. Import Warning 行為

Warning model 位於 `src/scheduleWarnings.ts`。

實際行為：

- Warning records 型別為 `Record<string, true>`。
- Key 格式為 `${rowId}:${field}`，例如 `schedule-row-1:plan`。
- 初始 warning 為 `schedule-row-1` 的 `plan` cell。
- `hasScheduleWarning()` 決定特定 cell 是否顯示 warning icon。
- `resolveScheduleWarning()` 在該 cell 有 warning 且新值非空白時移除 warning。
- `countScheduleWarnings()` 用來判斷是否可 Publish。
- Warning metadata 跟著 version entry 保存，因此切換版本時 warning 不會依 filtered index 跑到錯誤 row。

Warning icon 顯示在受影響 cell 中；目前使用 amber text class 讓 warning 在灰色 row 中仍可辨識。

## 10. Technology Stack

已確認技術與 dependencies：

| 技術 | 用途 | 確認來源 |
| --- | --- | --- |
| React | UI rendering | `package.json`, `src/main.tsx` |
| TypeScript | 型別與 build | `package.json`, `tsconfig.json` |
| Vite | Dev server、build、preview | `package.json`, `vite.config.ts` |
| Tailwind CSS | Utility CSS | `package.json`, `vite.config.ts`, `src/styles.css` |
| xlsx / SheetJS | Excel import/export | `package.json`, `src/main.tsx` |

目前沒有 Backend、API、Database、Authentication 或 Permissions。

## 11. Project Structure

重要結構：

```text
D:\011superpowers-schedule
  index.html                         Vite HTML entry
  package.json                       npm scripts 與 dependencies
  package-lock.json                  npm lockfile
  vite.config.ts                     Vite config，使用 React 與 Tailwind plugin
  tsconfig.json                      TypeScript app config
  tsconfig.node.json                 TypeScript config for Vite config
  schedule 的假資料.xlsx             Project Master fake data 原始 Excel 檔
  src/
    main.tsx                         React app entry；主要頁面與 UI state wiring
    styles.css                       Tailwind import 與 base body font
    dashboardProjectRows.json        Project Master Excel 轉出的 Dashboard fake data
    schedule-output_3108.json        Schedule fake data source
    projectMaster.ts                 Project form、Project model、Excel row mapping、Dashboard export row
    dashboardColumns.ts              Project List 欄位與欄寬設定
    scheduleFilters.ts               Schedule filter、chips、Actual row gray rule
    scheduleWarnings.ts              Import Warning key/model/resolve logic
    versionHistory.ts                Published Version history helper
    teamMembers.ts                   Team Members import cleanup 與 table state helper
    worksheetImport.ts               Excel worksheet cleanup helper
    *.test.ts                        TypeScript assertion-style helper tests；目前沒有 npm test script
  docs/
    superpowers/specs/               先前開發規格文件
    superpowers/plans/               先前 implementation plans
```

未列出 `node_modules/`、`dist/` 與 TypeScript build info，因為它們是 dependencies 或 build output。

## 12. Getting Started

### Prerequisites

- Node.js：專案未在 `package.json` 指定 `engines`，請使用可執行目前 Vite/TypeScript toolchain 的 Node.js 版本。
- npm
- Windows PowerShell

目前環境檢查到的 Node.js 版本為 `v24.14.1`，但這不是專案鎖定需求。

### 安裝 Dependencies

```powershell
cd D:\011superpowers-schedule
npm install
```

### 啟動 Development Server

```powershell
npm run dev
```

Vite 會在終端機輸出 local URL。此專案沒有在 `vite.config.ts` 固定 port；若預設 port 被占用，Vite 可能改用其他 port。

### Production Build

```powershell
npm run build
```

### Preview Production Build

```powershell
npm run preview
```

`preview` script 存在於 `package.json`，用於預覽已 build 的 production output。

## 13. Available Scripts

| Command | 用途 |
| --- | --- |
| `npm run dev` | 啟動 Vite development server |
| `npm run build` | 執行 `tsc -b` 與 `vite build` |
| `npm run preview` | 使用 Vite preview 預覽 production build |

目前沒有 `npm test`、`lint` 或 `format` script。

## 14. Build 與 Verification

本次 README 更新後實際執行的 build command：

```powershell
npm run build
```

Manual verification checklist 建議在功能修改後執行：

- Dashboard 可以正常載入 Project。
- Search Project 正常運作。
- Dashboard Filters 使用 AND logic，且 chips / Clear All 正常。
- Project Workspace 可以從 Dashboard 開啟。
- Project Workspace 依序顯示 Project Master、Resources、Current Schedule。
- Project Master Detail 僅顯示 Basic Information、Mechanical、Cover / Leverage，且不含 Resources。
- Resources 的 Team Member 入口可開啟既有 Team Member workspace 並返回 Project Workspace。
- Project Master Create/Edit 後 Dashboard 與 Workspace 立即更新。
- Schedule Filters 顯示正確 result count。
- Filter 後編輯 Schedule Row 不會改到錯誤底層 row。
- Actual Date、`-`、`*`、`NA`、`N/A` 會讓正確 row 顯示灰色。
- `TBC`、`TBD` 與空白 Actual 保持正常樣式。
- Working Draft 可以雙擊 cell 編輯。
- 有 unresolved Import Warning 時 Publish 被阻止。
- 修改 warning cell 後 warning 被解除。
- Publish 可以建立下一個 version。
- 舊 Published Version 保持 read-only。
- Team Members Excel Import 可讀第一個 worksheet 並產生 dynamic columns。
- Dashboard Project List Export to Excel 正常。
- Schedule Export to Excel 正常，但需注意目前輸出的是初始 schedule 常數。

## 15. Prototype 限制

已確認限制：

- 無 Backend。
- 無 Database。
- 無 API。
- 無 Authentication。
- 無 Permissions。
- 無永久儲存。
- 使用 local fake data 與 client-side React state。
- Browser Refresh 後資料會回到初始狀態。
- Project List 的 Excel 資料在 runtime 使用 JSON，不是 browser 直接讀取 Windows absolute path。
- Team Members Excel Import 必須由使用者透過 browser 選檔。
- Schedule version history 目前不是 per-project。
- Schedule Export 目前不是 selected version aware。
- 尚未整合正式 PPT Parser。
- 無 Multi-user Collaboration。
- 無 Project Delete。
- 無 Version Restore。
- 無 Version Delete。
- 無 Version Comparison / Diff View。
- 無正式 deployment configuration。

## 16. Out of Scope

目前 MVP 刻意不處理：

- Task Management。
- 完整 Project Management 流程。
- Backend Services。
- User Permissions。
- 自動 PPT Parser Integration。
- Risk Management。
- Issue Management。
- Certification Management。
- Action Item Management。
- Version Comparison。
- Cross-project Schedule Editing。
- Production Deployment。

## 17. 未來開發方向

以下是未來方向，不是目前已完成功能：

1. 將 local data 改為 API 與 Database。
2. 將 Parser Output 接入 Candidate Information Flow。
3. 加入 PM Review、資料比對與確認流程。
4. 永久保存 Working Draft 與 Published Versions。
5. 將 Schedule versions 改為 per-project data model。
6. 加入 Authentication 與 Permissions。
7. 擴充 Risk、Issue、Certification、Action Item 等 domains。
8. 完成正式 Import、Export 與 Deployment flow。

## 18. AI 開發交接規則

給未來 Codex 或其他 AI Agent 的規則：

- 修改前先檢查目前程式碼，不要只依 README 或舊 prompt 判斷。
- 不要重新建立整個專案。
- 不要破壞已正常運作的功能。
- 不要直接修改 Published Versions。
- Working Draft 必須與 Published Versions 分離。
- 編輯 filtered Schedule Rows 時，必須使用 stable row IDs。
- Publish 必須包含完整 Working Draft，不能只發布目前可見 rows。
- 不要混淆 Project Master Excel Data 與 Schedule Row Data。
- 未經明確要求，不要加入 Backend、API、Database、Authentication 或 Permissions。
- 每次修改後執行 `npm run build`。
- 回報 Changed Files、Completed Features、Verification Results、Remaining Limitations。
- 當 Architecture、Setup、Data Flow 或主要功能變更時，必須同步更新 `README.md`。

README 與 Source Code 必須一起閱讀。當 README 與程式碼衝突時：

- 目前 Source Code 是實際 Implementation Truth。
- 經 PM 明確確認的產品規格是 Design Target。
- 不應在未確認前自行刪除既有產品規則。
