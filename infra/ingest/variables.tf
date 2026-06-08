variable "aws_profile" {
  type    = string
  default = "h0"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "function_name" {
  type    = string
  default = "quorum-ingest"
}

variable "dsql_endpoint" {
  type        = string
  description = "DSQL cluster endpoint host for this region (from infra/app primary_endpoint)."
}

variable "dsql_region" {
  type    = string
  default = "us-east-1"
}

variable "cluster_arns" {
  type        = list(string)
  description = "DSQL cluster ARNs the Lambda may connect to (from infra/app cluster_arns)."
}

variable "log_retention_days" {
  type    = number
  default = 14
}
