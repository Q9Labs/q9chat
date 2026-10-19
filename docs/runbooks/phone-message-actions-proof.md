# Phone message actions proof

Use the native clients and staging setup from [phone attachments proof](phone-attachments-proof.md).
No additional native module is required. Use Node 24 and pnpm 11. Hold
the shared M4 job lock (`/tmp/q9chat-m4.lock`) for each device run and the final gate.

```sh
pnpm exec e2e run --config e2e.phone.config.ts --grep 'J5/J6:' --reporter list --trace on
pnpm exec e2e run --config e2e.android.config.ts --grep 'J5/J6:' --reporter list --trace on
```

Each journey creates two staging members and a group. It seeds more than 300
messages, opens a quote outside the loaded history, replies, edits, reacts,
checks who reacted, reports a peer message and deletes its own message. It
checks an offline edit and reconnect, then membership removal. A
second member observes the live changes. The journey then deletes its account
from Account, checks sign-out and checks the preserved message author becomes
Deleted account. It removes its own staging users after the run.

Inside the locked iOS job, uninstall the development client, reset the
simulator Keychain and reinstall before launching. Android clears the app
state before opening the development client. The journey does
not use agent-model calls.

Stop the lane's Metro, Worker, proxy and test engine on every exit. Shut down
the simulator or emulator inside the lock; preserve the shared devices.
