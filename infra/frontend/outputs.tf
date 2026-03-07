output "frontend_bucket_name" {
  description = "S3 bucket name — use as FRONTEND_S3_BUCKET in GitHub Secrets"
  value       = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID — use as CLOUDFRONT_DISTRIBUTION_ID in GitHub Secrets"
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_url" {
  description = "Your live frontend URL"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "allowed_origins_value" {
  description = "Paste this as ALLOWED_ORIGINS in GitHub Secrets (add your localhost too)"
  value       = "http://localhost:3000,https://${aws_cloudfront_distribution.frontend.domain_name}"
}
