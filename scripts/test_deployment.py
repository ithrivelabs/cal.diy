import argparse
import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("deployment", SCRIPTS / "deploy-cloud-run.py")
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)
IMAGE = "registry.example/cal-diy@sha256:" + "a" * 64
PREPARE_IMAGE = "registry.example/cal-diy@sha256:" + "b" * 64


def service():
    return {"metadata": {"annotations": {}}, "spec": {"template": {
        "metadata": {"annotations": {
            "autoscaling.knative.dev/minScale": "1",
            "run.googleapis.com/vpc-access-connector": "connector",
        }},
        "spec": {"serviceAccountName": "runtime@example.com", "containers": [{
            "image": "old-image", "ports": [{"containerPort": 3000}],
            "env": [{"name": "DATABASE_URL", "value": "test-only"},
                    {"name": "DATABASE_DIRECT_URL", "valueFrom": {"secretKeyRef": {"name": "db", "key": "1"}}}],
            "resources": {"limits": {"cpu": "2", "memory": "2Gi"}},
        }]},
    }}}


class DeploymentTests(unittest.TestCase):
    def test_job_preserves_database_access_without_service_scaling(self):
        original = service()
        job = deployment.make_job(original, IMAGE, "prepare-test")
        execution = job["spec"]["template"]
        task = execution["spec"]["template"]["spec"]
        self.assertEqual(task["containers"][0]["env"], original["spec"]["template"]["spec"]["containers"][0]["env"])
        self.assertEqual(task["serviceAccountName"], "runtime@example.com")
        self.assertEqual(task["maxRetries"], 0)
        self.assertNotIn("ports", task["containers"][0])
        self.assertNotIn("autoscaling.knative.dev/minScale", execution["metadata"]["annotations"])
        self.assertEqual(execution["metadata"]["annotations"]["run.googleapis.com/vpc-access-connector"], "connector")

    def test_missing_direct_connection_stops_preparation(self):
        original = service()
        original["spec"]["template"]["spec"]["containers"][0]["env"].pop()
        with self.assertRaisesRegex(ValueError, "DATABASE_DIRECT_URL"):
            deployment.make_job(original, IMAGE, "prepare-test")

    def test_sidecar_requires_explicit_review(self):
        original = service()
        original["spec"]["template"]["spec"]["containers"].append({"image": "sidecar"})
        with self.assertRaisesRegex(ValueError, "sidecars"):
            deployment.make_job(original, IMAGE, "prepare-test")

    def test_deployment_is_gated_by_job_success(self):
        for fail in (True, False):
            calls = []
            def fake_gcloud(project, region, *args, read=False):
                calls.append(args)
                if read:
                    return service()
                if args[:3] == ("run", "jobs", "replace"):
                    path = Path(args[3])
                    self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                    job = json.loads(path.read_text())
                    self.assertEqual(job["spec"]["template"]["spec"]["template"]["spec"]["containers"][0]["image"], PREPARE_IMAGE)
                if fail and args[:3] == ("run", "jobs", "execute"):
                    raise subprocess.CalledProcessError(1, "gcloud")
            args = argparse.Namespace(project="test", region="test", service="cal-diy", image="image:tag",
                                      prepare_image="prepare:tag",
                                      release_id="1234", dry_run=False)
            def describe_image(command, **_):
                digest = PREPARE_IMAGE if "prepare:tag" in command else IMAGE
                return subprocess.CompletedProcess(command, 0, json.dumps({"image_summary": {"fully_qualified_digest": digest}}))
            with self.subTest(fail=fail), patch.object(deployment, "gcloud", side_effect=fake_gcloud), patch.object(
                deployment.subprocess, "run", side_effect=describe_image
            ):
                if fail:
                    with self.assertRaises(subprocess.CalledProcessError):
                        deployment.deploy(args)
                    self.assertFalse(any(call[:3] == ("run", "services", "update") for call in calls))
                else:
                    deployment.deploy(args)
                    self.assertIn(f"--image={IMAGE}", calls[-1])
                self.assertEqual(deployment.subprocess.run.call_count, 2)
                self.assertIn("--wait", calls[-1] if fail else calls[-2])


class StartupTests(unittest.TestCase):
    def test_startup_and_preparation_failure_boundaries(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts").mkdir()
            (root / "apps/web").mkdir(parents=True)
            for filename in ("start.sh", "prepare-deployment.sh"):
                shutil.copyfile(SCRIPTS / filename, root / "scripts" / filename)
            (root / "built-webapp-url").write_text("http://built")
            (root / "scripts/replace-placeholder.sh").write_text(
                '#!/bin/sh\nprintf "replace %s %s\\n" "$1" "$2" >> "$CALL_LOG"\n'
            )
            (root / "scripts/replace-placeholder.sh").chmod(0o755)
            node = root / "node"
            node.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALL_LOG"\n'
                            'case "$1" in *prisma*) exit "${MIGRATE_EXIT:-0}";; '
                            '*ts-node*) exit "${SEED_EXIT:-0}";; esac\n')
            node.chmod(0o755)
            log = root / "calls"
            env = {"PATH": f"{root}:/usr/bin:/bin", "CALL_LOG": str(log), "PORT": "8080",
                   "BUILT_NEXT_PUBLIC_WEBAPP_URL": "http://stale", "NEXT_PUBLIC_WEBAPP_URL": "http://test"}
            subprocess.run(["sh", str(root / "scripts/start.sh")], env=env, check=True)
            self.assertIn("replace http://built http://test", log.read_text())
            self.assertIn("server.js", log.read_text())
            self.assertNotIn("prisma", log.read_text())
            for migrate_exit, seed_exit in ((1, 0), (0, 1), (0, 0)):
                log.write_text("")
                result = subprocess.run(["sh", str(root / "scripts/prepare-deployment.sh")], env={
                    **env, "DATABASE_URL": "test", "DATABASE_DIRECT_URL": "test",
                    "MIGRATE_EXIT": str(migrate_exit), "SEED_EXIT": str(seed_exit),
                })
                self.assertEqual(result.returncode, migrate_exit or seed_exit)
                self.assertEqual("ts-node" in log.read_text(), migrate_exit == 0)


if __name__ == "__main__":
    unittest.main()
