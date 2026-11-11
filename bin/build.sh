#!/usr/bin/env bash
#
# Build, and optionally release, the extension.
#
#   bin/build.sh                     verify + package the current version (no git changes)
#   bin/build.sh <patch|minor|major|x.y.z> [--push] [--publish]
#                                    cut a release:
#     1. preflight: on main, clean tree, tag unused, CHANGELOG has notes
#     2. npm ci, then bump package.json + public/manifest.json together and
#        date the CHANGELOG
#     3. the full verify suite (types, lint, unit, browser tests)
#     4. package release/tab-audio-control-<version>.zip, inspect it, and sign
#        release/tab-audio-control-<version>.crx (Web Store "Verified CRX uploads")
#     5. commit "chore(release): v<version>" and tag v<version>
#     6. with --push: push main + tag, create a GitHub release with the zip
#     7. with --publish: upload the .crx to the Chrome Web Store and submit it
#        for review
#   bin/build.sh --publish           retry step 7 for a release that's already
#                                    tagged (rebuilds it from the clean tag)
#
# Options:
#   --push           push and publish the GitHub release (needs `gh auth login`)
#   --publish        upload to the Chrome Web Store and submit for review
#   --store-assets   also re-render store/ screenshots from the current popup
#
# Signing key (releases require it; the Web Store only accepts signed updates),
# first match wins:
#   1. $CRX_SIGNING_KEY, a path to the .pem
#   2. $OP_CRX_KEY_ITEM, a 1Password Document item ID (optionally $OP_VAULT);
#      fetched into a private temp file that's deleted when the script exits
#   3. ~/.config/tab-audio-control/crx-signing-key.pem
# Put personal settings like OP_CRX_KEY_ITEM in .env.release (gitignored).
# The key must match store/crx-public-key.pem and must never be in the repo.
#
# Chrome Web Store (--publish) uses the store's API as a service account; see
# CONTRIBUTING.md for the one-time setup. It needs, in .env.release:
#   CWS_PUBLISHER_ID, CWS_ITEM_ID   from the developer dashboard
#   OP_CWS_KEY_ITEM                 1Password Document item holding the service
#                                   account's JSON key (or $CWS_SERVICE_ACCOUNT_KEY,
#                                   a path outside the repo)
# Without --publish the upload stays manual: the script prints the steps at the end.
#
set -euo pipefail

# Run from the repo root regardless of where the script is invoked.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

BUMP=""
PUSH=false
PUBLISH=false
STORE_ASSETS=false
for arg in "$@"; do
	case "$arg" in
	--push) PUSH=true ;;
	--publish) PUBLISH=true ;;
	--store-assets) STORE_ASSETS=true ;;
	-h | --help)
		awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
		exit 0
		;;
	patch | minor | major) BUMP="$arg" ;;
	[0-9]*.[0-9]*.[0-9]*) BUMP="$arg" ;;
	*)
		echo "Unknown argument: $arg (try --help)" >&2
		exit 1
		;;
	esac
done

if [[ "$PUSH" == true && -z "$BUMP" ]]; then
	echo "--push needs a version (patch, minor, major or x.y.z)." >&2
	exit 1
fi

step() { printf '\n\033[1;35m==>\033[0m \033[1m%s\033[0m\n' "$*"; }
fail() {
	printf '\033[1;31mError:\033[0m %s\n' "$*" >&2
	exit 1
}

json_version() { node -p "require('./$1').version"; }

# Personal, untracked settings (OP_CRX_KEY_ITEM, OP_VAULT, CRX_SIGNING_KEY).
if [[ -f .env.release ]]; then
	# shellcheck source=/dev/null
	source .env.release
fi

# Runs however the script ends: deletes fetched keys, and if a release failed
# between the version bump and the commit, puts the bumped files back so the
# tree is clean for the next try.
KEY_DIR=""
BUMPED=false
cleanup() {
	if [[ -n "$KEY_DIR" ]]; then rm -rf "$KEY_DIR"; fi
	if [[ "$BUMPED" == true ]]; then
		git checkout --quiet HEAD -- package.json package-lock.json public/manifest.json CHANGELOG.md store
		echo "Release not cut: version files restored." >&2
	fi
}
trap cleanup EXIT

# op_document <item id> <file name>: fetches a 1Password Document into a private
# temp dir that's deleted when the script exits, and sets OP_FILE to its path.
op_document() {
	command -v op >/dev/null || fail "A 1Password item is configured but the 1Password CLI (op) isn't installed."
	[[ -n "$KEY_DIR" ]] || KEY_DIR="$(mktemp -d)"
	OP_FILE="$KEY_DIR/$2"
	local args=(document get "$1" --out-file "$OP_FILE" --file-mode 0600)
	[[ -n "${OP_VAULT:-}" ]] && args+=(--vault "$OP_VAULT")
	echo "Reading $2 from 1Password…"
	op "${args[@]}" >/dev/null || fail "Couldn't read 1Password item $1."
}

# Sets SIGNING_KEY to a .pem path, fetching from 1Password if configured.
resolve_signing_key() {
	if [[ -n "${CRX_SIGNING_KEY:-}" ]]; then
		SIGNING_KEY="$CRX_SIGNING_KEY"
	elif [[ -n "${OP_CRX_KEY_ITEM:-}" ]]; then
		op_document "$OP_CRX_KEY_ITEM" crx-signing-key.pem
		SIGNING_KEY="$OP_FILE"
	else
		SIGNING_KEY="$HOME/.config/tab-audio-control/crx-signing-key.pem"
	fi
}

# Exports what scripts/publish.mjs needs, then proves the credentials work
# (read-only), so a bad key stops the release before anything is changed.
check_store_access() {
	[[ -n "${CWS_PUBLISHER_ID:-}" && -n "${CWS_ITEM_ID:-}" ]] ||
		fail "--publish needs CWS_PUBLISHER_ID and CWS_ITEM_ID (set them in .env.release)."
	if [[ -z "${CWS_SERVICE_ACCOUNT_KEY:-}" ]]; then
		[[ -n "${OP_CWS_KEY_ITEM:-}" ]] ||
			fail "--publish needs OP_CWS_KEY_ITEM (a 1Password Document item) or CWS_SERVICE_ACCOUNT_KEY (a path)."
		op_document "$OP_CWS_KEY_ITEM" cws-service-account.json
		CWS_SERVICE_ACCOUNT_KEY="$OP_FILE"
	fi
	export CWS_PUBLISHER_ID CWS_ITEM_ID CWS_SERVICE_ACCOUNT_KEY
	node scripts/publish.mjs --check || fail "Couldn't reach the Chrome Web Store API with those credentials."
}

# Fails if the zip holds anything that shouldn't ship (keys, maps, env files).
inspect_zip() {
	local zip="$1" listing
	listing="$(unzip -Z1 "$zip")"
	grep -qx 'manifest.json' <<<"$listing" || fail "$zip has no manifest.json"
	if grep -E '\.(map|pem|key|crx|zip)$|(^|/)\.env' <<<"$listing"; then
		fail "$zip contains files that must not ship (listed above)"
	fi
	if unzip -p "$zip" | LC_ALL=C grep -aE '/Users/|/home/[a-z]' >/dev/null; then
		fail "$zip contains local filesystem paths"
	fi
	echo "$zip ($(du -h "$zip" | cut -f1 | tr -d ' '), $(wc -l <<<"$listing" | tr -d ' ') files) looks clean"
}

# ---------------------------------------------------------------------------
# Build only
# ---------------------------------------------------------------------------
if [[ -z "$BUMP" ]]; then
	if [[ "$PUBLISH" == true ]]; then
		# Only ever upload exactly what was released.
		step "Preflight"
		[[ -z "$(git status --porcelain)" ]] || fail "Working tree isn't clean. Commit or stash first."
		git tag --points-at HEAD | grep -qx "v$(json_version package.json)" ||
			fail "--publish without a version re-uploads an existing release: check out its tag first."
		check_store_access
	fi
	step "Verifying v$(json_version package.json)"
	npm run verify
	[[ "$STORE_ASSETS" == true ]] && { step "Rendering store assets" && node scripts/store-assets.mjs; }
	step "Packaging"
	node scripts/package.mjs
	inspect_zip "release/tab-audio-control-$(json_version dist/manifest.json).zip"
	step "Signing"
	resolve_signing_key
	CRX_SIGNING_KEY="$SIGNING_KEY" node scripts/sign.mjs || {
		[[ $? -eq 2 && "$PUBLISH" != true ]] || exit 1
		echo "Skipped: no signing key, so no .crx (fine for local builds)."
	}
	if [[ "$PUBLISH" == true ]]; then
		step "Uploading to the Chrome Web Store"
		node scripts/publish.mjs
	fi
	exit 0
fi

# ---------------------------------------------------------------------------
# Release
# ---------------------------------------------------------------------------
step "Preflight"
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || fail "Releases are cut from main."
[[ -z "$(git status --porcelain)" ]] || fail "Working tree isn't clean. Commit or stash first."
resolve_signing_key
[[ -f "$SIGNING_KEY" ]] ||
	fail "No CRX signing key at $SIGNING_KEY. The Web Store requires signed updates (set OP_CRX_KEY_ITEM in .env.release, or CRX_SIGNING_KEY)."
if [[ "$PUSH" == true ]]; then
	gh auth status >/dev/null 2>&1 || fail "gh isn't logged in. Run: gh auth login"
	# An empty remote (first push) has no main yet, so there's nothing to be behind.
	if git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
		git fetch --quiet origin main
		[[ -z "$(git rev-list HEAD..origin/main)" ]] || fail "origin/main has commits you don't. Pull first."
	fi
fi
[[ "$PUBLISH" == true ]] && check_store_access

CURRENT="$(json_version package.json)"
[[ "$CURRENT" == "$(json_version public/manifest.json)" ]] ||
	fail "package.json ($CURRENT) and manifest.json versions differ."

if [[ "$BUMP" =~ ^[0-9] ]]; then
	VERSION="$BUMP"
else
	VERSION="$(node -e '
		const [maj, min, pat] = process.argv[1].split(".").map(Number);
		const next = { major: [maj + 1, 0, 0], minor: [maj, min + 1, 0], patch: [maj, min, pat + 1] };
		console.log(next[process.argv[2]].join("."));
	' "$CURRENT" "$BUMP")"
fi
TAG="v$VERSION"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && fail "Tag $TAG already exists."
if [[ "$PUSH" == true ]] && git ls-remote --exit-code --tags origin "$TAG" >/dev/null 2>&1; then
	fail "Tag $TAG already exists on origin."
fi
echo "Releasing $CURRENT → $VERSION"

step "Installing exact dependencies"
npm ci

step "Updating versions and CHANGELOG"
BUMPED=true
TODAY="$(date +%Y-%m-%d)"
node - "$VERSION" "$TODAY" <<'NODE'
const fs = require('fs');
const [version, today] = process.argv.slice(2);

// CHANGELOG first, so a missing entry stops us before anything is written.
// Either date an existing "## [x.y.z] - Unreleased" heading, or move the
// [Unreleased] notes under a new heading.
let log = fs.readFileSync('CHANGELOG.md', 'utf8');
const pending = `## [${version}] - Unreleased`;
if (log.includes(pending)) {
	log = log.replace(pending, `## [${version}] - ${today}`);
} else {
	const match = log.match(/## \[Unreleased\]\n([\s\S]*?)(?=\n## \[|$)/);
	if (!match || !match[1].trim()) {
		console.error(`CHANGELOG.md has no notes under [Unreleased] for ${version}. Add them, commit, and rerun.`);
		process.exit(1);
	}
	log = log.replace('## [Unreleased]\n', `## [Unreleased]\n\n## [${version}] - ${today}\n`);
}

for (const file of ['package.json', 'public/manifest.json']) {
	const json = JSON.parse(fs.readFileSync(file, 'utf8'));
	json.version = version;
	fs.writeFileSync(file, JSON.stringify(json, null, '\t') + '\n');
}
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
lock.version = version;
if (lock.packages?.['']) lock.packages[''].version = version;
fs.writeFileSync('package-lock.json', JSON.stringify(lock, null, '\t') + '\n');
fs.writeFileSync('CHANGELOG.md', log);
NODE
# Re-format what we rewrote so the lint step stays green.
npx prettier --log-level warn --write package.json public/manifest.json CHANGELOG.md

step "Verifying"
npm run verify

if [[ "$STORE_ASSETS" == true ]]; then
	step "Rendering store assets"
	node scripts/store-assets.mjs
fi

step "Packaging"
node scripts/package.mjs
ZIP="release/tab-audio-control-$VERSION.zip"
CRX="release/tab-audio-control-$VERSION.crx"
inspect_zip "$ZIP"

step "Signing"
CRX_SIGNING_KEY="$SIGNING_KEY" node scripts/sign.mjs

step "Committing and tagging $TAG"
git add package.json package-lock.json public/manifest.json CHANGELOG.md
[[ "$STORE_ASSETS" == true ]] && git add store
git commit --quiet -m "chore(release): $TAG"
BUMPED=false
git tag -a "$TAG" -m "$TAG"
git log --oneline -1

if [[ "$PUSH" == true ]]; then
	step "Pushing and publishing the GitHub release"
	git push --quiet origin main "$TAG"
	NOTES="$(awk -v v="$VERSION" '
		$0 ~ "^## \\[" v "\\]" { on = 1; next }
		on && /^## \[/ { exit }
		on { print }
	' CHANGELOG.md)"
	gh release create "$TAG" "$ZIP" --title "$TAG" --notes "$NOTES"
fi

if [[ "$PUBLISH" == true ]]; then
	step "Uploading to the Chrome Web Store"
	node scripts/publish.mjs || fail "The release is cut, but the store upload failed. Retry with: bin/build.sh --publish"
fi

step "Done: $TAG"
if [[ "$PUSH" != true ]]; then
	echo "Not pushed. When ready:  git push origin main $TAG"
	echo "Or redo with --push next time to push and create the GitHub release too."
fi
if [[ "$PUBLISH" == true ]]; then
	echo "Submitted to the Chrome Web Store for review. If the UI changed, upload new screenshots from store/ in the dashboard."
	exit 0
fi
cat <<EOF

Chrome Web Store:
  1. https://chrome.google.com/webstore/devconsole → Tab Audio Control → Package → Upload new package
  2. Upload $CRX  (signed; verified uploads reject the plain zip)
  3. If the UI changed, upload new screenshots from store/ (bin/build.sh --store-assets renders them)
  4. Submit for review
EOF
