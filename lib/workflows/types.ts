export type WorkflowState = Record<string, unknown>

export type StepContext = {
  runId: string
  tenantId: string
  userId: string
  input: unknown
  state: WorkflowState
}

export type StepResult = {
  state?: WorkflowState
  output?: unknown
}

export type WorkflowStep = {
  id: string
  run: (context: StepContext) => Promise<StepResult>
}

export type WorkflowDefinition = {
  id: string
  steps: readonly WorkflowStep[]
}
