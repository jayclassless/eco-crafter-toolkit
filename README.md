# Eco Crafter Toolkit

[This application](https://eco-crafter.classless.net) gives players of
[Eco](https://play.eco) a price calculator for the in-game economy: pick
your skills, talents, plugin modules, and crafting tables, set prices for
the raw materials you can source, and the app derives the cost and sale
price of every recipe you can craft (with margins, ingredient swaps, and
recipe variants resolved automatically).

The app is free to use and records no information about you — all data is
stored locally in your browser.

## Contributing

Bug reports and pull requests are welcome on
[GitHub](https://github.com/jayclassless/eco-crafter-toolkit/issues).
For non-trivial changes, please open an issue first to discuss the
approach.

## Development

To set up an environment to develop this application, the most straight-
forward way is to use `mise`:

```shell
$ mise settings experimental=true
$ mise trust
$ mise install
```

To boot up a local development server:

```shell
$ aube run dev
```

## Deployment

Production hosting (S3 + CloudFront on `eco-crafter.classless.net`) is
defined as a CDK app under `infra/`. Pushes to the `production` branch
trigger `.github/workflows/deploy.yml`, which builds the site and uploads
to the S3 bucket provisioned by the stack, then invalidates CloudFront.

See `infra/README.md` for first-time setup, the IAM policy used by the
deploy workflow, and instructions for adding a future Lambda API behind
the same distribution.

## License

[MIT](LICENSE.txt) © Jason Simeone
