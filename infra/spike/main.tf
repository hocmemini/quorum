locals {
  tags = {
    Project   = "quorum"
    Component = "wp0-spike"
    Ephemeral = "true"
  }
}

# Two peered single-Region clusters (us-east-1 + us-east-2) sharing one witness (us-west-2).
# Resource names + arguments verified against hashicorp/aws v6.49 provider schema.
resource "aws_dsql_cluster" "primary" {
  deletion_protection_enabled = false

  multi_region_properties {
    witness_region = var.witness_region
  }

  tags = { Name = "quorum-spike-${var.primary_region}" }
}

resource "aws_dsql_cluster" "secondary" {
  provider                    = aws.secondary
  deletion_protection_enabled = false

  multi_region_properties {
    witness_region = var.witness_region
  }

  tags = { Name = "quorum-spike-${var.secondary_region}" }
}

# Peer each cluster with the other. Dedicated peering resources break the create-order cycle:
# both clusters exist first, then the bidirectional link is established.
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

# IAM: allow the spike runner to obtain admin auth tokens / connect to both clusters.
# (The real project attaches an equivalent policy to its Lambda/execution role instead.)
data "aws_iam_policy_document" "dsql_connect" {
  statement {
    sid       = "DsqlConnect"
    effect    = "Allow"
    actions   = ["dsql:DbConnect", "dsql:DbConnectAdmin"]
    resources = [aws_dsql_cluster.primary.arn, aws_dsql_cluster.secondary.arn]
  }
}

resource "aws_iam_policy" "dsql_connect" {
  name   = "quorum-spike-dsql-connect"
  policy = data.aws_iam_policy_document.dsql_connect.json
  tags   = { Name = "quorum-spike-dsql-connect" }
}

resource "aws_iam_user_policy_attachment" "dsql_connect" {
  count      = var.connect_user != "" ? 1 : 0
  user       = var.connect_user
  policy_arn = aws_iam_policy.dsql_connect.arn
}
