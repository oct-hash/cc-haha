import { useAutoModeUnavailableNotification } from 'src/hooks/notifs/useAutoModeUnavailableNotification.js'
import { useCanSwitchToExistingSubscription } from 'src/hooks/notifs/useCanSwitchToExistingSubscription.js'
import { useDeprecationWarningNotification } from 'src/hooks/notifs/useDeprecationWarningNotification.js'
import { useFastModeNotification } from 'src/hooks/notifs/useFastModeNotification.js'
import { useIDEStatusIndicator } from 'src/hooks/notifs/useIDEStatusIndicator.js'
import { useInstallMessages } from 'src/hooks/notifs/useInstallMessages.js'
import { useLspInitializationNotification } from 'src/hooks/notifs/useLspInitializationNotification.js'
import { useMcpConnectivityStatus } from 'src/hooks/notifs/useMcpConnectivityStatus.js'
import { useModelMigrationNotifications } from 'src/hooks/notifs/useModelMigrationNotifications.js'
import { useNpmDeprecationNotification } from 'src/hooks/notifs/useNpmDeprecationNotification.js'
import { usePluginAutoupdateNotification } from 'src/hooks/notifs/usePluginAutoupdateNotification.js'
import { usePluginInstallationStatus } from 'src/hooks/notifs/usePluginInstallationStatus.js'
import { useRateLimitWarningNotification } from 'src/hooks/notifs/useRateLimitWarningNotification.js'
import { useSettingsErrors } from 'src/hooks/notifs/useSettingsErrors.js'
import { useTeammateLifecycleNotification } from 'src/hooks/notifs/useTeammateShutdownNotification.js'
import { useChromeExtensionNotification } from 'src/hooks/useChromeExtensionNotification.js'
import { useClaudeCodeHintRecommendation } from 'src/hooks/useClaudeCodeHintRecommendation.js'
import { useLspPluginRecommendation } from 'src/hooks/useLspPluginRecommendation.js'
import { useOfficialMarketplaceNotification } from 'src/hooks/useOfficialMarketplaceNotification.js'

const useAntOrgWarningNotification: any =
  process.env.USER_TYPE === 'ant'
    ? require('./notifs/useAntOrgWarningNotification.js').useAntOrgWarningNotification
    : () => {}

export function useNotificationLayer({
  mcpClients,
  mainLoopModel,
  ideSelection,
  ideInstallationStatus,
}: {
  mcpClients: any
  mainLoopModel: string
  ideSelection: any
  ideInstallationStatus: any
}) {
  useModelMigrationNotifications()
  useCanSwitchToExistingSubscription()
  useIDEStatusIndicator({
    ideSelection,
    mcpClients,
    ideInstallationStatus,
  })
  useMcpConnectivityStatus({ mcpClients })
  useAutoModeUnavailableNotification()
  usePluginInstallationStatus()
  usePluginAutoupdateNotification()
  useSettingsErrors()
  useRateLimitWarningNotification(mainLoopModel)
  useFastModeNotification()
  useDeprecationWarningNotification(mainLoopModel)
  useNpmDeprecationNotification()
  useAntOrgWarningNotification()
  useInstallMessages()
  useChromeExtensionNotification()
  useOfficialMarketplaceNotification()
  useLspInitializationNotification()
  useTeammateLifecycleNotification()
  const { recommendation: lspRecommendation, handleResponse: handleLspResponse } =
    useLspPluginRecommendation()
  const { recommendation: hintRecommendation, handleResponse: handleHintResponse } =
    useClaudeCodeHintRecommendation()

  return { lspRecommendation, handleLspResponse, hintRecommendation, handleHintResponse }
}
