output "lambda_function_name" {
  value = aws_lambda_function.monitor.function_name
}

output "lambda_arn" {
  value = aws_lambda_function.monitor.arn
}

output "schedule_rule" {
  value = aws_cloudwatch_event_rule.schedule.name
}
