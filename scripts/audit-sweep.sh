#!/usr/bin/env bash
# scripts/audit-sweep.sh — READ-ONLY sweep for billable / silent-biller AWS resources.
#
# Enumerates resource classes that cost money while they exist across every ENABLED region,
# then global services. Only describe/list/get calls — it never creates, modifies, or
# deletes anything.
#
# Usage:
#   AWS_PROFILE=h0 scripts/audit-sweep.sh
#   scripts/audit-sweep.sh --profile h0 --region-only us-east-1
#
# Output is plain text, greppable, grouped by region then service. Resources that bill while
# idle are flagged inline (unattached EIPs, never-expire log groups, public S3 buckets, ...).

set -uo pipefail

PROFILE="${AWS_PROFILE:-h0}"
ONLY_REGION=""
while [ $# -gt 0 ]; do
  case "$1" in
    --profile)     PROFILE="$2"; shift 2 ;;
    --region-only) ONLY_REGION="$2"; shift 2 ;;
    -h|--help)     grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

export AWS_PROFILE="$PROFILE"
export AWS_PAGER=""
export AWS_DEFAULT_OUTPUT="text"

hr()  { printf '\n========================  %s  ========================\n' "$*"; }
sub() { printf '\n  -- %s --\n' "$*"; }

# q LABEL <aws ...> : run a read-only call; print results (indented), or (none)/(error).
q() {
  local label="$1"; shift
  local out rc
  out="$("$@" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then
    printf '    %-36s ERROR: %s\n' "$label" "$(printf '%s' "$out" | head -n1 | cut -c1-140)"
  elif [ -z "${out//[[:space:]]/}" ]; then
    printf '    %-36s (none)\n' "$label"
  else
    printf '    %-36s\n' "$label"
    printf '%s\n' "$out" | sed 's/^/        /'
  fi
}

ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo UNKNOWN)"
hr "ACCOUNT ${ACCOUNT}  —  audit sweep  $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

if [ -n "$ONLY_REGION" ]; then
  REGIONS="$ONLY_REGION"
else
  REGIONS="$(aws ec2 describe-regions --query 'Regions[].RegionName' --output text 2>/dev/null)"
fi
if [ -z "${REGIONS// /}" ]; then
  echo "Could not list regions (auth not ready?). Aborting." >&2
  exit 1
fi
echo "Enabled regions: ${REGIONS}"

sweep_region() {
  local r="$1"
  hr "REGION ${r}"

  sub "Compute / network (classic silent billers)"
  q "EC2 instances"               aws ec2 describe-instances --region "$r" --query 'Reservations[].Instances[].[InstanceId,InstanceType,State.Name]'
  q "EBS volumes"                 aws ec2 describe-volumes --region "$r" --query 'Volumes[].[VolumeId,Size,State,VolumeType]'
  q "EBS snapshots (self)"        aws ec2 describe-snapshots --owner-ids self --region "$r" --query 'Snapshots[].[SnapshotId,VolumeSize,StartTime]'
  q "Elastic IPs (None=unattached)" aws ec2 describe-addresses --region "$r" --query 'Addresses[].[PublicIp,AssociationId,InstanceId]'
  q "NAT gateways (available)"    aws ec2 describe-nat-gateways --region "$r" --filter Name=state,Values=available --query 'NatGateways[].[NatGatewayId,SubnetId]'
  q "ALB/NLB (elbv2)"             aws elbv2 describe-load-balancers --region "$r" --query 'LoadBalancers[].[LoadBalancerName,Type,State.Code]'
  q "Classic ELB"                 aws elb describe-load-balancers --region "$r" --query 'LoadBalancerDescriptions[].LoadBalancerName'
  q "Interface/GWLB VPC endpoints" aws ec2 describe-vpc-endpoints --region "$r" --query 'VpcEndpoints[?VpcEndpointType!=`Gateway`].[VpcEndpointId,ServiceName,VpcEndpointType,State]'
  q "Transit Gateways"            aws ec2 describe-transit-gateways --region "$r" --query 'TransitGateways[?State!=`deleted`].[TransitGatewayId,State]'
  q "Site-to-Site VPNs"           aws ec2 describe-vpn-connections --region "$r" --query 'VpnConnections[?State!=`deleted`].[VpnConnectionId,State]'

  sub "Databases / streaming"
  q "RDS instances"               aws rds describe-db-instances --region "$r" --query 'DBInstances[].[DBInstanceIdentifier,DBInstanceClass,Engine,DBInstanceStatus]'
  q "RDS / Aurora clusters"       aws rds describe-db-clusters --region "$r" --query 'DBClusters[].[DBClusterIdentifier,Engine,Status]'
  q "Redshift clusters"           aws redshift describe-clusters --region "$r" --query 'Clusters[].[ClusterIdentifier,NodeType,ClusterStatus]'
  q "OpenSearch domains"          aws opensearch list-domain-names --region "$r" --query 'DomainNames[].DomainName'
  q "ElastiCache clusters"        aws elasticache describe-cache-clusters --region "$r" --query 'CacheClusters[].[CacheClusterId,CacheNodeType,Engine]'
  q "Neptune clusters"            aws neptune describe-db-clusters --region "$r" --query 'DBClusters[?Engine==`neptune`].[DBClusterIdentifier,Status]'
  q "DocumentDB clusters"         aws docdb describe-db-clusters --region "$r" --query 'DBClusters[?Engine==`docdb`].[DBClusterIdentifier,Status]'
  q "Kinesis streams"             aws kinesis list-streams --region "$r" --query 'StreamNames'
  q "MSK (Kafka) clusters"        aws kafka list-clusters --region "$r" --query 'ClusterInfoList[].[ClusterName,State]'
  q "DynamoDB tables"             aws dynamodb list-tables --region "$r" --query 'TableNames'

  sub "Containers / serverless / ML"
  q "EKS clusters"                aws eks list-clusters --region "$r" --query 'clusters'
  q "ECS clusters"                aws ecs list-clusters --region "$r" --query 'clusterArns'
  local carns
  carns="$(aws ecs list-clusters --region "$r" --query 'clusterArns' --output text 2>/dev/null)"
  if [ -n "${carns// /}" ]; then
    for c in $carns; do
      q "  services @ ${c##*/}"   aws ecs list-services --cluster "$c" --region "$r" --query 'serviceArns'
    done
  fi
  q "Lambda functions"            aws lambda list-functions --region "$r" --query 'Functions[].FunctionName'
  q "SageMaker endpoints"         aws sagemaker list-endpoints --region "$r" --query 'Endpoints[].[EndpointName,EndpointStatus]'
  q "SageMaker notebooks"         aws sagemaker list-notebook-instances --region "$r" --query 'NotebookInstances[].[NotebookInstanceName,NotebookInstanceStatus]'
  q "App Runner services"         aws apprunner list-services --region "$r" --query 'ServiceSummaryList[].[ServiceName,Status]'
  q "Elastic Beanstalk envs"      aws elasticbeanstalk describe-environments --region "$r" --query 'Environments[?Status!=`Terminated`].[EnvironmentName,Status]'
  q "Amplify apps"                aws amplify list-apps --region "$r" --query 'apps[].[name,appId]'
  q "Lightsail instances"         aws lightsail get-instances --region "$r" --query 'instances[].[name,bundleId]'

  sub "Storage / KMS / logs / other"
  q "EFS file systems"            aws efs describe-file-systems --region "$r" --query 'FileSystems[].[FileSystemId,Name,SizeInBytes.Value]'
  q "FSx file systems"            aws fsx describe-file-systems --region "$r" --query 'FileSystems[].[FileSystemId,FileSystemType,StorageCapacity]'
  q "Backup vaults"               aws backup list-backup-vaults --region "$r" --query 'BackupVaultList[].[BackupVaultName,NumberOfRecoveryPoints]'
  q "ECR repositories"            aws ecr describe-repositories --region "$r" --query 'repositories[].repositoryName'
  q "Secrets Manager secrets"     aws secretsmanager list-secrets --region "$r" --query 'SecretList[].Name'
  q "CW log groups (never-expire)" aws logs describe-log-groups --region "$r" --query 'logGroups[?retentionInDays==null].[logGroupName,storedBytes]'
  q "CW custom dashboards"        aws cloudwatch list-dashboards --region "$r" --query 'DashboardEntries[].DashboardName'
  q "SES identities (v2)"         aws sesv2 list-email-identities --region "$r" --query 'EmailIdentities[].[IdentityName,IdentityType]'

  # KMS customer-managed keys ($1/mo each) — list, then classify per key.
  local keys cmk=""
  keys="$(aws kms list-keys --region "$r" --query 'Keys[].KeyId' --output text 2>/dev/null)"
  if [ -n "${keys// /}" ]; then
    for k in $keys; do
      local meta mgr state
      meta="$(aws kms describe-key --key-id "$k" --region "$r" --query 'KeyMetadata.[KeyManager,KeyState]' --output text 2>/dev/null)"
      mgr="${meta%%[[:space:]]*}"; state="${meta##*[[:space:]]}"
      if [ "$mgr" = "CUSTOMER" ] && [ "$state" != "PendingDeletion" ]; then
        cmk="${cmk} ${k}(${state})"
      fi
    done
  fi
  if [ -n "${cmk// /}" ]; then
    printf '    %-36s\n        %s\n' "KMS customer-managed keys" "$cmk"
  else
    printf '    %-36s (none)\n' "KMS customer-managed keys"
  fi
}

for r in $REGIONS; do
  sweep_region "$r"
done

hr "GLOBAL SERVICES"

sub "S3 buckets (+ public-access posture)"
buckets="$(aws s3api list-buckets --query 'Buckets[].Name' --output text 2>/dev/null)"
if [ -z "${buckets// /}" ]; then
  echo "    (no buckets)"
else
  for b in $buckets; do
    pab="$(aws s3api get-public-access-block --bucket "$b" --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' --output text 2>/dev/null)"
    [ -z "${pab// /}" ] && pab="NO-PUBLIC-ACCESS-BLOCK(!)"
    pol="$(aws s3api get-bucket-policy-status --bucket "$b" --query 'PolicyStatus.IsPublic' --output text 2>/dev/null || echo n/a)"
    loc="$(aws s3api get-bucket-location --bucket "$b" --query 'LocationConstraint' --output text 2>/dev/null)"
    printf '    %-42s region=%-12s public-policy=%-5s PAB[acls,ign,pol,restrict]=%s\n' "$b" "${loc:-us-east-1}" "$pol" "$pab"
  done
fi

sub "CloudFront / Route53 / Global Accelerator"
q "CloudFront distributions" aws cloudfront list-distributions --query 'DistributionList.Items[].[Id,DomainName,Enabled]'
q "Route53 hosted zones"     aws route53 list-hosted-zones --query 'HostedZones[].[Name,Id]'
q "Route53 registered domains (auto-renew)" aws route53domains list-domains --region us-east-1 --query 'Domains[].[DomainName,AutoRenew,Expiry]'
q "Global Accelerator"       aws globalaccelerator list-accelerators --region us-west-2 --query 'Accelerators[].[Name,Status]'

hr "SWEEP COMPLETE"
