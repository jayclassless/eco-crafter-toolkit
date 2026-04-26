import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as cf from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'

const SITE_DOMAIN = 'eco-crafter.classless.net'

export class EcoCrafterStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    const cert = new acm.Certificate(this, 'SiteCert', {
      domainName: SITE_DOMAIN,
      validation: acm.CertificateValidation.fromDns(),
    })

    const oneDayCachePolicy = new cf.CachePolicy(this, 'OneDayCachePolicy', {
      cachePolicyName: 'EcoCrafter-OneDay',
      defaultTtl: Duration.days(1),
      maxTtl: Duration.days(1),
      minTtl: Duration.seconds(0),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    })

    const oneYearCachePolicy = new cf.CachePolicy(this, 'OneYearCachePolicy', {
      cachePolicyName: 'EcoCrafter-OneYear',
      defaultTtl: Duration.days(365),
      maxTtl: Duration.days(365),
      minTtl: Duration.seconds(0),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    })

    const noCacheHeaders = this.cacheControlPolicy('NoCacheHeaders', 'no-cache')
    const oneDayHeaders = this.cacheControlPolicy('OneDayHeaders', 'public, max-age=86400')
    const oneYearHeaders = this.cacheControlPolicy(
      'OneYearHeaders',
      'public, max-age=31536000, immutable'
    )

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(bucket)

    const baseBehavior = {
      origin: s3Origin,
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cf.AllowedMethods.ALLOW_GET_HEAD,
    }

    const distribution = new cf.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      domainNames: [SITE_DOMAIN],
      certificate: cert,
      priceClass: cf.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        ...baseBehavior,
        compress: true,
        cachePolicy: cf.CachePolicy.CACHING_DISABLED,
        responseHeadersPolicy: noCacheHeaders,
      },
      additionalBehaviors: {
        '/assets/*': {
          ...baseBehavior,
          compress: true,
          cachePolicy: oneYearCachePolicy,
          responseHeadersPolicy: oneYearHeaders,
        },
        '/data/*': {
          ...baseBehavior,
          compress: true,
          cachePolicy: oneDayCachePolicy,
          responseHeadersPolicy: oneDayHeaders,
        },
        '/eco-icons/*': {
          ...baseBehavior,
          compress: false,
          cachePolicy: oneDayCachePolicy,
          responseHeadersPolicy: oneDayHeaders,
        },
        '/icons/*': {
          ...baseBehavior,
          compress: false,
          cachePolicy: oneDayCachePolicy,
          responseHeadersPolicy: oneDayHeaders,
        },
        '/primereact-themes/*': {
          ...baseBehavior,
          compress: true,
          cachePolicy: oneDayCachePolicy,
          responseHeadersPolicy: oneDayHeaders,
        },
      },
    })

    new CfnOutput(this, 'SiteBucketName', { value: bucket.bucketName })
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId })
    new CfnOutput(this, 'DistributionDomain', {
      value: distribution.domainName,
    })
  }

  private cacheControlPolicy(id: string, value: string): cf.ResponseHeadersPolicy {
    return new cf.ResponseHeadersPolicy(this, id, {
      customHeadersBehavior: {
        customHeaders: [{ header: 'Cache-Control', value, override: true }],
      },
    })
  }
}
