# AWS Lambda deployment

Status: prepared, not deployed. No AWS credentials or ESPN cookies are committed.

## What gets created

- One Lambda function: 512 MB, x86_64, 60-second timeout, no provisioned concurrency.
- A Lambda Function URL for HTTPS access.
- A basic execution role and a log group with seven-day retention.
- An ECR container repository managed by SAM when you request image-repository resolution.

No VPC, NAT Gateway, API Gateway, database, always-on server or second scheduler. ChatGPT runs the reports; Lambda only fetches ESPN data when called. Function URLs have no separate API Gateway charge. ECR image storage and CloudWatch logs can cost money even when Lambda compute fits your free allowance. This is not a guaranteed-free deployment. Budget alerts are notifications, not hard spending caps. Remove old ECR images as the repository grows.

## Deploy

You need AWS CLI with an authenticated profile, current AWS SAM CLI, and Docker on the machine running the build. This can be a development machine or suitable cloud development environment. The deployed function runs entirely in AWS; your computer can be off afterward. AWS CloudShell does not necessarily provide a usable Docker daemon, so do not assume these build commands work there unchanged.

From the repository root:

```bash
aws sts get-caller-identity
sam validate --lint
sam build
sam deploy --guided --resolve-image-repos
```

Choose your intended AWS account/region and a stack name such as `espn-fantasy-mcp`. For the parameters enter your league ID, team ID, season 2026, ESPN_S2 cookie, ESPN SWID cookie (including braces), and a random MCP token of at least 32 characters. Generate that separate token with your password manager or `openssl rand -hex 32` and store it in your password manager. Keep it out of chat and Git.

The three credential parameters use CloudFormation `NoEcho`; the function receives them as Lambda environment variables encrypted at rest. People with sufficient Lambda configuration permissions can still read those variables. Do not save secret parameter overrides in samconfig.toml: answer No when asked to save deployment arguments, and never paste secrets into shell history or committed parameter files. The gitignore and Docker exclusions also exclude samconfig.toml and .env files as a backstop.

SAM creates the function URL invocation permissions for AuthType NONE. That setting delegates authentication to this application's bearer-token check. Do not interpret it as permission to remove application authentication. The only unauthenticated application route is /health, which returns `ok` with no league data. Invalid MCP requests still invoke Lambda, so protect the token and endpoint and watch abnormal request volume.

## Check the deployment

Use McpEndpoint from the stack outputs. Check:

1. GET the corresponding /health URL: it should return `ok`.
2. POST /mcp without a token: it should return 401.
3. Connect with an MCP client using Streamable HTTP and `Authorization: Bearer <MCP_AUTH_TOKEN>`.
4. List tools and verify there are no write tools.
5. Call get_league and get_report_context for the intended team. Confirm league, roster, season, scoring settings and week match ESPN.
6. Repeat after idle to check cold-start behavior and the client's timeout.

The HTTP server returns buffered JSON without keeping MCP sessions in memory, which fits Lambda's request lifecycle. It does not depend on a background process continuing between invocations. The SDK may issue initialization notifications; these should succeed independently of any specific Lambda instance.

The server currently uses single-owner bearer authentication, not OAuth. Verify that the intended ChatGPT MCP/plugin connection supports this method. If it requires OAuth, add a compatible authentication gateway before scheduling; don't expose the service without authentication. The endpoint and token must be configured in the ChatGPT environment that runs the scheduled task. GitHub access alone doesn't provide this connection.

## Update and refresh

Build/deploy a new revision with SAM for code updates. Review parameter reuse carefully so existing secrets aren't overwritten. If ESPN cookies expire, update the Lambda environment variables directly in AWS or update the stack's secure parameters; direct console changes can be overwritten by subsequent stack updates unless parameters are kept in sync. Never return secret values in logs or reports.

Deleting the stack stops the function. Check SAM-managed ECR storage separately so old images don't remain billable.

## Validation boundaries

The Node build and 26 application tests passed locally. The SAM template requires validation in an authenticated AWS environment, and the Docker image and full Lambda/MCP path require a real deployment test. No live ESPN test or schedule has been completed.

References:
- https://github.com/aws/aws-lambda-web-adapter
- https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-property-function-functionurlconfig.html
- https://aws.amazon.com/lambda/pricing/
- https://aws.amazon.com/ecr/pricing/
