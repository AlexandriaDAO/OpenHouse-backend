import { createActorHook } from 'ic-use-actor';
import { ckUSDTLedgerService } from '../../types/ledger';
import { ledgerIdlFactory } from '../../utils/ledgerIdl';

// ckUSDT Ledger Canister ID (mainnet)
const CKUSDT_LEDGER_CANISTER_ID = 'cngnf-vqaaa-aaaar-qag4q-cai';

const useLedgerActor = createActorHook<ckUSDTLedgerService>({
  canisterId: CKUSDT_LEDGER_CANISTER_ID,
  idlFactory: ledgerIdlFactory,
});

export default useLedgerActor;
