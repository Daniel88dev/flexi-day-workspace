# Backend image and Lambda bundle under pnpm

Written 2026-11-01 for Fenro task T-557, under the map T-553 (move the product repos from npm 12 to
pnpm). It builds on the toolchain findings in `docs/research/pnpm-toolchain.md` on the
`research/pnpm-toolchain` branch and does not repeat them. Every URL below was read on that date.

Claims marked "trial" come from a copy of `flexi-day-be` under `/tmp`, converted with pnpm 12.16.1
on this Mac (Node 24.22.1, Docker 29.6.2 on Apple silicon). Images were built for `linux/amd64`,
as CD builds them, so they ran under emulation. The checkout itself was not touched. Nothing was
pushed and no AWS call was made.

## Short version

- The App Runner image keeps its shape: build stage, production-dependencies stage, runtime stage.
  pnpm goes into the build stages by copying `/opt/pnpm` from `ghcr.io/pnpm/pnpm:<version>-alpine`.
  The runtime stage needs no pnpm, because it starts with `node`. The full Dockerfile is in
  section 1.
- The isolated `node_modules` survives `COPY --from`. Its symlinks are relative and point into
  `node_modules/.pnpm`, which is copied with them. The trial image had 990 symlinks, none broken,
  booted, answered `/health` and imported all 32 production dependencies.
- The pnpm image is 28% smaller: 433 MB against 599 MB. npm's `--omit=dev` keeps vitest,
  drizzle-kit, vite, esbuild and tsx in production, because better-auth lists them as optional
  peers. pnpm's `--prod` drops them.
- `pnpm fetch` and `pnpm deploy` both work here but add nothing for a single-package repo built on
  ephemeral CD runners. Plain `pnpm install --frozen-lockfile` with a cache mount is enough.
- The Lambda's esbuild step is unaffected: the bundle is byte-identical to npm's once module path
  keys are normalised. Its runtime install is not. Under the default isolated linker the zip
  breaks in Lambda (`Cannot find package 'detect-libc'`) and grows to 50.6 MB, past the 50 MB
  direct-upload limit. `nodeLinker: hoisted` plus `supportedArchitectures` gives a zip within
  5 KB of npm's that loads in the Lambda Node 24 image.
- Nothing in `scripts/` calls npm or npx. The calls to change are in `package.json` scripts, the
  two Dockerfiles, the compose file, `lambda/attachment-processor/build.mjs` and the workflows.
- Two traps. `npx @sentry/cli` in the Dockerfile fetches an unpinned package that is not in the
  lockfile; make it a devDependency. `pnpm run x -- --flag` forwards the `--` literally, so vitest
  silently ignores `--shard` and `--coverage` in CI unless the `--` goes.
- No blocker. The two phantom imports from the toolchain research matter here too: three of the
  four test files that import `@better-auth/utils` are e2e tests and run inside `Dockerfile.e2e`.

## 1. The App Runner image

### What the Dockerfile does today

`Dockerfile` has two stages on `node:24-alpine`. The builder runs `npm ci`, `npm run build`, then
`npx @sentry/cli` to inject and upload source maps when the `sentry_auth_token` secret is mounted.
The runner copies `package*.json`, runs `npm ci --omit=dev --ignore-scripts`, adds the RDS CA
bundle and copies `dist` from the builder. It starts with
`node --import ./dist/instrument.js dist/index.js`. CD builds it with
`docker buildx build --platform linux/amd64 --provenance=false --push`, and App Runner auto-deploys
the moving tag.

### How pnpm gets into the image

pnpm's Docker guide documents three ways ([Docker guide][docker]):

| Option                                                                              | What it is                                                                                                       | Fit                                                                     |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `FROM ghcr.io/pnpm/pnpm:12` as the base                                             | Debian slim, standalone pnpm, no Node. Node comes from `pnpm runtime set` or `devEngines`                        | Changes the base and moves Node pinning out of the tag                  |
| `COPY --from=ghcr.io/pnpm/pnpm:12-alpine /opt/pnpm /opt/pnpm` into `node:24-alpine` | Adds the pnpm binary and its bundled `node-gyp`, then symlinks `pnpm`, `pn`, `pnpx`, `pnx` into `/usr/local/bin` | Keeps today's base. The guide's own example is exactly `node:24-alpine` |
| Corepack or `npm i -g pnpm`                                                         | The guide does not mention either. The CI guide says not to use Corepack ([CI docs][ci])                         | No                                                                      |

The guide says to copy the whole `/opt/pnpm` directory "because it also contains the `node-gyp`
that pnpm uses to build native dependencies", and to copy from the `-alpine` image when the base is
Alpine, so the C library matches ([Docker guide][docker]). `/opt/pnpm` is 48 MB, but it only
lands in the build stages.

Pin the exact version. The trial found the moving tags run ahead of npm: `ghcr.io/pnpm/pnpm:12`
and `12-alpine` already carry 12.17.0, while npm's `latest` is 12.16.1 and 12.17.0 sits on
`next-12` (`npm view pnpm dist-tags`). The guide describes `<major>` as tracking "the latest stable
release within that major" ([Docker guide][docker]). Use `12.16.1-alpine`, or that tag plus its
digest (`sha256:3b67e34454e18e4797a50ade3176dde31cec13ad6670f460a81bdf6e1d8b547b` on
2026-11-01), and keep it equal to the `packageManager` pin. `be`'s `dependabot.yml` has no `docker`
ecosystem today, so nothing would bump that tag.

### Does a symlinked `node_modules` survive `COPY --from`?

Yes. With the default `virtualStoreType: project`, "every project gets its own virtual store
inside `node_modules/.pnpm`" ([node_modules settings][set-nm]). The top-level entries are relative
symlinks into it. Trial: `readlink /app/node_modules/express` in the runtime image printed
`.pnpm/express@5.3.0_supports-color@8.1.1/node_modules/express`. The image held 990 symlinks and
`find -L /app/node_modules -type l` found no broken one. Packages that reach undeclared
dependencies still work, because `hoistPattern: ['*']` puts them in `node_modules/.pnpm/node_modules`,
which travels with the copy. That is where the trial found sharp's
`@img/sharp-linuxmusl-x64` and `@img/sharp-libvips-linuxmusl-x64`.

The one setting that would break the copy is the global virtual store (`virtualStoreType: global`),
where `node_modules` "contains only symlinks to a central virtual store" under the store path
([node_modules settings][set-nm]). It is off by default. Do not turn it on for this repo.

The guide's own multi-stage examples copy `node_modules` from a `prod-deps` stage the same way
([Docker guide][docker]).

### `pnpm install --prod`, `pnpm fetch` or `pnpm deploy`

- **`pnpm install --frozen-lockfile --prod`** in its own stage, then `COPY` of `node_modules`. This
  is the guide's Example 1 ([Docker guide][docker]). It is what the trial used.
- **`pnpm fetch`** fills the virtual store from the lockfile alone, then
  `pnpm install --offline` links it after the sources are copied ([fetch][fetch]). Its point is
  that the fetch layer is reused until the lockfile changes, "on CI or CD environments, the
  BuildKit cache mounts might not be available" ([Docker guide][docker], Example 3). CD here gets
  no layer reuse either: each run creates a new buildx builder on an ephemeral runner and passes no
  `--cache-from`. Docker notes each builder keeps its own cache storage ([Docker cache][dcache]).
  The trial confirmed `pnpm fetch --prod` followed by
  `pnpm install --offline --frozen-lockfile --prod` works on this lockfile. It buys nothing until
  CD exports a build cache.
- **`pnpm deploy --prod <dir>`** copies the package and installs its dependencies into an isolated
  `node_modules` there ([deploy][deploy]). The docs describe it for workspaces. The trial ran it in
  this single-package repo with pnpm 12.16.1, and it worked, but it copied the whole repository
  (Dockerfiles, `docs/`, `src/`, `lambda/`). Files follow `pnpm pack` rules, and `package.json`
  has no `files` field. It also wrote a dedicated lockfile and re-verified it against the
  supply-chain policies, which took 38 s. It suits a monorepo, not this repo.

### Dependency build scripts in the image

Today's runtime install passes `--ignore-scripts`. pnpm denies dependency build scripts unless
`allowBuilds` approves them, and `strictDepBuilds` fails the install on an unreviewed one
([build settings][set-build]). So `pnpm-workspace.yaml` must be in the image before the install,
carrying the `false` entries the toolchain research found (`esbuild`, `@sentry/node-cpu-profiler`),
plus `@sentry/cli` if it becomes a devDependency. The guide says the same: copy
`pnpm-workspace.yaml` before `pnpm install`, because "omitting it can change how dependencies are
installed or make a frozen install fail" ([Docker guide][docker]). sharp 0.35 has no install
script (`npm view sharp@0.35.5 scripts`), so nothing changes for it.

Each frozen install also re-checks the lockfile against `minimumReleaseAge`, which needs registry
metadata. Trial: "Lockfile passes supply-chain policies (746 entries in 3.7s)" in one stage and
5.6 s in the other. The build already needs the network, so this only costs time.

### `npx @sentry/cli` is unpinned

`@sentry/cli` is in neither `package.json` nor `package-lock.json`. `npx @sentry/cli` therefore
downloads whatever version is current when the image builds, outside the lockfile and outside any
release-age policy. Under pnpm the fix is to add it as a devDependency and call
`pnpm exec sentry-cli`. It ships its binary as per-platform optional dependencies and has a
`postinstall` (`npm view @sentry/cli scripts optionalDependencies`). Trial: with
`"@sentry/cli": false` in `allowBuilds`, `pnpm exec sentry-cli --version` printed `sentry-cli
3.8.2` both on macOS and in the Alpine build stage. The upload itself was not tried, since that
needs the token.

### Recommended Dockerfile

This is the trial's `Dockerfile.pnpm`. The runtime stage is the same as today's, except that
`node_modules` comes from `prod-deps` instead of a second install.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-alpine AS pnpm
COPY --from=ghcr.io/pnpm/pnpm:12.16.1-alpine /opt/pnpm /opt/pnpm
RUN for bin in pnpm pn pnpx pnx; do ln -s "/opt/pnpm/$bin" "/usr/local/bin/$bin"; done
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# build stage
FROM pnpm AS builder
LABEL authors="danielhrynusiw"
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
  pnpm install --frozen-lockfile --store-dir /var/cache/pnpm

COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY src ./src
RUN pnpm run build

ARG APP_VERSION=unknown
ARG SENTRY_ORG=freelancer-ldp
ARG SENTRY_PROJECT=flexi-day-be
RUN --mount=type=secret,id=sentry_auth_token \
  if [ -f /run/secrets/sentry_auth_token ]; then \
    export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)"; \
    pnpm exec sentry-cli sourcemaps inject ./dist && \
    pnpm exec sentry-cli sourcemaps upload \
      --org "$SENTRY_ORG" --project "$SENTRY_PROJECT" --release "$APP_VERSION" ./dist; \
  else \
    echo "sentry_auth_token secret not provided; skipping source map upload"; \
  fi

# production dependencies
FROM pnpm AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
  pnpm install --frozen-lockfile --prod --store-dir /var/cache/pnpm

# runtime stage: node only, no pnpm
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

ARG APP_VERSION=unknown
ENV APP_VERSION=${APP_VERSION}

COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules

RUN mkdir -p /app/logs && chown -R node:node /app/logs

RUN wget -qO /app/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/app/rds-global-bundle.pem

COPY --from=builder --chown=node:node /app/dist ./dist

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 || exit 1

CMD ["node", "--import", "./dist/instrument.js", "dist/index.js"]
```

Notes on it:

- The runner still copies `package.json`. `dist` is ESM and needs `"type": "module"` from it.
- The cache mount sits at `/var/cache/pnpm` with `--store-dir`, as the guide does ([Docker
  guide][docker]). In CD it starts empty every run, but `builder` and `prod-deps` run in parallel
  and share it within one build.
- The guide warns that a store baked into an image layer makes later installs copy files out of
  the lower layer ([Docker guide][docker]). The store here is a cache mount, so this does not apply.
- `.dockerignore` already excludes `node_modules`, `dist` and `lambda`, and does not exclude
  `pnpm-lock.yaml` or `pnpm-workspace.yaml`. It needs no change.
- `cd.yml`'s build step needs no change. The image build does not use the runner's pnpm.

### Trial results

| Measure                                   | npm (today)             | pnpm (above)            |
| ----------------------------------------- | ----------------------- | ----------------------- |
| Image size, `linux/amd64`                 | 599,114,934 bytes       | 432,607,930 bytes       |
| `/app/node_modules`                       | 405.8 MB, 451 packages  | 323.5 MB, 347 packages  |
| `/app/dist`                               | 11.7 MB                 | 11.7 MB                 |
| Cold build, `--no-cache`, empty store     | 75 s                    | 22 s                    |
| Boot against Postgres 15, `/health`       | `{"ok":true}` after 6 s | `{"ok":true}` after 5 s |
| `import()` of every production dependency | 32 of 32                | 32 of 32                |

Build times are on this Mac with amd64 emulation and warm base images. Treat them as a ratio,
not as CD numbers.

The 104 packages only npm ships are all development tooling. The largest are
`@rolldown/binding-linux-x64-musl` (19 MB), `@esbuild/linux-x64` (10 MB), `drizzle-kit` (10 MB),
`lightningcss-linux-x64-musl` (10 MB), vitest, vite and Babel. npm's lockfile marks `vitest` and
`drizzle-kit` `devOptional`, because `better-auth` lists them as optional `peerDependencies`, and
`vite` lists `tsx` the same way. `npm ci --omit=dev` keeps `devOptional` packages. pnpm's `--prod`
does not install them. Nothing at runtime needs them: the image starts with `node`, and
migrations run from a developer machine through `scripts/db-migrate.sh`.

## 2. `Dockerfile.e2e` and `docker-compose.e2e.yml`

`Dockerfile.e2e` is one stage: `npm ci`, copy sources, `npm run build`, `CMD ["npm", "run",
"test:e2e"]`. The compose file runs `npm run db:migrate && npm run test:e2e` against a
`postgres:15` service. Neither CI nor CD uses them. `package.json` exposes them as
`docker:e2e:build` and `docker:e2e:run`.

Under pnpm this image keeps pnpm at runtime, since its command is a package script:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-alpine
LABEL authors="danielhrynusiw"
COPY --from=ghcr.io/pnpm/pnpm:12.16.1-alpine /opt/pnpm /opt/pnpm
RUN for bin in pnpm pn pnpx pnx; do ln -s "/opt/pnpm/$bin" "/usr/local/bin/$bin"; done
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
  pnpm install --frozen-lockfile --store-dir /var/cache/pnpm

COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY vitest.config.ts ./
COPY vitest.e2e.config.ts ./
COPY src ./src

RUN pnpm run build

CMD ["pnpm", "run", "test:e2e"]
```

The compose `command` becomes `pnpm run db:migrate && pnpm run test:e2e`, and `test:e2e` itself
must call `pnpm run test:e2e:check` rather than `npm run`. Trial: with those changes and
`@better-auth/utils@0.5.0` declared as a devDependency, `docker compose up --build` ran
`twoFactor` and `nativeSession`, two of the files that import it: 2 files, 30 tests passed.
drizzle-kit migrated the database from inside the Alpine image.

The phantom import has to be fixed before this image works, because three of the four files that
import `@better-auth/utils` are e2e tests: `twoFactor.e2e.test.ts`, `nativeSession.e2e.test.ts`
and `pushRegistration.e2e.test.ts`. `better-auth@1.7.12` pins `@better-auth/utils` to `0.5.0`, so
declare that version.

## 3. The Lambda bundle

`cd.yml`'s `deploy-attachment-processor` job runs `npm ci` at the root, then `npm run
lambda:build`, which runs `lambda/attachment-processor/build.mjs`. That script does two separate
things, and pnpm affects them differently.

### The esbuild step resolves correctly

esbuild bundles `src/lambda/attachmentProcessor/index.ts` from the root `node_modules`, with
`sharp` and `libheif-js` external. Every bare import in that handler is a declared root
dependency: `@aws-sdk/client-s3` and `zod` in `dependencies`, `@aws-sdk/client-secrets-manager` in
`devDependencies`. Transitive packages are reached from inside `.pnpm`, where each has its own
dependencies beside it.

Trial: both bundles hold the same 782 modules. pnpm's `index.mjs` is 50 KB larger (2,315,388
against 2,264,805 bytes) only because esbuild names each module by its path, and pnpm paths carry
`node_modules/.pnpm/<name>@<version>/`. After rewriting those paths to the npm form, `diff` of the
two bundles is empty.

### The runtime install does not, under the default linker

The second half copies the Lambda's own `package.json` and `package-lock.json` into `dist/` and
runs `npm ci --omit=dev --ignore-scripts --os=linux --cpu=x64 --libc=glibc`, then `zip -qrX`.
Only sharp and libheif-js (plus sharp's five dependencies) ship this way.

pnpm's docs name this case: `nodeLinker: hoisted` exists partly because "some serverless
providers (for instance, AWS Lambda) don't support symlinks" ([node_modules settings][set-nm]).
The trial shows how it fails. `zip -r` stores what a symlink points to, not the link. With the
isolated linker, `node_modules/sharp` becomes a plain copy that no longer sits next to its
dependencies, which live only under `.pnpm`. Results, built in a Linux container and run in
`public.ecr.aws/lambda/nodejs:24` under `linux/amd64`:

| Linker          | Zip size         | Result                                                                                           |
| --------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| npm (today)     | 11,644,240 bytes | loads                                                                                            |
| pnpm `hoisted`  | 11,649,432 bytes | sharp 0.35.5 and libheif-js load                                                                 |
| pnpm `isolated` | 50,584,614 bytes | `ERR_MODULE_NOT_FOUND: Cannot find package 'detect-libc' imported from .../sharp/dist/sharp.mjs` |

The isolated zip also passes 50 MB, the limit for uploading a zip directly with
`update-function-code --zip-file`. Larger packages must go through S3 ([Lambda Node.js
packaging][lambda-pkg]).

The working setup is a `pnpm-workspace.yaml` of its own in `lambda/attachment-processor/`, which
also makes that directory its own pnpm root so the repo root's install ignores it:

```yaml
nodeLinker: hoisted
supportedArchitectures:
  os: [linux]
  cpu: [x64]
  libc: [glibc]
skills:
  dirs: []
```

Then `pnpm import` there turns `package-lock.json` into `pnpm-lock.yaml` (trial: same versions),
and `build.mjs` copies three files and runs pnpm:

```js
for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
  cpSync(path.join(here, file), path.join(dist, file));
}
execFileSync("pnpm", ["install", "--frozen-lockfile", "--prod"], { cwd: dist, stdio: "inherit" });
```

Copying `pnpm-workspace.yaml` into `dist/` matters. Without it, pnpm walks up to the parent's file.
`supportedArchitectures` installs optional dependencies for platforms other than the host
([dependency resolution settings][set-dep]).

One difference from npm: on macOS, pnpm ignored `libc: [glibc]`, in the file and as
`--libc=glibc` on the command line, and also installed the musl variants of sharp. The zip came
out at 19.0 MB instead of 11.1 MB. It still works, because the glibc build is there too. On Linux
the filter worked and the zip matched npm's. CD runs on `ubuntu-latest`, so only local builds get
the larger zip.

Two smaller points:

- The zip also carries `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `node_modules/.modules.yaml` and
  `node_modules/.pnpm/lock.yaml`, a few KB in all. npm's carries its two lockfiles the same way.
- The trial's first container run placed the pnpm store at `dist/node_modules/.pnpm-store`, because
  the project sat on a bind mount on another device, and the zip doubled. That cannot happen on
  the CD runner, where the store and the checkout share a disk, but `--store-dir` outside `dist`
  rules it out anywhere.

In `cd.yml` the job swaps `actions/setup-node` and `npm ci` for `pnpm/setup`, which installs the
root dependencies and puts pnpm on `PATH` for `build.mjs`. `dependabot.yml` covers only `/` today,
so the Lambda's lockfile is not watched under npm either. Under pnpm it needs a second
`directory` entry.

## 4. Where npm and npx are called

`scripts/db-migrate.sh` and `scripts/drizzle-migrate.mjs` call neither. The script runs
`node scripts/drizzle-migrate.mjs`, `node -e`, `psql`, `aws`, `curl` and `shasum`.
`src/scripts/rekeyOrganization.ts` mentions `npm run` only in its usage message.

What does call them:

| Place                                   | Call                                                    | Under pnpm                |
| --------------------------------------- | ------------------------------------------------------- | ------------------------- |
| `package.json` `dev`                    | `npm run build`                                         | `pnpm run build`          |
| `package.json` `check`                  | `npm run` ×3, `npm test`                                | `pnpm run`, `pnpm test`   |
| `package.json` `test:e2e*` (3 scripts)  | `npm run test:e2e:check`                                | `pnpm run test:e2e:check` |
| `Dockerfile`                            | `npm ci` ×2, `npx @sentry/cli` ×2                       | section 1                 |
| `Dockerfile.e2e`, compose file          | `npm ci`, `npm run` ×3                                  | section 2                 |
| `lambda/attachment-processor/build.mjs` | `execFileSync("npm", ["ci", ...])`                      | section 3                 |
| `ci.yml`, `cd.yml`                      | `npm ci`, `npm run ...`, `setup-node` with `cache: npm` | `pnpm/setup`, `pnpm run`  |

`npm run` would keep working inside pnpm scripts, since Node still ships npm, but it ignores
`pnpm-workspace.yaml` and would spawn a second package manager.

### The `--` in CI commands

`ci.yml` runs `npm run test:unit -- --coverage` and `npm run test:e2e -- --shard=N/4`. npm drops
the `--`. pnpm passes it through: "Options listed after the script's name are passed to the
executed script" ([pnpm run][run]), and that includes a literal `--`. Trial: a script printing its
`argv` received `--shard=1/4` from npm and `--` plus `--shard=1/4` from pnpm. vitest then treats
everything after `--` as not its own: `pnpm run vl authSecretRotation` listed 1 test file, and
`pnpm run vl -- authSecretRotation` listed all 161.

A literal translation would keep CI green while coverage stops and every e2e shard runs the whole
suite. Write `pnpm run test:unit --coverage` and `pnpm run test:e2e --shard=N/4`. The frontend's
`npm run test -- --shard=...` in `flexi-day/.github/workflows/ci.yml` has the same problem.

## 5. Image size and cold start

- **App Runner.** `apprunner.tf` sets `min_size = 1`. App Runner keeps at least that many
  instances provisioned ([App Runner auto scaling][ar-scale]), so requests do not wait on an image
  pull. The pull happens on deploy and on scale-out, and a 28% smaller image shortens both. Boot
  to `/health` was the same within a second under emulation. pnpm's symlinks cost Node a
  `realpath` per package on first load. The trial did not measure that, and the boot time does not
  show it.
- **Lambda.** With the hoisted linker the zip has the same files as npm's, so cold start does not
  change. AWS recommends bundling where possible because it cuts I/O ([Lambda Node.js
  packaging][lambda-pkg]), and `build.mjs` already does. The isolated layout would add 39 MB of
  duplicate files on top of failing.

## 6. Frontend and emails

Neither repo has a Dockerfile. Their workflows run `npm ci` and `npm run <script>`, and the
toolchain research already ran `next build` and the emails template build under pnpm. The one
thing beyond renaming is the `--` trap in `flexi-day`'s sharded test step above. The emails deploy
workflow passes no arguments after `--`.

## Checklist for the backend ticket

- `pnpm-workspace.yaml` at the root with the overrides and `allowBuilds` from the toolchain
  research, plus `"@sentry/cli": false`.
- `@sentry/cli` and `@better-auth/utils@0.5.0` as devDependencies.
- `Dockerfile` and `Dockerfile.e2e` as in sections 1 and 2, the compose `command` as in section 2.
- `lambda/attachment-processor/pnpm-workspace.yaml` and `pnpm-lock.yaml`, and the `build.mjs`
  change. Delete both `package-lock.json` files.
- `npm run` to `pnpm run` in `package.json` scripts. Drop `--` in workflow `pnpm run` calls.
- `dependabot.yml`: a `directory` for `/lambda/attachment-processor`, and a `docker` entry if the
  pnpm image tag should be bumped automatically.
- `docs/terraform.md` mentions `npm run lambda:build` and "that directory's own lockfile". Update
  the wording.

## Sources

- pnpm docs: [Working with Docker][docker], [pnpm fetch][fetch], [pnpm deploy][deploy],
  [pnpm run][run], [node_modules settings][set-nm], [dependency resolution settings][set-dep],
  [build settings][set-build], [continuous integration][ci]
- Docker: [Optimize cache usage in builds][dcache]
- AWS: [Deploy Node.js Lambda functions with .zip file archives][lambda-pkg],
  [Managing App Runner automatic scaling][ar-scale]
- npm registry: `npm view pnpm dist-tags`, `npm view @sentry/cli`, `npm view sharp@0.35.5 scripts`
- Repo: `flexi-day-be` at its checked-out state on 2026-11-01: `Dockerfile`, `Dockerfile.e2e`,
  `docker-compose.e2e.yml`, `.dockerignore`, `.github/workflows/ci.yml` and `cd.yml`,
  `.github/dependabot.yml`, `lambda/attachment-processor/`, `scripts/`, `package.json`,
  `package-lock.json`, `terraform/apprunner.tf`, `terraform/attachments.tf`, `docs/terraform.md`

[docker]: https://pnpm.io/docker
[fetch]: https://pnpm.io/cli/fetch
[deploy]: https://pnpm.io/cli/deploy
[run]: https://pnpm.io/cli/run
[set-nm]: https://pnpm.io/settings/node-modules
[set-dep]: https://pnpm.io/settings/dependency-resolution
[set-build]: https://pnpm.io/settings/build
[ci]: https://pnpm.io/continuous-integration
[dcache]: https://docs.docker.com/build/cache/optimize/
[lambda-pkg]: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-package.html
[ar-scale]: https://docs.aws.amazon.com/apprunner/latest/dg/manage-autoscaling.html
