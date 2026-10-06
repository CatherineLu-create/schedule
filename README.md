# PIP — Project Information Platform

PIP 是 React、TypeScript、Vite 與 Tailwind CSS 建立的前端 Prototype / User Trial。
所有修改只存在同一個 App session 的瀏覽器記憶體中；目前沒有 backend、database、
persistence、authentication、permissions 或多使用者同步，也不是 production 系統。
Excel 讀寫使用 SheetJS。Repository 的 Project、Schedule 與 Team 資料都是開發／測試資料。

## 資料權威與排程

`Project.master` 保存 Project Master，`Project.team` 保存已儲存的 Team；
`PrototypeState.schedules` 依確切 ProjectId 保存各專案獨立的 canonical Schedule。
Governance runtime 與 `SelfServiceReferenceCatalogs` 是 App 的另外兩份 sibling state，
不是 `PrototypeState` 或 `PrototypeAction` 的欄位。Dashboard、Workspace 與治理工具共用
這些既有 state 與 canonical commands/selectors。

Published Schedule 是不可直接編輯的正式版本。開始 Working Draft 時，只複製該專案
Current Published 的完整 occurrences；沒有 Published 時建立空白 Draft，不補 baseline
或 template rows。Draft 可跨頁導覽保留；Publish 建立下一個不可變版本，Discard 捨棄
未發布修改。Dashboard、Portfolio、日期提醒與跟進完成狀態只讀 Current Published。

PM 的 Schedule 使用英文：讀取／Edit、選擇定義／Add Milestone、日期與適用性編輯、
Publish／Discard。日期按 Apply Date 才寫入 Draft；Not Applicable 必須明確選擇並清除
Plan、Actual。Project-specific 編輯器先建立本案定義，使用目前已發布且可選的 Stage
與選填 Type（No Type 保存為 null），再透過 Add Milestone 明確加入 occurrence。
同名不會自動對應公版；既有 occurrence 與歷史定義的 ID 不因名稱相似而替換。

## 公版治理與跟進

「公版管理」使用中文，流程為建立草稿 → 檢查並預覽發布 → 發布公版。治理 Draft 與
Preview 不改變 PM 選項、Portfolio 欄位或 Attention；發布後，各消費端使用同一份
current release。公版定義的「可新增」、「顯示於總表」、「加入日期提醒」與跟進要求
分別管理，發布定義不會自動新增專案 occurrence。

Stage / Type 支援 Add、Retire，不支援 Rename。Stage 必填，新的公版或本案定義可用
null Type；沒有假的「空白／None」Type record。初始可選 Type 恰為 G/O、SMT、Pre-Build、
Close、Test、Certification、Preparation。其餘 legacy Types 保留供歷史解析，不能用於
新定義；MDRR、ID fix、Kickoff 的既有 Type ID 不改寫。停用分類只移除新定義的選項，
不自動停用引用它的既有定義。公版里程碑的 Retire 移除可新增資格，歷史仍可解析。
已發布 occurrence lineage，以及停用發布當下發給同專案、同 Draft、同 occurrence 的
精確授權，允許合法既有列繼續更新；授權不能用來新增列或跨專案使用。

Milestone Follow-up 與 Attention 分開。既有專案只在治理明確指定後加入要求；新專案
建立時，Project、空白 Schedule 與當時 release 的要求一起提交，後續 release 不回填
先前新案。只有 Current Published 中確切公版定義的 applicable 或 N/A occurrence
能完成要求；Draft 或同名本案定義不算完成。之後發布移除該列會重新待確認，但不阻擋
Schedule Publish，也不因此新增 Attention。撤回／重新指定保留歷史，重新指定使用新 ID。
QCI PM 來自已儲存的 `Project.team.projectRoles.qciPm`；缺少時顯示 Unassigned，待辦
仍保留。沒有 pending 要求時隱藏跟進面板。

## Dashboard 與 Excel 匯出

Upcoming / Overdue 的資格是四種 reusable Type ID：`type-g-o`、`type-smt`、
`type-pre-build`、`type-close`，加上確切 system definition `milestone-ramp-fcs`，
以及目前 release 的 additional Attention definition IDs。FCS 保存名稱不變、顯示
SSL/GL，SSL/GL 不是新 Type；MDRR 本身不再自動提醒，須明確加入已發布的額外提醒。
規則不依名稱猜測。只計 applicable、Plan 非 null、Actual 為 null 的 Current Published
列；Upcoming 包含 session referenceDate 到 +14 天，Overdue 在 referenceDate 之前。
日期以 DateOnly 比較，依 Project 去重並列出實際命中的里程碑。Blocking Issues 計算未啟用。

All Projects 寬表與匯出共用 Portfolio rows/cells 與目前已發布的完整 leaf schema。
初始有 11 個 Project、30 個 Schedule、7 個 Team leaf columns；治理發布可改變 Schedule
欄位。Team 的 QCI PM 來自已儲存資料，其餘六個 migration-pending leaves 仍保留空白，
不另從 roster 重建資料。

Export to Excel 輸出 `Project_Portfolio_Summary.xlsx`，只有一張 `All Projects` sheet，
每個 Project 一列。輸出列精確符合目前 Search AND Filters；無條件時輸出全部，零結果
保留完整 headers。所有右側欄位都會輸出，不受 viewport、水平捲動或欄寬影響，不另外
輸出 Schedule / Team detail sheets。Search 搜尋 Project Name、QCI Model Name、
Product Line、Customer、CPU、GPU；Panel Size 仍只屬於 filter 範圍。九個 filters 為
Year、Customer、Status、Category、Product Line、Panel Size、CPU、GPU、QCI PM。

## 模擬審核與 session catalogs

「進階治理與試用工具」預設收合，只在 Governance 中提供本案對應、模擬資料與審核紀錄。
這是 UI 位置分工，不是真實角色授權。工具操作所選專案的真實 Schedule；本案對應不需
先載入模擬資料，必須實際勾選工作內容、階段、類型、完成標準四項相同條件。

固定揭露：**模擬匯入資料｜供 PIP 流程驗收，非 Kevin 正式 JSON 格式**。
四個獨立情境為 `basic-success`、`fixable-validation`、`retired-existing-update`、
`retired-no-reference-negative`，使用既有 fixtures 與 loader。無 Draft 時必須確認
建立空白／複製 Current Published 才載入；取消不改狀態。每筆候選需明確確認，原始壞資料
保留為 evidence，不因更正而覆寫。Review decision、最終 Published 結果與治理發布歷史
是不同紀錄；審核 trace 不成為第二份日期或完成權威。

真實 Kevin 匯入格式與操作流程將於取得正式資料後另行設計。Governance / Schedule
沒有 JSON textarea、檔案選取或格式相容承諾。既有 Team 檔案匯入是獨立功能，仍保留。

只有 Product Line、Panel Size、CPU、GPU 提供一般 Add New。新增成功會立即選取，
取消外層 Project 表單仍保留 catalog option，同一 session 其他表單可重用。重複名稱
在各 catalog 內不分大小寫檢查，ID 衝突會拒絕；治理操作不清除或重建這四份 catalogs。
Customer、Category、Cover、Status、Stage、Type、Team Function 不提供這條一般
self-service 新增路徑；Project-specific milestone 使用上述獨立受治理的流程。

重新整理／remount 會恢復 bundled Project、Schedule、治理 releases 與 catalogs，清除
本次新增、編輯、發布、要求／撤回、退休授權、模擬／審核及 catalog additions。
目前不包含 Team / Cover / Template governance、正式 parser 或跨 session 儲存。

## 執行與驗證

從專案根目錄使用既有 npm scripts：

```powershell
npm run dev
npm run test:run -- --maxWorkers=1
npm run build
npm run preview
```

`dev` 啟動 Vite；`test:run` 執行 Vitest；`build` 執行 `tsc -b && vite build --config vite.config.ts`，明確使用 TS 設定以避免舊 JS 設定遮蔽 Pages base；
`preview` 執行 `vite preview --config vite.config.ts`，以同一份 TS 設定預覽已建置輸出。使用 Vite 終端實際印出的 URL，不假定 port。Pages base
維持 `/schedule/`。`npm test` 可啟動 Vitest watch mode；沒有 lint / format script。
這些是可用命令，不代表每次文件更新都已執行完整套件或部署。

主要入口為 `src/main.tsx`；domain / commands / selectors 在 `src/domain`、
`src/application`；目前整合行為由 `src/legacy/characterization` 的測試記錄。
Fixture ownership 與開發資料界線見 [V2 Development Fixture Contract](src/fixtures/v2/README.md)。
