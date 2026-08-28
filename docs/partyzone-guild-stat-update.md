# PartyZone guild stat refresh

`scripts/update-partyzone-guild-stats.js` refreshes only the ten characters in
the existing importer roster. Run it **on PartyZone's host**, which is permitted
to access Minibia's API. Do not run the creation importer with `--execute` for
this task: it skips existing accounts.

From `/home/zelek/partyzone`, with the production `.env` present:

```sh
node -r dotenv/config scripts/update-partyzone-guild-stats.js --plan /home/zelek/partyzone-backups/guild-stats-TIMESTAMP.json
```

The plan reads live Minibia data and PostgreSQL, prints before/after values and
writes a private snapshot. It neither changes accounts nor reads portal passwords.
Review the output before applying. All ten accounts must exist uniquely and
match the expected names/vocations. Missing API skills abort the plan.

For application, arrange a brief maintenance window: acquire `.deploying`, wait
for the watchdog lock to clear, gracefully stop **only PartyZone**, and verify
both its process and port 2530 have stopped. Back up PostgreSQL with `pg_dump`.
Then, within an hour of planning:

```sh
node -r dotenv/config scripts/update-partyzone-guild-stats.js --apply /home/zelek/partyzone-backups/guild-stats-TIMESTAMP.json --confirm-partyzone
```

The tool requires `INSTANCE_NAME=partyzone`, `USE_EMBEDDED_DB=false`, an explicit
`DATABASE_URL`, database `p1023_partyzone`, a maintenance marker and no listener
on the configured game port. It locks the ten account rows, backs up their latest
saved JSON to `SNAPSHOT.before.json` (0600, no overwrite), then applies all updates
in one transaction. Always restart PartyZone and release the maintenance marker,
including when application fails. Verify public `/health` after startup.

Updated: experience/level, configured skills, maximum HP/mana/capacity and base
speed. Current HP/mana retain their filled percentage; zero HP remains zero for
normal respawn. Free capacity is recalculated from inventory by the game on login.
Skill levels use cumulative points and are validated against the login formulas;
Minibia highscores only provide whole skill levels, not progress to the next one.
Knights retain the existing main-weapon rules (Neked: highest melee skill), ML 9
and shielding from API; mages use API magic level. Other skills stay at 15.

Unchanged: account IDs/login/passwords, items (including weapons), outfits,
positions, friends, achievements, party listening time, quest storage and other
non-stat character fields. Existing equipment is never replaced on a refresh.

Tests: `npm run test:partyzone-accounts`.
