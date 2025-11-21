import { createActorHook } from 'ic-use-actor';
import { _SERVICE } from '@declarations/mines_backend/mines_backend.did';
import { idlFactory } from '@declarations/mines_backend/mines_backend.did.js';

// NOTE: Despite the name "useMinesActor", this canister now serves Plinko V2 (Motoko)
// The canister ID 'wvrcw-3aaaa-aaaah-arm4a-cai' was repurposed from Mines to Plinko V2 in PR #72
const canisterId = 'wvrcw-3aaaa-aaaah-arm4a-cai';

const useMinesActor = createActorHook<_SERVICE>({
  canisterId,
  idlFactory,
});

export default useMinesActor;
