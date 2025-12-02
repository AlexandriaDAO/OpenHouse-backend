# 🤖 AUTONOMOUS PR ORCHESTRATOR - DO NOT SKIP

**You are an autonomous PR orchestrator. Your ONLY job is to implement this plan and create a PR.**

## Isolation Check (RUN FIRST)
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ "$REPO_ROOT" = "/home/theseus/alexandria/openhouse" ]; then
    echo "❌ FATAL: In main repo. Must be in worktree."
    echo "Worktree: /home/theseus/alexandria/openhouse-ii2"
    exit 1
fi
echo "✅ In isolated worktree: $REPO_ROOT"
```

## Your Autonomous Workflow (NO QUESTIONS ALLOWED)
1. **Verify isolation** - You must be in worktree: `/home/theseus/alexandria/openhouse-ii2`
2. **Implement feature** - Follow plan sections below
3. **Build & Deploy to Mainnet**:
   - Frontend changes only:
     ```bash
     cd openhouse_frontend
     npm run build
     cd ..
     ./deploy.sh --frontend-only
     ```

4. **Verify deployment**:
   ```bash
   # Test the live site
   echo "Visit: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io"
   echo "Test both authentication options:"
   echo "  - Internet Identity (Classic)"
   echo "  - Internet Identity 2.0 (with Google/Passkeys)"
   ```

5. **Create PR** (MANDATORY):
   ```bash
   git add .
   git commit -m "feat: add Internet Identity 2.0 authentication option

- Add dual authentication provider support (II 1.0 + II 2.0)
- Implement AuthMethodSelector component with visual provider cards
- Add configuration for identity provider selection
- Maintain backward compatibility with existing users
- Update UI with modern authentication options (passkeys, Google sign-in)

Deployed to mainnet frontend."
   git push -u origin feature/internet-identity-2
   gh pr create --title "feat: Add Internet Identity 2.0 Authentication Option" --body "Implements PLAN_INTERNET_IDENTITY_2_INTEGRATION.md

## Summary
Adds Internet Identity 2.0 as an authentication option alongside the classic Internet Identity. Users can now choose between:
- **Internet Identity (Classic)**: Traditional II with identity anchors
- **Internet Identity 2.0**: Modern II with passkeys, Google/Apple/Microsoft sign-in

## Changes
- Added AuthMethodSelector component with visual provider selection
- Added configuration support for dual identity providers
- Updated AuthButton to show provider selection on first login
- Maintained full backward compatibility with existing authenticated users

## Testing
Deployed to mainnet:
- Frontend: https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io

Test scenarios:
1. New users see provider selection screen
2. Classic II authentication flow works
3. II 2.0 authentication flow works (beta)
4. Existing authenticated users remain logged in
5. Both providers generate valid principals for game backends

## Notes
- II 2.0 is currently in beta (https://id.ai)
- Both providers use the same delegation mechanism
- No backend changes required (principal-based auth unchanged)
- Users can switch providers by logging out and back in"
   ```

6. **Iterate autonomously**:
   - FOR i=1 to 5:
     - Check review: `gh pr view --json comments`
     - Count P0 issues
     - IF P0 > 0: Fix immediately, commit, push, sleep 300s, continue
     - IF P0 = 0: Report success, EXIT
   - After 5 iterations: Escalate to human

## CRITICAL RULES
- ❌ NO questions ("should I?", "want me to?", "is it done?")
- ❌ NO skipping PR creation - it's MANDATORY
- ❌ NO stopping after implementation - create PR immediately
- ⚠️ MAINNET DEPLOYMENT: All changes go directly to production
- ✅ After sleep: IMMEDIATELY continue (no pause)
- ✅ ONLY stop at: approved, max iterations, or error

**Branch:** `feature/internet-identity-2`
**Worktree:** `/home/theseus/alexandria/openhouse-ii2`

---

# Implementation Plan: Internet Identity 2.0 Integration

## Overview

**Task Type:** NEW FEATURE (Additive)
**Scope:** Frontend authentication only
**Affected Canisters:** None (frontend-only change)
**Backend Impact:** Zero (principal-based auth unchanged)

**Goal:** Add Internet Identity 2.0 as an authentication option alongside the classic Internet Identity, giving users choice between traditional anchor-based authentication and modern passkey/social login authentication.

## Current State

### Authentication Architecture

**Files Involved:**
- `openhouse_frontend/src/lib/ic-use-identity/hooks/useInternetIdentity.ts` (lines 1-71)
  - Line 8: Hardcoded `DEFAULT_IDENTITY_PROVIDER = "https://identity.ic0.app"`
  - Line 35: Used in `login()` function options

- `openhouse_frontend/src/lib/ic-use-identity/init.tsx` (lines 1-173)
  - AuthClient initialization and delegation validation
  - No changes needed (provider-agnostic)

- `openhouse_frontend/src/providers/AuthProvider.tsx` (lines 1-51)
  - React context wrapper for authentication state
  - No changes needed (provider-agnostic)

- `openhouse_frontend/src/components/AuthButton.tsx` (lines 1-129)
  - Simple login button that calls `login()` with no parameters
  - Needs update to show provider selection UI

### Current Flow
1. User clicks login button → `login()` called with no options
2. Hardcoded II 1.0 provider (`https://identity.ic0.app`) opens
3. User authenticates with identity anchor
4. Delegation returned and validated
5. Principal extracted and used for all backend calls

### What Works Well
- Delegation validation (1-hour TTL)
- Principal-based backend authentication
- Balance tracking per principal
- Session management and auto-logout

### What Needs Change
- Single hardcoded identity provider
- No user choice for authentication method
- No support for modern II 2.0 features (passkeys, social login)

## Design Decisions

### 1. Dual Provider Support
- Keep both II 1.0 (`https://identity.ic0.app`) and II 2.0 (`https://id.ai`)
- Let users choose at login time
- Default to showing both options for new users
- Remember user's last choice (localStorage)

### 2. UI Approach
Create new component `AuthMethodSelector` that shows:
- **Card 1: Internet Identity (Classic)**
  - Icon: Classic II logo/icon
  - Description: "Secure authentication with identity anchors"
  - Button: "Login with Classic II"

- **Card 2: Internet Identity 2.0 (Beta)**
  - Icon: Modern II 2.0 logo
  - Description: "Modern auth with passkeys & Google sign-in"
  - Button: "Login with II 2.0"
  - Badge: "Beta"

### 3. Configuration Strategy
Add configuration object for identity providers:
```typescript
interface IdentityProviderConfig {
  id: string;
  name: string;
  url: string;
  description: string;
  isBeta?: boolean;
}
```

### 4. Backward Compatibility
- Existing authenticated users: No impact (already have valid delegation)
- Existing code: All delegation validation logic unchanged
- Backend: Zero changes (principal-based auth is provider-agnostic)

### 5. User Experience
**First-time login:**
1. Click login button
2. See provider selection modal
3. Choose provider (II 1.0 or II 2.0)
4. Redirected to chosen provider
5. Authenticate and return
6. Choice remembered for next time

**Returning user:**
1. Click login button
2. Automatically use last-chosen provider
3. Option to "Use different method" on login screen

## Implementation Plan

### Step 1: Create Identity Provider Configuration

**File:** `openhouse_frontend/src/lib/ic-use-identity/config/identityProviders.ts` (NEW)

```typescript
// PSEUDOCODE
export interface IdentityProviderConfig {
  id: 'classic' | 'v2';
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
    description: 'Secure authentication with identity anchors',
    isBeta: false,
    features: ['Identity Anchors', 'Device-based Keys', 'Battle-tested']
  },
  {
    id: 'v2',
    name: 'Internet Identity 2.0',
    url: 'https://id.ai',
    description: 'Modern authentication with passkeys and social login',
    isBeta: true,
    features: ['Passkeys (FIDO2)', 'Google Sign-In', 'Apple/Microsoft', 'No identity numbers']
  }
];

export const DEFAULT_PROVIDER = IDENTITY_PROVIDERS[0]; // Classic by default

// LocalStorage key for remembering user's choice
export const PROVIDER_PREFERENCE_KEY = 'openhouse_identity_provider';

export function getPreferredProvider(): IdentityProviderConfig {
  // Check localStorage for saved preference
  // Return saved provider or default
}

export function setPreferredProvider(providerId: string): void {
  // Save to localStorage
}
```

### Step 2: Update useInternetIdentity Hook

**File:** `openhouse_frontend/src/lib/ic-use-identity/hooks/useInternetIdentity.ts` (MODIFY)

```typescript
// PSEUDOCODE - Update login function signature

// REMOVE line 8: const DEFAULT_IDENTITY_PROVIDER = "https://identity.ic0.app";
// ADD import:
import { type IdentityProviderConfig, DEFAULT_PROVIDER } from '../config/identityProviders';

// MODIFY function signature (line 10):
function login(loginOptions?: LoginOptions, providerConfig?: IdentityProviderConfig): void {
  const context = store.getSnapshot().context;

  // ... existing validation code ...

  const provider = providerConfig ?? DEFAULT_PROVIDER;

  const options: AuthClientLoginOptions = {
    identityProvider: provider.url,  // CHANGE: Use config instead of hardcoded
    onSuccess: onLoginSuccess,
    onError: onLoginError,
    maxTimeToLive: ONE_HOUR_IN_NANOSECONDS,
    windowOpenerFeatures: "width=400,height=650,left=100,top=100",
    ...loginOptions,
  };

  store.send({
    type: "setState",
    status: "authenticating" as const,
    error: undefined,
  });

  void authClient.login(options);
}

// UPDATE return type (line 66):
export const useInternetIdentity = (): InternetIdentityContext => {
  return {
    login,  // Now accepts optional providerConfig
  };
};
```

### Step 3: Update Type Definitions

**File:** `openhouse_frontend/src/lib/ic-use-identity/types.ts` (MODIFY - if exists, or create)

```typescript
// PSEUDOCODE - Add provider config to context
import type { IdentityProviderConfig } from './config/identityProviders';

export interface InternetIdentityContext {
  login: (loginOptions?: LoginOptions, providerConfig?: IdentityProviderConfig) => void;
}

// Keep existing types...
```

### Step 4: Create AuthMethodSelector Component

**File:** `openhouse_frontend/src/components/AuthMethodSelector.tsx` (NEW)

```tsx
// PSEUDOCODE
import React, { useState } from 'react';
import {
  IDENTITY_PROVIDERS,
  getPreferredProvider,
  setPreferredProvider,
  type IdentityProviderConfig
} from '../lib/ic-use-identity/config/identityProviders';

interface AuthMethodSelectorProps {
  onSelect: (provider: IdentityProviderConfig) => void;
  onCancel?: () => void;
}

export const AuthMethodSelector: React.FC<AuthMethodSelectorProps> = ({
  onSelect,
  onCancel
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(
    getPreferredProvider().id
  );

  const handleSelect = (provider: IdentityProviderConfig) => {
    setPreferredProvider(provider.id);
    onSelect(provider);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Choose Authentication Method</h2>
        <p className="subtitle">Select how you want to log in to OpenHouse</p>

        <div className="provider-cards">
          {IDENTITY_PROVIDERS.map(provider => (
            <div
              key={provider.id}
              className={`provider-card ${selectedId === provider.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(provider.id)}
            >
              {/* Provider Icon/Logo */}
              <div className="provider-icon">
                {/* Use appropriate icon for each provider */}
              </div>

              {/* Provider Name with Beta Badge */}
              <div className="provider-name">
                {provider.name}
                {provider.isBeta && <span className="beta-badge">Beta</span>}
              </div>

              {/* Description */}
              <p className="provider-description">{provider.description}</p>

              {/* Features List */}
              <ul className="provider-features">
                {provider.features.map((feature, idx) => (
                  <li key={idx}>
                    <svg className="check-icon" />
                    {feature}
                  </li>
                ))}
              </ul>

              {/* Select Button */}
              <button
                className="select-button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(provider);
                }}
              >
                Login with {provider.name}
              </button>
            </div>
          ))}
        </div>

        {/* Info footer */}
        <div className="info-footer">
          <p>
            Both methods provide secure, decentralized authentication.
            Your choice will be remembered for next time.
          </p>
        </div>

        {onCancel && (
          <button className="cancel-button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
```

### Step 5: Update AuthButton Component

**File:** `openhouse_frontend/src/components/AuthButton.tsx` (MODIFY)

```tsx
// PSEUDOCODE - Add provider selection modal

// ADD imports at top:
import { AuthMethodSelector } from './AuthMethodSelector';
import { type IdentityProviderConfig, getPreferredProvider } from '../lib/ic-use-identity/config/identityProviders';

// ADD state in component (after line 9):
const [showProviderSelector, setShowProviderSelector] = useState(false);

// MODIFY login button click handler (around line 119-120):
// REPLACE:
//   onClick={login}
// WITH:
const handleLoginClick = () => {
  // Check if user has a saved preference
  const preferredProvider = getPreferredProvider();

  // If they have a preference, use it directly
  // Otherwise, show the selector
  if (preferredProvider) {
    login(undefined, preferredProvider);
  } else {
    setShowProviderSelector(true);
  }
};

const handleProviderSelect = (provider: IdentityProviderConfig) => {
  setShowProviderSelector(false);
  login(undefined, provider);
};

// UPDATE JSX return (around line 117-128):
return (
  <>
    <button
      onClick={handleLoginClick}  // CHANGED
      className="p-2 hover:bg-gray-800 rounded transition-colors"
      title="Login"
    >
      <svg className="w-6 h-6 text-gray-400 hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
      </svg>
    </button>

    {/* ADD: Provider selector modal */}
    {showProviderSelector && (
      <AuthMethodSelector
        onSelect={handleProviderSelect}
        onCancel={() => setShowProviderSelector(false)}
      />
    )}
  </>
);
```

### Step 6: Add Styling for New Components

**File:** `openhouse_frontend/src/index.css` or relevant CSS file (MODIFY)

```css
/* PSEUDOCODE - Add styles for AuthMethodSelector */

.modal-overlay {
  /* Fixed overlay covering viewport */
  /* Semi-transparent background */
  /* z-index to appear above other content */
}

.modal-content {
  /* Centered card/panel */
  /* Max width ~800px */
  /* Padding, rounded corners */
  /* Casino theme colors */
}

.provider-cards {
  /* Grid layout: 2 columns on desktop, 1 on mobile */
  /* Gap between cards */
}

.provider-card {
  /* Card styling with hover effects */
  /* Border, padding, rounded corners */
  /* Cursor pointer */
  /* Transition for smooth selection */
}

.provider-card.selected {
  /* Highlight selected card */
  /* Border color change, glow effect */
}

.beta-badge {
  /* Small badge next to provider name */
  /* Bright color (yellow/orange) */
  /* Rounded pill shape */
}

.provider-features {
  /* List styling with checkmarks */
  /* Spacing between items */
}

.check-icon {
  /* Green checkmark icon */
  /* Small size, inline with text */
}

.select-button {
  /* Primary action button */
  /* Full width within card */
  /* Casino accent color */
  /* Hover effects */
}

.info-footer {
  /* Light text, centered */
  /* Help text styling */
}
```

### Step 7: Update AuthProvider Types (if needed)

**File:** `openhouse_frontend/src/providers/AuthProvider.tsx` (VERIFY - likely no changes)

The AuthProvider should work without modification since:
- It uses `useInternetIdentity().login` which now accepts optional provider
- Identity and delegation validation is provider-agnostic
- Principal extraction works the same for both providers

**No changes needed** - just verify after implementation.

### Step 8: Add User Preference Management

**File:** `openhouse_frontend/src/lib/ic-use-identity/config/identityProviders.ts` (COMPLETE implementation)

```typescript
// PSEUDOCODE - Complete localStorage functions

export function getPreferredProvider(): IdentityProviderConfig | null {
  try {
    const savedId = localStorage.getItem(PROVIDER_PREFERENCE_KEY);
    if (!savedId) return null;

    const provider = IDENTITY_PROVIDERS.find(p => p.id === savedId);
    return provider ?? null;
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
```

### Step 9: Optional - Add Provider Switcher in Settings

**File:** `openhouse_frontend/src/components/SettingsModal.tsx` or similar (OPTIONAL)

```tsx
// PSEUDOCODE - Allow users to change provider preference

import { IDENTITY_PROVIDERS, clearPreferredProvider } from '../lib/ic-use-identity/config/identityProviders';

export const SettingsModal: React.FC = () => {
  // ... existing settings ...

  const handleClearProviderPreference = () => {
    clearPreferredProvider();
    // Show success message
    // User will see provider selector on next login
  };

  return (
    <div className="settings-modal">
      {/* ... existing settings ... */}

      <div className="setting-group">
        <h3>Authentication Method</h3>
        <p>Choose which identity provider to use for login</p>
        <button onClick={handleClearProviderPreference}>
          Reset Provider Preference
        </button>
        <p className="help-text">
          This will let you choose a different authentication method on your next login
        </p>
      </div>
    </div>
  );
};
```

## File Tree Changes

### New Files
```
openhouse_frontend/
  src/
    lib/
      ic-use-identity/
        config/
          identityProviders.ts (NEW - ~100 lines)
    components/
      AuthMethodSelector.tsx (NEW - ~150 lines)
```

### Modified Files
```
openhouse_frontend/
  src/
    lib/
      ic-use-identity/
        hooks/
          useInternetIdentity.ts (MODIFY - add provider param)
        types.ts (MODIFY - update interface)
    components/
      AuthButton.tsx (MODIFY - add selector modal)
    index.css (MODIFY - add modal styles)
```

### Total Impact
- **New files:** 2
- **Modified files:** 4-5
- **Lines added:** ~300
- **Lines removed:** ~5
- **Backend changes:** 0

## Testing Strategy

### Manual Testing Checklist

**Pre-deployment (Build Check):**
```bash
cd openhouse_frontend
npm run build
# Verify no TypeScript errors
# Verify build completes successfully
```

**Post-deployment (Mainnet):**

1. **First-time login flow:**
   - [ ] Visit https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io
   - [ ] Click login button
   - [ ] Verify provider selector modal appears
   - [ ] Verify both providers listed with correct info
   - [ ] Select "Internet Identity (Classic)"
   - [ ] Verify redirects to https://identity.ic0.app
   - [ ] Complete authentication
   - [ ] Verify successful login with principal displayed

2. **II 2.0 authentication flow:**
   - [ ] Logout
   - [ ] Click login button
   - [ ] Select "Internet Identity 2.0"
   - [ ] Verify redirects to https://id.ai
   - [ ] Complete authentication (try Google sign-in if available)
   - [ ] Verify successful login with principal displayed

3. **Provider preference persistence:**
   - [ ] Logout
   - [ ] Click login button
   - [ ] Verify last-used provider is pre-selected or auto-used
   - [ ] Complete login
   - [ ] Verify works without re-showing selector

4. **Existing user compatibility:**
   - [ ] Login with existing account
   - [ ] Verify no disruption to existing authenticated session
   - [ ] Verify balance and game state preserved

5. **Game functionality:**
   - [ ] After II 2.0 login, deposit funds
   - [ ] Play a game (Dice/Plinko/Crash)
   - [ ] Verify backend accepts principal from II 2.0
   - [ ] Verify balance updates correctly

6. **Error handling:**
   - [ ] Cancel provider selector → verify can retry
   - [ ] Cancel authentication at provider → verify returns to OpenHouse
   - [ ] Test delegation expiry after 1 hour

### Integration Points to Verify

- [ ] Principal format identical between providers
- [ ] Delegation validation works for both providers
- [ ] Backend canisters accept principals from both providers
- [ ] Balance tracking works across provider switches
- [ ] Logout clears delegation for both providers

## Deployment Notes

### Build Process
```bash
cd openhouse_frontend
npm run build
cd ..
```

### Deploy Command
```bash
./deploy.sh --frontend-only
```

### Affected Canisters
- **Frontend:** `pezw3-laaaa-aaaal-qssoa-cai` (MODIFIED)
- **Backends:** None (no changes)

### Rollback Plan
If issues arise:
1. Revert commit in feature branch
2. Rebuild frontend: `cd openhouse_frontend && npm run build`
3. Redeploy: `./deploy.sh --frontend-only`
4. Original single-provider flow restored

### Performance Impact
- **Bundle size:** +~10KB (new components and config)
- **Load time:** No impact (modal lazy-loaded on login click)
- **Runtime:** No impact (same authentication flow)

## Security Considerations

### ✅ Safe Aspects
- Both providers use same delegation mechanism
- Principal extraction is provider-agnostic
- Backend validation unchanged (IC-level signature verification)
- No new attack vectors introduced
- LocalStorage only stores preference string (no secrets)

### ⚠️ Considerations
- **II 2.0 Beta Status:** Currently in beta, not production-ready per DFINITY
  - Mitigation: Clearly mark as "Beta" in UI
  - Mitigation: Keep classic II as default

- **Provider URL Trust:** Both URLs must be correct
  - Mitigation: Hardcoded in config (not user-input)
  - Mitigation: Use HTTPS only

- **Cross-Provider Sessions:** User might authenticate with both
  - Mitigation: Last login wins (only one delegation active)
  - Mitigation: Different principals = different balances (isolated)

### 🔒 Best Practices Applied
- No secrets in localStorage
- Provider URLs hardcoded and immutable
- Delegation validation unchanged (1-hour TTL)
- No new privileged operations
- Same security model as existing auth

## Success Criteria

### Must Have (P0)
- [ ] Users can choose between II 1.0 and II 2.0
- [ ] Both providers successfully authenticate
- [ ] Principals work with all game backends
- [ ] Provider preference persists across sessions
- [ ] Existing authenticated users unaffected
- [ ] No TypeScript build errors
- [ ] Frontend deploys successfully to mainnet

### Should Have (P1)
- [ ] Visual distinction between providers clear
- [ ] Beta badge visible for II 2.0
- [ ] Modal styling matches casino theme
- [ ] Mobile-responsive provider selector
- [ ] Smooth animations/transitions

### Nice to Have (P2)
- [ ] Provider switcher in settings
- [ ] Analytics on provider usage
- [ ] Tooltips explaining provider differences
- [ ] Quick provider comparison table

## Open Questions / Future Work

1. **When II 2.0 exits beta:**
   - Should II 2.0 become the default?
   - Should we deprecate II 1.0?
   - Update: Monitor DFINITY announcement, plan migration

2. **Multi-provider sessions:**
   - Should we support users having multiple identities?
   - Current: No, last login wins
   - Future: Could add account switcher

3. **Provider analytics:**
   - Track which provider users prefer
   - A/B test default provider
   - Future: Add telemetry (privacy-preserving)

4. **Additional providers:**
   - NFID support?
   - Plug wallet?
   - Stoic wallet?
   - Future: Extensible provider system

## References

### Documentation
- [Internet Identity 2.0 Overview](https://medium.com/dfinity/internet-identity-2-0-the-new-user-experience-cf04243e8c32)
- [Integrating Internet Identity](https://internetcomputer.org/docs/building-apps/authentication/integrate-internet-identity)
- [II 2.0 Beta Docs](https://identitysupport.dfinity.org/hc/en-us/articles/39593373981588-Internet-Identity-2-0)

### Codebase References
- Current auth implementation: `openhouse_frontend/src/lib/ic-use-identity/`
- AuthClient docs: `@dfinity/auth-client` package
- Delegation validation: `@dfinity/identity` package

### Related Issues
- Feature request: Support modern authentication methods
- User feedback: Onboarding friction with identity anchors
- Future: Multi-wallet support

---

## Implementation Checklist

When implementing this plan:

- [ ] Verify worktree isolation
- [ ] Create `identityProviders.ts` config file
- [ ] Update `useInternetIdentity.ts` hook
- [ ] Update type definitions
- [ ] Create `AuthMethodSelector.tsx` component
- [ ] Update `AuthButton.tsx` component
- [ ] Add modal styling to CSS
- [ ] Test TypeScript compilation
- [ ] Build frontend (`npm run build`)
- [ ] Deploy to mainnet (`./deploy.sh --frontend-only`)
- [ ] Test both providers on live site
- [ ] Verify game functionality with II 2.0 principals
- [ ] Create commit with descriptive message
- [ ] Push to feature branch
- [ ] Create PR with detailed description
- [ ] Monitor for feedback and iterate

---

**END OF PLAN**

🎯 **Next Step:** Execute this plan autonomously, deploy to mainnet, and create PR.
