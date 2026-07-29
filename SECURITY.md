# Security Policy

## Supported Versions

Security fixes target the latest commit on `main` and the latest published release. Older source snapshots may not receive fixes.

## Reporting a Vulnerability

Do not open a public Issue for a suspected vulnerability.

Use the repository’s **Security** tab and select **Report a vulnerability** to create a private GitHub Security Advisory. Include:

- affected commit or release;
- reproduction steps;
- expected and observed impact;
- relevant logs with secrets and personal data removed;
- any suggested mitigation.

Maintainers will acknowledge a complete report within seven days when possible, assess severity, coordinate a fix, and publish credit if the reporter requests it.

## Sensitive Data

Roomark can contain property addresses, notes, photos, dimensions, and risk observations. Test reports and Issues must use synthetic data. Never publish API keys, tokens, private keys, exact personal addresses, or identifiable tenant information.

## Scope

Security reports may cover:

- Android local-data exposure or corruption;
- unsafe WebView behavior;
- backend authorization or input-validation defects;
- database or container configuration;
- CI, release, or supply-chain compromise;
- accidental credential disclosure.

Feature requests and general support questions belong in the normal Issue and support channels described in [SUPPORT.md](SUPPORT.md).
