# Security

Please **do not** open a public GitHub issue for vulnerabilities in authentication, billing, or data access.

## Reporting

Email **contact@orryon.com** with a description, impact, and steps to reproduce. If you use GitHub, file a [private security advisory](https://github.com/imagine369/orryon/security/advisories/new) on this repository.

We will acknowledge reports and work on a fix before any public disclosure.

## Scope

In scope: this repository, orryon.com, and the official desktop builds.

Out of scope: self-hosted deployments you run, third-party forks, and issues that require your own API keys (xAI, Stripe, Google).

## Secrets

Never commit `.env`, API keys, or production databases. Use `.env.example` as the template. Hosted production secrets stay in Railway / Vercel, not in git.
