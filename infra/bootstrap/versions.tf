terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.49"
    }
  }

  # Chicken-and-egg: this stack CREATES the tfstate bucket the other stacks use, so its own state
  # is LOCAL and gitignored (CLAUDE.md). Keep it: it owns the permanent budget guardrail.
}
