# Default provider = primary region (us-east-1); also used for global IAM.
provider "aws" {
  region  = var.primary_region
  profile = var.aws_profile

  default_tags {
    tags = local.tags
  }
}

# Secondary active region (us-east-2).
provider "aws" {
  alias   = "secondary"
  region  = var.secondary_region
  profile = var.aws_profile

  default_tags {
    tags = local.tags
  }
}
