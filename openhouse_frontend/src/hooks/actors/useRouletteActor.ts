import { createActorHook } from 'ic-use-actor';
import { _SERVICE } from '@declarations/roulette_backend/roulette_backend.did';
import { idlFactory } from '@declarations/roulette_backend/roulette_backend.did.js';

// Hardcoded canister ID from dfx.json
const canisterId = 'wvrcw-3aaaa-aaaah-arm4a-cai';

const useRouletteActor = createActorHook<_SERVICE>({
  canisterId,
  idlFactory,
});

export default useRouletteActor;
