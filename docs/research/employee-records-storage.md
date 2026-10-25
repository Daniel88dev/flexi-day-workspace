# Employee records: RDS Postgres or DynamoDB

Written 2026-10-25 for fenro task T-469, a research ticket on the map T-466 "Employee records and
people directory". The owner decides in T-476 "Where employee records are stored". This file gives
the facts, the options and their monthly costs.

Facts about Flexi Day come from `flexi-day-be` on `main` as of 2026-10-25: the Terraform files,
`docs/terraform.md`, the schema and the docs named below. Non-secret values in the gitignored
`terraform/terraform.tfvars` were read to confirm that production uses the defaults. AWS prices come
from AWS's own Price List API files for `eu-central-1` (publication dates under
[Sources](#sources)), cross-checked against AWS's pricing pages where those render. Euro figures use
the ECB reference rate of 23 October 2026, 1 EUR = 1.1193 USD. AWS prices exclude VAT. Anything not
read on a primary page is marked **unverified**.

Short answer: keep employee records in the existing RDS Postgres. The directory's reads join
profiles to `employments`, `user`, groups and the visibility rules, and the sync pull, account
deletion and retention all assume one Postgres transaction and one clock. DynamoDB would cost almost
nothing in AWS fees (under €2.50 a month at 100k profiles) and needs no new network plumbing,
because App Runner already reaches AWS's public endpoints. What it costs is engineering: a second
datastore in every join, every delete, the sync pull, local development, cloud sessions and the e2e
suite. If T-477 decides the sensitive tier needs more than disk encryption, encrypt those columns in
the application with a KMS key. That adds about €0.90 to €1.70 a month at these scales.

| What                              | State on 2026-10-25                                                  |
| --------------------------------- | -------------------------------------------------------------------- |
| Database                          | RDS PostgreSQL 17, `db.t4g.micro`, Single-AZ, 20 GB gp3, encrypted   |
| Instance hours                    | Reserved, 1 year All Upfront, $104, expires 2027-10-13               |
| Current RDS bill (estimate)       | about €13.50 a month (reservation spread, storage, one public IPv4)  |
| Backend network                   | App Runner, default public egress, no VPC connector, no NAT          |
| DynamoDB in use today             | None in any Terraform file in the workspace                          |
| AWS Database Encryption SDK       | Java, .NET and Rust only, no JavaScript                              |
| Recommendation                    | RDS, with application-level column encryption if T-477 asks for it   |
| Cost change of the recommendation | about €0.90 (1k), €0.92 (10k), €1.64 (100k) a month, for the KMS key |

## What Flexi Day runs today

### The database

- `aws_db_instance.main` runs PostgreSQL 17 on `var.db_instance_class`, default `db.t4g.micro`,
  with `allocated_storage` 20 GB of gp3 and `max_allocated_storage` twice that
  (`flexi-day-be/terraform/rds.tf:10-14`, `terraform/variables.tf`). `terraform.tfvars` keeps the
  defaults: `db.t4g.micro`, 20 GB, 7-day backups, Single-AZ.
- `storage_encrypted = true` with no `kms_key_id` (`rds.tf:13`), so RDS uses its AWS managed key
  `aws/rds`, which "can't [be managed], rotate[d], or delete[d]" (RDS user guide, AWS KMS key
  management). There is no customer managed key and no KMS call anywhere in the backend.
- The instance is `publicly_accessible` (`rds.tf:27`) and its security group opens 5432 to
  `0.0.0.0/0` (`terraform/security-groups.tf`). The comment there names the protections: a random
  32-character password, `rds.force_ssl = 1` and encrypted storage.
- `docs/terraform.md` ("Before you plan") records that every secret but the two Apple `.p8` keys,
  the generated RDS password included, sits in plain text in the local `terraform.tfstate`.
- Backups: `backup_retention_period` 7 days, window 03:00-04:00, Performance Insights on with 7-day
  retention, Enhanced Monitoring every 60 seconds (`rds.tf:33-46`). Deletion protection is on in
  production.
- `docs/terraform.md` ("RDS instance class and reserved instance"): a reservation bought by hand on
  2026-10-13 covers one `db.t4g.micro` for a year. It is size-flexible inside `db.t4g`, so a move to
  `db.t4g.small` keeps it counting.

### The network

`apprunner.tf` says "Networking: default public egress. ... No VPC connector needed." AWS's App
Runner guide confirms that by default an application "can send messages to public endpoints. This
includes ... AWS services". The backend already calls SES, S3 and Secrets Manager this way. A
VPC connector would change that: "your services can't access the public internet and AWS APIs"
without a NAT gateway or VPC endpoints.

The same App Runner page now opens with "AWS App Runner is no longer open to new customers.
Existing customers can continue to use the service as normal." That does not bear on this choice,
but it bears on any future plan that rebuilds the service.

### Encryption already in the code

`src/utils/auth.ts:97` sets better-auth's `encryptOAuthTokens: true`, and
`src/utils/oauthTokens.ts` reuses better-auth's helpers to encrypt calendar tokens. That key is
derived from `BETTER_AUTH_SECRET`, which `terraform/secrets.tf:10-16` rotates every
`better_auth_rotation_days` (90) through `time_rotating`. A rotated OAuth token costs a reconnect.
A rotated HR field would be unreadable for good, so profile encryption must not reuse that secret.

### Where the directory's data would touch the rest

- **Employment** (`src/db/schema/employment-schema.ts`) is one row per person and organization,
  unique on the pair, cascading from both `organizations` and `user`. ADR 0004 makes it the roster.
  A profile hangs off it or off the user (T-471 decides which); either way it is a foreign key into
  Postgres.
- **Visibility** (`docs/attendance.md`, "Visibility"): an employee sees their own Employment, a
  group admin the Employments of that group's members, an org admin every Employment in the
  organization. These are joins over `employments`, `group_users`, `groups` and
  `organization_users`.
- **Sync pull** (`docs/sync-pull.md`): one cursor, an `updatedAt` high-water mark read once when the
  pull starts, a 60-second overlap for clock skew between the database and the server, pages fixed
  at 1000 rows across all tables in dependency order, tombstones carried as soft-deleted rows, and a
  version bump to force a snapshot when a table is added (versions 3 and 4 added `birthdays` and
  `groupEvents`). The exclusions "sit in the vacation reader's `WHERE`, never in a filter after
  it", because a short page ends the walk.
- **Account deletion** (`docs/account-deletion.md`): "One transaction, all or nothing", taking
  organization locks in id order, then the user row, then re-checking blockers under those locks.
  Employments go by cascade. Attachments are the one store outside Postgres, and their objects are
  removed after the commit, best effort. "RDS backups keep the data for their 7-day retention."
  T-467 found that this hard delete conflicts with the employer-as-controller reading; that
  belongs to T-471 and T-474, not here.
- **Retention** runs on one in-process nightly tick (`src/jobs/quotaRolloverJob.ts:42-62`, croner):
  quota rollover, then the attachment, attendance-location and attendance-ceiling sweeps. Adding a
  profile retention sweep there adds no plumbing.
- **Tests and local stacks**: the e2e suite runs against a native Postgres `testdb`, with no
  container in cloud sessions (`tools/cloud/setup.sh`). The workspace `CLAUDE.md` says cloud
  sessions run native Postgres with no Docker.

## The options in this codebase

### RDS Postgres, plain columns

Profiles become one or two Drizzle tables beside `employments`, with foreign keys and
`ON DELETE` rules like every other table.

- Joins, visibility and search are SQL in the same query, as attendance does today.
- The sync pull adds a table to the envelope and bumps the cursor version, the pattern used twice
  already.
- Account deletion and any future "end the login, keep the record" rule stay in the one
  transaction.
- Backups and point-in-time restore cover profiles with everything else: "any second during your
  retention period", latest restorable time "typically within the last five minutes" (RDS FAQ).
  Free backup storage runs "up to your account's total provisioned database storage across the
  entire region" (RDS FAQ), so 20 GB.
- e2e, the dev scenario seeding and cloud sessions need nothing new.
- Protection at rest is the disk encryption above. Anyone holding the `DATABASE` connection string,
  a dump or a restored snapshot reads every field in clear.

### RDS Postgres, sensitive columns encrypted in the application

Same tables, but the sensitive tier (home address, private phone, emergency contact, date of birth,
whatever T-473 puts there) is stored as ciphertext. Directory fields such as job title, department,
manager, start date and contract type stay plain so they can be joined, sorted and searched.

- **Shape**: envelope encryption. A customer managed KMS key wraps one data key per organization;
  the wrapped key sits in Postgres; the backend asks KMS to unwrap it on a cache miss and encrypts
  fields with AES-GCM in Node. Node's `crypto` module covers the cipher. The AWS Encryption SDK for
  JavaScript is the packaged alternative (**unverified**: not read for this ticket).
- **What it buys**: the KMS key never leaves KMS, and only the App Runner instance role gets
  `kms:Decrypt`. A leaked connection string, a dump, a snapshot or the plain-text `tfstate` then
  yields ciphertext for those fields. Every unwrap is a CloudTrail event, which lines up with the
  logging T-467 found CNIL recommends.
- **What it costs in code**: no SQL search, sort or uniqueness on encrypted fields; a decrypt step
  in every reader, the sync pull and the export; key caching; and a test KMS double for e2e and
  local stacks (a static local key works, since only the wrap step talks to KMS).
- **pgcrypto instead**: available on RDS for PostgreSQL 17 (version 1.3, RDS extension list), but
  the key travels to the server with every call. The pgcrypto docs say "all the data and passwords
  move between `pgcrypto` and client applications in clear text" and advise "If you cannot [trust
  the DBA], then better do crypto inside client application." Here it is worse: the parameter
  group logs statements slower than one second (`log_min_duration_statement = 1000`) to CloudWatch,
  and PostgreSQL's default `log_parameter_max_length = -1` "allows bind parameters to be logged in
  full", key included. Not recommended.

### DynamoDB, on-demand or provisioned

A table keyed by organization and person, holding the profile item, plus a global secondary index
on organization and `updatedAt` for the sync pull.

- **Joins and visibility**: DynamoDB has no joins. The visibility rules live in Postgres
  (memberships, admin grants, managers), so every directory read still queries Postgres for who the
  caller may see, then fetches profiles from DynamoDB by key and merges in Node. Names and avatars
  come from `user` in Postgres. Search on job title or department needs either a scan per
  organization or extra indexes.
- **Sync pull**: the cursor's position is read from the database clock once per pull. DynamoDB has
  no shared clock with Postgres, so the profile table would need its own position inside the cursor,
  its own skew allowance, and its own paging inside the fixed 1000-row page. Tombstones would be
  kept items, as the other tables keep soft-deleted rows.
- **Account deletion and erasure**: DynamoDB cannot join the Postgres transaction. The delete
  becomes two steps, Postgres then DynamoDB (or the reverse), with a retry or an outbox for the
  half that fails, the way attachments are handled today but for data rather than bytes.
- **Retention**: TTL deletes expired items "within a few days of their expiration time, without
  consuming write throughput", and the deletes appear in DynamoDB Streams (DynamoDB TTL guide). It
  is the one event-driven piece here and it is free. Postgres gets the same result from one more
  sweep on the existing nightly tick, also free.
- **Backups**: PITR is per table, "up to 35 days of recovery points at a per second granularity",
  restoring into a new table (DynamoDB PITR guide), billed on table size. A restore of both stores
  to the same second is two independent restores with no transactional link between them.
- **Encryption at rest**: always on. The default AWS owned key is free; an AWS managed or customer
  managed key adds KMS charges (DynamoDB encryption at rest guide). This protects disks, as RDS
  storage encryption does, not against the backend's own credentials.
- **Fine-grained IAM**: `dynamodb:LeadingKeys` and `dynamodb:Attributes` restrict items and
  attributes per IAM principal, with examples built on web identity federation, where each end user
  has their own identity. Flexi Day's backend uses one App Runner instance role for every user, so
  the per-user visibility rules stay in application code either way. IAM could stop the role from
  reading an attribute at all, but the backend must read the sensitive tier for the people allowed
  to see it, so that does not help.
- **Field encryption**: the AWS Database Encryption SDK for DynamoDB exists for Java, .NET and Rust
  only. From Node it would be the same hand-built envelope encryption as the RDS option, at the same
  KMS cost.
- **Local development and tests**: DynamoDB Local needs a Java runtime, "JRE version 17.x or newer"
  for v2.6.0 and later, or Docker (DynamoDB Local guide). Cloud sessions run without Docker, and
  whether their image carries JRE 17 is **unverified**. `tools/cloud/setup.sh`, the e2e suite, CI,
  `npm run dev:scenario`, `dev:reset` and the stack scripts would all need it, or a fake that the
  e2e suite cannot trust.
- **Network**: App Runner reaches DynamoDB's public endpoint like SES and S3, so no NAT and no VPC
  endpoint. DynamoDB "does not charge for data transferred between DynamoDB and other AWS services
  within the same AWS Region" (on-demand pricing page).
- **On-demand vs provisioned**: on-demand bills per request. Provisioned bills per capacity unit
  hour and throttles above the provisioned rate unless auto scaling (target 70% by default) catches
  up. The free tier, "25 WCUs, 25 RCUs, and 25 GB of data storage ... each month on a per Region,
  per-payer account basis", applies to provisioned capacity and the Standard class, with no expiry
  stated. Nothing else in the account uses DynamoDB today, so the whole allowance would be
  available. Reserved capacity starts at 100 units, far above this load.

## Unit prices, eu-central-1

| Item                                    | Price (USD)                                                           | Source             |
| --------------------------------------- | --------------------------------------------------------------------- | ------------------ |
| RDS `db.t4g.micro` PostgreSQL Single-AZ | $0.019 per hour on demand                                             | RDS price list     |
| RDS `db.t4g.micro` reserved, 1 yr AUF   | $104 once                                                             | RDS price list     |
| RDS `db.t4g.small` PostgreSQL Single-AZ | $0.037 per hour on demand                                             | RDS price list     |
| RDS gp3 storage                         | $0.137 per GB-month                                                   | RDS price list     |
| RDS backup beyond free allocation       | $0.103 per GB-month                                                   | RDS price list     |
| Public IPv4 address                     | $0.005 per hour                                                       | VPC price list     |
| DynamoDB on-demand reads                | $0.1525 per million read request units                                | DynamoDB list      |
| DynamoDB on-demand writes               | $0.7625 per million write request units                               | DynamoDB list      |
| DynamoDB provisioned RCU                | $0.0001586 per RCU-hour beyond 25 free                                | DynamoDB list      |
| DynamoDB provisioned WCU                | $0.000793 per WCU-hour beyond 25 free                                 | DynamoDB list      |
| DynamoDB storage, Standard              | $0.306 per GB-month beyond 25 GB free                                 | DynamoDB list      |
| DynamoDB PITR                           | $0.2448 per GB-month                                                  | DynamoDB list      |
| KMS customer managed key                | $1 per month, plus $1 at each of the first two rotations, then capped | KMS page, KMS list |
| KMS symmetric requests                  | $0.03 per 10,000, 20,000 a month free                                 | KMS list, KMS page |
| AWS managed KMS keys (`aws/rds`)        | no monthly fee, requests charged                                      | KMS page           |
| Secrets Manager secret                  | $0.40 per secret-month                                                | Secrets list       |
| NAT gateway                             | $0.052 per hour and $0.052 per GB                                     | EC2 price list     |
| Interface VPC endpoint                  | $0.012 per hour per AZ, $0.01 per GB                                  | VPC price list     |
| Gateway VPC endpoint (DynamoDB, S3)     | free                                                                  | VPC pricing page   |

Reads are metered per 4 KB, writes per 1 KB. A strongly consistent read of an item up to 4 KB is
one read unit, eventually consistent half; transactional reads and writes cost double (on-demand
pricing page).

## The current RDS bill

| Line                                     | USD a month | EUR a month |
| ---------------------------------------- | ----------- | ----------- |
| Instance hours (reservation spread)      | 8.67        | 7.74        |
| 20 GB gp3                                | 2.74        | 2.45        |
| One public IPv4 address                  | 3.65        | 3.26        |
| Backups within the 20 GB free allocation | 0           | 0           |
| **Total**                                | **15.06**   | **13.45**   |

Enhanced Monitoring writes OS metrics to CloudWatch Logs, and Performance Insights with 7-day
retention is assumed free; neither was priced for this ticket (**unverified**). Without the
reservation the instance would be $13.87 a month on demand.

## Cost model

Assumptions, the same for every option so the differences stand out:

- 20 profiles per organization on average, so 50, 500 and 5,000 organizations.
- A profile item of 2 KB including encrypted fields, and a 2 KB copy in the sync index.
- 100 profile reads per profile per month (directory lists, profile pages, phone sync), strongly
  consistent, one read unit each.
- 2 profile writes per profile per month, each writing the table and the sync index.
- For provisioned capacity: reads fall in 160 working hours a month with a 3x peak, capacity sized
  for the peak at 70% utilisation, with at least one unit each for table and index.
- The sensitive-read access log (T-467's CNIL finding: log reads of the sensitive tier, keep 6-12
  months) stays in Postgres in every option: 10 logged reads per profile per month, 250 bytes a row,
  12 months kept. That is about 0.03 GB at 1k, 0.28 GB at 10k and 2.8 GB at 100k profiles.
- KMS: one data key per organization, unwrapped on a cache miss, cached up to 24 hours on each of at
  most 2 App Runner instances, so organizations × 2 × 30 requests a month.

What the assumptions give:

- **RDS storage** for profiles is about 0.002 GB, 0.02 GB and 0.2 GB. With the access log the
  directory adds about 0.03 GB, 0.3 GB and 3 GB. That costs nothing while the database fits in its
  20 GB allocation. Past that, each added GB costs €0.12 a month, and storage autoscaling stops at
  40 GB. How much of the 20 GB production uses today was not read (**unverified**).
- **RDS compute** does not change at these volumes. A move to `db.t4g.small` would come from the
  whole product's growth, not from this choice, and would cost about €12 a month on top of the
  reservation, which then covers half the instance (**unverified** arithmetic from size-flexibility,
  not a quoted figure).
- **DynamoDB on-demand**: reads plus writes plus PITR come to $0.02, $0.22 and $2.23 a month. Table
  storage is 0.004 GB, 0.04 GB and 0.38 GB, inside the 25 GB free allowance; if that allowance does
  not apply to on-demand tables (**unverified**: the page ties the free tier to provisioned
  capacity), storage adds $0.12 at 100k.
- **DynamoDB provisioned**: 2, 9 and 76 read units and 2, 2 and 6 write units. The first two fit in
  the free tier; at 100k, 51 read units above it cost $5.90 a month, plus PITR. Auto scaling would
  bring that down, and an under-provisioned table throttles.
- **KMS** for column encryption: 3,000, 30,000 and 300,000 requests a month. The key is $1; requests
  add $0, $0.03 and $0.84. Rotation adds $1 after the first year and $1 after the second, then
  stops. Keeping the data key in Secrets Manager instead would cost $0.40 a month, but then the key
  is a readable secret like the database password, which is what column encryption tries to get
  away from.

## New plumbing

| Plumbing                     | RDS as is | RDS + column encryption     | DynamoDB                                                      |
| ---------------------------- | --------- | --------------------------- | ------------------------------------------------------------- |
| NAT gateway                  | none      | none                        | none                                                          |
| VPC endpoint                 | none      | none                        | none                                                          |
| IAM                          | none      | one `apprunner_kms` policy  | one `apprunner_dynamodb` policy                               |
| Terraform                    | none      | `aws_kms_key` and alias     | `aws_dynamodb_table` with PITR, TTL, deletion protection      |
| Local and CI                 | none      | a static local key, no KMS  | DynamoDB Local (JRE 17+ or Docker) in dev, CI and cloud setup |
| Monthly cost of the plumbing | €0        | included in the KMS figures | €0                                                            |

IAM roles, policies and Terraform resources carry no AWS charge. None of the options needs NAT or a
VPC endpoint while App Runner keeps default egress.

If the backend ever moves to a VPC connector to take RDS off the public internet, every option
needs a way out to AWS APIs, because it already calls SES, S3 and Secrets Manager. A NAT gateway is
$37.96 a month (€33.91) plus $0.052 per GB; an interface endpoint in two AZs is $17.52 a month
(€15.65) per service plus $0.01 per GB. DynamoDB could use a free gateway endpoint, and KMS would
need an interface endpoint like the others. Whether App Runner's VPC connector routes through a
gateway endpoint was not read (**unverified**). That move is not part of this decision.

## Operational load

- **RDS, either form**: nothing new to monitor, migrate or back up. Drizzle migrations, the
  existing `db:migrate:prod` hand-over, the e2e suite and the dev scenario all extend as they did for
  attendance and birthdays. Column encryption adds key handling, a KMS key policy to review and one
  more thing to restore if the key is ever disabled: the KMS key is the only way to read the
  encrypted fields, in backups too.
- **DynamoDB**: a second datastore with its own schema shape, access patterns fixed up front,
  backups, metrics and Terraform; a second write path in account deletion; a cursor change in the
  sync pull; DynamoDB Local in the laptop stack, the cloud setup script, CI and e2e; and seed and
  reset support in the dev CLI and the `flexi-dev` MCP server.

## Recommendation

Store employee records in the existing RDS Postgres. The AWS bill barely separates the options;
the codebase does. Every read the directory makes is a join against Postgres tables, and the sync
pull, account deletion and retention each depend on one transaction and one clock. DynamoDB would
save no money and would add a second write path, a second backup story and a second local
datastore to a stack that runs native Postgres with no Docker.

For the sensitive tier, T-477 decides the protection. If it chooses more than disk encryption,
the RDS option with application-level envelope encryption under a customer managed KMS key is the
one to price: about €0.90 a month at 1k profiles, €0.92 at 10k and €1.64 at 100k, rising by up to
€1.79 once the key has rotated twice. Do not use pgcrypto with the current logging settings, and do
not derive the key from `BETTER_AUTH_SECRET`, which rotates every 90 days.

## Open questions

- How much of the 20 GB allocation production uses today. `SELECT pg_database_size('flexiday')`
  through the `psql_command` output, run by the owner, would answer it.
- Whether sensitive fields reach the phone's local store through the sync pull at all, or stay
  web-only. That changes the decrypt surface and is for T-477 and T-479.
- Whether the access log of sensitive reads lives in Postgres with the profiles, as assumed here,
  and how long it is kept (T-474).

## Sources

Read on 2026-10-25 unless stated.

Flexi Day code and docs, `flexi-day-be` on `main`:

- `terraform/rds.tf`, `vpc.tf`, `security-groups.tf`, `apprunner.tf`, `iam.tf`, `secrets.tf`,
  `variables.tf`, `main.tf`; non-secret `db_*` and `apprunner_*` values in `terraform.tfvars`
- `docs/terraform.md`, `docs/sync-pull.md`, `docs/account-deletion.md`, `docs/attendance.md`
- `src/db/schema/employment-schema.ts`, `src/db/schema/user-birthday-schema.ts`
- `src/utils/auth.ts`, `src/utils/oauthTokens.ts`, `src/jobs/quotaRolloverJob.ts`,
  `src/jobs/attachmentSweepJob.ts`
- Workspace `CLAUDE.md` and `tools/cloud/setup.sh`

AWS Price List API, `eu-central-1` (publication date in brackets):

- AmazonRDS (2026-10-20):
  https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/eu-central-1/index.json
- AmazonDynamoDB (2026-09-11):
  https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/eu-central-1/index.json
- awskms (2026-09-11):
  https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/awskms/current/eu-central-1/index.json
- AmazonVPC (2026-10-16):
  https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonVPC/current/eu-central-1/index.json
- AWSSecretsManager (2026-09-11):
  https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSSecretsManager/current/eu-central-1/index.json
- AmazonEC2, NAT gateway lines only:
  https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/eu-central-1/index.json

AWS pages:

- DynamoDB on-demand pricing: https://aws.amazon.com/dynamodb/pricing/on-demand/
- DynamoDB provisioned pricing: https://aws.amazon.com/dynamodb/pricing/provisioned/
- KMS pricing: https://aws.amazon.com/kms/pricing/
- VPC pricing: https://aws.amazon.com/vpc/pricing/ (shows NAT prices for US East only)
- RDS for PostgreSQL pricing: https://aws.amazon.com/rds/postgresql/pricing/ (no Frankfurt prices
  shown)
- RDS FAQ, backups and point-in-time restore: https://aws.amazon.com/rds/faqs/
- RDS backups: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html
- RDS KMS key management:
  https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.Keys.html
- RDS for PostgreSQL extensions:
  https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html
- DynamoDB encryption at rest:
  https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/EncryptionAtRest.html
- DynamoDB fine-grained access control:
  https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/specifying-conditions.html
- DynamoDB TTL: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html
- DynamoDB PITR:
  https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Point-in-time-recovery.html
- DynamoDB Local:
  https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html
- AWS Database Encryption SDK languages:
  https://docs.aws.amazon.com/database-encryption-sdk/latest/devguide/ddb-programming-languages.html
- App Runner VPC access: https://docs.aws.amazon.com/apprunner/latest/dg/network-vpc.html

Other primary sources:

- ECB EUR/USD reference rate, 23 October 2026:
  https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html
- PostgreSQL 17 logging settings: https://www.postgresql.org/docs/17/runtime-config-logging.html
- PostgreSQL 17 pgcrypto: https://www.postgresql.org/docs/17/pgcrypto.html

## Comparison and monthly cost change

|                                                      | RDS Postgres as is                  | RDS + column-level encryption                     | DynamoDB on-demand                                 | DynamoDB provisioned                  |
| ---------------------------------------------------- | ----------------------------------- | ------------------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| Joins with `employments`, `user`, groups, visibility | SQL, one query                      | SQL, one query; no SQL search on encrypted fields | merged in Node after a Postgres query              | merged in Node after a Postgres query |
| Sync pull                                            | one more table, cursor version bump | same, plus decrypt on read                        | second position in the cursor, own paging and skew | same as on-demand                     |
| Account deletion                                     | inside the one transaction          | inside the one transaction                        | second step outside it, needs retry                | same as on-demand                     |
| Retention                                            | one more sweep on the nightly tick  | same                                              | TTL, free and event-driven, deletes within days    | same as on-demand                     |
| Backups, restore                                     | shared 7-day PITR                   | shared 7-day PITR, KMS key needed to read         | separate per-table PITR, up to 35 days             | same as on-demand                     |
| Protection at rest                                   | disk encryption, `aws/rds`          | disk plus field encryption, key in KMS            | disk encryption, AWS owned key                     | same as on-demand                     |
| Local dev, cloud, e2e                                | nothing new                         | a static local key                                | DynamoDB Local (JRE 17+ or Docker) everywhere      | same as on-demand                     |
| New plumbing                                         | none                                | KMS key, IAM policy                               | table, IAM policy                                  | table, IAM policy, capacity settings  |
| Throttling risk                                      | none new                            | none new                                          | none                                               | above provisioned capacity            |
| **Cost change, 1k profiles**                         | **€0**                              | **+€0.89**                                        | **+€0.02**                                         | **€0 (free tier)**                    |
| **Cost change, 10k profiles**                        | **€0**                              | **+€0.92**                                        | **+€0.20**                                         | **+€0.01**                            |
| **Cost change, 100k profiles**                       | **€0**                              | **+€1.64**                                        | **+€1.99**                                         | **+€5.36**                            |

Cost changes are against today's RDS bill of about €13.45 a month and exclude VAT. RDS figures hold
while the database fits in its 20 GB allocation; each GB beyond it costs €0.12 a month. The
column-encryption figures rise by up to €1.79 once the KMS key has rotated twice. DynamoDB figures
include PITR and assume the account's free tier is otherwise unused. Recommendation: RDS Postgres,
with column-level encryption if T-477 asks for field protection.
