terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.49"
    }
  }

  # PRODUCTION stack. Before go-live, move state to the S3 backend created by infra/bootstrap
  # (backend "s3" with use_lockfile = true). Local state is shown here only for build/validate -
  # do NOT apply a persistent cluster on local state (state loss would orphan the cluster).
}
