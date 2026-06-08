output "tfstate_bucket" {
  description = "S3 bucket for the app/monitor/ingest stacks' backend (use_lockfile = true)."
  value       = aws_s3_bucket.tfstate.id
}

output "alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

output "budget_name" {
  value = aws_budgets_budget.monthly.name
}
