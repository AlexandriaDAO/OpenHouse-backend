import type { AuthClientLoginOptions } from "@dfinity/auth-client";
import { DelegationIdentity, isDelegationValid } from "@dfinity/identity";
import { store } from "../store";
import { setError, setIdentity } from "../store/mutators";
import type { InternetIdentityContext, LoginOptions } from "../types";
import { type IdentityProviderConfig, DEFAULT_PROVIDER, setPreferredProvider } from "../config/identityProviders";

const ONE_HOUR_IN_NANOSECONDS = BigInt(3_600_000_000_000);

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
