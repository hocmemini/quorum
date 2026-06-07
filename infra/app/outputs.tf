output "primary_endpoint" {
  description = "us-east-1 DSQL connection endpoint host."
  value       = "${aws_dsql_cluster.primary.identifier}.dsql.${var.primary_region}.on.aws"
}

output "secondary_endpoint" {
  description = "us-east-2 DSQL connection endpoint host."
  value       = "${aws_dsql_cluster.secondary.identifier}.dsql.${var.secondary_region}.on.aws"
}

# Feeds infra/monitor (cluster_arns) and any app/ingestion IAM connect policy.
output "cluster_arns" {
  value = [aws_dsql_cluster.primary.arn, aws_dsql_cluster.secondary.arn]
}

output "regions" {
  value = {
    primary   = var.primary_region
    secondary = var.secondary_region
    witness   = var.witness_region
  }
}

# Convenience for the app/runtime .env (region-aware endpoint list).
output "app_env" {
  description = "Endpoint env for the data layer (DSQL_ENDPOINT_USE1/USE2)."
  value       = <<-EOT
    DSQL_ENDPOINT_USE1=${aws_dsql_cluster.primary.identifier}.dsql.${var.primary_region}.on.aws
    DSQL_ENDPOINT_USE2=${aws_dsql_cluster.secondary.identifier}.dsql.${var.secondary_region}.on.aws
    DSQL_REGION_USE1=${var.primary_region}
    DSQL_REGION_USE2=${var.secondary_region}
  EOT
}
