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
  default     = "h0-deploy"
  description = "IAM user that runs the spike and obtains DSQL admin auth tokens."
}
