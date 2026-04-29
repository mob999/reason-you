#!/usr/bin/env sh
set -eu

repo="${REASONYOU_REPO:-mob999/reason-you}"
version="${REASONYOU_VERSION:-latest}"
install_dir="${REASONYOU_INSTALL_DIR:-$HOME/.local/bin}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "reasonyou installer: missing required command: $1" >&2
    exit 1
  fi
}

detect_target() {
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m | tr '[:upper:]' '[:lower:]')"

  case "$os" in
    darwin*) os="darwin" ;;
    linux*) os="linux" ;;
    mingw* | msys* | cygwin*) os="windows" ;;
    *)
      echo "reasonyou installer: unsupported OS: $os" >&2
      exit 1
      ;;
  esac

  case "$arch" in
    x86_64 | amd64) arch="x64" ;;
    arm64 | aarch64) arch="arm64" ;;
    *)
      echo "reasonyou installer: unsupported architecture: $arch" >&2
      exit 1
      ;;
  esac

  printf 'bun-%s-%s' "$os" "$arch"
}

download() {
  url="$1"
  output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$output"
  else
    echo "reasonyou installer: missing curl or wget" >&2
    exit 1
  fi
}

target="$(detect_target)"
ext=""
if [ "${target#bun-windows-}" != "$target" ]; then
  ext=".exe"
fi

asset="reasonyou-$target$ext"
if [ "$version" = "latest" ]; then
  url="https://github.com/$repo/releases/latest/download/$asset"
else
  url="https://github.com/$repo/releases/download/$version/$asset"
fi

need uname
need mkdir
need chmod

tmp="${TMPDIR:-/tmp}/reasonyou-install.$$"
trap 'rm -f "$tmp"' EXIT INT TERM

echo "Downloading $asset from $repo..."
download "$url" "$tmp"

mkdir -p "$install_dir"
binary_name="reasonyou$ext"
install_path="$install_dir/$binary_name"
mv "$tmp" "$install_path"
chmod +x "$install_path"

echo "Installed reasonyou to $install_path"
case ":$PATH:" in
  *":$install_dir:"*) ;;
  *)
    echo "Add this to your shell profile if needed:"
    echo "  export PATH=\"$install_dir:\$PATH\""
    ;;
esac
