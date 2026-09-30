import argparse
import copy
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path


def gcloud(project, region, *args, read=False):
    command = ["gcloud", *args, f"--project={project}", f"--region={region}", "--quiet"]
    if read:
        command.append("--format=json")
    result = subprocess.run(command, check=True, text=True, stdout=subprocess.PIPE if read else None)
    return json.loads(result.stdout) if read else None


def make_job(service, image, name):
    template = service["spec"]["template"]
    spec = template["spec"]
    if len(spec["containers"]) != 1:
        raise ValueError("Preparation requires a single-container service; review sidecars before deploying")
    source = spec["containers"][0]
    env_names = {entry["name"] for entry in source.get("env", [])}
    if not {"DATABASE_URL", "DATABASE_DIRECT_URL"} <= env_names:
        raise ValueError("Configure DATABASE_URL and DATABASE_DIRECT_URL on the service before deploying")
    container = {key: copy.deepcopy(source[key]) for key in ("env", "resources", "volumeMounts") if key in source}
    container.update(image=image, command=["/bin/sh", "/calcom/scripts/prepare-deployment.sh"], workingDir="/calcom")
    annotations = template.get("metadata", {}).get("annotations", {})
    inherited = {key: value for key, value in annotations.items() if key in {
        "run.googleapis.com/cloudsql-instances", "run.googleapis.com/vpc-access-connector",
        "run.googleapis.com/vpc-access-egress", "run.googleapis.com/network-interfaces",
        "run.googleapis.com/encryption-key", "run.googleapis.com/secrets",
    }}
    task = {key: copy.deepcopy(spec[key]) for key in ("serviceAccountName", "volumes") if key in spec}
    task.update(containers=[container], maxRetries=0, timeoutSeconds="1800")
    policy = {key: value for key, value in service["metadata"].get("annotations", {}).items() if key in {
        "run.googleapis.com/launch-stage", "run.googleapis.com/binary-authorization",
    }}
    return {
        "apiVersion": "run.googleapis.com/v1", "kind": "Job",
        "metadata": {"name": name, "annotations": policy},
        "spec": {"template": {
            "metadata": {"annotations": inherited},
            "spec": {"taskCount": 1, "parallelism": 1, "template": {"spec": task}},
        }},
    }


def resolve_image(project, image):
    result = subprocess.run([
        "gcloud", "artifacts", "docker", "images", "describe", image,
        f"--project={project}", "--format=json", "--quiet",
    ], check=True, text=True, stdout=subprocess.PIPE)
    digest = json.loads(result.stdout)["image_summary"]["fully_qualified_digest"]
    if not re.fullmatch(r"[^\s@]+@sha256:[a-f0-9]{64}", digest):
        raise ValueError("Artifact Registry did not return an immutable image digest")
    return digest


def deploy(args):
    service = gcloud(args.project, args.region, "run", "services", "describe", args.service, read=True)
    image = resolve_image(args.project, args.image)
    prepare_image = resolve_image(args.project, args.prepare_image) if args.prepare_image else image
    release = args.release_id.replace("-", "")
    if not re.fullmatch(r"[a-z0-9]{1,32}", release):
        raise ValueError("release-id must contain 1–32 lowercase letters/digits, excluding hyphens")
    service_prefix_length = 49 - len("-prepare-") - len(release)
    name = f"{args.service[:service_prefix_length].rstrip('-')}-prepare-{release}"
    job = make_job(service, prepare_image, name)
    print(f"Preparation job: {name}\nPreparation image: {prepare_image}\nWeb image: {image}", flush=True)
    if args.dry_run:
        return
    # The manifest may contain plain environment secrets inherited from the service.
    with tempfile.TemporaryDirectory(prefix="cal-diy-deploy-") as directory:
        manifest = Path(directory) / "job.json"
        with manifest.open("x") as output:
            os.chmod(manifest, 0o600)
            json.dump(job, output)
        gcloud(args.project, args.region, "run", "jobs", "replace", str(manifest))
    gcloud(args.project, args.region, "run", "jobs", "execute", name, "--wait")
    gcloud(args.project, args.region, "run", "services", "update", args.service,
           f"--image={image}", "--command=/bin/sh", "--args=/calcom/scripts/start.sh")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare the database before updating a Cloud Run web service")
    for option in ("project", "region", "service", "image", "release-id"):
        parser.add_argument(f"--{option}", required=True)
    parser.add_argument("--prepare-image")
    parser.add_argument("--dry-run", action="store_true")
    try:
        deploy(parser.parse_args())
    except (subprocess.CalledProcessError, ValueError, KeyError) as error:
        raise SystemExit(f"Deployment stopped: {error}") from None
