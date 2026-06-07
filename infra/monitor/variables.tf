variable "aws_profile" {
  type    = string
  default = "h0"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "dsql_endpoint_use1" {
  type        = string
  description = "Primary DSQL connection endpoint host."
}

variable "dsql_endpoint_use2" {
  type        = string
  description = "Secondary DSQL connection endpoint host."
}

variable "dsql_region_use1" {
  type    = string
  default = "us-east-1"
}

variable "dsql_region_use2" {
  type    = string
  default = "us-east-2"
}

variable "cluster_arns" {
  type        = list(string)
  description = "DSQL cluster ARNs the monitor may obtain connect tokens for."
}

variable "schedule_expression" {
  type    = string
  default = "rate(6 hours)"
}

variable "monitor_events" {
  type    = number
  default = 10
}

variable "latency_p99_threshold_ms" {
  type    = number
  default = 3000
}

variable "alarm_sns_topic_arn" {
  type        = string
  default     = ""
  description = "Optional SNS topic for alarm actions (Phase-3 alerts). Empty = no action."
}
