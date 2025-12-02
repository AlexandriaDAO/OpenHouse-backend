export interface IdentityProviderConfig {
  id: string;
  name: string;
  url: string;
  description: string;
  isBeta: boolean;
  features: string[];
}

export const IDENTITY_PROVIDERS: IdentityProviderConfig[] = [
  {
    id: 'classic',
    name: 'Internet Identity',
    url: 'https://identity.ic0.app',
    description: 'Classic identity anchors',
    isBeta: false,
    features: []
  },
  {
    id: 'v2',
    name: 'Internet Identity 2.0',
    url: 'https://id.ai',
    description: 'Sign in with Google, Microsoft, or Apple',
    isBeta: true,
    features: []
  }
];

export const DEFAULT_PROVIDER = IDENTITY_PROVIDERS[0];

// LocalStorage key for remembering user's choice
export const PROVIDER_PREFERENCE_KEY = 'openhouse_identity_provider';

/**
 * Retrieves the user's preferred identity provider from localStorage.
 * @returns The saved provider config, or null if none exists or is invalid
 */
export function getPreferredProvider(): IdentityProviderConfig | null {
  try {
    const savedId = localStorage.getItem(PROVIDER_PREFERENCE_KEY);
    if (!savedId) return null;

    const provider = IDENTITY_PROVIDERS.find(p => p.id === savedId);
    
    if (!provider) {
      // Clear invalid preference
      localStorage.removeItem(PROVIDER_PREFERENCE_KEY);
      return null;
    }

    return provider;
  } catch (error) {
    console.error('Failed to get preferred provider:', error);
    return null;
  }
}

export function setPreferredProvider(providerId: string): void {
  try {
    localStorage.setItem(PROVIDER_PREFERENCE_KEY, providerId);
  } catch (error) {
    console.error('Failed to save provider preference:', error);
  }
}

export function clearPreferredProvider(): void {
  try {
    localStorage.removeItem(PROVIDER_PREFERENCE_KEY);
  } catch (error) {
    console.error('Failed to clear provider preference:', error);
  }
}
