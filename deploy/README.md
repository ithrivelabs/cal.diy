Visit https://cal.com/docs/introduction/quick-start/self-hosting/installation#requirements for full instructions

# Cloud Run deployment preparation

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
