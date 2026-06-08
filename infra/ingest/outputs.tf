output "function_name" {
  value = aws_lambda_function.ingest.function_name
}

output "function_arn" {
  value = aws_lambda_function.ingest.arn
}

output "role_arn" {
  value = aws_iam_role.ingest.arn
}

output "rule_arn" {
  value = aws_cloudwatch_event_rule.alarm.arn
}
