output "cognito_pool_id" {
  description = "Cognito User Pool ID — set as COGNITO_POOL_ID in GitHub Secrets"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "Cognito App Client ID — set as COGNITO_CLIENT_ID in GitHub Secrets"
  value       = aws_cognito_user_pool_client.app.id
}

output "cognito_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = aws_cognito_user_pool.main.arn
}
