import React from "react";
import {
  filterProjectReferenceOptions,
  type ProjectReferenceOption,
} from "./application/selectors/projectReferenceOptions";
import type { CatalogItem } from "./domain/reference-data/catalog";
import {
  toCatalogItemId,
  type CatalogItemId,
  type ProjectId,
} from "./domain/shared/ids";
import type { CatalogSelection, ProjectSelection } from "./projectMasterForm";

export interface ProjectFieldInputProps {
  readonly error?: string;
  readonly inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}

export function ProjectFieldInput({
  error,
  inputMode,
  label,
  onChange,
  value,
}: ProjectFieldInputProps): React.ReactElement {
  return (
    <label className="grid gap-1 text-sm md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
      <span>{label}</span>
      <span className="grid min-w-0 gap-1">
        <input
          aria-label={label}
          className="min-w-0 rounded-md border border-slate-300 px-3 py-2"
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
          type="text"
          value={value}
        />
        {error !== undefined && <span className="text-xs text-rose-700">{error}</span>}
      </span>
    </label>
  );
}

export interface ProjectCatalogSelectProps {
  readonly compact?: boolean;
  readonly emptyLabel: string;
  readonly error?: string;
  readonly label: string;
  readonly onChange: (value: CatalogSelection) => void;
  readonly options: readonly CatalogItem<CatalogItemId>[];
  readonly value: CatalogSelection;
}

export function ProjectCatalogSelect({
  compact = false,
  emptyLabel,
  error,
  label,
  onChange,
  options,
  value,
}: ProjectCatalogSelectProps): React.ReactElement {
  const hasResolvedValue = value === "" || options.some((option) => option.id === value);
  const select = (
    <select
      aria-label={compact ? label : undefined}
      className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2"
      onChange={(event) => onChange(
        event.target.value === "" ? "" : toCatalogItemId(event.target.value),
      )}
      value={value}
    >
      <option value="">{emptyLabel}</option>
      {!hasResolvedValue && <option value={value}>Unavailable Material</option>}
      {options.map((option) => (
        <option key={option.id} value={option.id}>{option.displayName}</option>
      ))}
    </select>
  );

  if (compact) {
    return (
      <span className="grid min-w-0 gap-1">
        {select}
        {error !== undefined && <span className="text-xs text-rose-700">{error}</span>}
      </span>
    );
  }

  return (
    <label className="grid gap-1 text-sm md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
      <span>{label}</span>
      <span className="grid min-w-0 gap-1">
        {select}
        {error !== undefined && <span className="text-xs text-rose-700">{error}</span>}
      </span>
    </label>
  );
}

export interface ProjectReferencePickerProps {
  readonly currentProjectId: ProjectId;
  readonly label: string;
  readonly onChange: (value: ProjectSelection) => void;
  readonly options: readonly ProjectReferenceOption[];
  readonly value: ProjectSelection;
}

function filteredReferenceOptions(
  options: readonly ProjectReferenceOption[],
  query: string,
): readonly ProjectReferenceOption[] {
  return query.trim().split(/\s+/).filter(Boolean).reduce(
    (matches, token) => filterProjectReferenceOptions(matches, token),
    options,
  );
}

export function ProjectReferencePicker({
  currentProjectId,
  label,
  onChange,
  options,
  value,
}: ProjectReferencePickerProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const generatedId = React.useId().replaceAll(":", "");
  const listboxId = `project-reference-options-${generatedId}`;
  const labelId = `project-reference-label-${generatedId}`;
  const filtered = filteredReferenceOptions(options, query);
  const choices: readonly ({ readonly kind: "clear" } | {
    readonly kind: "project";
    readonly option: ProjectReferenceOption;
  })[] = [
    { kind: "clear" },
    ...filtered.map((option) => ({ kind: "project" as const, option })),
  ];
  const selected = value === ""
    ? undefined
    : options.find(({ projectId }) => projectId === value);
  const selectedLabel = value === ""
    ? "Not specified"
    : selected === undefined
      ? "Unavailable Project"
      : selected.projectId === currentProjectId
        ? `Current Project (New Design) · ${selected.displayLabel}`
        : selected.displayLabel;

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const openPicker = (): void => {
    setOpen(true);
    setQuery("");
    setActiveIndex(-1);
  };
  const closePicker = (restoreFocus: boolean): void => {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const choose = (choice: (typeof choices)[number]): void => {
    onChange(choice.kind === "clear" ? "" : choice.option.projectId);
    closePicker(true);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePicker(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, choices.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const choice = choices[activeIndex];
      if (choice !== undefined) choose(choice);
    }
  };

  return (
    <div className="grid min-w-0 gap-1">
      <span className="sr-only" id={labelId}>{label}</span>
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={`${labelId} ${labelId}-value`}
        className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm"
        onClick={() => open ? closePicker(false) : openPicker()}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            openPicker();
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="min-w-0 truncate" id={`${labelId}-value`}>{selectedLabel}</span>
        <span aria-hidden="true" className="shrink-0 text-slate-500">▾</span>
      </button>

      {open && (
        <div className="mt-1 grid min-w-0 gap-1 rounded-md border border-slate-300 bg-white p-2 shadow-sm">
          <input
            aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
            aria-controls={listboxId}
            aria-expanded="true"
            aria-label={`Search ${label}`}
            className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search by year, STN Project Name, or QCI Model Name"
            ref={inputRef}
            role="combobox"
            type="search"
            value={query}
          />
          <div
            aria-label={`${label} options`}
            className="max-h-56 overflow-y-auto rounded-md border border-slate-200 p-1"
            id={listboxId}
            role="listbox"
          >
            {choices.map((choice, index) => {
              const choiceValue = choice.kind === "clear" ? "" : choice.option.projectId;
              const choiceLabel = choice.kind === "clear"
                ? "Not specified"
                : choice.option.projectId === currentProjectId
                  ? `Current Project (New Design) · ${choice.option.displayLabel}`
                  : choice.option.displayLabel;
              return (
                <button
                  aria-selected={value === choiceValue}
                  className={`block w-full rounded px-2 py-2 text-left text-sm ${
                    activeIndex === index ? "bg-slate-100" : "hover:bg-slate-50"
                  }`}
                  id={`${listboxId}-${index}`}
                  key={choice.kind === "clear" ? "clear" : choice.option.projectId}
                  onClick={() => choose(choice)}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                  tabIndex={-1}
                  type="button"
                >
                  {choiceLabel}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-sm text-slate-500">No matching Projects</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
