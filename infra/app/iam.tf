# Vercel runs outside AWS, so the app's serverless functions need a long-lived IAM user's access
# keys to sign DSQL IAM tokens (@aws-sdk/dsql-signer). This user can do dsql connect on both
# clusters and nothing else. Create its access key OUT OF BAND
# (aws iam create-access-key --user-name quorum-vercel) and put the secret straight into the
# Vercel project env; it must never reach tfstate, the repo, or logs.
resource "aws_iam_user" "vercel" {
  name = "quorum-vercel"
}

data "aws_iam_policy_document" "vercel_connect" {
  statement {
    sid       = "DsqlConnect"
    actions   = ["dsql:DbConnect", "dsql:DbConnectAdmin"]
    resources = [aws_dsql_cluster.primary.arn, aws_dsql_cluster.secondary.arn]
  }
}

resource "aws_iam_user_policy" "vercel_connect" {
  name   = "dsql-connect"
  user   = aws_iam_user.vercel.name
  policy = data.aws_iam_policy_document.vercel_connect.json
}

output "vercel_user" {
  description = "IAM user for the Vercel runtime; create its access key out of band."
  value       = aws_iam_user.vercel.name
}
