locals {
  tags = {
    Project   = "quorum"
    Component = "ingest"
  }
}

# Bundle built by: pnpm --filter @quorum/ingest build  (run before plan/apply).
data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/../../functions/ingest/dist/index.js"
  output_path = "${path.module}/build/ingest.zip"
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

resource "aws_iam_role" "ingest" {
  name               = "${var.function_name}-role"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.ingest.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# IAM-token auth to DSQL: the Lambda role connects (admin user) to the app clusters.
data "aws_iam_policy_document" "dsql_connect" {
  statement {
    actions   = ["dsql:DbConnect", "dsql:DbConnectAdmin"]
    resources = var.cluster_arns
  }
}

resource "aws_iam_role_policy" "dsql_connect" {
  name   = "dsql-connect"
  role   = aws_iam_role.ingest.id
  policy = data.aws_iam_policy_document.dsql_connect.json
}

resource "aws_cloudwatch_log_group" "ingest" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "ingest" {
  function_name    = var.function_name
  role             = aws_iam_role.ingest.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      DSQL_ENDPOINT_PRIMARY = var.dsql_endpoint
      DSQL_REGION           = var.dsql_region
    }
  }

  depends_on = [aws_cloudwatch_log_group.ingest]
}

# Fire on any CloudWatch alarm transitioning INTO the ALARM state.
resource "aws_cloudwatch_event_rule" "alarm" {
  name        = "${var.function_name}-alarm-state-change"
  description = "Route CloudWatch alarms entering ALARM to the ingestion Lambda."
  event_pattern = jsonencode({
    source        = ["aws.cloudwatch"]
    "detail-type" = ["CloudWatch Alarm State Change"]
    detail = {
      state = { value = ["ALARM"] }
    }
  })
}

resource "aws_cloudwatch_event_target" "ingest" {
  rule      = aws_cloudwatch_event_rule.alarm.name
  target_id = "ingest-lambda"
  arn       = aws_lambda_function.ingest.arn
}

resource "aws_lambda_permission" "events" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.alarm.arn
}
