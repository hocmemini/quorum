variable "aws_profile" {
  type    = string
  default = "h0"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

# Required (no default) so the address never lands in the public repo (DEC-008). Put the real value
# in the gitignored infra/bootstrap/terraform.tfvars, or pass TF_VAR_alert_email.
variable "alert_email" {
  type        = string
  description = "Email for budget and billing-alarm notifications. Confirm the SNS subscription by email."
}

variable "budget_amount" {
  type    = number
  default = 20
}
