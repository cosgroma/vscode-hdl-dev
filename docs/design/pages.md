# GitHub Pages

The documentation site is built with MkDocs and deployed with GitHub Pages
Actions.

## Build Tool

MkDocs is a Python documentation generator. The repository keeps that dependency
isolated to documentation builds through `requirements-docs.txt`; it is not part
of the VS Code extension's npm dependency graph.

The local build entry point is:

```bash
make docs-install
make docs-build
```

`make docs-build` runs:

```bash
mkdocs build --strict --site-dir site
```

The built site is written to `site/`, which is ignored by git and uploaded by
the Pages workflow.

## Deployment

`.github/workflows/pages.yml` follows the git-flow branch model:

- pushes to `develop` build the site for validation only
- pushes to `main` build, upload, and deploy the Pages artifact
- pull requests into `main` or `develop` build the site but do not deploy
- manual dispatch deploys only when run from `main`

The public site URL is:

```text
https://cosgroma.github.io/vscode-hdl-dev/
```
