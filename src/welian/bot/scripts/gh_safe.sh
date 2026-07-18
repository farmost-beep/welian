#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────
# gh_safe.sh — Sandboxed GitHub CLI wrapper for welian agent
#
# Inspired by claude-code's scripts/gh.sh. Restricts gh CLI to a safe
# subset of subcommands and flags, preventing the agent from performing
# destructive operations (deleting issues, force-pushing, closing PRs
# without confirmation, etc.)
#
# Compatible with macOS bash 3.2 (no associative arrays).
#
# Usage:
#   gh_safe.sh pr view 123
#   gh_safe.sh pr list --state open --limit 20
#   gh_safe.sh pr create --title "..." --body "..."
#   gh_safe.sh issue view 456
#   gh_safe.sh repo view
#   gh_safe.sh search issues "query" --limit 10
#
# Blocked operations:
#   - pr close / pr merge / pr ready / pr review (destructive)
#   - issue close / issue delete / issue edit (destructive)
#   - repo delete / repo archive (destructive)
#   - Any command with --force, --delete-branch, --admin
#   - Search queries with repo:/org:/user: qualifiers (scope escape)
# ──────────────────────────────────────────────────────────────────────

export GH_HOST=github.com

REPO="${GH_REPO:-${GITHUB_REPOSITORY:-}}"
if [[ -n "$REPO" ]]; then
  export GH_REPO="$REPO"
fi

# ── Parse arguments ──
SUB1="${1:-}"
SUB2="${2:-}"
CMD="${SUB1:-} ${SUB2:-}"

# ── Allowed subcommands (case statement for multi-word matching) ──
case "$CMD" in
  "pr view"|"pr list"|"pr create"|"pr diff"|"pr checks"|"pr status"|\
  "issue view"|"issue list"|"repo view"|\
  "search issues"|"search prs"|"label list"|"auth status"|"api graphql")
    ;;
  *)
    echo "Error: command '$CMD' is not allowed by gh_safe.sh" >&2
    echo "Allowed: pr view, pr list, pr create, pr diff, pr checks, pr status," >&2
    echo "         issue view, issue list, repo view, search issues, search prs," >&2
    echo "         label list, auth status, api graphql" >&2
    exit 1
    ;;
esac

shift 2 2>/dev/null || shift $# 2>/dev/null || true

# ── Allowed flags per command (space-separated, macOS-compatible) ──
get_allowed_flags() {
  case "$1" in
    "pr view")       echo "--comments --json --web" ;;
    "pr list")       echo "--state --limit --label --author --assignee --base --head --json" ;;
    "pr create")     echo "--title --body --base --head --label --assignee --reviewer --draft --fill --json" ;;
    "pr diff")       echo "--color --patch" ;;
    "pr checks")     echo "--watch --json" ;;
    "pr status")     echo "--json" ;;
    "issue view")    echo "--comments --json --web" ;;
    "issue list")    echo "--state --limit --label --author --assignee --json" ;;
    "repo view")     echo "--json --web" ;;
    "search issues") echo "--limit --state --json" ;;
    "search prs")    echo "--limit --state --json" ;;
    "label list")    echo "--limit --json" ;;
    "auth status")   echo "" ;;
    "api graphql")   echo "--field --raw-field -F -f" ;;
    *)               echo "" ;;
  esac
}

# ── Flags that always require a value ──
FLAGS_WITH_VALUES="--state --limit --label --author --assignee --base --head --title --body --reviewer --draft --fill --json --color --patch --watch --web --field --raw-field"

# ── Blocked flags (always dangerous) ──
BLOCKED_FLAGS="--force --delete-branch --admin --merge --squash --rebase"

# ── Validate flags ──
allowed_for_cmd=$(get_allowed_flags "$CMD")

POSITIONAL=()
FLAGS=()
skip_next=false

for arg in "$@"; do
  if [[ "$skip_next" == true ]]; then
    FLAGS+=("$arg")
    skip_next=false
    continue
  fi

  if [[ "$arg" == -* ]]; then
    flag="${arg%%=*}"

    # Check blocked flags
    for blocked_flag in $BLOCKED_FLAGS; do
      if [[ "$flag" == "$blocked_flag" ]]; then
        echo "Error: flag '$flag' is blocked by gh_safe.sh" >&2
        exit 1
      fi
    done

    # Check allowed flags
    flag_allowed=false
    for allowed_flag in $allowed_for_cmd; do
      if [[ "$flag" == "$allowed_flag" ]]; then
        flag_allowed=true
        break
      fi
    done

    if [[ "$flag_allowed" == false ]]; then
      echo "Error: flag '$flag' is not allowed for '$CMD' (allowed: $allowed_for_cmd)" >&2
      exit 1
    fi

    FLAGS+=("$arg")

    # If flag expects a value and isn't using = syntax, skip next arg
    if [[ "$arg" != *=* ]]; then
      for vflag in $FLAGS_WITH_VALUES; do
        if [[ "$flag" == "$vflag" ]]; then
          skip_next=true
          break
        fi
      done
    fi
  else
    POSITIONAL+=("$arg")
  fi
done

# ── Command-specific validation ──

if [[ "$CMD" == "search issues" || "$CMD" == "search prs" ]]; then
  QUERY="${POSITIONAL[0]:-}"
  QUERY_LOWER=$(echo "$QUERY" | tr '[:upper:]' '[:lower:]')
  if [[ "$QUERY_LOWER" == *"repo:"* || "$QUERY_LOWER" == *"org:"* || "$QUERY_LOWER" == *"user:"* ]]; then
    echo "Error: search query must not contain repo:, org:, or user: qualifiers" >&2
    exit 1
  fi
  if [[ -n "$REPO" ]]; then
    gh "$SUB1" "$SUB2" "$QUERY" --repo "$REPO" ${FLAGS[@]+"${FLAGS[@]}"}
  else
    gh "$SUB1" "$SUB2" "$QUERY" ${FLAGS[@]+"${FLAGS[@]}"}
  fi
elif [[ "$CMD" == "issue view" ]]; then
  if [[ ${#POSITIONAL[@]} -ne 1 ]] || ! [[ "${POSITIONAL[0]}" =~ ^[0-9]+$ ]]; then
    echo "Error: issue view requires exactly one numeric issue number" >&2
    exit 1
  fi
  gh "$SUB1" "$SUB2" "${POSITIONAL[0]}" ${FLAGS[@]+"${FLAGS[@]}"}
elif [[ "$CMD" == "pr view" ]]; then
  if [[ ${#POSITIONAL[@]} -gt 1 ]]; then
    echo "Error: pr view takes at most one argument" >&2
    exit 1
  fi
  if [[ ${#POSITIONAL[@]} -eq 1 ]]; then
    gh "$SUB1" "$SUB2" "${POSITIONAL[0]}" ${FLAGS[@]+"${FLAGS[@]}"}
  else
    gh "$SUB1" "$SUB2" ${FLAGS[@]+"${FLAGS[@]}"}
  fi
elif [[ "$CMD" == "pr create" ]]; then
  # pr create needs --title and --body (or --fill)
  has_title=false
  has_body=false
  has_fill=false
  for f in ${FLAGS[@]+"${FLAGS[@]}"}; do
    case "$f" in
      --title=*) has_title=true ;;
      --title) has_title=true ;;
      --body=*) has_body=true ;;
      --body) has_body=true ;;
      --fill) has_fill=true ;;
    esac
  done
  if [[ "$has_fill" == false ]]; then
    if [[ "$has_title" == false || "$has_body" == false ]]; then
      echo "Error: pr create requires --title and --body (or --fill to use current branch info)" >&2
      exit 1
    fi
  fi
  gh "$SUB1" "$SUB2" ${FLAGS[@]+"${FLAGS[@]}"}
elif [[ "$CMD" == "issue list" || "$CMD" == "label list" || "$CMD" == "pr list" ]]; then
  if [[ ${#POSITIONAL[@]} -ne 0 ]]; then
    echo "Error: $CMD does not accept positional arguments" >&2
    exit 1
  fi
  gh "$SUB1" "$SUB2" ${FLAGS[@]+"${FLAGS[@]}"}
elif [[ "$CMD" == "api graphql" ]]; then
  if [[ ${#POSITIONAL[@]} -lt 1 ]]; then
    echo "Error: api graphql requires a query string" >&2
    exit 1
  fi
  gh "$SUB1" "$SUB2" "${POSITIONAL[0]}" ${FLAGS[@]+"${FLAGS[@]}"}
else
  gh "$SUB1" "$SUB2" ${POSITIONAL[@]+"${POSITIONAL[@]}"} ${FLAGS[@]+"${FLAGS[@]}"}
fi
