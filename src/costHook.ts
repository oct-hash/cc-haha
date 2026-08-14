import { useEffect } from 'react'
import { formatTotalCost, saveCurrentSessionCosts } from './cost-tracker.js'
import { hasConsoleBillingAccess } from './utils/billing.js'
import type { FpsMetrics } from './utils/fpsTracker.js'

export function useCostSummary(getFpsMetrics?: () => FpsMetrics | undefined): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally omitted dependency (mount-once effect / unstable callback identity)
  useEffect(() => {
    const f = () => {
      if (hasConsoleBillingAccess()) {
        process.stdout.write(`\n${formatTotalCost()}\n`)
      }

      saveCurrentSessionCosts(getFpsMetrics?.())
    }
    process.on('exit', f)
    return () => {
      process.off('exit', f)
    }
  }, [])
}
