import { AppError } from "@/lib/errors"
import type { WorkflowDefinition } from "@/lib/workflows/types"

const workflows = new Map<string, WorkflowDefinition>()

export function registerWorkflow(definition: WorkflowDefinition): void {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(definition.id)) {
    throw new AppError(
      "invalid_workflow",
      "Workflow ids use lowercase words separated by dots, such as invoices.collect.",
    )
  }
  if (workflows.has(definition.id)) {
    throw new AppError("invalid_workflow", `Workflow ${definition.id} is already registered.`)
  }
  if (definition.steps.length === 0) {
    throw new AppError("invalid_workflow", "A workflow needs at least one step.")
  }

  const seen = new Set<string>()
  for (const step of definition.steps) {
    if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(step.id)) {
      throw new AppError("invalid_workflow", `Step id ${step.id} is invalid.`)
    }
    if (seen.has(step.id)) {
      throw new AppError("invalid_workflow", `Step ${step.id} is duplicated.`)
    }
    seen.add(step.id)
  }

  workflows.set(definition.id, definition)
}

export function getWorkflow(id: string): WorkflowDefinition {
  const workflow = workflows.get(id)
  if (!workflow) {
    throw new AppError("workflow_not_found", `Workflow ${id} is not registered.`, 404)
  }
  return workflow
}

export function clearWorkflows(): void {
  workflows.clear()
}
