# Eco Crafter Toolkit — AWS infrastructure

CDK app that provisions the production hosting for `eco-crafter.classless.net`.

## What it creates

- **Private S3 bucket** for the built site (`vite build` output).
- **CloudFront distribution** fronting the bucket via an Origin Access Control,
  with per-path-prefix cache + compression behaviors and a custom domain.
- **ACM certificate** for the custom domain, validated by DNS.

| Path pattern                                       | CF cache TTL | `Cache-Control` returned              | Compress |
| -------------------------------------------------- | ------------ | ------------------------------------- | -------- |
| default (`/index.html`, favicon, banner, manifest) | 0            | `no-cache`                            | yes      |
| `/assets/*`                                        | 1y           | `public, max-age=31536000, immutable` | yes      |
| `/data/*`                                          | 1d           | `public, max-age=86400`               | yes      |
| `/eco-icons/*`                                     | 1d           | `public, max-age=86400`               | no       |
| `/icons/*`                                         | 1d           | `public, max-age=86400`               | no       |
| `/primereact-themes/*`                             | 1d           | `public, max-age=86400`               | yes      |

The actual site upload + invalidation happens in the
`.github/workflows/deploy.yml` workflow on merge to `production` — this CDK
stack just provisions the platform.

## Prerequisites

1. AWS account with admin access for the initial deploy.
2. AWS CLI configured locally (`aws configure` or `AWS_PROFILE=...`).
3. Ability to add CNAME records at the external DNS provider for `classless.net`.
4. `mise` installed (already required by the main repo).

## First-time setup

```sh
cd infra
mise exec -- aube install --frozen-lockfile
mise exec -- aube exec cdk bootstrap aws://<account-id>/us-east-1
mise exec -- aube exec cdk deploy
```

The first `cdk deploy` will pause inside CloudFormation while the ACM
certificate sits in `PENDING_VALIDATION`. Find the validation `CNAME`:

```sh
aws acm list-certificates --region us-east-1
aws acm describe-certificate --region us-east-1 \
  --certificate-arn <arn-from-list>
```

Copy the `Name` / `Value` pair from `DomainValidationOptions[0].ResourceRecord`
into the external DNS provider as a `CNAME`. ACM polls every minute or so;
the stack will roll forward on its own once validation succeeds.

After deploy completes, note the stack outputs:

- `SiteBucketName` — the S3 bucket the deploy workflow uploads to.
- `DistributionId` — the CloudFront distribution to invalidate.
- `DistributionDomain` — the `dxxxx.cloudfront.net` hostname.

Add `eco-crafter` as a `CNAME` pointing to `DistributionDomain` at the
external DNS provider.

## GitHub Actions deploy user

Create one IAM user with programmatic access and attach this inline policy
(replace `<bucket>`, `<account-id>`, and `<dist-id>` with the stack outputs):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::<bucket>"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::<bucket>/*"
    },
    {
      "Effect": "Allow",
      "Action": ["cloudfront:CreateInvalidation"],
      "Resource": "arn:aws:cloudfront::<account-id>:distribution/<dist-id>"
    }
  ]
}
```

Then in the GitHub repo settings:

- **Secrets** (`Settings → Secrets and variables → Actions → Secrets`):
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
- **Variables** (`Settings → Secrets and variables → Actions → Variables`):
  - `SITE_BUCKET` — value of `SiteBucketName`
  - `DISTRIBUTION_ID` — value of `DistributionId`

## Subsequent deploys

Infra changes:

```sh
cd infra
mise exec -- aube exec cdk diff
mise exec -- aube exec cdk deploy
```

Site content changes happen automatically via the workflow on push to
`production`.

## Adding a Lambda API later

When server-side functions are needed, define the function in
`lib/eco-crafter-stack.ts` and attach it as an additional behavior on the
existing distribution:

```ts
const apiFn = new lambda.Function(this, 'Api', {
  /* ... */
})
const fnUrl = apiFn.addFunctionUrl({
  authType: lambda.FunctionUrlAuthType.AWS_IAM,
})
distribution.addBehavior('/api/*', new origins.FunctionUrlOrigin(fnUrl), {
  cachePolicy: cf.CachePolicy.CACHING_DISABLED,
  originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
  allowedMethods: cf.AllowedMethods.ALLOW_ALL,
})
```

No changes to the bucket, the deploy workflow, or DNS are required.
