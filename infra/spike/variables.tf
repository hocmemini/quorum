variable "aws_profile" {
  type        = string
  default     = "h0"
  description = "AWS CLI profile used to apply this stack."
}

variable "primary_region" {
  type        = string
  default     = "us-east-1"
  description = "First active DSQL region (peered cluster with an endpoint)."
}

variable "secondary_region" {
  type        = string
  default     = "us-east-2"
  description = "Second active DSQL region (peered cluster with an endpoint)."
}

variable "witness_region" {
  type        = string
  default     = "us-west-2"
  description = "DSQL witness region (quorum only, no endpoint). Verified-supported US trio (AWS docs, 2026-06)."
}

variable "connect_user" {
  type        = string
  default     = ""
  description = "IAM user to attach the DSQL connect policy to. Set in a gitignored terraform.tfvars; empty skips the attachment so no IAM username lives in the public repo."
}
