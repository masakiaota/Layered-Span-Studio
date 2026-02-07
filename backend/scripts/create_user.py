from __future__ import annotations

import argparse
import sys

from layered_span_studio_backend.core.config import get_settings
from layered_span_studio_backend.core.security import hash_password
from layered_span_studio_backend.repositories import users as users_repo


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a backend user")
    parser.add_argument("username")
    parser.add_argument("password")
    args = parser.parse_args()

    settings = get_settings()
    users_repo.ensure_users_db(settings)

    if users_repo.get_user_by_username(settings, args.username):
        print("Username already exists", file=sys.stderr)
        return 1

    password_hash = hash_password(args.password)
    users_repo.create_user(settings, args.username, password_hash, meta={})
    print("User created")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
