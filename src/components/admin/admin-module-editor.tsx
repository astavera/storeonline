"use client";

import { CalendarClock, Eye, Rocket, Save, Undo2 } from "lucide-react";
import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { AdminControlField, AdminFieldValue, AdminModule, AdminWorkflowAction } from "@/config/admin-control-plane";

type AdminModuleEditorProps = {
  module: AdminModule;
};

type SubmitState =
  | {
      status: "idle";
      message: string;
      details?: string;
    }
  | {
      status: "success" | "error";
      message: string;
      details?: string;
    };

const actionLabels: Record<AdminWorkflowAction, string> = {
  save_draft: "Save draft",
  preview: "Preview",
  publish: "Publish",
  schedule: "Schedule",
  unpublish: "Unpublish"
};

const actionIcons: Record<AdminWorkflowAction, typeof Save> = {
  save_draft: Save,
  preview: Eye,
  publish: Rocket,
  schedule: CalendarClock,
  unpublish: Undo2
};

export function AdminModuleEditor({ module }: AdminModuleEditorProps) {
  const initialValues = useMemo(() => buildInitialValues(module.editableFields), [module.editableFields]);
  const [values, setValues] = useState<Record<string, AdminFieldValue>>(initialValues);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle", message: "Ready for controlled production edits." });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitOperation(operation: AdminWorkflowAction) {
    setIsSubmitting(true);
    setSubmitState({ status: "idle", message: "Validating controlled fields..." });

    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          moduleId: module.id,
          operation,
          values
        })
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        setSubmitState({
          status: "error",
          message: "This edit needs attention.",
          details: Array.isArray(result.errors) ? result.errors.join(" ") : "Validation failed."
        });
        return;
      }

      setSubmitState({
        status: "success",
        message: `${actionLabels[operation]} accepted for ${module.title}.`,
        details: result.storage?.message ?? "Validated and ready for persistence."
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message: "The admin API did not respond.",
        details: error instanceof Error ? error.message : "Unknown error."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateField(field: AdminControlField, value: AdminFieldValue) {
    setValues((current) => ({
      ...current,
      [field.name]: value
    }));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]" data-admin-module={module.id}>
      <div className="min-w-0">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-secondary">{module.category}</p>
            <h1 className="mt-2 font-display text-3xl font-semibold">{module.title}</h1>
            <p className="mt-3 max-w-3xl text-secondary">{module.purpose}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.08em]">
            <span className="rounded-md border border-border bg-surface-muted px-3 py-2">{module.riskLevel} risk</span>
            <span className="rounded-md border border-border bg-surface-muted px-3 py-2">{module.editableFields.length} fields</span>
          </div>
        </div>

        <div className="mt-6 border-b border-border pb-5">
          <p className="text-sm font-semibold">Production goal</p>
          <p className="mt-2 text-sm text-secondary">{module.productionGoal}</p>
        </div>

        <form className="mt-6 grid gap-5" onSubmit={(event) => event.preventDefault()}>
          {module.editableFields.map((field) => (
            <FieldControl field={field} key={field.name} onChange={updateField} value={values[field.name]} />
          ))}
        </form>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">
          {module.workflowActions.map((action) => {
            const Icon = actionIcons[action];
            return (
              <Button className="gap-2" disabled={isSubmitting} key={action} onClick={() => submitOperation(action)} type="button" variant={action === "publish" ? "primary" : "secondary"}>
                <Icon aria-hidden="true" size={16} />
                {actionLabels[action]}
              </Button>
            );
          })}
        </div>

        <div
          className={`mt-5 rounded-md border px-4 py-3 text-sm ${
            submitState.status === "error"
              ? "border-red-200 bg-red-50 text-red-900"
              : submitState.status === "success"
                ? "border-green-200 bg-green-50 text-green-900"
                : "border-border bg-surface-muted text-secondary"
          }`}
          role="status"
        >
          <p className="font-semibold">{submitState.message}</p>
          {submitState.details ? <p className="mt-1">{submitState.details}</p> : null}
        </div>
      </div>

      <aside className="grid content-start gap-4">
        <InfoPanel title="Connected data">
          {module.connectedModels.map((model) => (
            <span className="rounded-md border border-border bg-surface px-3 py-2 text-sm" key={model}>
              {model}
            </span>
          ))}
        </InfoPanel>
        <InfoPanel title="Allowed roles">
          {module.ownerRoles.map((role) => (
            <span className="rounded-md border border-border bg-surface px-3 py-2 text-sm" key={role}>
              {role}
            </span>
          ))}
        </InfoPanel>
        <InfoPanel title="Guardrails">
          {module.guardrails.map((guardrail) => (
            <p className="text-sm text-secondary" key={guardrail}>
              {guardrail}
            </p>
          ))}
        </InfoPanel>
        <InfoPanel title="Production checklist">
          {module.productionChecklist.map((item) => (
            <label className="flex items-start gap-2 text-sm text-secondary" key={item}>
              <input className="mt-1 h-4 w-4 rounded border-border" type="checkbox" />
              <span>{item}</span>
            </label>
          ))}
        </InfoPanel>
      </aside>
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange
}: {
  field: AdminControlField;
  value: AdminFieldValue | undefined;
  onChange: (field: AdminControlField, value: AdminFieldValue) => void;
}) {
  const id = `admin-field-${field.name}`;
  const sharedClasses = "mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-primary outline-none transition focus:border-primary";

  function handleTextChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    onChange(field, event.target.value);
  }

  return (
    <label className="block rounded-md border border-border bg-surface-muted p-4" htmlFor={id}>
      <span className="flex flex-wrap items-center gap-2 font-semibold">
        {field.label}
        {field.required ? <span className="text-xs uppercase tracking-[0.08em] text-secondary">Required</span> : null}
      </span>
      <span className="mt-1 block text-sm text-secondary">{field.helpText}</span>
      {renderInput(field, id, value, sharedClasses, handleTextChange, onChange)}
    </label>
  );
}

function renderInput(
  field: AdminControlField,
  id: string,
  value: AdminFieldValue | undefined,
  sharedClasses: string,
  handleTextChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void,
  onChange: (field: AdminControlField, value: AdminFieldValue) => void
) {
  if (field.type === "textarea" || field.type === "json" || field.type === "list") {
    return <textarea className={sharedClasses} id={id} onChange={handleTextChange} rows={field.type === "textarea" ? 4 : 5} value={formatInputValue(value)} />;
  }

  if (field.type === "select") {
    return (
      <select className={sharedClasses} id={id} onChange={handleTextChange} value={formatInputValue(value)}>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "boolean") {
    return (
      <span className="mt-3 flex items-center gap-3 text-sm text-secondary">
        <input checked={Boolean(value)} className="h-5 w-5 rounded border-border" id={id} onChange={(event) => onChange(field, event.target.checked)} type="checkbox" />
        Enabled
      </span>
    );
  }

  const inputType = field.type === "datetime" ? "datetime-local" : field.type === "number" ? "number" : "text";

  return <input className={sharedClasses} id={id} onChange={handleTextChange} type={inputType} value={formatInputValue(value)} />;
}

function InfoPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface-muted p-4">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3 grid gap-2">{children}</div>
    </section>
  );
}

function buildInitialValues(fields: AdminControlField[]) {
  return fields.reduce<Record<string, AdminFieldValue>>((values, field) => {
    values[field.name] = field.defaultValue ?? (field.type === "boolean" ? false : "");
    return values;
  }, {});
}

function formatInputValue(value: AdminFieldValue | undefined) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value === undefined ? "" : String(value);
}
