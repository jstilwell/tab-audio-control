#!/usr/bin/env bash
#
# Build, and optionally release, the extension.
#
#   bin/build.sh                     verify + package the current version (no git changes)
#   bin/build.sh <patch|minor|major|x.y.z> [--push]
#                                    cut a release:
#     1. preflight: on main, clean tree, tag unused, CHANGELOG has notes
#     2. npm ci, then bump package.json + public/manifest.json together and
#        date the CHANGELOG
#     3. the full verify suite (types, lint, unit, browser tests)
#     4. package release/tab-audio-control-<version>.zip and inspect it
#     5. commit "chore(release): v<version>" and tag v<version>
#     6. with --push: push main + tag, create a GitHub release with the zip
#
# Options:
#   --push           push and publish the GitHub release (needs `gh auth login`)
#   --store-assets   also re-render store/ screenshots from the current popup
#
# The Chrome Web Store upload stays manual: the script prints the steps at the end.
#
set -euo pipefail

# Run from the repo root regardless of where the script is invoked.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

BUMP=""
PUSH=false
STORE_ASSETS=false
for arg in "$@"; do
	case "$arg" in
	--push) PUSH=true ;;
	--store-assets) STORE_ASSETS=true ;;
	-h | --help)
		sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
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
	step "Verifying v$(json_version package.json)"
	npm run verify
	[[ "$STORE_ASSETS" == true ]] && { step "Rendering store assets" && node scripts/store-assets.mjs; }
	step "Packaging"
	node scripts/package.mjs
	inspect_zip "release/tab-audio-control-$(json_version dist/manifest.json).zip"
	exit 0
fi

# ---------------------------------------------------------------------------
# Release
# ---------------------------------------------------------------------------
step "Preflight"
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || fail "Releases are cut from main."
[[ -z "$(git status --porcelain)" ]] || fail "Working tree isn't clean. Commit or stash first."
if [[ "$PUSH" == true ]]; then
	gh auth status >/dev/null 2>&1 || fail "gh isn't logged in. Run: gh auth login"
	# An empty remote (first push) has no main yet, so there's nothing to be behind.
	if git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
		git fetch --quiet origin main
		[[ -z "$(git rev-list HEAD..origin/main)" ]] || fail "origin/main has commits you don't. Pull first."
	fi
fi

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
inspect_zip "$ZIP"

step "Committing and tagging $TAG"
git add package.json package-lock.json public/manifest.json CHANGELOG.md
[[ "$STORE_ASSETS" == true ]] && git add store
git commit --quiet -m "chore(release): $TAG"
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

step "Done: $TAG"
if [[ "$PUSH" != true ]]; then
	echo "Not pushed. When ready:  git push origin main $TAG"
	echo "Or redo with --push next time to push and create the GitHub release too."
fi
cat <<EOF

Chrome Web Store:
  1. https://chrome.google.com/webstore/devconsole → Tab Audio Control → Package → Upload new package
  2. Upload $ZIP
  3. If the UI changed, upload new screenshots from store/ (bin/build.sh --store-assets renders them)
  4. Submit for review
EOF
