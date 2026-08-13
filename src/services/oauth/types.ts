export type SubscriptionType = 'free' | 'pro' | 'team' | 'enterprise' | null

export type RateLimitTier = 'standard' | 'high' | null

export type OAuthProfileResponse = {
  account?: {
    uuid: string
    email_address: string
    organization?: {
      uuid: string
    }
  }
  subscription_type?: string
  rate_limit_tier?: string
}

export type OAuthResponseAccount = {
  uuid: string
  emailAddress: string
  organizationUuid?: string
}

export type OAuthTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
  subscriptionType: SubscriptionType
  rateLimitTier: RateLimitTier
  profile?: OAuthProfileResponse
  tokenAccount?: OAuthResponseAccount
}

export type OAuthTokenExchangeResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  account?: {
    uuid: string
    email_address: string
    organization?: {
      uuid: string
    }
  }
}

export type ReferralRedemptionsResponse = {
  redemptions: unknown[]
}

export type ReferrerRewardInfo = {
  rewardInfo: unknown
}
