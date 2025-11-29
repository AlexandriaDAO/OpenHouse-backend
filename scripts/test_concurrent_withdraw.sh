#!/bin/bash
echo "Starting Balance:"
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_my_balance

echo "Launching 5 concurrent withdraw_all calls..."
for i in {1..5}; do
  echo "Call $i..."
  dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai withdraw_all '()' &
done

wait
echo "All calls finished."

echo "Final Balance:"
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai get_my_balance

echo "Running Audit:"
dfx canister --network ic call whchi-hyaaa-aaaao-a4ruq-cai audit_balances
