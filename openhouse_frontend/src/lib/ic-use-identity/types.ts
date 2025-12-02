import type { Identity } from "@dfinity/agent";
import type { IdentityProviderConfig } from "./config/identityProviders";

export type Status = "initializing" | "idle" | "authenticating" | "success" | "error";

export interface IdentityContext {
  clear: () => Promise<void>;
  error?: Error;
  status: Status;
  identity?: Identity;
}

export interface InternetIdentityContext {
  login: (loginOptions?: LoginOptions, providerConfig?: IdentityProviderConfig) => void;
}

export interface LoginOptions {
  identityProvider?: string;
  maxTimeToLive?: bigint;
  windowOpenerFeatures?: string;
}
