variable "aws_profile" {
  type    = string
  default = "h0"
}

variable "primary_region" {
  type    = string
  default = "us-east-1"
}

variable "secondary_region" {
  type    = string
  default = "us-east-2"
}

variable "witness_region" {
  type    = string
  default = "us-west-2"
}

variable "deletion_protection" {
  type        = bool
  default     = true
  description = "Production default. The cluster must stay reachable through judging (2026-07-24)."
}
