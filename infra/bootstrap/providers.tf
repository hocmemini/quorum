# Billing metrics (AWS/Billing EstimatedCharges) only exist in us-east-1, so this stack is pinned
# there. Budgets and the account public-access block are global.
provider "aws" {
  region  = var.region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project   = "quorum"
      Component = "bootstrap"
    }
  }
}
