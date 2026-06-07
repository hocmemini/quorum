output "primary_endpoint" {
  description = "us-east-1 DSQL connection endpoint host."
  value       = "${aws_dsql_cluster.primary.identifier}.dsql.${var.primary_region}.on.aws"
}

output "secondary_endpoint" {
  description = "us-east-2 DSQL connection endpoint host."
  value       = "${aws_dsql_cluster.secondary.identifier}.dsql.${var.secondary_region}.on.aws"
}

output "primary_cluster_arn" {
  value = aws_dsql_cluster.primary.arn
}

output "secondary_cluster_arn" {
  value = aws_dsql_cluster.secondary.arn
}

output "dsql_connect_policy_arn" {
  value = aws_iam_policy.dsql_connect.arn
}

# Convenience: terraform output -raw spike_env > ../../packages/spike-failover/.env
output "spike_env" {
  description = "Paste/redirect into packages/spike-failover/.env"
  value       = <<-EOT
    DSQL_ENDPOINT_USE1=${aws_dsql_cluster.primary.identifier}.dsql.${var.primary_region}.on.aws
    DSQL_ENDPOINT_USE2=${aws_dsql_cluster.secondary.identifier}.dsql.${var.secondary_region}.on.aws
    DSQL_REGION_USE1=${var.primary_region}
    DSQL_REGION_USE2=${var.secondary_region}
  EOT
}
