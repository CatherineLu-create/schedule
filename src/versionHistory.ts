export type VersionEntry<TScheduleItem, TMeta = unknown> = {
  version: string;
  schedule: TScheduleItem[];
  meta?: TMeta;
};

export type VersionHistory<TScheduleItem, TMeta = unknown> = {
  versions: VersionEntry<TScheduleItem, TMeta>[];
  selectedVersion: string;
  currentSchedule: TScheduleItem[];
  currentMeta?: TMeta;
};

export function createInitialVersionHistory<TScheduleItem>(
  schedule: TScheduleItem[],
): VersionHistory<TScheduleItem>;
export function createInitialVersionHistory<TScheduleItem, TMeta>(
  schedule: TScheduleItem[],
  meta: TMeta,
): VersionHistory<TScheduleItem, TMeta>;
export function createInitialVersionHistory<TScheduleItem, TMeta>(
  schedule: TScheduleItem[],
  meta?: TMeta,
): VersionHistory<TScheduleItem, TMeta> {
  return {
    versions: [{ version: "v1", schedule, meta }],
    selectedVersion: "v1",
    currentSchedule: schedule,
    currentMeta: meta,
  };
}

export function publishVersion<TScheduleItem>(
  history: VersionHistory<TScheduleItem>,
  schedule: TScheduleItem[],
): VersionHistory<TScheduleItem>;
export function publishVersion<TScheduleItem, TMeta>(
  history: VersionHistory<TScheduleItem, TMeta>,
  schedule: TScheduleItem[],
  meta: TMeta,
): VersionHistory<TScheduleItem, TMeta>;
export function publishVersion<TScheduleItem, TMeta>(
  history: VersionHistory<TScheduleItem, TMeta>,
  schedule: TScheduleItem[],
  meta?: TMeta,
): VersionHistory<TScheduleItem, TMeta> {
  const nextVersion = `v${history.versions.length + 1}`;
  const versions = [...history.versions, { version: nextVersion, schedule }];
  const versionWithMeta = [...history.versions, { version: nextVersion, schedule, meta }];

  return {
    versions: meta === undefined ? versions : versionWithMeta,
    selectedVersion: nextVersion,
    currentSchedule: schedule,
    currentMeta: meta,
  };
}

export function selectVersion<TScheduleItem, TMeta>(
  history: VersionHistory<TScheduleItem, TMeta>,
  version: string,
): VersionHistory<TScheduleItem, TMeta> {
  const selected = history.versions.find((entry) => entry.version === version);

  if (!selected) {
    return history;
  }

  return {
    ...history,
    selectedVersion: selected.version,
    currentSchedule: selected.schedule,
    currentMeta: selected.meta,
  };
}
