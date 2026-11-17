"""Fail closed before building a release from a dirty or unpublished checkout."""
import argparse
import json
import subprocess
import sys


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-remote", action="store_true")
    parser.add_argument("--tag", help="Also require this immutable remote tag at HEAD")
    args = parser.parse_args()
    status = git("status", "--porcelain", "--untracked-files=all")
    if status:
        sys.exit("Release blocked: uncommitted or untracked files:\n" + status)
    branch = git("branch", "--show-current")
    if not branch:
        sys.exit("Release blocked: select an explicit release branch")
    commit = git("rev-parse", "HEAD")
    if args.verify_remote or args.tag:
        refs = ["refs/heads/" + branch]
        if args.tag:
            refs += ["refs/tags/" + args.tag, "refs/tags/" + args.tag + "^{}"]
        remote = dict((ref, sha) for sha, ref in
                      (line.split() for line in git("ls-remote", "origin", *refs).splitlines()))
        if remote.get(refs[0]) != commit:
            sys.exit("Release blocked: origin branch does not match HEAD")
        if args.tag and remote.get(refs[2], remote.get(refs[1])) != commit:
            sys.exit("Release blocked: remote release tag does not match HEAD")
    print(json.dumps({"clean": True, "branch": branch, "commit": commit,
                      "remote_verified": args.verify_remote or bool(args.tag), "tag": args.tag}))


if __name__ == "__main__":
    main()
