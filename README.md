# Reason You

Reason You is a developer CLI that explains the most recent failed shell command.

## Install

Install the latest GitHub Release binary:

```bash
curl -fsSL https://raw.githubusercontent.com/mob999/reason-you/main/install.sh | sh
```

On Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/mob999/reason-you/main/install.ps1 | iex
```

Install a specific tag:

```bash
curl -fsSL https://raw.githubusercontent.com/mob999/reason-you/main/install.sh | REASONYOU_VERSION=v0.1.0 sh
```

```powershell
$env:REASONYOU_VERSION = "v0.1.0"; irm https://raw.githubusercontent.com/mob999/reason-you/main/install.ps1 | iex
```

By default the installer writes to `~/.local/bin/reasonyou`. Override it with `REASONYOU_INSTALL_DIR`:

```bash
curl -fsSL https://raw.githubusercontent.com/mob999/reason-you/main/install.sh | REASONYOU_INSTALL_DIR=/usr/local/bin sh
```

On Windows the default install directory is `%LOCALAPPDATA%\Programs\reasonyou\bin`.

## Usage

Set up the shell hook and provider config:

```bash
reasonyou init
```

Check local configuration:

```bash
reasonyou doctor
```

Run a command that fails, then ask Reason You to explain it:

```bash
ls xxx
reasonyou
```

Useful options:

```bash
reasonyou --json
reasonyou --rerun
reasonyou --display-thinking
reasonyou --hide-thinking
reasonyou --model gpt-5
reasonyou config get
reasonyou --version
```

## Development

```bash
bun install
```

```bash
bun run check
bun test
bun run build
```
