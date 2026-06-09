locals {
  tags = {
    Project   = "quorum"
    Component = "dsql-monitor"
  }
  name = "quorum-dsql-monitor"
}

# Bundle produced by: pnpm --filter @quorum/dsql-monitor build  (-> functions/dsql-monitor/dist)
data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../../functions/dsql-monitor/dist"
  output_path = "${path.module}/.build/dsql-monitor.zip"
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "monitor" {
  name               = "${local.name}-role"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.monitor.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "monitor" {
  statement {
    sid       = "DsqlConnect"
    actions   = ["dsql:DbConnect", "dsql:DbConnectAdmin"]
    resources = var.cluster_arns
  }
  statement {
    sid       = "PutMetrics"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["Quorum/DSQLMonitor"]
    }
  }
  statement {
    sid       = "ReadBudget"
    actions   = ["budgets:ViewBudget"]
    resources = ["*"]
  }
  statement {
    sid       = "ReadMetrics"
    actions   = ["cloudwatch:GetMetricData"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "monitor" {
  name   = "${local.name}-policy"
  role   = aws_iam_role.monitor.id
  policy = data.aws_iam_policy_document.monitor.json
}

resource "aws_lambda_function" "monitor" {
  function_name    = local.name
  role             = aws_iam_role.monitor.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      DSQL_ENDPOINT_USE1 = var.dsql_endpoint_use1
      DSQL_ENDPOINT_USE2 = var.dsql_endpoint_use2
      DSQL_REGION_USE1   = var.dsql_region_use1
      DSQL_REGION_USE2   = var.dsql_region_use2
      MONITOR_EVENTS     = tostring(var.monitor_events)
    }
  }
}

resource "aws_cloudwatch_event_rule" "schedule" {
  name                = "${local.name}-schedule"
  schedule_expression = var.schedule_expression
}

resource "aws_cloudwatch_event_target" "lambda" {
  rule = aws_cloudwatch_event_rule.schedule.name
  arn  = aws_lambda_function.monitor.arn
}

resource "aws_lambda_permission" "events" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.monitor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.schedule.arn
}

# One alarm per claim: fires if the claim ever reports 0 (fail) or stops reporting.
resource "aws_cloudwatch_metric_alarm" "claim" {
  for_each            = toset(["C1", "C2", "C3"])
  alarm_name          = "${local.name}-claim-${lower(each.value)}-fail"
  namespace           = "Quorum/DSQLMonitor"
  metric_name         = "ClaimPass"
  dimensions          = { Claim = each.value }
  statistic           = "Minimum"
  period              = 3600
  evaluation_periods  = 1
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = var.alarm_sns_topic_arn == "" ? [] : [var.alarm_sns_topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "latency_p99" {
  alarm_name          = "${local.name}-write-latency-p99"
  namespace           = "Quorum/DSQLMonitor"
  metric_name         = "WriteLatencyP99"
  statistic           = "Maximum"
  period              = 3600
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.latency_p99_threshold_ms
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_sns_topic_arn == "" ? [] : [var.alarm_sns_topic_arn]
}
