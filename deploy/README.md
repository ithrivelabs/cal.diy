Visit https://cal.com/docs/introduction/quick-start/self-hosting/installation#requirements for full instructions

# Cloud Run deployment

## Phase 3: standalone web image

The web image now copies Next.js standalone output, its static files and public assets,
translations, app descriptions, and the sign-in email template. The separate preparation
image retains Prisma, migrations, and the seed script. Both images use the same commit;
the deployment helper pins each tag to its own digest, runs preparation first, and updates
the web service only after the job succeeds. No integrations or booking routes are removed.

**Before pushing the Phase 3 commit to `main`**, replace the global trigger's inline YAML
with the complete `cloudbuild-phase3.yaml` and save it. The repository YAML is a copy for
review; the existing trigger does not read it automatically. The new config builds and
pushes the preparation image (`<commit>-prepare`) and the standalone web image (`<commit>`).
The first build still uses `--no-cache`; the second reuses layers from the first within
the same Cloud Build run. Persistent caching is a later phase, so this phase may not make
deployments faster. Keep the Cloud Run CPU, memory, minimum instances, and Scheduler jobs
unchanged while measuring the new runtime.

The Phase 2 cold-start log from 2026-09-30 shows about 94 seconds between the URL
replacement message and the startup TCP probe, while Next.js itself reported ready in
480 ms. The Phase 3 trigger passes `_WEBAPP_URL=https://cal.theithrive.org` as a Docker
build argument, so the built public URL matches the service's runtime URL and startup
skips that file scan. If the service URL changes, update `_WEBAPP_URL` in the inline
trigger and rebuild; the runtime replacement remains a fallback for mismatches.

If using Cloud Shell to inspect the release before rollout, pass both freshly pushed tags
to the helper with `--dry-run`:

```sh
python3 scripts/deploy-cloud-run.py \
  --project=calender-495405 --region=asia-southeast1 --service=cal-diy \
  --image=WEB_IMAGE_TAG --prepare-image=PREPARATION_IMAGE_TAG \
  --release-id=phase3check --dry-run
```

After deployment, check the preparation job and the new revision logs, then test login,
team Google Calendar availability, booking/event creation, email notifications,
rescheduling, and cancellation. Record the new image size and a cold-start request time
against the Phase 1 baseline. If a runtime regression appears, shift traffic back to the
previous revision; this does not undo database migrations. The preparation image must be
kept for future release jobs even though it is not used by the web service.

## Phase 2: deployment preparation (already installed)

Phase 2 separates database preparation from web startup for `cal-diy` in project
`calender-495405`, region `asia-southeast1`. The existing global Cloud Build trigger
is `9e0f8b44-369b-4861-988d-c308be482d95`.

The new startup script only replaces the public URL when necessary and starts Next.js.
It no longer waits for the database, migrates, seeds, or launches Yarn/Turbo. Install
the deployment step below before allowing a build containing this change to deploy.

## Install in the existing trigger

1. In Cloud Build, open the existing trigger in **global** and edit its inline build
   configuration. Paste the complete `cloudbuild-phase2.yaml` into the inline editor,
   click **Done**, then save the trigger. The Build and Push steps still use the
   existing arguments; `--no-cache` remains until Phase 4.
2. Do this before pushing the Phase 2 commit to `main`. Saving the trigger does not
   start a build, while a push to `main` does. The next build will contain the helper
   script and use the new Deploy step.
3. Ensure the service has both `DATABASE_URL` and `DATABASE_DIRECT_URL` configured.
   For Supabase, the latter must be a migration-capable direct or session-mode connection
   reachable from Cloud Run, not a transaction-mode pooler URL (see [Supabase's Prisma guide](https://supabase.com/docs/guides/database/prisma)). Existing credentials
   stay in the service/Secret Manager; do not put them into the build YAML.
4. The build identity needs permission to read/update the service, read Artifact Registry
   image metadata, create/update/run jobs and read their executions, and act as the runtime
   service account. The existing runtime identity retains its database and secret access.
5. Run deployments sequentially. Unique job names prevent two builds from changing the
   same job definition, but do not serialize database migrations or competing rollouts.
6. Commit/push the code and run the updated trigger. Updating the trigger configuration
   and deploying have not been performed by the local implementation.

The helper resolves the pushed image tag to a digest, copies the current service's
environment, secret references, service account, resources, volumes and database-network
annotations into a release-specific job, and waits for its execution. It uses one task
with no automatic retries and a 30-minute timeout. The temporary manifest is private and
removed after submission; its environment values are not printed by the helper.

The job runs `scripts/prepare-deployment.sh`: migrations first, app registration second.
Seeding errors stop deployment. Google Calendar must finish enabled, using either the
existing database app keys or valid `GOOGLE_API_CREDENTIALS`. No integrations are removed.
This validates app configuration, not live OAuth access for each connected team member.

Only successful preparation allows the helper to update the web service to the same
digest. The existing service settings and traffic policy are retained; the current
100%-to-latest policy sends traffic to the new revision when ready. Startup command and
arguments are explicitly set to the new web startup script. Sidecar services are rejected
until their job requirements are reviewed.

The image build also sets `SKIP_DB_MIGRATIONS=1` for the existing Prisma auto-migration
build hook. Explicit migration execution in the preparation job is unaffected.

## Validate before rollout

From a checkout containing these changes and an authenticated Cloud Shell, use a newly
built and pushed Phase 2 image tag. Do not use the old image from the audit: it lacks the
preparation script.

```sh
python3 scripts/deploy-cloud-run.py \
  --project=calender-495405 --region=asia-southeast1 --service=cal-diy \
  --image=NEW_PHASE_2_IMAGE --release-id=phase2check --dry-run
```

Dry-run reads configuration and image metadata and validates the planned job without
creating it, executing database operations or updating the service. It does not prove
database connectivity or permissions to create/run jobs.

After a real rollout, verify the preparation job succeeded, web startup logs contain no
migration/seeding commands, and test login, team availability, booking/calendar event
creation, required notifications, rescheduling and cancellation. Keep current CPU, memory,
minimum instances and scaling Scheduler jobs until Phase 5 validates scale-to-zero.

For other deployment paths such as Docker Compose, run preparation explicitly before
starting the web container. New/empty databases no longer initialize on web startup.

## Failure and rollback

If preparation fails, the helper exits nonzero without updating the web image. A failed
preparation may already have applied migrations or some app updates; these are not rolled
back automatically. Review the failed execution and retry after fixing the cause. Only
backward-compatible migrations should run while the previous revision serves traffic.

Record the previous service revision/digest before rollout. If application validation
fails, restore traffic to the previous revision. Restoring an image does not reverse
database migrations. Keep release-specific jobs for diagnosis; they do not run on a
schedule. Their later cleanup belongs with deployment-artifact retention work.

## Local checks

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p test_deployment.py -v
yarn vitest run scripts/seed-app-store.test.ts
yarn biome check scripts/seed-app-store.ts scripts/seed-app-store.test.ts
yarn type-check:ci --force
```

The tests use mocks and temporary directories; they do not contact Supabase or Google Cloud.
