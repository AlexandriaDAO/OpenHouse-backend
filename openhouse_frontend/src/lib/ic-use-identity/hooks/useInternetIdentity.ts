import type { AuthClientLoginOptions } from "@dfinity/auth-client";
import { DelegationIdentity, isDelegationValid } from "@dfinity/identity";
import { store } from "../store";
import { setError, setIdentity } from "../store/mutators";
import type { InternetIdentityContext, LoginOptions } from "../types";
import { type IdentityProviderConfig, DEFAULT_PROVIDER, setPreferredProvider } from "../config/identityProviders";

// 7 days in nanoseconds for longer session persistence
const SEVEN_DAYS_IN_NANOSECONDS = BigInt(7 * 24 * 60 * 60 * 1_000_000_000);

// Canonical origin for consistent principal derivation across all domains
const DERIVATION_ORIGIN = "https://pezw3-laaaa-aaaal-qssoa-cai.icp0.io";

function login(loginOptions?: LoginOptions, providerConfig?: IdentityProviderConfig): void {
  const context = store.getSnapshot().context;

  if (!context.providerComponentPresent) {
    setError("The IdentityProvider component is not present. Make sure to wrap your app with it.");
    return;
  }

  const authClient = context.authClient;
  if (!authClient) {
    setError("AuthClient is not initialized yet, make sure to call login on user interaction.");
    return;
  }

  const identity = authClient.getIdentity();
  if (
    !identity.getPrincipal().isAnonymous() &&
    identity instanceof DelegationIdentity &&
    isDelegationValid(identity.getDelegation())
  ) {
    setError("User is already authenticated");
    return;
  }

  const provider = providerConfig ?? DEFAULT_PROVIDER;

  const handleSuccess = () => {
    onLoginSuccess();
    setPreferredProvider(provider.id);
  };

  const options: AuthClientLoginOptions = {
    identityProvider: provider.url,
    onSuccess: handleSuccess,
    onError: onLoginError,
    maxTimeToLive: SEVEN_DAYS_IN_NANOSECONDS,
    windowOpenerFeatures: "width=400,height=650,left=100,top=100",
    derivationOrigin: DERIVATION_ORIGIN,
    ...loginOptions,
  };

  store.send({
    type: "setState",
    status: "authenticating" as const,
    error: undefined,
  });

  void authClient.login(options);
}

function onLoginSuccess(): void {
  const identity = store.getSnapshot().context.authClient?.getIdentity();
  if (!identity) {
    setError("Identity not found after successful login");
    return;
  }

  setIdentity(identity);
}

function onLoginError(error?: string): void {
  setError(error ?? "Login failed");
}

export const useInternetIdentity = (): InternetIdentityContext => {
  return {
    login,
  };
};
