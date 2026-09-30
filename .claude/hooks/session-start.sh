#!/bin/bash
set -euo pipefail

# Only needed in Claude Code on the web -- a local checkout already has the
# SDK (or Android Studio manages it), so don't touch anything there.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Installed outside the repo -- android/local.properties (which points at
# this) is gitignored, same as every other local Android SDK install.
ANDROID_SDK_DIR="/opt/android-sdk"

# AGP 8.13.0 (this project's version) needs Build Tools 35.0.0 and supports
# up through API 36.1; compileSdk here is 36. Gradle/JDK aren't installed
# here because this image already ships Gradle >=8.13 and JDK 17+, both of
# which AGP 8.13.0 requires.
PLATFORM="platforms;android-36"
BUILD_TOOLS="build-tools;35.0.0"

SDKMANAGER="$ANDROID_SDK_DIR/cmdline-tools/latest/bin/sdkmanager"

if [ ! -x "$SDKMANAGER" ]; then
  # Pinned to a specific "command line tools only" build (not a moving
  # "latest" redirect) so this hook installs the same bits every time;
  # checksum from https://developer.android.com/studio#command-line-tools-only.
  CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip"
  CMDLINE_TOOLS_SHA256="4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583"

  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT
  curl -fsSL "$CMDLINE_TOOLS_URL" -o "$tmp_dir/cmdline-tools.zip"
  echo "$CMDLINE_TOOLS_SHA256  $tmp_dir/cmdline-tools.zip" | sha256sum -c -

  mkdir -p "$ANDROID_SDK_DIR/cmdline-tools"
  unzip -q "$tmp_dir/cmdline-tools.zip" -d "$ANDROID_SDK_DIR/cmdline-tools"
  # The zip's top-level folder is named "cmdline-tools" -- sdkmanager
  # itself requires this exact cmdline-tools/latest/... layout to find its
  # own sibling tools, so this rename isn't cosmetic.
  mv "$ANDROID_SDK_DIR/cmdline-tools/cmdline-tools" "$ANDROID_SDK_DIR/cmdline-tools/latest"
fi

# "yes |" sees a broken pipe once sdkmanager stops reading (it exits as
# soon as the last license is accepted), which is a normal SIGPIPE, not a
# real failure -- don't let set -e over that kill the hook.
yes | "$SDKMANAGER" --sdk_root="$ANDROID_SDK_DIR" --licenses > /dev/null 2>&1 || true

"$SDKMANAGER" --sdk_root="$ANDROID_SDK_DIR" "platform-tools" "$PLATFORM" "$BUILD_TOOLS" > /dev/null

echo "export ANDROID_HOME=$ANDROID_SDK_DIR" >> "$CLAUDE_ENV_FILE"
echo "export ANDROID_SDK_ROOT=$ANDROID_SDK_DIR" >> "$CLAUDE_ENV_FILE"

# android/local.properties is gitignored (it's meant to be per-machine) and
# Gradle refuses to find the SDK without it -- write it fresh every session
# rather than relying on it having survived from a previous one.
if [ -d "$CLAUDE_PROJECT_DIR/android" ]; then
  echo "sdk.dir=$ANDROID_SDK_DIR" > "$CLAUDE_PROJECT_DIR/android/local.properties"
fi
