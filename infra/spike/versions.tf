terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.49"
    }
  }

  # Spike state is LOCAL and ephemeral - this stack is torn down in-pass (scripts/teardown.sh)
  # and must not accrue idle cost. The real stacks use the S3 backend from infra/bootstrap
  # (use_lockfile = true). Intentionally no backend block here.
}
