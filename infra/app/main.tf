locals {
  tags = {
    Project     = "quorum"
    Component   = "app"
    Environment = "production"
  }
}

# Production multi-Region DSQL: two peered clusters (us-east-1 + us-east-2) sharing one witness
# (us-west-2) — the same pattern WP-0 proved, with deletion protection ON. Resource names
# verified against hashicorp/aws v6.49.
resource "aws_dsql_cluster" "primary" {
  deletion_protection_enabled = var.deletion_protection

  multi_region_properties {
    witness_region = var.witness_region
  }

  tags = { Name = "quorum-${var.primary_region}" }
}

resource "aws_dsql_cluster" "secondary" {
  provider                    = aws.secondary
  deletion_protection_enabled = var.deletion_protection

  multi_region_properties {
    witness_region = var.witness_region
  }

  tags = { Name = "quorum-${var.secondary_region}" }
}

resource "aws_dsql_cluster_peering" "primary" {
  identifier     = aws_dsql_cluster.primary.identifier
  witness_region = var.witness_region
  clusters       = [aws_dsql_cluster.secondary.arn]
}

resource "aws_dsql_cluster_peering" "secondary" {
  provider       = aws.secondary
  identifier     = aws_dsql_cluster.secondary.identifier
  witness_region = var.witness_region
  clusters       = [aws_dsql_cluster.primary.arn]
}
