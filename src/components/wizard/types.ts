import type { ReactNode } from 'react'

export type WizardStepComponent<T = unknown> = (props: {
  data: T
  updateData: (data: Partial<T>) => void
  onNext: () => void
  onPrev: () => void
}) => ReactNode

export type WizardContextValue = {
  currentStep: number
  totalSteps: number
  goNext: () => void
  goPrev: () => void
  data: Record<string, unknown>
  updateData: (data: Record<string, unknown>) => void
}

export type WizardProviderProps = {
  steps: WizardStepComponent[]
  children: ReactNode
  onComplete?: (data: Record<string, unknown>) => void
}
