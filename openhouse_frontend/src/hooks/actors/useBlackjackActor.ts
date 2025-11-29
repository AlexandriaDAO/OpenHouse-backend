import { createActorHook } from 'ic-use-actor';
import { _SERVICE } from '@declarations/blackjack_backend/blackjack_backend.did';
import { idlFactory } from '@declarations/blackjack_backend/blackjack_backend.did.js';

// Hardcoded canister ID from dfx.json (formerly mines_backend)
const canisterId = 'wvrcw-3aaaa-aaaah-arm4a-cai';

const useBlackjackActor = createActorHook<_SERVICE>({
  canisterId,
  idlFactory,
});

export default useBlackjackActor;
